import { NextResponse } from "next/server";
import { z } from "zod";
import { createSourceIntakeRun, listSourceIntakeRuns } from "@/lib/sources";
import { SOURCE_INTAKE_STATUSES, SOURCE_INTAKE_TRIGGERS } from "@/lib/domain/sources";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

const createIntakeSchema = z.object({
  trigger: z.enum(SOURCE_INTAKE_TRIGGERS).default("manual"),
  status: z.enum(SOURCE_INTAKE_STATUSES).optional(),
  tool: z.string().trim().min(1).optional(),
  agentRunId: z.string().trim().min(1).optional(),
  jobId: z.string().trim().min(1).optional(),
  rawPayloadRef: z.string().trim().min(1).optional(),
  costEstimate: z.number().nonnegative().optional(),
  logs: z.array(z.record(z.string(), z.unknown())).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

/** GET /api/sources/[id]/intake - list intake runs for a source. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  try {
    const runs = await listSourceIntakeRuns({
      sourceId: id,
      status: SOURCE_INTAKE_STATUSES.includes(status as never) ? (status as never) : undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    });
    return NextResponse.json({ ok: true, count: runs.length, runs });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/** POST /api/sources/[id]/intake - create a source intake run. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = createIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const result = await createSourceIntakeRun({ sourceId: id, ...parsed.data });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const statusCode = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: statusCode });
  }
}
