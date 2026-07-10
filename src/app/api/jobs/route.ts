import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueJob, listJobs } from "@/lib/jobs";
import type { JobStatus } from "@/lib/domain/jobs";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

// Route-level schema coerces runAfter from an ISO string in JSON to a Date.
const apiEnqueueSchema = z.object({
  queue: z.string().trim().min(1),
  type: z.string().trim().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
  priority: z.number().int().optional(),
  maxAttempts: z.number().int().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  linkedModule: z.string().trim().min(1).optional(),
  linkedEntityType: z.string().trim().min(1).optional(),
  linkedEntityId: z.string().trim().min(1).optional(),
  runAfter: z.coerce.date().optional(),
});

/**
 * GET /api/jobs — list jobs (filters: queue, status, type, limit).
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  try {
    const items = await listJobs({
      queue: searchParams.get("queue") ?? undefined,
      status: (searchParams.get("status") as JobStatus | null) ?? undefined,
      type: searchParams.get("type") ?? undefined,
      limit: limitParam !== null ? Number(limitParam) : undefined,
    });
    return NextResponse.json({ ok: true, count: items.length, jobs: items });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/jobs — enqueue a job. Idempotent when idempotencyKey is supplied.
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = apiEnqueueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }
  // Enqueuing spends money (AI/network jobs) — founder-gated, like every other mutating route.
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  try {
    const { job, deduped } = await enqueueJob(parsed.data);
    return NextResponse.json({ ok: true, deduped, job }, { status: deduped ? 200 : 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
