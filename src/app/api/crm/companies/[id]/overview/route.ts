import { NextResponse } from "next/server";
import { getCompanyOverview } from "@/lib/crm/overview";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/crm/companies/[id]/overview — the company 360: everything linked to one company. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await ctx.params;
  try {
    const overview = await getCompanyOverview(id);
    if (!overview.company) return NextResponse.json({ ok: false, error: "company not found" }, { status: 404 });
    return NextResponse.json({ ok: true, ...overview });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
