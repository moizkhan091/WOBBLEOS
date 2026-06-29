import { describe, expect, it } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "@/lib/security/webhooks";

describe("webhook signatures", () => {
  it("accepts a fresh signed payload", async () => {
    const payload = JSON.stringify({ id: "evt_1", action: "source.ingested" });
    const timestamp = "1782429600";
    const secret = "secret";
    const signature = await signWebhookPayload({ payload, timestamp, secret });

    const result = await verifyWebhookSignature({
      payload,
      timestamp,
      signature,
      secret,
      nowEpochSeconds: 1782429600,
    });

    expect(result.valid).toBe(true);
  });

  it("rejects replayed payloads older than five minutes", async () => {
    const payload = JSON.stringify({ id: "evt_1", action: "source.ingested" });
    const timestamp = "1782429000";
    const secret = "secret";
    const signature = await signWebhookPayload({ payload, timestamp, secret });

    const result = await verifyWebhookSignature({
      payload,
      timestamp,
      signature,
      secret,
      nowEpochSeconds: 1782429601,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain("timestamp");
  });
});
