import { NextResponse } from "next/server";
import { z } from "zod";
import { driveSelectiveGraphRerun, rollbackRevisionCycle, getRevisionCycle, markRevisionReran } from "@/lib/selective-revision";
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
      const reProducer = (cycle.reenqueue as { producer?: string } | null)?.producer;
      // PROPOSAL: no graph checkpoints — the rerun re-assembles a NEW proposal version, REUSING the persisted
      // synthesis when only `assemble` reran (the old proposal is retained for founder comparison).
      if (reProducer === "proposal") {
        const { rerunProposalRevision } = await import("@/lib/proposals/revision");
        const { defaultSynthesize } = await import("@/lib/departments/verticals/proposal");
        const out = await rerunProposalRevision(id, { synthesize: defaultSynthesize });
        if (!out) return NextResponse.json({ ok: false, error: "proposal cycle not rerunnable (not planned, or missing proposal/audit)" }, { status: 409 });
        return NextResponse.json({ ok: true, ...out, reenqueued: true });
      }
      if (!cycle.graphRunId) return NextResponse.json({ ok: false, error: "cycle is not bound to a graph run" }, { status: 409 });
      // 1) Clear ONLY the reran nodes' checkpoints (preserved nodes' cached outputs survive).
      const result = await driveSelectiveGraphRerun(id);
      // 2) Re-enqueue the producer bound to the SAME graphRunId so it loads the preserved nodes' checkpoints and
      //    regenerates only the cleared (reran) nodes — this is what makes the preservation actually pay off.
      let reenqueued = false;
      const re = (cycle.reenqueue ?? {}) as Record<string, unknown>;
      const rerunKey = `revision_rerun:${id}`;
      if (re.producer === "content.graph" && re.contentTrackId && re.objective) {
        const { enqueueContentGraphJob } = await import("@/lib/content-graph");
        await enqueueContentGraphJob({ contentTrackId: String(re.contentTrackId), requestedBy: String(re.requestedBy ?? "Moiz"), objective: String(re.objective), graphRunId: cycle.graphRunId, idempotencyKey: rerunKey });
        reenqueued = true;
      } else if (re.producer === "audit.paid" && re.businessName && re.intakeNotes) {
        const { enqueuePaidAuditJob } = await import("@/lib/paid-audit-graph");
        await enqueuePaidAuditJob({ businessName: String(re.businessName), industry: re.industry ? String(re.industry) : undefined, intakeNotes: String(re.intakeNotes), freeAuditSummary: re.freeAuditSummary ? String(re.freeAuditSummary) : undefined, companyId: re.companyId ? String(re.companyId) : undefined, opportunityId: re.opportunityId ? String(re.opportunityId) : undefined, requestedBy: String(re.requestedBy ?? "Moiz"), graphRunId: cycle.graphRunId, idempotencyKey: rerunKey });
        reenqueued = true;
      }
      // 3) Transition planned → reran so a SUBSEQUENT revise of the same run opens a fresh cycle (not the stale plan).
      await markRevisionReran(id);
      return NextResponse.json({ ok: true, ...result, reenqueued });
    }
    const ok = await rollbackRevisionCycle(id);
    if (!ok) return NextResponse.json({ ok: false, error: "cycle not found or already rolled back" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
