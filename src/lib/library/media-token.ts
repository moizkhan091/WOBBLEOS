import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed-media-URL tokens (no library deps — kept separate so zernio.ts can import it without a
 * circular dependency). The HMAC binds assetId + index + EXPIRY so a signed URL can't be tampered to
 * fetch a different asset AND stops working after its lifetime (WOB-AUD-019). Format: `<exp>.<hmac>`
 * where the HMAC covers `assetId:index:exp`, so a caller cannot extend the expiry without invalidating
 * the signature. Secret: MEDIA_URL_SECRET (dedicated), falling back to SESSION_SECRET.
 */
function mediaSecret(): string {
  return (process.env.MEDIA_URL_SECRET || process.env.SESSION_SECRET || "").trim();
}

/** Default token lifetime — long enough for an external publisher to fetch, short enough to bound a leak. */
export const DEFAULT_MEDIA_TOKEN_TTL_MS = 7 * 24 * 60 * 60_000; // 7 days

function computeMac(assetId: string, index: number, exp: number): string {
  return createHmac("sha256", mediaSecret() || "unset").update(`${assetId}:${index}:${exp}`).digest("hex");
}

export function signMediaToken(assetId: string, index: number, opts: { ttlMs?: number; now?: number } = {}): string {
  const now = opts.now ?? Date.now();
  const exp = now + (opts.ttlMs ?? DEFAULT_MEDIA_TOKEN_TTL_MS);
  return `${exp}.${computeMac(assetId, index, exp)}`;
}

export function verifyMediaToken(assetId: string, index: number, token: string | null, opts: { now?: number } = {}): boolean {
  if (!token || !mediaSecret()) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(exp) || !sig) return false;
  const now = opts.now ?? Date.now();
  if (exp < now) return false; // expired — fail closed
  const expected = computeMac(assetId, index, exp);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
