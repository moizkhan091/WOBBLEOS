import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { reviewLeadMagnet } from "@/lib/lead-magnets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reviewSchema = z.object({ decision: z.enum(["approved", "rejected", "retired"]) });

/** POST /api/lead-magnets/[id]/review — the human gate. Approve/reject a magnet, or retire an approved one. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  try {
    const magnet = await reviewLeadMagnet({ magnetId: id, decision: parsed.data.decision, reviewedBy: auth }, {});
    if (!magnet) return NextResponse.json({ ok: false, error: "lead magnet not found" }, { status: 404 });
    return NextResponse.json({ ok: true, magnet });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
