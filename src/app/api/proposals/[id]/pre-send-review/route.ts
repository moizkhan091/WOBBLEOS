import { NextResponse } from "next/server";
import { isAuthError, requireFounder } from "@/lib/auth/route";
import { reviewProposalBeforeSending } from "@/lib/deal-team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/proposals/[id]/pre-send-review — the deal reviewer and the pricing analyst, together.
 *
 * They run as a pair because a founder about to send a proposal wants one answer, and because the two
 * things that sink a proposal (a promise the findings do not support, and a price with no reason a
 * client can check) usually live in the same document. Nothing is changed: both are advisory, and the
 * result is stored on the proposal so the verdict travels with it.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;

  try {
    return NextResponse.json({ ok: true, ...(await reviewProposalBeforeSending(id, { actor: auth })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = message.includes("not found") || message.includes("not attached") ? 422 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
