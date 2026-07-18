import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { runContentIntelligence, listContentIntelligenceRuns } from "@/lib/content-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/content/intelligence — founder-visible run history (most recent first). Founder-gated. */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  try {
    const runs = await listContentIntelligenceRuns(limitParam !== null ? Number(limitParam) : 20);
    return NextResponse.json({ ok: true, count: runs.length, runs });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

const triggerSchema = z.object({
  objective: z.string().trim().max(600).optional(),
  count: z.coerce.number().int().min(1).max(20).optional(),
  locationName: z.string().trim().max(80).optional(),
});

/**
 * POST /api/content/intelligence — the MANUAL trigger. Runs the intelligence loop inline (gather active
 * sources → strategist → scored topic bank) so the founder sees results immediately without a worker rebuild;
 * the scheduled path uses the durable job. Founder-gated.
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = triggerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });

  try {
    const result = await runContentIntelligence(
      { trigger: "manual", objective: parsed.data.objective, count: parsed.data.count, locationName: parsed.data.locationName, requestedBy: auth },
      {},
    );
    return NextResponse.json({ ok: true, runId: result.runId, sourceCount: result.sourceCount, topicCount: result.topicCount, topics: result.topics }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
