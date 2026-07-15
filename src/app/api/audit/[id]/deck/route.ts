import { NextResponse } from "next/server";
import { getAudit } from "@/lib/free-audit";
import { renderAuditDeckHtml } from "@/lib/documents/render";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/audit/[id]/deck — present-ready HTML slide deck of the audit (arrow keys to navigate). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await ctx.params;
  const audit = await getAudit(id);
  if (!audit) return NextResponse.json({ ok: false, error: "audit not found" }, { status: 404 });
  const report = (audit.report ?? {}) as unknown as Record<string, unknown>;
  const html = renderAuditDeckHtml({
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
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
