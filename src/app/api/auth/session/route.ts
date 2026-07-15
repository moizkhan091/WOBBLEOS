import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/auth/session — who is logged in (the acting founder), or 401. */
export async function GET(request: Request) {
  const claims = await getSessionFromRequest(request).catch(() => null);
  if (!claims) return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  return NextResponse.json({
    ok: true,
    authenticated: true,
    founder: claims.founder,
    founderId: claims.fid,
    isSuperAdmin: claims.sa,
  });
}
