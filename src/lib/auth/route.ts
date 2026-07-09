import { NextResponse } from "next/server";
import { getActingFounder, type AuthDeps } from "@/lib/auth";

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
