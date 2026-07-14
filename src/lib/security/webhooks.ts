import { createHmac, timingSafeEqual } from "node:crypto";

/** Pre-parse body-size cap shared by every public webhook (WOB-AUD-011) — bounds memory/CPU pressure. */
export const MAX_WEBHOOK_BODY_BYTES = 4_000_000;

/**
 * Read a request body with a hard size cap enforced BEFORE parsing. Checks the Content-Length header
 * first (cheap early reject) and re-checks the actual byte length after reading.
 */
export async function readCappedRawBody(
  request: Request,
  maxBytes: number = MAX_WEBHOOK_BODY_BYTES,
): Promise<{ ok: true; raw: string } | { ok: false; status: number; error: string }> {
  const cl = request.headers.get("content-length");
  if (cl && Number.isFinite(Number(cl)) && Number(cl) > maxBytes) {
    return { ok: false, status: 413, error: `payload too large (max ${maxBytes} bytes)` };
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    return { ok: false, status: 413, error: `payload too large (max ${maxBytes} bytes)` };
  }
  return { ok: true, raw };
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
