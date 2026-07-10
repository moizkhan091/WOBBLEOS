import { NextResponse } from "next/server";
import { askWobbleAgent, askAgentSchema } from "@/lib/ask/agent";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

/**
 * POST /api/ask/agent — Ask WOBBLE Orchestrator.
 *
 * The agentic command surface: the model inspects and operates the OS via the safe
 * tool registry (read live state, propose model swaps, apply confirmed upgrades).
 * Destructive tools require `confirmActions: true`; otherwise the response returns
 * `pendingConfirmation` and applies nothing.
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = askAgentSchema.omit({ founder: true }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }
  // Founder identity is the verified session — never client-supplied. This surface can apply
  // confirmed OS actions, so attribution + gating must be trustworthy.
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  try {
    const result = await askWobbleAgent({ ...parsed.data, founder: auth });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
