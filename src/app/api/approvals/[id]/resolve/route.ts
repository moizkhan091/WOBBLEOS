import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveApproval } from "@/lib/approval-router";

export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  approvedBy: z.string().trim().min(1, "approvedBy is required"),
  notes: z.string().trim().min(1).optional(),
  trustLevel: z.string().trim().min(1).optional(),
});

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

/**
 * POST /api/approvals/[id]/resolve
 * Complete an approval by dispatching to the correct entity service so the
 * underlying source/skill/content is actually approved/rejected - not just the
 * approval row. (memory_update is handled by the memory endpoint with fields.)
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

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const result = await resolveApproval({ approvalId: id, ...parsed.data });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = message.includes("not found")
      ? 404
      : message.includes("memory_update") || message.includes("not allowed") || message.includes("requires explicit confirmation")
        ? 409
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
