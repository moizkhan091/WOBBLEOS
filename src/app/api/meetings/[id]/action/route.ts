import { NextResponse } from "next/server";
import { z } from "zod";
import { transitionMeeting } from "@/lib/meetings";
import { MEETING_STATUSES } from "@/lib/domain/meeting";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ status: z.enum(MEETING_STATUSES), outcome: z.string().trim().min(1).optional(), notes: z.string().trim().min(1).optional(), followUpRequired: z.boolean().optional() });

/** POST /api/meetings/[id]/action — change status / record outcome (audited). */
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
    const meeting = await transitionMeeting(id, parsed.data.status, { actor: auth, outcome: parsed.data.outcome, notes: parsed.data.notes, followUpRequired: parsed.data.followUpRequired });
    if (!meeting) return NextResponse.json({ ok: false, error: "meeting not found or invalid transition" }, { status: 409 });
    return NextResponse.json({ ok: true, meeting });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
