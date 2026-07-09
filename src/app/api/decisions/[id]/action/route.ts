import { NextResponse } from "next/server";
import { z } from "zod";
import { addOption, transitionDecision, commitDecision, scoreDecisionOptions } from "@/lib/decisions";
import { DECISION_STATUSES } from "@/lib/domain/decision";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(DECISION_STATUSES) }),
  z.object({ action: z.literal("add_option"), label: z.string().trim().min(1), rationale: z.string().trim().optional(), pros: z.array(z.string().trim().min(1)).optional(), cons: z.array(z.string().trim().min(1)).optional() }),
  z.object({ action: z.literal("score") }),
  z.object({ action: z.literal("commit"), optionId: z.string().trim().min(1), rationale: z.string().trim().min(1), confidence: z.number().int().min(0).max(100).optional() }),
]);

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
    const p = parsed.data;
    const decision = p.action === "status" ? await transitionDecision(id, p.status, { actor: auth })
      : p.action === "add_option" ? await addOption(id, { label: p.label, rationale: p.rationale, pros: p.pros, cons: p.cons }, { actor: auth })
      : p.action === "score" ? await scoreDecisionOptions(id, { actor: auth })
      : await commitDecision(id, { optionId: p.optionId, rationale: p.rationale, confidence: p.confidence, actor: auth });
    if (!decision) return NextResponse.json({ ok: false, error: "decision not found or invalid action" }, { status: 409 });
    return NextResponse.json({ ok: true, decision });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
