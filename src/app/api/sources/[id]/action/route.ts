import { NextResponse } from "next/server";
import { z } from "zod";
import { deactivateSource, reactivateSource } from "@/lib/sources";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("deactivate"), reason: z.string().trim().min(1).optional() }),
  z.object({ action: z.literal("reactivate") }),
]);

/**
 * POST /api/sources/[id]/action — founder deactivate/reactivate a source. Founder-gated.
 *   deactivate → the source drops out of the job feed + accepts no new chunks (collection + propagation STOP);
 *                the approval + all evidence are PRESERVED (never deleted). Returns the impact (chunks preserved).
 *   reactivate → reverses it (the source re-enters the feed; evidence intact).
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
    const result = parsed.data.action === "deactivate"
      ? await deactivateSource(id, { deactivatedBy: auth, reason: parsed.data.reason })
      : await reactivateSource(id, { reactivatedBy: auth });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true, source: result.source, impact: result.impact });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
