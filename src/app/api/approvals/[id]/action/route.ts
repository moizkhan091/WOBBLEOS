import { NextResponse } from "next/server";
import { applyApprovalAction, applyActionSchema } from "@/lib/approvals";
import { resolveApproval } from "@/lib/approval-router";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

/**
 * POST /api/approvals/[id]/action
 * Apply an approval action (approve, reject, request_revision, archive,
 * send_to_n8n, retry_handoff, mark_final, approve_clip, reject_clip,
 * approve_final_mp4, ...). Requires approvedBy. High-risk actions require
 * confirmationProvided: true. Invalid transitions are rejected.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = applyActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  try {
    // approve/reject must run the SAME downstream effect as /resolve (source compile, content import,
    // memory create, …) — route them through resolveApproval so both approval routes are identical.
    // Other actions (archive, send_to_n8n, retry_handoff, clip/final gates, …) stay on applyApprovalAction.
    const action = parsed.data.action;
    if (action === "approve" || action === "reject") {
      const result = await resolveApproval({ approvalId: id, action, approvedBy: auth, notes: parsed.data.notes });
      return NextResponse.json({ ok: true, result });
    }
    const result = await applyApprovalAction({ approvalId: id, ...parsed.data, approvedBy: auth });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    // Not-found vs invalid-transition/confirmation/missing-reason are client-correctable -> 409; unknown -> 500.
    const status = message.includes("not found")
      ? 404
      : message.includes("not allowed") || message.includes("requires explicit confirmation") || message.includes("reason is required") || message.includes("already actioned")
        ? 409
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
