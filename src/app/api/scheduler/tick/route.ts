import { NextResponse } from "next/server";
import { runScheduledTick } from "@/lib/scheduler";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/scheduler/tick — run the scheduler on demand (also runs every 60s in the worker). */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const u = new URL(request.url);
    const result = await runScheduledTick({ runMaintenance: u.searchParams.get("maintenance") === "true" });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
