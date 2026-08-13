import { NextResponse } from "next/server";
import { isAuthError, requireFounder } from "@/lib/auth/route";
import { getLossPattern } from "@/lib/loss-patterns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/revenue/losses — why deals actually die, grouped, with the founders' own sentences.
 *
 * Read-only and derived. Nothing here is stored, because the source of truth is the reason a founder
 * typed on the deal, and a cached summary would quietly drift away from it.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    return NextResponse.json({ ok: true, ...(await getLossPattern()) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
