import { NextResponse } from "next/server";
import { getActingFounder, getSessionFromRequest, type AuthDeps, type SessionClaims } from "@/lib/auth";

/**
 * Resolve the acting founder for a MUTATING route from the verified session (DB-backed, so
 * revoked/expired sessions are rejected even though the edge proxy is JWT-only).
 *
 * Returns the founder name, or a 401 NextResponse to return immediately. This is the single
 * source of "who did this" — routes must NEVER trust a client-supplied actor/createdBy/editedBy
 * field, which a caller could set to another founder to write/edit that founder's private bank.
 *
 *   const auth = await requireFounder(request);
 *   if (isAuthError(auth)) return auth;
 *   // auth is now the trusted founder string
 */
export async function requireFounder(request: Request, deps?: AuthDeps): Promise<string | NextResponse> {
  const founder = await getActingFounder(request, deps);
  if (!founder) return NextResponse.json({ ok: false, error: "unauthenticated — please log in" }, { status: 401 });
  return founder;
}

export function isAuthError(value: string | NextResponse): value is NextResponse {
  return typeof value !== "string";
}

/**
 * The full verified session (founder name + account id + super-admin flag), or a 401 to return.
 * Use when a route needs the account IDENTITY rather than just the display name — e.g. changing your
 * own password, or administering accounts.
 */
export async function requireSession(request: Request, deps?: AuthDeps): Promise<SessionClaims | NextResponse> {
  const claims = await getSessionFromRequest(request, deps);
  if (!claims) return NextResponse.json({ ok: false, error: "unauthenticated — please log in" }, { status: 401 });
  return claims;
}

/**
 * Like requireSession, but additionally demands the super-admin founder. Returns 403 for an
 * authenticated non-admin — account administration (disable a founder, revoke their sessions) is not
 * something one founder may do to another unless they hold the admin role.
 *
 * The flag is read from the CURRENT account row by verifySession, never from the token alone, so
 * de-privileging a founder takes effect immediately rather than at token expiry.
 */
export async function requireSuperAdmin(request: Request, deps?: AuthDeps): Promise<SessionClaims | NextResponse> {
  const claims = await requireSession(request, deps);
  if (isSessionError(claims)) return claims;
  if (!claims.sa) return NextResponse.json({ ok: false, error: "forbidden — super-admin only" }, { status: 403 });
  return claims;
}

export function isSessionError(value: SessionClaims | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
