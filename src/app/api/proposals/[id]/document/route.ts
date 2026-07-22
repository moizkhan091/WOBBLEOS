import { NextResponse } from "next/server";
import { getProposal } from "@/lib/proposals";
import { buildProposalDocument, renderDocument } from "@/lib/documents";
import { renderPdf, isPdfRendererAvailable, PdfRendererUnavailableError } from "@/lib/documents/pdf";
import { resolveRequestedFormat, pdfFilename } from "@/lib/documents/request-format";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/proposals/[id]/document — the proposal as a WOBBLE-branded artifact.
 *
 * `?format=` → `document` (default prose proposal) | `deck16x9` (pitch it on screen) | `deckA4`
 * (print leave-behind). `?download=pdf` returns a PDF. Commercial terms always render LAST regardless
 * of format — the founder's rule: the decision is evaluated on business value before price.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await ctx.params;

  const { format, download, invalid } = resolveRequestedFormat(request.url, "document");
  if (invalid) return NextResponse.json({ ok: false, error: `unknown format '${invalid}' — use deck16x9, deckA4 or document` }, { status: 400 });

  const proposal = await getProposal(id);
  if (!proposal) return NextResponse.json({ ok: false, error: "proposal not found" }, { status: 404 });
  const doc = buildProposalDocument({
    title: proposal.title,
    currency: proposal.currency,
    pricingCents: proposal.pricingCents,
    scope: proposal.scope,
    services: proposal.services,
    timeline: proposal.timeline,
    terms: proposal.terms,
  });
  const html = renderDocument(doc, format);

  if (!download) {
    return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
  }
  if (!isPdfRendererAvailable()) {
    return NextResponse.json({ ok: false, error: "PDF rendering is unavailable on this host (Chromium not installed) — open the HTML view instead" }, { status: 503 });
  }
  try {
    const pdf = await renderPdf(html, format);
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdfFilename(proposal.title || "proposal", format)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const status = error instanceof PdfRendererUnavailableError ? 503 : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "PDF render failed" }, { status });
  }
}
