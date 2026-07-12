import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { getDepartmentDetail } from "@/lib/departments";

export const dynamic = "force-dynamic";

/**
 * GET /api/departments/[department] — drill into one department: its registered agent team (with
 * run/failure/quality) and its most recent inter-agent handoffs. Founder-only, read-only.
 */
export async function GET(request: Request, context: { params: Promise<{ department: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  const { department } = await context.params;
  const limit = Number(new URL(request.url).searchParams.get("limit"));
  try {
    const detail = await getDepartmentDetail(department, {}, Number.isFinite(limit) && limit > 0 ? limit : undefined);
    return NextResponse.json({ ok: true, detail });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
