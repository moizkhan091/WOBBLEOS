import { NextResponse } from "next/server";
import { z } from "zod";
import { proposalAction } from "@/lib/proposals";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["approve", "send", "accept", "reject"]), reason: z.string().trim().min(1).optional() });

/**
 * POST /api/proposals/[id]/action — founder-gated lifecycle. Accepting an opportunity-linked proposal
 * atomically emits a Sales/CRM outbox handoff (returns `handoffId`); the autonomous commercial chain then
 * advances the deal to won, drafts the invoice and stands up the project. (Opp-less proposals draft an
 * inline invoice — `invoiceId`.)
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
    const result = await proposalAction(id, parsed.data.action, { actor: auth, reason: parsed.data.reason });
    if (!result) return NextResponse.json({ ok: false, error: "proposal not found or invalid transition" }, { status: 409 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
