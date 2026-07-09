import { NextResponse } from "next/server";
import { archiveKnowledgeNote, getKnowledgeNoteDetail } from "@/lib/knowledge";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

/** GET /api/knowledge/notes/[id] — a knowledge note with its provenance + wiki links. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await params;
  try {
    const detail = await getKnowledgeNoteDetail(id);
    if (!detail) return NextResponse.json({ ok: false, error: "knowledge note not found" }, { status: 404 });
    return NextResponse.json({ ok: true, ...detail });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/** DELETE /api/knowledge/notes/[id] — archive a note (removes it from retrieval). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await params;
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const archived = await archiveKnowledgeNote(id);
    if (!archived) return NextResponse.json({ ok: false, error: "knowledge note not found or already archived" }, { status: 404 });
    return NextResponse.json({ ok: true, status: "archived" });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
