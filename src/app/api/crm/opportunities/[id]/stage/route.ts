import { NextResponse } from "next/server";
import { z } from "zod";
import { moveOpportunityStage } from "@/lib/crm";
import { PIPELINE_STAGES } from "@/lib/domain/crm";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ stage: z.enum(PIPELINE_STAGES), reason: z.string().trim().min(1).optional() });

/** POST /api/crm/opportunities/[id]/stage — move a deal to a new pipeline stage (audited + history). */
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
    const opp = await moveOpportunityStage(id, parsed.data.stage, { actor: auth, reason: parsed.data.reason });
    if (!opp) return NextResponse.json({ ok: false, error: "opportunity not found" }, { status: 404 });
    return NextResponse.json({ ok: true, opportunity: opp });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
