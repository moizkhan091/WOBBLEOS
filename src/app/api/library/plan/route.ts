import { NextResponse } from "next/server";
import { z } from "zod";
import { planFeedForLibrary } from "@/lib/library";
import { requireFounder, isAuthError } from "@/lib/auth/route";

/**
 * POST /api/library/plan — "Plan my feed": propose an ordered posting sequence over the un-actioned
 * library. Read-only (schedules nothing) — the founder reviews and applies via /plan/apply.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  startAt: z.coerce.date().optional(),
  perDay: z.number().int().min(1).max(10).optional(),
  hoursOfDay: z.array(z.number().int().min(0).max(23)).optional(),
  platform: z.enum(["instagram", "facebook", "linkedin", "x", "youtube", "tiktok"]).optional(),
  reelEvery: z.number().int().min(2).max(20).optional(),
});

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  const startAt = parsed.data.startAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000); // default: tomorrow
  try {
    const plan = await planFeedForLibrary({ ...parsed.data, startAt });
    return NextResponse.json({ ok: true, ...plan });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
