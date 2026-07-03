import { NextResponse } from "next/server";
import { z } from "zod";
import { approveMemoryUpdate, rejectMemoryUpdate } from "@/lib/memory";
import { MEMORY_TIERS, MEMORY_TRUST_LEVELS } from "@/lib/domain/memory";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

const approveSchema = z.object({
  action: z.literal("approve"),
  approvalId: z.string().trim().min(1),
  approvedBy: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  title: z.string().trim().min(1),
  memoryTier: z.enum(MEMORY_TIERS),
  trustLevel: z.enum(MEMORY_TRUST_LEVELS),
  bankSlugs: z.array(z.string().trim().min(1)).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  notes: z.string().trim().min(1).optional(),
});

const rejectSchema = z.object({
  action: z.literal("reject"),
  approvalId: z.string().trim().min(1),
  rejectedBy: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional(),
});

const memoryApprovalActionSchema = z.discriminatedUnion("action", [approveSchema, rejectSchema]);

/**
 * POST /api/memory/proposals/[id]/approval
 * Approve/reject a memory update proposal. Approval creates memory; rejection does not.
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

  const parsed = memoryApprovalActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const result =
      parsed.data.action === "approve"
        ? await approveMemoryUpdate({ proposalId: id, ...parsed.data })
        : await rejectMemoryUpdate({ proposalId: id, ...parsed.data });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = message.includes("not found")
      ? 404
      : message.includes("not pending") ||
          message.includes("not allowed") ||
          message.includes("requires explicit confirmation")
        ? 409
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
