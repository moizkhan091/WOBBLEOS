import { NextResponse } from "next/server";
import { listMemoryRecords } from "@/lib/memory";
import { MEMORY_TIERS, type MemoryTier } from "@/lib/domain/memory";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

/**
 * GET /api/memory
 * List approved memory/Brain records. Filters: memoryTier, area, bankSlug, status, limit.
 *
 * Readable by any authenticated founder, including other founders' banks — company memory and founder
 * memory are both transparent internally. `requireFounder` closes WOB-UAT-029 (the edge proxy is
 * JWT-signature-only, so a revoked session read this until its token expired).
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const tier = searchParams.get("memoryTier");
  const status = searchParams.get("status");
  const limitParam = searchParams.get("limit");

  try {
    const records = await listMemoryRecords({
      memoryTier: MEMORY_TIERS.includes(tier as MemoryTier) ? (tier as MemoryTier) : undefined,
      area: searchParams.get("area") ?? undefined,
      bankSlug: searchParams.get("bankSlug") ?? undefined,
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
