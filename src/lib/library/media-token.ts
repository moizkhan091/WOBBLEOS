import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed-media-URL tokens (no library deps — kept separate so zernio.ts can import it without a
 * circular dependency). The HMAC binds assetId+index so a signed URL can't be tampered to fetch a
 * different asset. Secret: MEDIA_URL_SECRET, falling back to SESSION_SECRET.
 */
function mediaSecret(): string {
  return (process.env.MEDIA_URL_SECRET || process.env.SESSION_SECRET || "").trim();
}

export function signMediaToken(assetId: string, index: number): string {
  return createHmac("sha256", mediaSecret() || "unset").update(`${assetId}:${index}`).digest("hex");
}

export function verifyMediaToken(assetId: string, index: number, token: string | null): boolean {
  if (!token || !mediaSecret()) return false;
  const expected = signMediaToken(assetId, index);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
