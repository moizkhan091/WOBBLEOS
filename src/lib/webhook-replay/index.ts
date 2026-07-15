import { createHash } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { webhookReplayClaims } from "@/db/schema";
import { newId } from "@/lib/ids";

export const WEBHOOK_REPLAY_RETENTION_MS = 30 * 24 * 60 * 60_000;

export interface WebhookReplayClaimRow {
  id: string;
  producer: string;
  deliveryKeyHash: string;
  payloadSha256: string;
  status: "claimed" | "completed" | "failed";
  claimedAt: Date;
  completedAt: Date | null;
  expiresAt: Date;
  metadata: Record<string, unknown>;
  updatedAt: Date;
}

export interface WebhookReplayStore {
  claim(row: WebhookReplayClaimRow): Promise<{ inserted: boolean; existingPayloadSha256?: string }>;
  update(id: string, fields: Partial<WebhookReplayClaimRow>): Promise<void>;
  purgeExpired(before: Date): Promise<number>;
}

export interface ClaimWebhookDeliveryInput {
  producer: string;
  deliveryId: string;
  payload: string;
  now?: Date;
  retentionMs?: number;
}

export interface ClaimWebhookDeliveryResult {
  outcome: "claimed" | "duplicate" | "payload_mismatch";
  claimId?: string;
  deliveryKeyHash: string;
  payloadSha256: string;
}

export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

export function defaultWebhookReplayStore(db: Db = getDb()): WebhookReplayStore {
  return {
    async claim(row) {
      const inserted = await db
        .insert(webhookReplayClaims)
        .values(row)
        .onConflictDoNothing({ target: [webhookReplayClaims.producer, webhookReplayClaims.deliveryKeyHash] })
        .returning({ id: webhookReplayClaims.id });
      if (inserted.length) return { inserted: true };
      const existing = await db
        .select({ payloadSha256: webhookReplayClaims.payloadSha256 })
        .from(webhookReplayClaims)
        .where(and(
          eq(webhookReplayClaims.producer, row.producer),
          eq(webhookReplayClaims.deliveryKeyHash, row.deliveryKeyHash),
        ))
        .limit(1);
      return { inserted: false, existingPayloadSha256: existing[0]?.payloadSha256 };
    },
    async update(id, fields) {
      await db.update(webhookReplayClaims).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() }).where(eq(webhookReplayClaims.id, id));
    },
    async purgeExpired(before) {
      const deleted = await db.delete(webhookReplayClaims).where(lt(webhookReplayClaims.expiresAt, before)).returning({ id: webhookReplayClaims.id });
      return deleted.length;
    },
  };
}

export async function claimWebhookDelivery(
  input: ClaimWebhookDeliveryInput,
  store: WebhookReplayStore = defaultWebhookReplayStore(),
): Promise<ClaimWebhookDeliveryResult> {
  const now = input.now ?? new Date();
  const deliveryKeyHash = sha256(input.deliveryId);
  const payloadSha256 = sha256(input.payload);
  const claimId = newId("webhook_claim");
  const result = await store.claim({
    id: claimId,
    producer: input.producer,
    deliveryKeyHash,
    payloadSha256,
    status: "claimed",
    claimedAt: now,
    completedAt: null,
    expiresAt: new Date(now.getTime() + (input.retentionMs ?? WEBHOOK_REPLAY_RETENTION_MS)),
    metadata: {},
    updatedAt: now,
  });
  if (result.inserted) return { outcome: "claimed", claimId, deliveryKeyHash, payloadSha256 };
  return {
    outcome: result.existingPayloadSha256 === payloadSha256 ? "duplicate" : "payload_mismatch",
    deliveryKeyHash,
    payloadSha256,
  };
}

export async function completeWebhookDelivery(claimId: string, store: WebhookReplayStore = defaultWebhookReplayStore(), now = new Date()): Promise<void> {
  await store.update(claimId, { status: "completed", completedAt: now, updatedAt: now });
}

export async function failWebhookDelivery(claimId: string, store: WebhookReplayStore = defaultWebhookReplayStore(), now = new Date()): Promise<void> {
  await store.update(claimId, { status: "failed", updatedAt: now });
}

export async function purgeExpiredWebhookReplayClaims(before = new Date(), store: WebhookReplayStore = defaultWebhookReplayStore()): Promise<number> {
  return store.purgeExpired(before);
}
