import { NextResponse } from "next/server";
import { getSourceValue } from "@/lib/intelligence";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/intelligence/targets/[id]/value — a source's evidence-backed value/ROI (findings produced /
 *  approved / rejected, approval + false-positive rates, value score). Estimate-tiered, never a fake actual. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await ctx.params;
  try {
    const value = await getSourceValue(id);
    return NextResponse.json({ ok: true, value });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
