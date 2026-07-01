import { eq } from "drizzle-orm";
import { contentPackets, deadLetters, webhookEndpoints, webhookEvents } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import type { ContentPacketRow } from "@/lib/domain/content-command";
import {
  N8N_EVENT_TYPE_HEADER,
  N8N_HANDOFF_EVENT_TYPE,
  N8N_HANDOFF_MODULE,
  N8N_IDEMPOTENCY_HEADER,
  N8N_SIGNATURE_HEADER,
  N8N_TIMESTAMP_HEADER,
  assertContentPacketReadyForHandoff,
  buildContentHandoffPayload,
  buildDeadLetterRow,
  buildWebhookEventRow,
  sendContentHandoffSchema,
  stableJson,
  type DeadLetterRow,
  type SendContentHandoffInput,
  type WebhookEventRow,
} from "@/lib/domain/n8n-handoff";
import { signWebhookPayload, verifyWebhookSignature } from "@/lib/security/webhooks";

export interface WebhookEndpointRow {
  id: string;
  name: string;
  module: string;
  url: string;
  secretRefName: string;
  enabled: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExistingWebhookEvent {
  id: string;
  idempotencyKey: string | null;
  status: string;
}

export interface N8nHandoffStore {
  getEndpointById(id: string): Promise<WebhookEndpointRow | null>;
  getContentPacketById(id: string): Promise<ContentPacketRow | null>;
  findWebhookEventByIdempotencyKey(idempotencyKey: string): Promise<ExistingWebhookEvent | null>;
  insertWebhookEvent(row: WebhookEventRow): Promise<void>;
  insertDeadLetter(row: DeadLetterRow): Promise<void>;
  updateContentPacket(id: string, fields: Partial<ContentPacketRow>): Promise<void>;
}

export interface N8nTransportRequest {
  method: "POST";
  headers: Record<string, string>;
  body: string;
}

export interface N8nTransportResponse {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | string | null;
}

export type N8nTransport = (url: string, request: N8nTransportRequest) => Promise<N8nTransportResponse>;

export interface SendApprovedContentToN8nDeps {
  store?: N8nHandoffStore;
  transport?: N8nTransport;
  getSecret?: (secretRefName: string) => string | undefined;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

export interface SendApprovedContentToN8nResult {
  status: "sent" | "failed" | "duplicate";
  event: WebhookEventRow | ExistingWebhookEvent;
  deadLetter?: DeadLetterRow;
}

export interface ReceiveN8nCallbackInput {
  payloadText: string;
  timestamp: string | null;
  signature: string | null;
  idempotencyKey: string | null;
  eventType?: string | null;
  endpointId?: string | null;
}

export interface ReceiveN8nCallbackDeps {
  store?: N8nHandoffStore;
  getSecret?: (secretRefName: string) => string | undefined;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
  callbackSecretRefName?: string;
}

export interface ReceiveN8nCallbackResult {
  status: "accepted" | "duplicate" | "rejected";
  event: WebhookEventRow | ExistingWebhookEvent;
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

function defaultGetSecret(secretRefName: string): string | undefined {
  return process.env[secretRefName];
}

async function defaultTransport(url: string, request: N8nTransportRequest): Promise<N8nTransportResponse> {
  const response = await fetch(url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  const contentType = response.headers.get("content-type") ?? "";
  let body: N8nTransportResponse["body"] = null;
  if (contentType.includes("application/json")) {
    body = (await response.json()) as Record<string, unknown>;
  } else {
    body = await response.text();
  }

  return { ok: response.ok, status: response.status, body };
}

export async function sendApprovedContentToN8n(
  input: SendContentHandoffInput,
  deps: SendApprovedContentToN8nDeps = {},
): Promise<SendApprovedContentToN8nResult> {
  const parsed = sendContentHandoffSchema.parse(input);
  const now = deps.now ?? new Date();
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const getSecret = deps.getSecret ?? defaultGetSecret;
  const transport = deps.transport ?? defaultTransport;

  const duplicate = await store.findWebhookEventByIdempotencyKey(parsed.idempotencyKey);
  if (duplicate) {
    await recordAudit({
      eventType: "n8n_handoff.duplicate",
      module: N8N_HANDOFF_MODULE,
      entityType: "webhook_event",
      entityId: duplicate.id,
      actor: parsed.requestedBy,
      metadata: { idempotencyKey: parsed.idempotencyKey, status: duplicate.status },
    });
    return { status: "duplicate", event: duplicate };
  }

  const [endpoint, packet] = await Promise.all([
    store.getEndpointById(parsed.endpointId),
    store.getContentPacketById(parsed.contentPacketId),
  ]);
  if (!endpoint) throw new Error(`webhook endpoint '${parsed.endpointId}' not found`);
  if (!endpoint.enabled) throw new Error(`webhook endpoint '${parsed.endpointId}' is disabled`);
  if (!packet) throw new Error(`content packet '${parsed.contentPacketId}' not found`);

  try {
    assertContentPacketReadyForHandoff(packet);
  } catch (error) {
    await recordAudit({
      eventType: "n8n_handoff.blocked",
      module: N8N_HANDOFF_MODULE,
      entityType: "content_packet",
      entityId: packet.id,
      actor: parsed.requestedBy,
      metadata: { reason: error instanceof Error ? error.message : "content packet not ready" },
    });
    throw error;
  }

  const secret = getSecret(endpoint.secretRefName);
  if (!secret) {
    const failureReason = `missing webhook secret '${endpoint.secretRefName}'`;
    const event = buildWebhookEventRow(
      {
        endpointId: endpoint.id,
        direction: "outbound",
        eventType: N8N_HANDOFF_EVENT_TYPE,
        status: "failed",
        idempotencyKey: parsed.idempotencyKey,
        signatureVerified: false,
        replayProtected: false,
        payload: { contentPacketId: packet.id, endpointId: endpoint.id },
        response: null,
        failureReason,
      },
      { now },
    );
    const deadLetter = buildDeadLetterRow(
      {
        sourceType: "webhook_event",
        sourceId: event.id,
        module: N8N_HANDOFF_MODULE,
        reason: failureReason,
        payload: event.payload,
      },
      { now },
    );
    await store.insertWebhookEvent(event);
    await store.insertDeadLetter(deadLetter);
    await store.updateContentPacket(packet.id, { n8nHandoffStatus: "failed", updatedAt: now });
    await recordAudit({
      eventType: "n8n_handoff.failed",
      module: N8N_HANDOFF_MODULE,
      entityType: "content_packet",
      entityId: packet.id,
      actor: parsed.requestedBy,
      metadata: { reason: failureReason, endpointId: endpoint.id },
    });
    return { status: "failed", event, deadLetter };
  }

  const payload = buildContentHandoffPayload(packet, parsed, { now });
  const body = stableJson(payload);
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const signature = await signWebhookPayload({ payload: body, timestamp, secret });
  const headers = {
    "Content-Type": "application/json",
    [N8N_TIMESTAMP_HEADER]: timestamp,
    [N8N_SIGNATURE_HEADER]: signature,
    [N8N_IDEMPOTENCY_HEADER]: parsed.idempotencyKey,
    [N8N_EVENT_TYPE_HEADER]: N8N_HANDOFF_EVENT_TYPE,
  };

  await store.updateContentPacket(packet.id, { n8nHandoffStatus: "queued", updatedAt: now });

  let response: N8nTransportResponse;
  try {
    response = await transport(endpoint.url, { method: "POST", headers, body });
  } catch (error) {
    response = {
      ok: false,
      status: 0,
      body: { error: error instanceof Error ? error.message : "transport failure" },
    };
  }

  if (response.ok) {
    const event = buildWebhookEventRow(
      {
        endpointId: endpoint.id,
        direction: "outbound",
        eventType: N8N_HANDOFF_EVENT_TYPE,
        status: "success",
        idempotencyKey: parsed.idempotencyKey,
        signatureVerified: true,
        replayProtected: true,
        payload: payload as unknown as Record<string, unknown>,
        response: normalizeResponseBody(response.body, response.status),
        failureReason: null,
      },
      { now },
    );
    await store.insertWebhookEvent(event);
    await store.updateContentPacket(packet.id, { n8nHandoffStatus: "sent", updatedAt: now });
    await recordAudit({
      eventType: "n8n_handoff.sent",
      module: N8N_HANDOFF_MODULE,
      entityType: "content_packet",
      entityId: packet.id,
      actor: parsed.requestedBy,
      metadata: {
        endpointId: endpoint.id,
        eventId: event.id,
        idempotencyKey: parsed.idempotencyKey,
        approvedBy: parsed.approvedBy,
      },
    });
    return { status: "sent", event };
  }

  const failureReason = response.status > 0 ? `n8n returned HTTP ${response.status}` : "n8n transport failed";
  const event = buildWebhookEventRow(
    {
      endpointId: endpoint.id,
      direction: "outbound",
      eventType: N8N_HANDOFF_EVENT_TYPE,
      status: "failed",
      idempotencyKey: parsed.idempotencyKey,
      signatureVerified: true,
      replayProtected: true,
      payload: payload as unknown as Record<string, unknown>,
      response: normalizeResponseBody(response.body, response.status),
      failureReason,
    },
    { now },
  );
  const deadLetter = buildDeadLetterRow(
    {
      sourceType: "webhook_event",
      sourceId: event.id,
      module: N8N_HANDOFF_MODULE,
      reason: failureReason,
      payload: {
        endpointId: endpoint.id,
        contentPacketId: packet.id,
        idempotencyKey: parsed.idempotencyKey,
        response: event.response,
      },
    },
    { now },
  );
  await store.insertWebhookEvent(event);
  await store.insertDeadLetter(deadLetter);
  await store.updateContentPacket(packet.id, { n8nHandoffStatus: "failed", updatedAt: now });
  await recordAudit({
    eventType: "n8n_handoff.failed",
    module: N8N_HANDOFF_MODULE,
    entityType: "content_packet",
    entityId: packet.id,
    actor: parsed.requestedBy,
    metadata: {
      endpointId: endpoint.id,
      eventId: event.id,
      deadLetterId: deadLetter.id,
      idempotencyKey: parsed.idempotencyKey,
      reason: failureReason,
    },
  });

  return { status: "failed", event, deadLetter };
}

export async function receiveN8nCallback(
  input: ReceiveN8nCallbackInput,
  deps: ReceiveN8nCallbackDeps = {},
): Promise<ReceiveN8nCallbackResult> {
  const now = deps.now ?? new Date();
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const getSecret = deps.getSecret ?? defaultGetSecret;
  const secretRefName = deps.callbackSecretRefName ?? "N8N_WEBHOOK_SECRET";
  const secret = getSecret(secretRefName);
  if (!secret) throw new Error(`missing webhook secret '${secretRefName}'`);

  if (!input.timestamp || !input.signature) {
    const event = buildWebhookEventRow(
      {
        endpointId: input.endpointId ?? null,
        direction: "inbound",
        eventType: input.eventType ?? "n8n.callback",
        status: "rejected",
        idempotencyKey: input.idempotencyKey,
        signatureVerified: false,
        replayProtected: false,
        payload: parsePayloadText(input.payloadText),
        response: null,
        failureReason: "missing callback signature or timestamp",
      },
      { now },
    );
    await store.insertWebhookEvent(event);
    await recordAudit({
      eventType: "n8n_callback.rejected",
      module: N8N_HANDOFF_MODULE,
      entityType: "webhook_event",
      entityId: event.id,
      metadata: { reason: event.failureReason, idempotencyKey: input.idempotencyKey },
    });
    return { status: "rejected", event };
  }

  const verification = await verifyWebhookSignature({
    payload: input.payloadText,
    timestamp: input.timestamp,
    signature: input.signature,
    secret,
    nowEpochSeconds: Math.floor(now.getTime() / 1000),
  });

  if (!verification.valid) {
    const event = buildWebhookEventRow(
      {
        endpointId: input.endpointId ?? null,
        direction: "inbound",
        eventType: input.eventType ?? "n8n.callback",
        status: "rejected",
        idempotencyKey: input.idempotencyKey,
        signatureVerified: false,
        replayProtected: false,
        payload: parsePayloadText(input.payloadText),
        response: null,
        failureReason: verification.reason,
      },
      { now },
    );
    await store.insertWebhookEvent(event);
    await recordAudit({
      eventType: "n8n_callback.rejected",
      module: N8N_HANDOFF_MODULE,
      entityType: "webhook_event",
      entityId: event.id,
      metadata: { reason: verification.reason, idempotencyKey: input.idempotencyKey },
    });
    return { status: "rejected", event };
  }

  if (input.idempotencyKey) {
    const duplicate = await store.findWebhookEventByIdempotencyKey(input.idempotencyKey);
    if (duplicate) {
      await recordAudit({
        eventType: "n8n_callback.duplicate",
        module: N8N_HANDOFF_MODULE,
        entityType: "webhook_event",
        entityId: duplicate.id,
        metadata: { idempotencyKey: input.idempotencyKey, status: duplicate.status },
      });
      return { status: "duplicate", event: duplicate };
    }
  }

  const event = buildWebhookEventRow(
    {
      endpointId: input.endpointId ?? null,
      direction: "inbound",
      eventType: input.eventType ?? "n8n.callback",
      status: "success",
      idempotencyKey: input.idempotencyKey,
      signatureVerified: true,
      replayProtected: true,
      payload: parsePayloadText(input.payloadText),
      response: { accepted: true },
      failureReason: null,
    },
    { now },
  );
  await store.insertWebhookEvent(event);
  await recordAudit({
    eventType: "n8n_callback.accepted",
    module: N8N_HANDOFF_MODULE,
    entityType: "webhook_event",
    entityId: event.id,
    metadata: { idempotencyKey: input.idempotencyKey, eventType: event.eventType },
  });
  return { status: "accepted", event };
}

function normalizeResponseBody(body: N8nTransportResponse["body"], status: number): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return { status, ...(body as Record<string, unknown>) };
  }
  return { status, body };
}

function parsePayloadText(payloadText: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(payloadText) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return { value: parsed };
  } catch {
    return { raw: payloadText };
  }
}

export function defaultStore(db: Db = getDb()): N8nHandoffStore {
  return {
    async getEndpointById(id) {
      const rows = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, id)).limit(1);
      return (rows[0] as WebhookEndpointRow | undefined) ?? null;
    },
    async getContentPacketById(id) {
      const rows = await db.select().from(contentPackets).where(eq(contentPackets.id, id)).limit(1);
      return (rows[0] as ContentPacketRow | undefined) ?? null;
    },
    async findWebhookEventByIdempotencyKey(idempotencyKey) {
      const rows = await db.select().from(webhookEvents).where(eq(webhookEvents.idempotencyKey, idempotencyKey)).limit(1);
      const row = rows[0];
      return row ? { id: row.id, idempotencyKey: row.idempotencyKey, status: row.status } : null;
    },
    async insertWebhookEvent(row) {
      await db.insert(webhookEvents).values({
        id: row.id,
        endpointId: row.endpointId,
        direction: row.direction,
        eventType: row.eventType,
        status: row.status,
        idempotencyKey: row.idempotencyKey,
        signatureVerified: row.signatureVerified,
        replayProtected: row.replayProtected,
        payload: row.payload,
        response: row.response,
        failureReason: row.failureReason,
        receivedAt: row.receivedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    },
    async insertDeadLetter(row) {
      await db.insert(deadLetters).values({
        id: row.id,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        module: row.module,
        reason: row.reason,
        payload: row.payload,
        retryCount: row.retryCount,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    },
    async updateContentPacket(id, fields) {
      await db.update(contentPackets).set(fields).where(eq(contentPackets.id, id));
    },
  };
}
