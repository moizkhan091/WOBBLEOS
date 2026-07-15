import { NextResponse } from "next/server";
import { getProposal } from "@/lib/proposals";
import { renderProposalHtml } from "@/lib/documents/render";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/proposals/[id]/document — premium HTML proposal (open in a tab, print to PDF). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await ctx.params;
  const proposal = await getProposal(id);
  if (!proposal) return NextResponse.json({ ok: false, error: "proposal not found" }, { status: 404 });
  const html = renderProposalHtml({
    title: proposal.title,
    currency: proposal.currency,
    pricingCents: proposal.pricingCents,
    scope: proposal.scope,
    services: proposal.services,
    timeline: proposal.timeline,
    terms: proposal.terms,
  });
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
