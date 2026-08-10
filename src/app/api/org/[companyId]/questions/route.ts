import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { generateCallQuestions, getStoredQuestionSet } from "@/lib/call-questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Pre-call questions for ONE client.
 *
 * GET  — the last set generated (free, instant). The container shows this so a founder opening the
 *        page five minutes before a call never has to wait or pay for a regeneration.
 * POST — generate a fresh set from the form answers + approved discovery facts + WOBBLE's service menu.
 *        Costs a model call, so it is deliberately an explicit action rather than something that fires
 *        on page load.
 */

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { companyId } = await context.params;
  try {
    const set = await getStoredQuestionSet(companyId);
    return NextResponse.json({ ok: true, set });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { companyId } = await context.params;
  try {
    const set = await generateCallQuestions(companyId, { actor: auth });
    return NextResponse.json({ ok: true, set }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
