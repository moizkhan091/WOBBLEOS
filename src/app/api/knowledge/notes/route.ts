import { NextResponse } from "next/server";
import { listKnowledgeNotes } from "@/lib/knowledge";
import { KNOWLEDGE_NOTE_TYPES } from "@/lib/domain/knowledge";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

/** GET /api/knowledge/notes?topic=&type=&sourceId=&status=&limit= — browse the compiled knowledge base. */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const noteTypes = type && (KNOWLEDGE_NOTE_TYPES as readonly string[]).includes(type) ? [type] : undefined;
  try {
    const notes = await listKnowledgeNotes({
      topic: url.searchParams.get("topic") ?? undefined,
      sourceId: url.searchParams.get("sourceId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      noteTypes,
      limit: Number(url.searchParams.get("limit") ?? 50),
    });
    return NextResponse.json({ ok: true, notes });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
