import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { getCommercialJourney, getArtifactLineage } from "@/lib/commercial-journey";
import { getClientIntakeContext } from "@/lib/intake/context";
import { getStoredQuestionSet } from "@/lib/call-questions";
import { audits, crmCompanies, crmContacts, invoices, proposals } from "@/db/schema";
import { getDb } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/org/[companyId] — everything the Client Workspace shows, in one call.
 *
 * The workspace used to return only the journey + lineage, which meant a founder could see that an
 * audit EXISTED but not read it, and could not see the contact's phone number on the contact's own
 * page. Each section below exists because it was a dead end in the UI:
 *   contacts  — so you can call/WhatsApp/email them from their container
 *   audits    — with the report, so a completed audit is readable instead of a status pill
 *   proposals/invoices — so the money side of the client is visible in one place
 *   intake    — what they told us on the website form
 *   questions — the last generated pre-call question set
 * Founder-gated, read-only.
 */
export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  }
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { companyId } = await context.params;

  try {
    const db = getDb();
    const [journey, lineage, intake, questionSet, companyRows, contactRows, auditRows, proposalRows, invoiceRows] = await Promise.all([
      getCommercialJourney(companyId),
      getArtifactLineage(companyId),
      getClientIntakeContext(companyId).catch(() => ({ snapshots: [] })),
      getStoredQuestionSet(companyId).catch(() => null),
      db.select({ website: crmCompanies.website, socialLinks: crmCompanies.socialLinks, notes: crmCompanies.notes }).from(crmCompanies).where(eq(crmCompanies.id, companyId)).limit(1),
      db.select().from(crmContacts).where(eq(crmContacts.companyId, companyId)).limit(50),
      db.select().from(audits).where(eq(audits.companyId, companyId)).orderBy(desc(audits.createdAt)).limit(20),
      db.select().from(proposals).where(eq(proposals.companyId, companyId)).orderBy(desc(proposals.createdAt)).limit(20),
      db.select().from(invoices).where(eq(invoices.companyId, companyId)).orderBy(desc(invoices.createdAt)).limit(20),
    ]);

    return NextResponse.json({
      ok: true,
      journey,
      lineage,
      intake: { snapshots: intake.snapshots },
      // The Quick Pitch graph wants the client's public presence; without it the container could only
      // link out to a blank form and the founder would retype what we already hold.
      company: { website: companyRows[0]?.website ?? null, socialLinks: (companyRows[0]?.socialLinks ?? {}) as Record<string, string>, notes: companyRows[0]?.notes ?? null },
      questions: questionSet,
      contacts: contactRows.map((c) => ({
        id: c.id,
        fullName: c.fullName,
        role: c.role,
        email: c.email,
        phone: c.phone,
        whatsapp: c.whatsapp,
        linkedin: c.linkedin,
        relationshipType: c.relationshipType,
        isDecisionMaker: Boolean((c.metadata as Record<string, unknown> | null)?.isDecisionMaker),
      })),
      audits: auditRows.map((a) => {
        const report = (a.report ?? {}) as Record<string, unknown>;
        return {
          id: a.id,
          kind: a.kind,
          status: a.status,
          businessName: a.businessName,
          createdAt: a.createdAt,
          executiveSummary: typeof report.executiveSummary === "string" ? report.executiveSummary : null,
          opportunityCount: Array.isArray(report.opportunities) ? report.opportunities.length : 0,
          hasRoadmap: Boolean(report.roadmap),
          // The whole report, not a teaser. A founder on a call needs the opportunities, the roadmap and
          // the ROI in front of them; sending them to another page for the part that matters meant the
          // container could show that an audit EXISTED and never what it said.
          situationSummary: typeof report.situationSummary === "string" ? report.situationSummary : null,
          currentState: typeof report.currentState === "string" ? report.currentState : null,
          opportunities: Array.isArray(report.opportunities) ? report.opportunities.slice(0, 20) : [],
          roadmap: Array.isArray(report.roadmap) ? report.roadmap.slice(0, 8) : [],
          roi: report.roi && typeof report.roi === "object" ? report.roi : null,
          risks: Array.isArray(report.risks) ? report.risks.slice(0, 10) : [],
          nextSteps: Array.isArray(report.nextSteps) ? report.nextSteps.slice(0, 10) : [],
          successMetrics: Array.isArray(report.successMetrics) ? report.successMetrics.slice(0, 10) : [],
          recommendedTechStack: Array.isArray(report.recommendedTechStack) ? report.recommendedTechStack.slice(0, 15) : [],
        };
      }),
      // preSendReview travels with the proposal so a founder returning tomorrow sees yesterday's verdict
      // instead of paying for it again.
      proposals: proposalRows.map((p) => ({
        id: p.id, title: p.title, status: p.status, version: p.version, totalCents: p.pricingCents ?? 0, currency: p.currency ?? "USD",
        preSendReview: ((p.metadata ?? {}) as Record<string, unknown>).preSendReview ?? null,
        // A price whose unit nobody can name must not go out quietly. An audit's money fields carry no
        // currency, and defaulting to dollars once turned a rupee price into a 280x quote.
        currencyUnverified: ((p.metadata ?? {}) as Record<string, unknown>).currencyUnverified === true,
        currencyNote: (((p.metadata ?? {}) as Record<string, unknown>).currencyNote as string | undefined) ?? null,
      })),
      invoices: invoiceRows.map((i) => ({
        id: i.id, number: i.invoiceNumber, status: i.status, totalCents: i.totalCents ?? 0, amountPaidCents: i.amountPaidCents ?? 0, currency: i.currency ?? "USD", dueAt: i.dueDate,
        // The recurring schedule, so a retainer reads as a retainer rather than as one of many one-offs.
        retainer: ((i.metadata ?? {}) as Record<string, unknown>).retainer ?? null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
