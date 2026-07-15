import { writeAuditEvent } from "@/lib/audit";
import { ingestIntelligencePayload, type IngestResult } from "@/lib/intelligence/ingest";
import { verifyWebhookSignature } from "@/lib/security/webhooks";
import {
  claimWebhookDelivery,
  completeWebhookDelivery,
  failWebhookDelivery,
  type ClaimWebhookDeliveryResult,
  type WebhookReplayStore,
} from "@/lib/webhook-replay";

export const INTELLIGENCE_PRODUCER_HEADER = "X-Wobble-Producer";
export const INTELLIGENCE_DELIVERY_ID_HEADER = "X-Wobble-Idempotency-Key";

const PRODUCER_PATTERN = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const DELIVERY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export function intelligenceWebhookSignatureContext(producer: string, deliveryId: string): string {
  return JSON.stringify({ producer, deliveryId });
}

export interface IntelligenceWebhookInput {
  raw: string;
  timestamp: string;
  signature: string;
  producer: string;
  deliveryId: string;
  secret: string;
}

export interface IntelligenceWebhookResponse {
  status: number;
  body: Record<string, unknown>;
}

export interface IntelligenceWebhookDeps {
  now?: Date;
  nowEpochSeconds?: number;
  replayStore?: WebhookReplayStore;
  claim?: (input: { producer: string; deliveryId: string; payload: string; now?: Date }, store?: WebhookReplayStore) => Promise<ClaimWebhookDeliveryResult>;
  complete?: (claimId: string, store?: WebhookReplayStore, now?: Date) => Promise<void>;
  fail?: (claimId: string, store?: WebhookReplayStore, now?: Date) => Promise<void>;
  ingest?: (payload: unknown) => Promise<IngestResult>;
  recordAudit?: (input: Parameters<typeof writeAuditEvent>[0]) => Promise<unknown>;
}

function invalidHeader(name: string): IntelligenceWebhookResponse {
  return { status: 400, body: { ok: false, error: `invalid or missing ${name}` } };
}

/** Authenticate, atomically claim, and ingest one intelligence delivery. */
export async function processIntelligenceWebhook(
  input: IntelligenceWebhookInput,
  deps: IntelligenceWebhookDeps = {},
): Promise<IntelligenceWebhookResponse> {
  if (!PRODUCER_PATTERN.test(input.producer)) return invalidHeader(INTELLIGENCE_PRODUCER_HEADER);
  if (!DELIVERY_ID_PATTERN.test(input.deliveryId)) return invalidHeader(INTELLIGENCE_DELIVERY_ID_HEADER);

  const verification = await verifyWebhookSignature({
    payload: input.raw,
    timestamp: input.timestamp,
    signature: input.signature,
    secret: input.secret,
    context: intelligenceWebhookSignatureContext(input.producer, input.deliveryId),
    nowEpochSeconds: deps.nowEpochSeconds,
  });
  if (!verification.valid) {
    return { status: 401, body: { ok: false, error: `invalid signature — ${verification.reason}` } };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input.raw);
  } catch {
    return { status: 400, body: { ok: false, error: "invalid JSON" } };
  }

  const now = deps.now ?? new Date();
  const claim = await (deps.claim ?? claimWebhookDelivery)(
    { producer: input.producer, deliveryId: input.deliveryId, payload: input.raw, now },
    deps.replayStore,
  );
  const audit = deps.recordAudit ?? writeAuditEvent;
  const auditSafely = async (event: Parameters<typeof writeAuditEvent>[0]) => {
    await audit(event).catch(() => {});
  };

  if (claim.outcome !== "claimed") {
    await auditSafely({
      eventType: claim.outcome === "duplicate" ? "intelligence.webhook_duplicate" : "intelligence.webhook_identifier_conflict",
      category: "access",
      module: "intelligence",
      entityType: "webhook_replay_claim",
      actor: `producer:${input.producer}`,
      surface: "/api/webhooks/intelligence",
      metadata: {
        producer: input.producer,
        deliveryKeyHashPrefix: claim.deliveryKeyHash.slice(0, 16),
        payloadHashPrefix: claim.payloadSha256.slice(0, 16),
      },
    });
    return {
      status: 409,
      body: {
        ok: false,
        duplicate: claim.outcome === "duplicate",
        error: claim.outcome === "duplicate"
          ? "duplicate intelligence webhook delivery"
          : "delivery identifier was already used with a different payload",
      },
    };
  }

  try {
    const result = await (deps.ingest ?? ingestIntelligencePayload)(payload);
    await (deps.complete ?? completeWebhookDelivery)(claim.claimId!, deps.replayStore, now);
    await auditSafely({
      eventType: "intelligence.webhook_ingested",
      category: "creation",
      module: "intelligence",
      entityType: "webhook_replay_claim",
      entityId: claim.claimId,
      actor: `producer:${input.producer}`,
      surface: "/api/webhooks/intelligence",
      metadata: {
        producer: input.producer,
        deliveryKeyHashPrefix: claim.deliveryKeyHash.slice(0, 16),
        payloadHashPrefix: claim.payloadSha256.slice(0, 16),
        recordsCreated: result.count,
      },
    });
    return { status: 200, body: { ok: true, ...result, note: "ingested as pending — review in the Intelligence Inbox" } };
  } catch (error) {
    await (deps.fail ?? failWebhookDelivery)(claim.claimId!, deps.replayStore, now);
    await auditSafely({
      eventType: "intelligence.webhook_failed",
      category: "system",
      module: "intelligence",
      entityType: "webhook_replay_claim",
      entityId: claim.claimId,
      actor: `producer:${input.producer}`,
      surface: "/api/webhooks/intelligence",
      metadata: { producer: input.producer, deliveryKeyHashPrefix: claim.deliveryKeyHash.slice(0, 16) },
    });
    return { status: 422, body: { ok: false, error: error instanceof Error ? error.message : "unknown error" } };
  }
}
