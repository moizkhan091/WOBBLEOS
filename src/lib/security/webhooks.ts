import { createHmac, timingSafeEqual } from "node:crypto";

export interface SignWebhookInput {
  payload: string;
  timestamp: string;
  secret: string;
}

export interface VerifyWebhookInput extends SignWebhookInput {
  signature: string;
  nowEpochSeconds?: number;
  maxAgeSeconds?: number;
}

export async function signWebhookPayload(input: SignWebhookInput): Promise<string> {
  return createHmac("sha256", input.secret).update(`${input.timestamp}.${input.payload}`).digest("hex");
}

export async function verifyWebhookSignature(input: VerifyWebhookInput): Promise<{ valid: boolean; reason: string }> {
  const now = input.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  const maxAge = input.maxAgeSeconds ?? 300;
  const timestamp = Number(input.timestamp);

  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > maxAge) {
    return { valid: false, reason: "webhook timestamp is outside the allowed replay window" };
  }

  const expected = await signWebhookPayload(input);
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(input.signature, "hex");

  if (expectedBuffer.length !== actualBuffer.length) {
    return { valid: false, reason: "webhook signature length mismatch" };
  }

  return timingSafeEqual(expectedBuffer, actualBuffer)
    ? { valid: true, reason: "webhook signature verified" }
    : { valid: false, reason: "webhook signature mismatch" };
}
