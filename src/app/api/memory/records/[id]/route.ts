import { NextResponse } from "next/server";
import { z } from "zod";
import { archiveMemoryRecord, editMemoryRecord, getMemoryRecordDetail } from "@/lib/memory";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

const editSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    content: z.string().trim().min(1).optional(),
    editedBy: z.string().trim().min(1).optional(), // ignored — the acting founder comes from the session
    reason: z.string().trim().min(1).optional(),
  })
  .refine((v) => v.title !== undefined || v.content !== undefined, { message: "provide title and/or content to edit" });

function errorStatus(message: string): number {
  if (/personal memory bank/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  return 500;
}

/** GET /api/memory/records/[id] — read a memory in full detail. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await params;
  try {
    const record = await getMemoryRecordDetail(id);
    if (!record) return NextResponse.json({ ok: false, error: "memory record not found" }, { status: 404 });
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/** PATCH /api/memory/records/[id] — edit a memory (re-embeds on content change; audited). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const record = await editMemoryRecord({ id, ...parsed.data, editedBy: auth });
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: errorStatus(message) });
  }
}

const archiveSchema = z.object({ archivedBy: z.string().trim().min(1).optional(), reason: z.string().trim().min(1).optional() });

/** DELETE /api/memory/records/[id] — soft-delete (archive) a memory. Reversible via restore. Audited. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await params;
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* body optional */
  }
  const parsed = archiveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    await archiveMemoryRecord({ id, ...parsed.data, archivedBy: auth });
    return NextResponse.json({ ok: true, status: "archived" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: errorStatus(message) });
  }
}
