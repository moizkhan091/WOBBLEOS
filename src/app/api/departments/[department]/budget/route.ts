import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { getBudgetState } from "@/lib/departments/budget";

export const dynamic = "force-dynamic";

/**
 * GET /api/departments/[department]/budget — the department's current windowed budget state: usage, caps
 * and remaining (daily/monthly cents + tokens, concurrency). Founder-only, read-only.
 */
export async function GET(request: Request, context: { params: Promise<{ department: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  const { department } = await context.params;
  try {
    const budget = await getBudgetState(department);
    if (!budget) return NextResponse.json({ ok: false, error: `department '${department}' not found` }, { status: 404 });
    return NextResponse.json({ ok: true, budget });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
