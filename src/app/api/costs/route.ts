import { NextResponse } from "next/server";
import { costSummary, listModelRuns } from "@/lib/model-runs";
import type { ModelRunStatus } from "@/lib/model-runs";

export const dynamic = "force-dynamic";

/**
 * GET /api/costs
 * Cost dashboard data: today/week/month totals + recent model runs.
 * Filters for the run list: module, provider, status, limit.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");

  try {
    const [summary, runs] = await Promise.all([
      costSummary(),
      listModelRuns({
        module: searchParams.get("module") ?? undefined,
        provider: searchParams.get("provider") ?? undefined,
        status: (searchParams.get("status") as ModelRunStatus | null) ?? undefined,
        limit: limitParam !== null ? Number(limitParam) : undefined,
      }),
    ]);
    return NextResponse.json({ ok: true, summary, count: runs.length, runs });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
