import { NextResponse } from "next/server";
import { listAudits } from "@/lib/free-audit";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/audit/workspace — every audit document (all kinds: pitch / roadmap / paid=final), so the
 * Audit Workspace UI can group them per client and show each client's 3-stage progress.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const all = await listAudits({ limit: 300 });
    // Trim to what the workspace list needs (reports can be large).
    const audits = all.map((a) => ({
      id: a.id,
      kind: a.kind,
      companyId: a.companyId,
      businessName: a.businessName,
      createdAt: a.createdAt,
      headline: (a.report as { headline?: string; executiveSummary?: string; summary?: string })?.headline ?? (a.report as { executiveSummary?: string })?.executiveSummary ?? (a.report as { summary?: string })?.summary ?? "",
      interviewPlan: ((a.report as { opportunities?: unknown[] })?.opportunities as Array<{ name?: string; expectedOutcome?: string }> | undefined) ?? [],
    }));
    return NextResponse.json({ ok: true, audits });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
