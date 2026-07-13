import { NextResponse } from "next/server";
import { z } from "zod";
import { createMediaJob, listMediaJobs, mediaPipelineStatus } from "@/lib/media";
import { MEDIA_KINDS } from "@/lib/domain/media";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/media — Media Studio status + the durable job queue. HONEST: the provider-independent pipeline (durable
 * queue, worker, retries, crash recovery, UI) IS built; the live fal.ai call is the only blocked piece (set FAL_KEY).
 * A submitted job without a configured provider is truthfully `blocked`, never faked.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { searchParams } = new URL(request.url);
  try {
    const jobs = await listMediaJobs({ status: searchParams.get("status") ?? undefined, limit: Number(searchParams.get("limit") ?? 100) });
    return NextResponse.json({ ok: true, ...mediaPipelineStatus(), jobs });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

const createSchema = z.object({
  kind: z.enum(MEDIA_KINDS),
  prompt: z.string().trim().min(1),
  provider: z.string().trim().min(1).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  estimatedCostCents: z.number().int().nonnegative().default(0),
  budgetCapCents: z.number().int().nonnegative().default(500),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  scopeType: z.enum(["company", "client", "project"]).optional(),
  companyId: z.string().trim().min(1).optional(),
  clientId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  dedupeKey: z.string().trim().min(1).max(200).optional(),
});

/** POST /api/media — submit a media generation job (founder-gated). Validated + budget-capped + queued. */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  try {
    const result = await createMediaJob({ ...parsed.data, requestedBy: auth }, {});
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error, errors: result.errors }, { status: 422 });
    return NextResponse.json({ ok: true, deduped: result.deduped, job: result.job }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
