import { NextResponse } from "next/server";
import { z } from "zod";
import { approveSource, rejectSource } from "@/lib/sources";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

const approveSchema = z.object({
  action: z.literal("approve"),
  approvalId: z.string().trim().min(1),
  approvedBy: z.string().trim().min(1),
  trustLevel: z.string().trim().min(1),
  notes: z.string().trim().min(1).optional(),
});

const rejectSchema = z.object({
  action: z.literal("reject"),
  approvalId: z.string().trim().min(1),
  rejectedBy: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional(),
});

const sourceApprovalActionSchema = z.discriminatedUnion("action", [approveSchema, rejectSchema]);

/**
 * POST /api/sources/[id]/approval
 * Apply a source approval/rejection and update the source record.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = sourceApprovalActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const result =
      parsed.data.action === "approve"
        ? await approveSource({ sourceId: id, ...parsed.data })
        : await rejectSource({ sourceId: id, ...parsed.data });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = message.includes("not found")
      ? 404
      : message.includes("not allowed") ||
          message.includes("requires explicit confirmation") ||
          message.includes("unknown source trust level") ||
          message.includes("blocked source")
        ? 409
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
