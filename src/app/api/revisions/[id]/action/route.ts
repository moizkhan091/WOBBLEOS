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
      // 1) Clear ONLY the reran nodes' checkpoints (preserved nodes' cached outputs survive).
      const result = await driveSelectiveGraphRerun(id);
      // 2) Re-enqueue the producer bound to the SAME graphRunId so it loads the preserved nodes' checkpoints and
      //    regenerates only the cleared (reran) nodes — this is what makes the preservation actually pay off.
      let reenqueued = false;
      const re = cycle.reenqueue as { producer?: string; contentTrackId?: string; objective?: string; requestedBy?: string } | null;
      if (re?.producer === "content.graph" && re.contentTrackId && re.objective) {
        const { enqueueContentGraphJob } = await import("@/lib/content-graph");
        await enqueueContentGraphJob({ contentTrackId: re.contentTrackId, requestedBy: re.requestedBy ?? "Moiz", objective: re.objective, graphRunId: cycle.graphRunId, idempotencyKey: `revision_rerun:${id}` });
        reenqueued = true;
      }
      return NextResponse.json({ ok: true, ...result, reenqueued });
    }
    const ok = await rollbackRevisionCycle(id);
    if (!ok) return NextResponse.json({ ok: false, error: "cycle not found or already rolled back" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
