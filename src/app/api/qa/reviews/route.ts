import { NextResponse } from "next/server";
import { z } from "zod";
import { runQaGate, RUNNABLE_QA_BOARDS } from "@/lib/qa/gate";
import { createDbQaReviewStore } from "@/lib/qa";
import { QaIndependenceError, type QaSubmission } from "@/lib/domain/qa-board";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERDICTS = ["pass", "fail", "revise", "blocked"] as const;

/** GET /api/qa/reviews — founder inspection of persisted INDEPENDENT QA verdicts (evidence + routing). Tenant-scoped. */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  const verdict = url.searchParams.get("verdict");
  try {
    const reviews = await createDbQaReviewStore().list({
      boardSlug: url.searchParams.get("boardSlug") ?? undefined,
      department: url.searchParams.get("department") ?? undefined,
      verdict: verdict && (VERDICTS as readonly string[]).includes(verdict) ? (verdict as (typeof VERDICTS)[number]) : undefined,
      workflowId: url.searchParams.get("workflowId") ?? undefined,
      clientWorkspaceId: url.searchParams.get("clientWorkspaceId") ?? undefined,
      limit: Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200),
    });
    return NextResponse.json({ ok: true, reviews });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

const runSchema = z.object({
  boardSlug: z.string().trim().min(1),
  artifact: z.unknown(),
  submission: z.object({
    authorAgentSlug: z.string().trim().min(1),
    contributingAgents: z.array(z.string().trim().min(1)).default([]),
    workflowId: z.string().trim().min(1),
    taskId: z.string().trim().min(1).optional(),
    clientWorkspaceId: z.string().trim().min(1).optional(),
    completedStages: z.array(z.string().trim().min(1)).default([]),
  }),
});

/**
 * POST /api/qa/reviews — run an IMPLEMENTED, independent QA board over a provided artifact and PERSIST the
 * evidence-backed verdict. Founder-gated. Runs the SAME gate the live department flows use: independence is
 * enforced (a self-review is rejected 409, never a silent pass), the verdict is derived deterministically
 * from evidence, and a repeat call for the same (board, workflow, task) REUSES the review (idempotent).
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = runSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  const board = RUNNABLE_QA_BOARDS[parsed.data.boardSlug];
  if (!board) return NextResponse.json({ ok: false, error: `no runnable QA board '${parsed.data.boardSlug}' (declared-only boards cannot assess)`, runnable: Object.keys(RUNNABLE_QA_BOARDS) }, { status: 404 });

  const s = parsed.data.submission;
  const submission: QaSubmission<unknown> = {
    artifactSchema: board.targetArtifactSchema,
    artifact: parsed.data.artifact,
    authorAgentSlug: s.authorAgentSlug,
    contributingAgents: s.contributingAgents,
    department: board.department,
    workflowId: s.workflowId,
    taskId: s.taskId ?? null,
    clientWorkspaceId: s.clientWorkspaceId ?? null,
    completedStages: s.completedStages,
  };

  try {
    // A founder-initiated review persists the evidence-backed verdict but does NOT auto-raise a founder
    // escalation (the founder is already looking at it) — the only side effect is the append-only review row.
    const decision = await runQaGate({ boards: [board], submission }, { raiseEscalation: async () => {} });
    const review = decision.reviews[0];
    return NextResponse.json({
      ok: true,
      verdict: decision.verdict,
      released: decision.released,
      firstRelease: decision.firstRelease,
      routingTarget: decision.routingTarget,
      review: review ? { id: review.id, verdict: review.verdict, score: review.score, boardSlug: review.boardSlug, independent: review.independent, blockedReason: review.blockedReason, criteria: review.criteria, evidence: review.evidence, routingTarget: review.routingTarget } : null,
    }, { status: 201 });
  } catch (error) {
    // Independence is a HARD guard: a reviewer that authored/contributed to the artifact is rejected, never
    // silently passed. This surfaces as a 409 with the exact violations — no review row is written.
    if (error instanceof QaIndependenceError) return NextResponse.json({ ok: false, error: error.message, violations: error.violations }, { status: 409 });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
