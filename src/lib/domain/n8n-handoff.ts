import { z } from "zod";
import type { ContentPacketRow } from "@/lib/domain/content-command";
import { newId } from "@/lib/ids";

export const N8N_HANDOFF_EVENT_TYPE = "content.packet.approved";
export const N8N_HANDOFF_MODULE = "n8n_handoff";
export const N8N_TIMESTAMP_HEADER = "X-Wobble-Timestamp";
export const N8N_SIGNATURE_HEADER = "X-Wobble-Signature";
export const N8N_IDEMPOTENCY_HEADER = "X-Wobble-Idempotency-Key";
export const N8N_EVENT_TYPE_HEADER = "X-Wobble-Event-Type";

export const sendContentHandoffSchema = z.object({
  endpointId: z.string().trim().min(1, "endpointId is required"),
  contentPacketId: z.string().trim().min(1, "contentPacketId is required"),
  idempotencyKey: z.string().trim().min(8, "idempotencyKey is required"),
  requestedBy: z.string().trim().min(1, "requestedBy is required"),
  approvedBy: z.string().trim().min(1, "approvedBy is required"),
  callbackUrl: z.string().trim().url().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type SendContentHandoffInput = z.input<typeof sendContentHandoffSchema>;
export type ParsedSendContentHandoffInput = z.output<typeof sendContentHandoffSchema>;

export interface WebhookEventRow {
  id: string;
  endpointId: string | null;
  direction: "inbound" | "outbound";
  eventType: string;
  status: "pending" | "success" | "failed" | "duplicate" | "rejected";
  idempotencyKey: string | null;
  signatureVerified: boolean;
  replayProtected: boolean;
  payload: Record<string, unknown>;
  response: Record<string, unknown> | null;
  failureReason: string | null;
  receivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeadLetterRow {
  id: string;
  sourceType: string;
  sourceId: string;
  module: string;
  reason: string;
  payload: Record<string, unknown>;
  retryCount: number;
  status: "open" | "retrying" | "resolved" | "archived";
  createdAt: Date;
  updatedAt: Date;
}

export interface HandoffPayload {
  eventType: typeof N8N_HANDOFF_EVENT_TYPE;
  contentPacket: {
    id: string;
    contentTrackId: string;
    platform: string;
    format: string;
    objective: string;
    targetAudience: string;
    angle: string;
    hook: string;
    mainCopy: string;
    carouselSlides: Array<Record<string, unknown>>;
    caption: string;
    cta: string;
    designDirection: string;
    evidenceSummary: string;
    sourceIdsUsed: string[];
    insightIdsUsed: string[];
    memoryChunksUsed: string[];
    claimRiskLevel: string;
    proofRequired: boolean;
    qualityStatus: string;
    approvalStatus: string;
  };
  handoff: {
    idempotencyKey: string;
    requestedBy: string;
    approvedBy: string;
    callbackUrl: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  };
}

export function assertContentPacketReadyForHandoff(packet: ContentPacketRow): void {
  if (packet.approvalStatus !== "approved") {
    throw new Error(`content packet '${packet.id}' must be approved before n8n handoff`);
  }
  if (packet.qualityStatus !== "passed") {
    throw new Error(`content packet '${packet.id}' must pass quality review before n8n handoff`);
  }
  if (packet.n8nHandoffStatus === "sent") {
    throw new Error(`content packet '${packet.id}' was already sent to n8n`);
  }
}

export function buildContentHandoffPayload(
  packet: ContentPacketRow,
  input: ParsedSendContentHandoffInput,
  opts: { now?: Date } = {},
): HandoffPayload {
  const now = opts.now ?? new Date();
  return {
    eventType: N8N_HANDOFF_EVENT_TYPE,
    contentPacket: {
      id: packet.id,
      contentTrackId: packet.contentTrackId,
      platform: packet.platform,
      format: packet.format,
      objective: packet.objective,
      targetAudience: packet.targetAudience,
      angle: packet.angle,
      hook: packet.hook,
      mainCopy: packet.mainCopy,
      carouselSlides: packet.carouselSlides,
      caption: packet.caption,
      cta: packet.cta,
      designDirection: packet.designDirection,
      evidenceSummary: packet.evidenceSummary,
      sourceIdsUsed: packet.sourceIdsUsed,
      insightIdsUsed: packet.insightIdsUsed,
      memoryChunksUsed: packet.memoryChunksUsed,
      claimRiskLevel: packet.claimRiskLevel,
      proofRequired: packet.proofRequired,
      qualityStatus: packet.qualityStatus,
      approvalStatus: packet.approvalStatus,
    },
    handoff: {
      idempotencyKey: input.idempotencyKey,
      requestedBy: input.requestedBy,
      approvedBy: input.approvedBy,
      callbackUrl: input.callbackUrl ?? null,
      metadata: input.metadata,
      createdAt: now.toISOString(),
    },
  };
}

export function buildWebhookEventRow(
  input: Omit<WebhookEventRow, "id" | "receivedAt" | "createdAt" | "updatedAt">,
  opts: { id?: string; now?: Date } = {},
): WebhookEventRow {
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("webhook"),
    receivedAt: now,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

export function buildDeadLetterRow(
  input: Omit<DeadLetterRow, "id" | "createdAt" | "updatedAt" | "retryCount" | "status"> & {
    retryCount?: number;
    status?: DeadLetterRow["status"];
  },
  opts: { id?: string; now?: Date } = {},
): DeadLetterRow {
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("deadletter"),
    retryCount: input.retryCount ?? 0,
    status: input.status ?? "open",
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortKeys(nested)]),
  );
}
