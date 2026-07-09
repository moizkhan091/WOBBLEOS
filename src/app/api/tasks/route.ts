import { NextResponse } from "next/server";
import { addTask, listTasks } from "@/lib/tasks";
import { createTaskSchema } from "@/lib/domain/task";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/tasks?status=&assignedTo=&opportunityId=&companyId=&limit= */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const u = new URL(request.url);
  try {
    const tasks = await listTasks({ status: u.searchParams.get("status") ?? undefined, assignedTo: u.searchParams.get("assignedTo") ?? undefined, opportunityId: u.searchParams.get("opportunityId") ?? undefined, companyId: u.searchParams.get("companyId") ?? undefined, limit: Number(u.searchParams.get("limit") ?? 300) });
    return NextResponse.json({ ok: true, tasks });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/** POST /api/tasks — create a task. */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = createTaskSchema.omit({ createdBy: true }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const task = await addTask({ ...parsed.data, createdBy: auth });
    return NextResponse.json({ ok: true, task }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
