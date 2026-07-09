import { NextResponse } from "next/server";
import { getAudit } from "@/lib/free-audit";
import { renderAuditReportHtml } from "@/lib/documents/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/audit/[id]/document — premium HTML audit report (open in a tab, print to PDF). */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await ctx.params;
  const audit = await getAudit(id);
  if (!audit) return NextResponse.json({ ok: false, error: "audit not found" }, { status: 404 });
  const report = (audit.report ?? {}) as unknown as Record<string, unknown>;
  const html = renderAuditReportHtml({
    businessName: audit.businessName,
    industry: (report.industry as string) ?? null,
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
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
