import { NextResponse } from "next/server";
import { z } from "zod";
import { cancelMediaJob, retryMediaJob } from "@/lib/media";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["cancel", "retry"]) });

/**
 * POST /api/media/[id]/action — founder cancel/retry a media job. Founder-gated.
 *   cancel → a queued/generating/blocked job is terminated.
 *   retry  → a failed/blocked job is requeued (e.g. after a provider is configured).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await ctx.params;
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  try {
    const result = parsed.data.action === "cancel"
      ? await cancelMediaJob(id, { canceledBy: auth }, {})
      : await retryMediaJob(id, { retriedBy: auth }, {});
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
