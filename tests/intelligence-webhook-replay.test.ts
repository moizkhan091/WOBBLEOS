import { describe, expect, it } from "vitest";
import {
  intelligenceWebhookSignatureContext,
  processIntelligenceWebhook,
  type IntelligenceWebhookDeps,
} from "@/lib/intelligence/webhook";
import { signWebhookPayload } from "@/lib/security/webhooks";
import type { WebhookReplayClaimRow, WebhookReplayStore } from "@/lib/webhook-replay";

const SECRET = "test-intelligence-secret";
const EPOCH = 2_000_000_000;
const NOW = new Date(EPOCH * 1000);

function memoryReplayStore(): WebhookReplayStore & { rows: Map<string, WebhookReplayClaimRow> } {
  const rows = new Map<string, WebhookReplayClaimRow>();
  return {
    rows,
    async claim(row) {
      const key = `${row.producer}:${row.deliveryKeyHash}`;
      const existing = rows.get(key);
      if (existing) return { inserted: false, existingPayloadSha256: existing.payloadSha256 };
      rows.set(key, row);
      return { inserted: true };
    },
    async update(id, fields) {
      for (const [key, row] of rows) {
        if (row.id === id) rows.set(key, { ...row, ...fields });
      }
    },
    async purgeExpired(before) {
      let count = 0;
      for (const [key, row] of rows) {
        if (row.expiresAt < before) { rows.delete(key); count++; }
      }
      return count;
    },
  };
}

async function signedInput(over: Partial<{ raw: string; producer: string; deliveryId: string; timestamp: string }> = {}) {
  const raw = over.raw ?? JSON.stringify({ title: "Competitor signal", summary: "A real observation" });
  const producer = over.producer ?? "apify_scout";
  const deliveryId = over.deliveryId ?? "delivery-001";
  const timestamp = over.timestamp ?? String(EPOCH);
  const signature = await signWebhookPayload({
    payload: raw,
    timestamp,
    secret: SECRET,
    context: intelligenceWebhookSignatureContext(producer, deliveryId),
  });
  return { raw, producer, deliveryId, timestamp, signature, secret: SECRET };
}

function deps(store: WebhookReplayStore, onIngest: () => void): IntelligenceWebhookDeps {
  return {
    replayStore: store,
    now: NOW,
    nowEpochSeconds: EPOCH,
    ingest: async () => { onIngest(); return { created: ["intel_1"], count: 1 }; },
    recordAudit: async () => {},
  };
}

describe("durable intelligence webhook replay protection", () => {
  it("accepts the first signed delivery and rejects the exact replay without another insert", async () => {
    const store = memoryReplayStore();
    let inserts = 0;
    const input = await signedInput();
    expect((await processIntelligenceWebhook(input, deps(store, () => inserts++))).status).toBe(200);
    const replay = await processIntelligenceWebhook(input, deps(store, () => inserts++));
    expect(replay).toMatchObject({ status: 409, body: { duplicate: true } });
    expect(inserts).toBe(1);
  });

  it("blocks replay from another app instance through the shared durable store", async () => {
    const sharedStore = memoryReplayStore();
    let inserts = 0;
    const instanceA = deps(sharedStore, () => inserts++);
    const instanceB = deps(sharedStore, () => inserts++);
    const input = await signedInput({ deliveryId: "cross-instance" });
    expect((await processIntelligenceWebhook(input, instanceA)).status).toBe(200);
    expect((await processIntelligenceWebhook(input, instanceB)).status).toBe(409);
    expect(inserts).toBe(1);
  });

  it("does not reserve a claim for an invalid signature", async () => {
    const store = memoryReplayStore();
    const input = { ...(await signedInput({ deliveryId: "bad-sig" })), signature: "00".repeat(32) };
    const result = await processIntelligenceWebhook(input, deps(store, () => {}));
    expect(result.status).toBe(401);
    expect(store.rows.size).toBe(0);
  });

  it("rejects expired timestamps before a durable claim", async () => {
    const store = memoryReplayStore();
    const input = await signedInput({ deliveryId: "expired", timestamp: String(EPOCH - 301) });
    const result = await processIntelligenceWebhook(input, deps(store, () => {}));
    expect(result.status).toBe(401);
    expect(store.rows.size).toBe(0);
  });

  it("fails safely when a valid signer reuses an identifier for an altered payload", async () => {
    const store = memoryReplayStore();
    let inserts = 0;
    const first = await signedInput({ deliveryId: "same-id", raw: JSON.stringify({ title: "A" }) });
    const altered = await signedInput({ deliveryId: "same-id", raw: JSON.stringify({ title: "B" }) });
    expect((await processIntelligenceWebhook(first, deps(store, () => inserts++))).status).toBe(200);
    const conflict = await processIntelligenceWebhook(altered, deps(store, () => inserts++));
    expect(conflict).toMatchObject({ status: 409, body: { duplicate: false } });
    expect(inserts).toBe(1);
  });

  it("atomically admits at most one of simultaneous duplicate deliveries", async () => {
    const store = memoryReplayStore();
    let inserts = 0;
    const input = await signedInput({ deliveryId: "simultaneous" });
    const results = await Promise.all(Array.from({ length: 20 }, () => processIntelligenceWebhook(input, deps(store, () => inserts++))));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(19);
    expect(inserts).toBe(1);
  });

  it("scopes delivery identifiers by authenticated producer", async () => {
    const store = memoryReplayStore();
    let inserts = 0;
    const a = await signedInput({ producer: "apify_scout", deliveryId: "shared-id" });
    const b = await signedInput({ producer: "n8n_transcript", deliveryId: "shared-id" });
    expect((await processIntelligenceWebhook(a, deps(store, () => inserts++))).status).toBe(200);
    expect((await processIntelligenceWebhook(b, deps(store, () => inserts++))).status).toBe(200);
    expect(inserts).toBe(2);
  });
});
