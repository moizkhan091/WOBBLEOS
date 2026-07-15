import { createHmac, timingSafeEqual } from "node:crypto";

/** Pre-parse body-size cap shared by every public webhook (WOB-AUD-011) — bounds memory/CPU pressure. */
export const MAX_WEBHOOK_BODY_BYTES = 4_000_000;

const payloadTooLarge = (maxBytes: number) => ({
  ok: false as const,
  status: 413,
  error: `payload too large (max ${maxBytes} bytes)`,
});

/**
 * Read a request body with a hard byte cap enforced BEFORE parsing. Content-Length is only a cheap
 * early-reject hint: the stream itself is always counted because the header may be absent, chunked,
 * or dishonest. Oversized streams are cancelled as soon as the first over-limit chunk arrives, so
 * the application never calls Request.text() or buffers the complete oversized payload.
 */
export async function readCappedRawBody(
  request: Request,
  maxBytes: number = MAX_WEBHOOK_BODY_BYTES,
): Promise<{ ok: true; raw: string } | { ok: false; status: number; error: string }> {
  const cl = request.headers.get("content-length");
  if (cl && Number.isFinite(Number(cl)) && Number(cl) > maxBytes) {
    return payloadTooLarge(maxBytes);
  }

  if (!request.body) return { ok: true, raw: "" };

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8");
  const chunks: string[] = [];
  let bytesRead = 0;
  let finished = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        break;
      }
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel("webhook payload exceeded byte limit").catch(() => {});
        return payloadTooLarge(maxBytes);
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return { ok: true, raw: chunks.join("") };
  } finally {
    if (!finished) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Raw-body HMAC-SHA256 verification (constant-time). Used by webhooks whose signing scheme is defined
 *  by an EXTERNAL provider (e.g. Zernio) and cannot carry our timestamp envelope. */
export function verifyRawBodySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const computed = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(computed);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface SignWebhookInput {
  payload: string;
  timestamp: string;
  secret: string;
  /** Optional authenticated delivery context (for example producer + idempotency identifier). */
  context?: string;
}

export interface VerifyWebhookInput extends SignWebhookInput {
  signature: string;
  nowEpochSeconds?: number;
  maxAgeSeconds?: number;
}

export async function signWebhookPayload(input: SignWebhookInput): Promise<string> {
  const signed = input.context
    ? `${input.timestamp}.${input.context}.${input.payload}`
    : `${input.timestamp}.${input.payload}`;
  return createHmac("sha256", input.secret).update(signed).digest("hex");
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
