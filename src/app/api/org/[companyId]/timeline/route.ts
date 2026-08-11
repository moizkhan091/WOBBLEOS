import { NextResponse } from "next/server";
import { isAuthError, requireFounder } from "@/lib/auth/route";
import { getClientTimeline } from "@/lib/client-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/org/[companyId]/timeline — this client's history in order, assembled from existing rows. */
export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { companyId } = await context.params;
  try {
    const timeline = await getClientTimeline(companyId);
    if (!timeline.companyName) return NextResponse.json({ ok: false, error: "company not found" }, { status: 404 });
    return NextResponse.json({ ok: true, ...timeline });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
