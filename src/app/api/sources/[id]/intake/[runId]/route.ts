import { NextResponse } from "next/server";
import { z } from "zod";
import { markSourceIntakeRunComplete } from "@/lib/sources";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

const completeIntakeSchema = z.object({
  status: z.enum(["routed", "succeeded", "failed", "cancelled"]),
  rawPayloadRef: z.string().trim().min(1).optional(),
  extractedInsightId: z.string().trim().min(1).optional(),
  extractedData: z.record(z.string(), z.unknown()).default({}),
  memoryBanksFed: z.array(z.string().trim().min(1)).default([]),
  relatedOutputIds: z.array(z.string().trim().min(1)).default([]),
  confidence: z.number().min(0).max(1).optional(),
  costUsed: z.number().nonnegative().optional(),
  actualCost: z.number().nonnegative().optional(),
  logs: z.array(z.record(z.string(), z.unknown())).default([]),
  error: z.string().trim().min(1).optional(),
});

/** PATCH /api/sources/[id]/intake/[runId] - complete/fail a source intake run. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string; runId: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { runId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = completeIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const result = await markSourceIntakeRunComplete({ intakeRunId: runId, ...parsed.data });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const statusCode = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: statusCode });
  }
}
