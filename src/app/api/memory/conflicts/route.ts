import { NextResponse } from "next/server";
import { listMemoryConflicts } from "@/lib/memory";

export const dynamic = "force-dynamic";

/** GET /api/memory/conflicts — open memory conflicts awaiting founder resolution. */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  try {
    const conflicts = await listMemoryConflicts({ limit });
    return NextResponse.json({ ok: true, conflicts });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
