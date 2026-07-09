import { NextResponse } from "next/server";
import { z } from "zod";
import { convertLead } from "@/lib/crm";
import { PIPELINE_STAGES } from "@/lib/domain/crm";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  companyName: z.string().trim().min(1).optional(),
  contactName: z.string().trim().min(1).optional(),
  valueCents: z.number().int().min(0).optional(),
  stage: z.enum(PIPELINE_STAGES).optional(),
});

/** POST /api/crm/leads/[id]/convert — turn a lead into a company + contact + opportunity. */
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
    const result = await convertLead(id, { ...parsed.data, actor: auth });
    if (!result) return NextResponse.json({ ok: false, error: "lead not found or already converted" }, { status: 409 });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
