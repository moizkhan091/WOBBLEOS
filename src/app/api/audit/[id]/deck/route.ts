import { NextResponse } from "next/server";
import { getAudit } from "@/lib/free-audit";
import { buildAuditDocument, renderDocument } from "@/lib/documents";
import { renderPdf, isPdfRendererAvailable, PdfRendererUnavailableError } from "@/lib/documents/pdf";
import { resolveRequestedFormat, pdfFilename } from "@/lib/documents/request-format";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/audit/[id]/deck — the audit as a WOBBLE-branded artifact.
 *
 * `?format=` picks the shape: `deck16x9` (default, present on screen) | `deckA4` (print leave-behind)
 * | `document` (prose report). `?download=pdf` returns a PDF instead of inline HTML. The audit's
 * CONTENT is modelled once (buildAuditDocument); only the dressing changes, so switching format never
 * re-runs the thinking or costs another model call.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await ctx.params;

  const { format, download, invalid } = resolveRequestedFormat(request.url, "deck16x9");
  if (invalid) return NextResponse.json({ ok: false, error: `unknown format '${invalid}' — use deck16x9, deckA4 or document` }, { status: 400 });

  const audit = await getAudit(id);
  if (!audit) return NextResponse.json({ ok: false, error: "audit not found" }, { status: 404 });
  const report = (audit.report ?? {}) as unknown as Record<string, unknown>;
  const doc = buildAuditDocument({
    businessName: audit.businessName,
    executiveSummary: (report.executiveSummary as string) ?? (report.summary as string) ?? "",
    situationSummary: report.situationSummary as never,
    currentState: report.currentState as never,
    opportunities: report.opportunities as never,
    roadmap: report.roadmap as never,
    roi: report.roi as never,
    risks: report.risks as never,
    successMetrics: report.successMetrics as never,
    recommendedTechStack: report.recommendedTechStack as never,
    nextSteps: report.nextSteps as never,
  });
  const html = renderDocument(doc, format);

  if (!download) {
    return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
  }
  // PDF path degrades HONESTLY: if Chromium isn't installed we say so rather than emitting a broken file.
  if (!isPdfRendererAvailable()) {
    return NextResponse.json({ ok: false, error: "PDF rendering is unavailable on this host (Chromium not installed) — open the HTML view instead" }, { status: 503 });
  }
  try {
    const pdf = await renderPdf(html, format);
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdfFilename(audit.businessName || "audit", format)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const status = error instanceof PdfRendererUnavailableError ? 503 : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "PDF render failed" }, { status });
  }
}
