import { NextResponse } from "next/server";
import { applyApprovalAction, applyActionSchema } from "@/lib/approvals";

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

  try {
    const result = await applyApprovalAction({ approvalId: id, ...parsed.data });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    // Not-found vs invalid-transition/confirmation are client-correctable -> 409; unknown -> 500.
    const status = message.includes("not found")
      ? 404
      : message.includes("not allowed") || message.includes("requires explicit confirmation")
        ? 409
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
