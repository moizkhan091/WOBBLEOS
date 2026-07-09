import { NextResponse } from "next/server";
import { z } from "zod";
import { transitionProject, updateProgress } from "@/lib/projects";
import { PROJECT_STATUSES } from "@/lib/domain/project";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const milestoneSchema = z.object({ title: z.string().trim().min(1), due: z.string().trim().optional(), done: z.boolean().optional() });
const deliverableSchema = z.object({ title: z.string().trim().min(1), done: z.boolean().optional() });
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(PROJECT_STATUSES) }),
  z.object({ action: z.literal("progress"), milestones: z.array(milestoneSchema).optional(), deliverables: z.array(deliverableSchema).optional() }),
]);

/** POST /api/projects/[id]/action — status change or milestone/deliverable progress (audited). */
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
    const project = parsed.data.action === "status"
      ? await transitionProject(id, parsed.data.status, { actor: auth })
      : await updateProgress(id, { milestones: parsed.data.milestones, deliverables: parsed.data.deliverables }, { actor: auth });
    if (!project) return NextResponse.json({ ok: false, error: "project not found or invalid transition" }, { status: 409 });
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
