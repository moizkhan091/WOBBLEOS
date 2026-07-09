import { NextResponse } from "next/server";
import { getWorkersOverview } from "@/lib/workers/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/workers — live worker heartbeats + job-queue summary. */
export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const overview = await getWorkersOverview();
    return NextResponse.json({ ok: true, ...overview });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
