import { NextResponse } from "next/server";
import { z } from "zod";
import { driveSelectiveGraphRerun, rollbackRevisionCycle, getRevisionCycle } from "@/lib/selective-revision";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["rerun", "rollback"]) });

/**
 * POST /api/revisions/[id]/action — founder control over a selective revision. Founder-gated.
 *   rerun    → clear ONLY the reran nodes' checkpoints (the next content run for the track regenerates exactly
 *              those + reuses every preserved node's cached output).
 *   rollback → restore every component to its pre-revision snapshot (version + status).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const cycle = await getRevisionCycle(id);
    if (!cycle) return NextResponse.json({ ok: false, error: "revision cycle not found" }, { status: 404 });
    if (parsed.data.action === "rerun") {
      if (!cycle.graphRunId) return NextResponse.json({ ok: false, error: "cycle is not bound to a graph run" }, { status: 409 });
      const result = await driveSelectiveGraphRerun(id);
      return NextResponse.json({ ok: true, ...result });
    }
    const ok = await rollbackRevisionCycle(id);
    if (!ok) return NextResponse.json({ ok: false, error: "cycle not found or already rolled back" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
