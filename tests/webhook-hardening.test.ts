import { describe, expect, it } from "vitest";
import { readCappedRawBody, verifyRawBodySignature, verifyWebhookSignature, signWebhookPayload, MAX_WEBHOOK_BODY_BYTES } from "@/lib/security/webhooks";
import { signMediaToken, verifyMediaToken } from "@/lib/library/media-token";

function req(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://x/webhook", { method: "POST", body, headers });
}

describe("webhook body-size cap (WOB-AUD-011)", () => {
  it("rejects a body over the cap via Content-Length before parsing", async () => {
    const r = await readCappedRawBody(req("{}", { "content-length": String(MAX_WEBHOOK_BODY_BYTES + 1) }), MAX_WEBHOOK_BODY_BYTES);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(413);
  });

  it("rejects an oversized actual body even if Content-Length lies", async () => {
    const big = "x".repeat(1024);
    const r = await readCappedRawBody(req(big), 512);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(413);
  });

  it("accepts a body within the cap", async () => {
    const r = await readCappedRawBody(req("{\"ok\":true}"), 4_000_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.raw).toBe("{\"ok\":true}");
  });
});

describe("raw-body HMAC (external-provider webhooks like Zernio)", () => {
  it("verifies a correct raw-body signature and rejects a tampered body", async () => {
    const secret = "zernio-secret";
    const body = JSON.stringify({ event: "post.published" });
    // raw-body HMAC (no timestamp prefix — the external provider's scheme)
    const { createHmac } = await import("node:crypto");
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyRawBodySignature(body, sig, secret)).toBe(true);
    expect(verifyRawBodySignature(body + "x", sig, secret)).toBe(false);
    expect(verifyRawBodySignature(body, null, secret)).toBe(false);
  });
});

describe("timestamped webhook replay window (our producers)", () => {
  it("accepts a fresh timestamped signature and rejects a replayed (old) one", async () => {
    const secret = "intel-secret";
    const body = JSON.stringify({ items: [] });
    const now = 1_000_000;
    const sig = await signWebhookPayload({ payload: body, timestamp: String(now), secret });
    const fresh = await verifyWebhookSignature({ payload: body, timestamp: String(now), signature: sig, secret, nowEpochSeconds: now + 10 });
    expect(fresh.valid).toBe(true);
    const replayed = await verifyWebhookSignature({ payload: body, timestamp: String(now), signature: sig, secret, nowEpochSeconds: now + 10_000 });
    expect(replayed.valid).toBe(false);
    expect(replayed.reason).toMatch(/replay window/);
  });
});

describe("media token expiry (WOB-AUD-019)", () => {
  const OLD = process.env.MEDIA_URL_SECRET;
  process.env.MEDIA_URL_SECRET = "media-secret";
  const now = 2_000_000_000_000;

  it("verifies a fresh token and rejects it after expiry", () => {
    const token = signMediaToken("asset_1", 0, { now, ttlMs: 60_000 });
    expect(verifyMediaToken("asset_1", 0, token, { now: now + 1_000 })).toBe(true);
    expect(verifyMediaToken("asset_1", 0, token, { now: now + 61_000 })).toBe(false); // expired
  });

  it("rejects a token for a different asset/index (binding intact)", () => {
    const token = signMediaToken("asset_1", 0, { now });
    expect(verifyMediaToken("asset_2", 0, token, { now: now + 1000 })).toBe(false);
    expect(verifyMediaToken("asset_1", 1, token, { now: now + 1000 })).toBe(false);
  });

  it("rejects a token whose expiry was tampered to extend it", () => {
    const token = signMediaToken("asset_1", 0, { now, ttlMs: 60_000 });
    const sig = token.split(".")[1];
    const forged = `${now + 10_000_000}.${sig}`; // push expiry far out, reuse the old MAC
    expect(verifyMediaToken("asset_1", 0, forged, { now: now + 1000 })).toBe(false);
    process.env.MEDIA_URL_SECRET = OLD; // restore
  });
});
