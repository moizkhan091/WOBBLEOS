import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import {
  audits,
  crmCompanies,
  crmContacts,
  crmLeads,
  crmOpportunities,
  crmStageHistory,
  meetings,
  meetingIntelligence,
  proposals,
  qualificationAssessments,
} from "@/db/schema";
import { contactCanSayYes } from "@/lib/domain/crm";
import { READINESS_FORM_SOURCE } from "@/lib/domain/intake";
import {
  scoreClientHealth,
  suggestNextAction,
  type ClientHealth,
  type NextActionSuggestion,
} from "@/lib/domain/client-health";

/**
 * The worklist: every client in the pipeline, ranked by what needs a founder today.
 *
 * The Revenue section used to open on seven tools and no answer to "who do I call first". This is that
 * answer, and it is computed from rows the OS already has rather than from a model, so it is free to
 * recompute on every page load and a founder can see exactly why something is at the top.
 *
 * Every query below is set-based across all companies at once. A per-company loop here would be N+1 on
 * the busiest page in the OS.
 */

export interface WorklistEntry {
  companyId: string;
  name: string;
  industry: string | null;
  status: string | null;
  health: ClientHealth;
  next: NextActionSuggestion;
  /** The open deal, when there is one. */
  deal: { id: string; name: string; stage: string; status: string; valueCents: number; currency: string } | null;
  lastTouchAt: string | null;
  /** Counts, so the row can say what exists without another request. */
  counts: { meetings: number; approvedFindings: number; proposals: number; audits: number; contacts: number };
  hasIntake: boolean;
  hasQuestions: boolean;
}

export interface Worklist {
  entries: WorklistEntry[];
  totals: {
    clients: number;
    needAttention: number;
    openDeals: number;
    openPipelineCents: number;
    overdueActions: number;
  };
  generatedAt: string;
}

const latestOf = (...dates: Array<Date | null | undefined>): Date | null => {
  let best: Date | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (!best || d.getTime() > best.getTime()) best = d;
  }
  return best;
};

/** Grades A/B are a fit worth spending on; D/F are not. Mapped to the health model's vocabulary. */
function levelFromGrade(grade: string | null): string | null {
  if (!grade) return null;
  if (grade === "A" || grade === "B") return "strong_fit";
  if (grade === "C") return "possible_fit";
  return "poor_fit";
}

export async function getWorklist(opts: { now?: Date; limit?: number } = {}, db: Db = getDb()): Promise<Worklist> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 200;

  const companies = await db
    .select({ id: crmCompanies.id, name: crmCompanies.name, industry: crmCompanies.industry, status: crmCompanies.status, createdAt: crmCompanies.createdAt })
    .from(crmCompanies)
    .where(isNull(crmCompanies.archivedAt))
    .orderBy(desc(crmCompanies.createdAt))
    .limit(limit);

  if (!companies.length) {
    return { entries: [], totals: { clients: 0, needAttention: 0, openDeals: 0, openPipelineCents: 0, overdueActions: 0 }, generatedAt: now.toISOString() };
  }
  const ids = companies.map((c) => c.id);

  const [opps, stageMoves, contactRows, meetingRows, factRows, proposalRows, auditRows, qualRows, questionRows, intakeRows] = await Promise.all([
    db.select().from(crmOpportunities).where(and(inArray(crmOpportunities.companyId, ids), isNull(crmOpportunities.archivedAt))),
    db
      .select({ opportunityId: crmStageHistory.opportunityId, movedAt: sql<string>`max(${crmStageHistory.createdAt})` })
      .from(crmStageHistory)
      .groupBy(crmStageHistory.opportunityId),
    db.select().from(crmContacts).where(and(inArray(crmContacts.companyId, ids), isNull(crmContacts.archivedAt))),
    db.select().from(meetings).where(and(inArray(meetings.companyId, ids), isNull(meetings.archivedAt))),
    db
      .select({ companyId: meetingIntelligence.companyId, approved: sql<number>`count(*) filter (where ${meetingIntelligence.status} = 'approved')` })
      .from(meetingIntelligence)
      .where(inArray(meetingIntelligence.companyId, ids))
      .groupBy(meetingIntelligence.companyId),
    db.select().from(proposals).where(and(inArray(proposals.companyId, ids), isNull(proposals.archivedAt))),
    db.select({ id: audits.id, companyId: audits.companyId, kind: audits.kind, status: audits.status, createdAt: audits.createdAt }).from(audits).where(inArray(audits.companyId, ids)),
    db
      .select({ subjectId: qualificationAssessments.subjectId, grade: qualificationAssessments.grade, version: qualificationAssessments.version })
      .from(qualificationAssessments)
      .where(and(eq(qualificationAssessments.subjectType, "company"), inArray(qualificationAssessments.subjectId, ids))),
    // A generated question set lives on the company's metadata, not its own table.
    db
      .select({ id: crmCompanies.id })
      .from(crmCompanies)
      .where(and(inArray(crmCompanies.id, ids), sql`${crmCompanies.metadata} ? 'callQuestions'`)),
    db
      .select({ companyId: crmLeads.companyId, at: sql<string>`max(${crmLeads.createdAt})` })
      .from(crmLeads)
      .where(and(inArray(crmLeads.companyId, ids), eq(crmLeads.source, READINESS_FORM_SOURCE)))
      .groupBy(crmLeads.companyId),
  ]);

  const stageMovedAt = new Map(stageMoves.map((s) => [s.opportunityId, new Date(s.movedAt)]));
  const approvedByCompany = new Map(factRows.map((f) => [f.companyId ?? "", Number(f.approved)]));
  const questionCompanies = new Set(questionRows.map((q) => q.id));
  const intakeAt = new Map(intakeRows.map((r) => [r.companyId ?? "", new Date(r.at)]));

  // Keep only the newest qualification per company.
  const bestQual = new Map<string, { grade: string; version: number }>();
  for (const q of qualRows) {
    const prev = bestQual.get(q.subjectId);
    if (!prev || q.version > prev.version) bestQual.set(q.subjectId, { grade: q.grade, version: q.version });
  }

  const entries: WorklistEntry[] = companies.map((c) => {
    const companyOpps = opps.filter((o) => o.companyId === c.id);
    // The open deal is the one that matters; if they are all closed, show the most recent.
    const deal = companyOpps.find((o) => o.status === "open") ?? companyOpps.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
    const companyContacts = contactRows.filter((x) => x.companyId === c.id);
    const companyMeetings = meetingRows.filter((m) => m.companyId === c.id);
    const companyProposals = proposalRows.filter((p) => p.companyId === c.id);
    const companyAudits = auditRows.filter((a) => a.companyId === c.id);
    const approvedFindings = approvedByCompany.get(c.id) ?? 0;

    const lastTouchAt = latestOf(
      ...companyContacts.map((x) => x.lastContactedAt),
      ...companyMeetings.map((m) => m.startAt ?? m.createdAt),
      ...companyProposals.map((p) => p.sentAt),
      deal ? stageMovedAt.get(deal.id) ?? null : null,
      intakeAt.get(c.id) ?? null,
    );

    const shared = {
      lastTouchAt,
      createdAt: c.createdAt,
      stage: deal?.stage ?? null,
      stageSinceAt: deal ? stageMovedAt.get(deal.id) ?? deal.createdAt : null,
      dealStatus: deal?.status ?? null,
      nextAction: deal?.nextAction ?? null,
      nextActionAt: deal?.nextActionAt ?? null,
      qualificationLevel: levelFromGrade(bestQual.get(c.id)?.grade ?? null),
      meetingCount: companyMeetings.length,
      approvedFindingCount: approvedFindings,
      proposalCount: companyProposals.length,
      proposalAwaitingReply: companyProposals.some((p) => p.status === "sent" || p.status === "viewed"),
      hasIntake: intakeAt.has(c.id),
      hasDecisionMaker: companyContacts.some((x) => contactCanSayYes({ relationshipType: x.relationshipType, metadata: x.metadata as Record<string, unknown> | null })),
      now,
    };

    return {
      companyId: c.id,
      name: c.name,
      industry: c.industry ?? null,
      status: c.status ?? null,
      health: scoreClientHealth(shared),
      next: suggestNextAction({
        ...shared,
        hasQuestionSet: questionCompanies.has(c.id),
        hasAudit: companyAudits.length > 0,
        auditIsPaid: companyAudits.some((a) => a.kind === "paid"),
        lostReason: deal?.lostReason ?? null,
        hasProposal: companyProposals.length > 0,
      }),
      deal: deal ? { id: deal.id, name: deal.name, stage: deal.stage, status: deal.status, valueCents: deal.valueCents, currency: deal.currency } : null,
      lastTouchAt: lastTouchAt ? lastTouchAt.toISOString() : null,
      counts: {
        meetings: companyMeetings.length,
        approvedFindings,
        proposals: companyProposals.length,
        audits: companyAudits.length,
        contacts: companyContacts.length,
      },
      hasIntake: intakeAt.has(c.id),
      hasQuestions: questionCompanies.has(c.id),
    };
  });

  // Most urgent first; ties broken by the worse health, so the top of the list is genuinely the top.
  entries.sort((a, b) => b.next.urgency - a.next.urgency || a.health.score - b.health.score);

  return {
    entries,
    totals: {
      clients: entries.length,
      needAttention: entries.filter((e) => e.health.band === "at_risk" || e.health.band === "cold").length,
      openDeals: entries.filter((e) => e.deal?.status === "open").length,
      openPipelineCents: entries.reduce((n, e) => n + (e.deal?.status === "open" ? e.deal.valueCents : 0), 0),
      overdueActions: entries.filter((e) => e.next.urgency >= 100).length,
    },
    generatedAt: now.toISOString(),
  };
}
