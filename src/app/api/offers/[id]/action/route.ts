import { NextResponse } from "next/server";
import { z } from "zod";
import { transitionOffer, addExperiment } from "@/lib/offers";
import { OFFER_STATUSES } from "@/lib/domain/offer";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(OFFER_STATUSES), resultNotes: z.string().trim().min(1).optional(), score: z.number().int().min(0).max(100).optional() }),
  z.object({ action: z.literal("add_experiment"), name: z.string().trim().min(1), metric: z.string().trim().optional() }),
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
    const offer = p.action === "status" ? await transitionOffer(id, p.status, { actor: auth, resultNotes: p.resultNotes, score: p.score }) : await addExperiment(id, { name: p.name, metric: p.metric }, { actor: auth });
    if (!offer) return NextResponse.json({ ok: false, error: "offer not found or invalid action" }, { status: 409 });
    return NextResponse.json({ ok: true, offer });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
