import { NextResponse } from "next/server";
import { getWebstats } from "@/lib/analytics/plausible";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/webstats?period=30d — live website traffic (Plausible), or an honest connect-state. */
export async function GET(request: Request) {
  const u = new URL(request.url);
  const period = u.searchParams.get("period") ?? "30d";
  try {
    const stats = await getWebstats(period);
    return NextResponse.json({ ok: true, ...stats });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
