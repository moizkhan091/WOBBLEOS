import { NextResponse } from "next/server";
import { z } from "zod";
import { approveSkillVersion, rejectSkillVersion } from "@/lib/prompt-skills";

export const dynamic = "force-dynamic";

const actionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  approvalId: z.string().trim().min(1, "approvalId is required"),
  approvedBy: z.string().trim().min(1, "approvedBy is required"),
  notes: z.string().trim().min(1).optional(),
});

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

/** POST /api/skills/[id]/approval - approve or reject a skill version. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  const { action, approvalId, approvedBy, notes } = parsed.data;
  try {
    const skill =
      action === "approve"
        ? await approveSkillVersion({ skillId: id, approvalId, approvedBy, notes })
        : await rejectSkillVersion({ skillId: id, approvalId, approvedBy, notes });
    return NextResponse.json({ ok: true, skill });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = message.includes("not found")
      ? 404
      : message.includes("not allowed") || message.includes("requires explicit confirmation")
        ? 409
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
