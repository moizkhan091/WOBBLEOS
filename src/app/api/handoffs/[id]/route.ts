import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { getHandoff } from "@/lib/handoff";

export const dynamic = "force-dynamic";

/**
 * GET /api/handoffs/[id] — inspect one handoff: full envelope, attempts (retryCount/maxRetries),
 * failure reason, lease (owner/expiry), lineage (workflow/correlation/causation/parentTask), and delivery
 * telemetry (cost/latency/quality) plus every lifecycle timestamp. Founder-only.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  const { id } = await context.params;
  try {
    const handoff = await getHandoff(id);
    if (!handoff) return NextResponse.json({ ok: false, error: `handoff '${id}' not found` }, { status: 404 });
    return NextResponse.json({ ok: true, handoff });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
