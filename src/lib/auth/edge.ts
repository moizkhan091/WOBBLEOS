import { jwtVerify } from "jose";

/**
 * Edge-safe auth primitives (jose ONLY — no bcrypt, no postgres) so `middleware.ts`
 * can run on the edge runtime. The full auth service (src/lib/auth/index.ts) re-uses these.
 */

export const SESSION_COOKIE = "wobble_session";

/**
 * Claims baked into the session JWT at login.
 *
 * `founder` is the acting founder's display name. It is NOT chosen by the caller any more — it is
 * copied from the authenticated account, so it is authoritative attribution rather than a request
 * parameter. `fid` is that account's founder_profiles.id (the stable key; display names can change),
 * and `sa` marks the super-admin. Routes should keep reading `founder`; `fid`/`sa` exist for account
 * administration.
 */
export interface SessionClaims {
  sid: string;
  founder: string;
  fid: string;
  sa: boolean;
}

export function getSecretKey(secret = process.env.SESSION_SECRET): Uint8Array {
  if (!secret || secret.length < 16) throw new Error("SESSION_SECRET is not configured (min 16 chars)");
  return new TextEncoder().encode(secret);
}

/**
 * Verify JWT signature + expiry only (no DB). Returns claims or null. Never throws.
 *
 * This is the SHALLOW check used by the edge proxy. It cannot see revocation or a disabled account —
 * those live in Postgres and are enforced by verifySession() in the Node route handlers.
 */
export async function verifyJwtOnly(token: string, secret = process.env.SESSION_SECRET): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(secret));
    if (typeof payload.sid !== "string" || typeof payload.founder !== "string" || typeof payload.fid !== "string") return null;
    return { sid: payload.sid, founder: payload.founder, fid: payload.fid, sa: payload.sa === true };
  } catch {
    return null;
  }
}

export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}
