import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { approveDecisionPolicy, rejectDecisionPolicy } from "@/lib/decision-learning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/decision-policies/[id] — founder review of a DERIVED decision policy.
 * Body: { action: "approve" | "reject" }. Approve → the policy becomes `active` (and supersedes any prior
 * active policy in the same scope+category); once active it is folded into the decision scorer's prompt, so
 * approving one actually influences future decisions. Founder-gated.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };

  try {
    if (body.action === "approve") {
      const policy = await approveDecisionPolicy(id, { approvedBy: auth });
      if (!policy) return NextResponse.json({ ok: false, error: "policy not found or not in 'proposed' state" }, { status: 404 });
      return NextResponse.json({ ok: true, policy });
    }
    if (body.action === "reject") {
      const policy = await rejectDecisionPolicy(id, { rejectedBy: auth });
      if (!policy) return NextResponse.json({ ok: false, error: "policy not found" }, { status: 404 });
      return NextResponse.json({ ok: true, policy });
    }
    return NextResponse.json({ ok: false, error: "action must be 'approve' or 'reject'" }, { status: 422 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
