import { NextResponse } from "next/server";
import { listMemoryVersions } from "@/lib/memory";

export const dynamic = "force-dynamic";

/** GET /api/memory/records/[id]/versions — full edit history (newest first). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await params;
  try {
    const versions = await listMemoryVersions(id);
    return NextResponse.json({ ok: true, versions });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
