import { NextResponse } from "next/server";
import { clearedSessionCookie, getSessionFromRequest, logout } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/logout — revoke the session + clear the cookie. */
export async function POST(request: Request) {
  const claims = await getSessionFromRequest(request).catch(() => null);
  if (claims) await logout(claims.sid).catch(() => {});
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearedSessionCookie());
  return res;
}
