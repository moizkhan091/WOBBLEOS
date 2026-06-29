import { NextResponse } from "next/server";
import { listMemoryRecords } from "@/lib/memory";
import { MEMORY_TIERS, type MemoryTier } from "@/lib/domain/memory";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

/**
 * GET /api/memory
 * List approved memory/Brain records. Filters: memoryTier, area, status, limit.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  const { searchParams } = new URL(request.url);
  const tier = searchParams.get("memoryTier");
  const status = searchParams.get("status");
  const limitParam = searchParams.get("limit");

  try {
    const records = await listMemoryRecords({
      memoryTier: MEMORY_TIERS.includes(tier as MemoryTier) ? (tier as MemoryTier) : undefined,
      area: searchParams.get("area") ?? undefined,
      status: status === "active" || status === "archived" ? status : undefined,
      limit: limitParam !== null ? Number(limitParam) : undefined,
    });
    return NextResponse.json({ ok: true, count: records.length, records });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
