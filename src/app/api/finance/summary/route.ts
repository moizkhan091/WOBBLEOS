import { NextResponse } from "next/server";
import { getRevenueSummary } from "@/lib/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/finance/summary — revenue dashboard rollups (paid, outstanding, pipeline, won, by service). */
export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const summary = await getRevenueSummary();
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
