import { NextResponse } from "next/server";
import { listContextRetrievalFailures } from "@/lib/context-os";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/context/health — founder view of Context OS retrieval HEALTH: recent trusted-context retrieval
 * FAILURES (fail-open events where a generator proceeded WITHOUT grounding). A sustained fault surfaces here so
 * degraded grounding is never silent. Tenant-filterable. Founder-gated.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  const windowHours = Math.min(Number(url.searchParams.get("windowHours") ?? 24) || 24, 24 * 30);
  try {
    const { failures } = await listContextRetrievalFailures({
      scopeType: url.searchParams.get("scopeType") ?? undefined,
      scopeId: url.searchParams.get("scopeId") ?? undefined,
      sinceMs: windowHours * 3_600_000,
      limit: Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 500),
    });
    const byCategory: Record<string, number> = {};
    for (const f of failures) byCategory[f.errorCategory] = (byCategory[f.errorCategory] ?? 0) + 1;
    return NextResponse.json({ ok: true, windowHours, failureCount: failures.length, byCategory, failures });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
