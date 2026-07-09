import { NextResponse } from "next/server";
import { z } from "zod";
import { applyFeedPlan } from "@/lib/library";
import { requireFounder, isAuthError } from "@/lib/auth/route";

/**
 * POST /api/library/plan/apply — schedule every item in an approved feed plan (manual publisher).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  items: z
    .array(z.object({ assetId: z.string().trim().min(1), scheduledAt: z.string().trim().min(1), platform: z.string().trim().min(1) }))
    .min(1)
    .max(500),
});

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  try {
    const result = await applyFeedPlan(parsed.data.items, { createdBy: auth });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
