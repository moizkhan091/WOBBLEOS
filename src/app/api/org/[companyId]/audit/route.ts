import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { getCommercialJourney } from "@/lib/commercial-journey";
import { runPaidAuditGraph } from "@/lib/paid-audit-graph";
import { getDb } from "@/db";
import { meetingIntelligence } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/org/[companyId]/audit — CLIENT-CENTRIC paid audit. Instead of typing 3 fields, this assembles the
 * client's STORED context (qualification grade + recommendation, services of interest, approved discovery
 * findings from meetings) into the audit intake and runs the paid-audit graph linked to the company — so the
 * audit inherits everything we already know about the client. Founder-gated.
 */
export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { companyId } = await context.params;

  try {
    const journey = await getCommercialJourney(companyId);
    if (!journey) return NextResponse.json({ ok: false, error: "company not found" }, { status: 404 });

    // Approved discovery facts (verbatim findings) make the richest intake.
    const db = getDb();
    const factRows = (await db
      .select()
      .from(meetingIntelligence)
      .where(and(eq(meetingIntelligence.companyId, companyId), eq(meetingIntelligence.status, "approved")))) as Array<{ kind: string; content: string }>;

    const services = [...new Set(journey.opportunities.flatMap((o) => o.serviceInterest))].filter(Boolean);
    const intakeNotes = [
      journey.qualification ? `QUALIFICATION: Grade ${journey.qualification.grade} (${journey.qualification.overallScore}/100). ${journey.qualification.recommendation}` : null,
      services.length ? `SERVICES OF INTEREST: ${services.join(", ")}` : null,
      factRows.length ? `DISCOVERY FINDINGS (from meetings, founder-approved):\n${factRows.map((f) => `- [${f.kind}] ${f.content}`).join("\n")}` : null,
      `Meetings held: ${journey.meetings.length}. Discovery facts captured: ${journey.discoveryFactCount}. Furthest stage: ${journey.stage}.`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await runPaidAuditGraph({
      businessName: journey.company.name,
      industry: journey.company.industry ?? "general business",
      intakeNotes: intakeNotes || `Client ${journey.company.name} — no stored context yet.`,
      requestedBy: auth,
      companyId,
    });

    return NextResponse.json({
      ok: true,
      auditId: result.auditId,
      inheritedContext: { qualification: Boolean(journey.qualification), services: services.length, discoveryFacts: factRows.length },
      report: { serviceCount: result.report.serviceCount, opportunities: result.report.opportunities.length, executiveSummary: result.report.executiveSummary },
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
