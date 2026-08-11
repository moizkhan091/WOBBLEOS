import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import {
  audits,
  crmCompanies,
  crmContacts,
  crmLeads,
  crmOpportunities,
  crmStageHistory,
  invoices,
  meetings,
  meetingIntelligence,
  proposals,
  qualificationAssessments,
} from "@/db/schema";
import { READINESS_FORM_SOURCE } from "@/lib/domain/intake";

/**
 * One client's history, in order.
 *
 * The container could already show that an audit EXISTED and that a proposal EXISTED, but not the
 * sequence: what they said first, when we called, what changed after, how long the gaps were. A
 * founder picking a client up after two weeks needs the story, not a set of counts.
 *
 * Everything here is read from rows that already exist. No new table, no event log to keep in sync,
 * and therefore nothing that can silently drift out of agreement with the records it describes.
 */

export type TimelineKind =
  | "form"
  | "lead"
  | "contact"
  | "meeting"
  | "finding"
  | "qualification"
  | "stage"
  | "audit"
  | "proposal"
  | "invoice";

export interface TimelineEvent {
  at: string;
  kind: TimelineKind;
  /** One line, past tense, specific. */
  title: string;
  /** Optional second line with the substance. */
  detail?: string;
  /** Where to go to see it. */
  href?: string;
  /** Gap in days since the previous event, so silences are visible rather than implied. */
  gapDays?: number;
}

const iso = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export async function getClientTimeline(companyId: string, db: Db = getDb()): Promise<{ events: TimelineEvent[]; companyName: string | null }> {
  const [company] = await db.select({ name: crmCompanies.name, createdAt: crmCompanies.createdAt }).from(crmCompanies).where(eq(crmCompanies.id, companyId)).limit(1);
  if (!company) return { events: [], companyName: null };

  const [leadRows, contactRows, meetingRows, oppRows, auditRows, proposalRows, invoiceRows, qualRows] = await Promise.all([
    db.select().from(crmLeads).where(eq(crmLeads.companyId, companyId)).limit(50),
    db.select().from(crmContacts).where(and(eq(crmContacts.companyId, companyId), isNull(crmContacts.archivedAt))).limit(50),
    db.select().from(meetings).where(and(eq(meetings.companyId, companyId), isNull(meetings.archivedAt))).limit(50),
    db.select().from(crmOpportunities).where(eq(crmOpportunities.companyId, companyId)).limit(20),
    db.select().from(audits).where(eq(audits.companyId, companyId)).limit(30),
    db.select().from(proposals).where(eq(proposals.companyId, companyId)).limit(30),
    db.select().from(invoices).where(eq(invoices.companyId, companyId)).limit(30),
    db
      .select({ grade: qualificationAssessments.grade, overallScore: qualificationAssessments.overallScore, createdAt: qualificationAssessments.createdAt, version: qualificationAssessments.version })
      .from(qualificationAssessments)
      .where(and(eq(qualificationAssessments.subjectType, "company"), eq(qualificationAssessments.subjectId, companyId)))
      .limit(20),
  ]);

  const meetingIds = meetingRows.map((m) => m.id);
  const [factRows, stageRows] = await Promise.all([
    meetingIds.length ? db.select().from(meetingIntelligence).where(inArray(meetingIntelligence.meetingId, meetingIds)).limit(300) : Promise.resolve([]),
    oppRows.length ? db.select().from(crmStageHistory).where(inArray(crmStageHistory.opportunityId, oppRows.map((o) => o.id))).orderBy(desc(crmStageHistory.createdAt)).limit(200) : Promise.resolve([]),
  ]);

  const events: TimelineEvent[] = [];
  const push = (at: string | null, e: Omit<TimelineEvent, "at">) => {
    if (at) events.push({ at, ...e });
  };

  for (const l of leadRows) {
    const viaForm = l.source === READINESS_FORM_SOURCE;
    push(iso(l.createdAt), {
      kind: viaForm ? "form" : "lead",
      title: viaForm ? "Filled the AI readiness form on the website" : `Arrived as a lead${l.source ? ` from ${l.source}` : ""}`,
      detail: l.problemStated ?? undefined,
      href: "/org",
    });
  }

  for (const c of contactRows) {
    push(iso(c.createdAt), { kind: "contact", title: `${c.fullName} added as a contact${c.role ? `, ${c.role}` : ""}` });
    // Only surface a logged touch that is meaningfully after the contact was created, otherwise every
    // new contact would produce two near-identical lines.
    const touched = iso(c.lastContactedAt);
    if (touched && c.lastContactedAt && c.lastContactedAt.getTime() - c.createdAt.getTime() > 60_000) {
      push(touched, { kind: "contact", title: `Spoke to ${c.fullName}${c.preferredChannel ? ` on ${c.preferredChannel}` : ""}` });
    }
  }

  for (const m of meetingRows) {
    const facts = factRows.filter((f) => f.meetingId === m.id);
    const approved = facts.filter((f) => f.status === "approved").length;
    push(iso(m.startAt ?? m.createdAt), {
      kind: "meeting",
      title: `${m.meetingType.replace(/_/g, " ")}: ${m.title}`,
      detail: m.status === "completed" ? `${facts.length} findings extracted, ${approved} approved` : `status: ${m.status}`,
      href: "/org",
    });
  }

  for (const q of qualRows) {
    push(iso(q.createdAt), { kind: "qualification", title: `Qualified grade ${q.grade}, score ${q.overallScore}`, detail: q.version > 1 ? `re-qualified, version ${q.version}` : undefined });
  }

  for (const st of stageRows) {
    push(iso(st.createdAt), {
      kind: "stage",
      title: st.oldStage ? `Deal moved ${st.oldStage.replace(/_/g, " ")} to ${st.newStage.replace(/_/g, " ")}` : `Deal opened at ${st.newStage.replace(/_/g, " ")}`,
      detail: st.reason ?? undefined,
      href: "/crm",
    });
  }

  for (const a of auditRows) {
    push(iso(a.createdAt), { kind: "audit", title: `${a.kind === "paid" ? "Paid" : "Free"} audit run`, detail: `status: ${a.status}`, href: a.kind === "paid" ? "/paid_audit" : "/free_audit" });
  }

  for (const p of proposalRows) {
    push(iso(p.createdAt), { kind: "proposal", title: `Proposal drafted: ${p.title}`, detail: p.version > 1 ? `version ${p.version}` : undefined, href: "/docs" });
    push(iso(p.sentAt), { kind: "proposal", title: `Proposal sent: ${p.title}`, href: "/docs" });
    push(iso(p.acceptedAt), { kind: "proposal", title: `Proposal accepted: ${p.title}`, href: "/docs" });
  }

  for (const i of invoiceRows) {
    push(iso(i.createdAt), { kind: "invoice", title: `Invoice ${i.invoiceNumber} drafted`, detail: `status: ${i.status}`, href: "/invoices" });
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // Gaps, computed newest-first: each event says how long AFTER the one below it happened. A two week
  // hole in a pipeline is the thing a founder needs to see, and a list of dates does not show it.
  for (let i = 0; i < events.length - 1; i++) {
    const gap = Math.floor((new Date(events[i].at).getTime() - new Date(events[i + 1].at).getTime()) / 86_400_000);
    if (gap >= 7) events[i].gapDays = gap;
  }

  return { events, companyName: company.name };
}
