import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { reviewResearchTarget } from "@/lib/intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/intelligence/targets/[id]/action — founder review of a PROPOSED/pending research source.
 * Body: { action: "approve" | "reject" }. Approve → the source joins the scout set (scouted on its cadence);
 * reject → it's declined (kept so the auto-scout never re-proposes it). Founder-gated + audited.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const decision = body.action === "approve" ? "approved" : body.action === "reject" ? "rejected" : null;
  if (!decision) return NextResponse.json({ ok: false, error: "action must be 'approve' or 'reject'" }, { status: 422 });

  const result = await reviewResearchTarget(id, { decision, reviewedBy: auth }, {});
  if (!result.ok) return NextResponse.json({ ok: false, error: "research target not found" }, { status: 404 });
  return NextResponse.json({ ok: true, decision, target: result.target });
}
