import { NextResponse } from "next/server";
import { listSourceTypeDefinitions } from "@/lib/sources";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

/** GET /api/sources/types - supported Source Registry intake types. */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const { searchParams } = new URL(request.url);
  try {
    const types = await listSourceTypeDefinitions({
      category: searchParams.get("category") ?? undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    });
    return NextResponse.json({ ok: true, count: types.length, types });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
