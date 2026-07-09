import { NextResponse } from "next/server";
import { retrieveKnowledge } from "@/lib/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/knowledge/retrieve?query=...&limit=&topic=&type= — the hybrid retrieval contract:
 * synthesized knowledge notes (understanding) + raw source chunks (fidelity/citation).
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const url = new URL(request.url);
  const query = url.searchParams.get("query")?.trim();
  if (!query) return NextResponse.json({ ok: false, error: "query is required" }, { status: 422 });
  const type = url.searchParams.get("type");
  try {
    const result = await retrieveKnowledge({
      query,
      topic: url.searchParams.get("topic") ?? undefined,
      noteTypes: type ? [type] : undefined,
      limit: Number(url.searchParams.get("limit") ?? 12),
      chunkLimit: Number(url.searchParams.get("chunkLimit") ?? 6),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
