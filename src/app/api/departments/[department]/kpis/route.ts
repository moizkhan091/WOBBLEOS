import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { getDepartmentKpis } from "@/lib/departments/kpi";

export const dynamic = "force-dynamic";

/**
 * GET /api/departments/[department]/kpis — the department's REAL KPIs computed from runtime data
 * (handoffs, escalations, budget, approvals): value, target, trend, freshness and confidence per metric.
 * Founder-only, read-only.
 */
export async function GET(request: Request, context: { params: Promise<{ department: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  const { department } = await context.params;
  try {
    const kpis = await getDepartmentKpis(department);
    if (!kpis) return NextResponse.json({ ok: false, error: `department '${department}' not found` }, { status: 404 });
    return NextResponse.json({ ok: true, kpis });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
