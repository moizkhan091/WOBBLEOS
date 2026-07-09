import { NextResponse } from "next/server";
import { z } from "zod";
import { transitionTask, assignTask } from "@/lib/tasks";
import { TASK_STATUSES } from "@/lib/domain/task";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ action: z.literal("status"), status: z.enum(TASK_STATUSES) }),
  z.object({ action: z.literal("assign"), assignedTo: z.string().trim().min(1) }),
]);

/** POST /api/tasks/[id]/action — change status or reassign a task (audited). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const task = parsed.data.action === "status" ? await transitionTask(id, parsed.data.status, { actor: auth }) : await assignTask(id, parsed.data.assignedTo, { actor: auth });
    if (!task) return NextResponse.json({ ok: false, error: "task not found or invalid transition" }, { status: 409 });
    return NextResponse.json({ ok: true, task });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
