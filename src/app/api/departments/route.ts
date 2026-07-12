import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { getDepartmentRollups } from "@/lib/departments";

export const dynamic = "force-dynamic";

/**
 * GET /api/departments — the department roll-up for the Command Centre: per department, the live
 * inter-agent handoff activity (in-flight / completed / stuck), spend, avg quality, and the registered
 * agent team behind it. Founder-only, read-only.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  try {
    const departments = await getDepartmentRollups();
    return NextResponse.json({ ok: true, departments });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
