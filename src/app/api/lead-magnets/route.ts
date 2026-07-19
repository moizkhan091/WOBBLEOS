import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { listLeadMagnets } from "@/lib/lead-magnets";
import { LEAD_MAGNET_TYPES } from "@/lib/domain/lead-magnets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/lead-magnets — the lead-magnet portfolio. Founder-gated. Filter by ?status=, ?magnetType=. */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const magnetType = searchParams.get("magnetType");
  try {
    const magnets = await listLeadMagnets({
      status: ["pending_review", "approved", "rejected", "retired"].includes(status ?? "") ? (status as never) : undefined,
      magnetType: LEAD_MAGNET_TYPES.includes(magnetType as never) ? (magnetType as never) : undefined,
    });
    return NextResponse.json({ ok: true, count: magnets.length, magnets });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
