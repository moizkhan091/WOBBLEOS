import { NextResponse } from "next/server";
import { getIntelligenceCockpit } from "@/lib/cockpit";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/cockpit — the founder Intelligence Cockpit: a read-only aggregation of the OS's real operational
 *  systems (revenue, self-optimizer, earned autonomy, what needs attention, media). Founder-gated. */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const cockpit = await getIntelligenceCockpit();
    return NextResponse.json({ ok: true, cockpit });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
