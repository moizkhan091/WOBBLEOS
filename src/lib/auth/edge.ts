import { jwtVerify } from "jose";

/**
 * Edge-safe auth primitives (jose ONLY — no bcrypt, no postgres) so `middleware.ts`
 * can run on the edge runtime. The full auth service (src/lib/auth/index.ts) re-uses these.
 */

export const SESSION_COOKIE = "wobble_session";

export interface SessionClaims {
  sid: string;
  founder: string;
}

export function getSecretKey(secret = process.env.SESSION_SECRET): Uint8Array {
  if (!secret || secret.length < 16) throw new Error("SESSION_SECRET is not configured (min 16 chars)");
  return new TextEncoder().encode(secret);
}

/** Verify JWT signature + expiry only (no DB). Returns claims or null. Never throws. */
export async function verifyJwtOnly(token: string, secret = process.env.SESSION_SECRET): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(secret));
    if (typeof payload.sid !== "string" || typeof payload.founder !== "string") return null;
    return { sid: payload.sid, founder: payload.founder };
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
