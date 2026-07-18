import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import {
  crmCompanies, crmOpportunities, proposals as proposalsTable, projects as projectsTable, audits as auditsTable,
  meetings as meetingsTable, meetingIntelligence, qualificationAssessments,
} from "@/db/schema";

/**
 * Commercial architecture (ADDITIVE, no destructive rename) — assembles a company's full commercial journey
 * as a single lineage: org → qualification → opportunity → meeting → discovery → artifact (audit/proposal) →
 * project. Pure read/assembly over the existing tables (no new schema). The three founder-facing aliases are
 * VIEWS over existing records: an "Opportunity Snapshot" is an opportunity + its linked artifacts; a "Paid
 * Transformation Audit" is an audit of kind `paid`; "Proposal" is the proposal record — nothing is renamed.
 */

export const COMMERCIAL_JOURNEY_MODULE = "commercial_journey";

export interface OpportunitySnapshot {
  id: string;
  name: string;
  stage: string | null;
  status: string | null;
  valueCents: number;
  serviceInterest: string[];
  nextAction: string | null;
  linkedProposalId: string | null;
  linkedAuditIds: string[];
  linkedProjectIds: string[];
}

export interface JourneyMeeting {
  id: string;
  title: string;
  meetingType: string;
  status: string;
  discoveryFactCount: number;
  approvedDiscoveryFacts: number;
}

export interface CommercialJourney {
  company: { id: string; name: string; industry: string | null; status: string | null; clientType: string | null };
  qualification: { grade: string; overallScore: number; recommendation: string; version: number } | null;
  opportunities: OpportunitySnapshot[];   // "Opportunity Snapshot" alias
  meetings: JourneyMeeting[];
  discoveryFactCount: number;
  paidTransformationAudits: Array<{ id: string; status: string; businessName: string | null }>; // "Paid Transformation Audit" alias (kind=paid)
  freeAudits: number;
  proposals: Array<{ id: string; title: string; status: string; version: number }>;
  projects: Array<{ id: string; name: string; status: string; healthScore: number | null }>;
  stage: string;   // computed furthest-reached lineage stage
}

export interface CommercialJourneyStore {
  getCompany(id: string): Promise<{ id: string; name: string; industry: string | null; status: string | null; clientType: string | null } | null>;
  latestQualification(companyId: string): Promise<{ grade: string; overallScore: number; recommendation: string; version: number } | null>;
  opportunities(companyId: string): Promise<OpportunitySnapshot[]>;
  meetings(companyId: string): Promise<JourneyMeeting[]>;
  audits(companyId: string): Promise<{ paid: Array<{ id: string; status: string; businessName: string | null }>; freeCount: number }>;
  proposals(companyId: string): Promise<Array<{ id: string; title: string; status: string; version: number }>>;
  projects(companyId: string): Promise<Array<{ id: string; name: string; status: string; healthScore: number | null }>>;
}

/** The lineage stage a company has reached (furthest wins). Order = the commercial journey. */
export function computeJourneyStage(j: Omit<CommercialJourney, "stage">): string {
  if (j.projects.length) return "project"; // won → delivery
  if (j.proposals.some((p) => p.status === "accepted")) return "won";
  if (j.proposals.length) return "proposal";
  if (j.paidTransformationAudits.length) return "paid_audit";
  if (j.meetings.length || j.discoveryFactCount) return "discovery";
  if (j.opportunities.length) return "opportunity";
  if (j.qualification) return "qualified";
  return "org";
}

export async function getCommercialJourney(companyId: string, deps: { store?: CommercialJourneyStore } = {}): Promise<CommercialJourney> {
  const store = deps.store ?? defaultStore();
  const company = await store.getCompany(companyId);
  if (!company) throw new Error(`company '${companyId}' not found`);

  const [qualification, opportunities, meetings, audits, proposals, projects] = await Promise.all([
    store.latestQualification(companyId),
    store.opportunities(companyId),
    store.meetings(companyId),
    store.audits(companyId),
    store.proposals(companyId),
    store.projects(companyId),
  ]);
  const discoveryFactCount = meetings.reduce((n, m) => n + m.discoveryFactCount, 0);

  const partial: Omit<CommercialJourney, "stage"> = {
    company, qualification, opportunities, meetings, discoveryFactCount,
    paidTransformationAudits: audits.paid, freeAudits: audits.freeCount, proposals, projects,
  };
  return { ...partial, stage: computeJourneyStage(partial) };
}

export function defaultStore(db: Db = getDb()): CommercialJourneyStore {
  return {
    async getCompany(id) {
      const r = await db.select().from(crmCompanies).where(eq(crmCompanies.id, id)).limit(1);
      const c = r[0];
      return c ? { id: c.id, name: c.name, industry: c.industry ?? null, status: c.status ?? null, clientType: c.clientType ?? null } : null;
    },
    async latestQualification(companyId) {
      const r = await db.select().from(qualificationAssessments).where(and(eq(qualificationAssessments.subjectType, "company"), eq(qualificationAssessments.subjectId, companyId))).orderBy(desc(qualificationAssessments.version)).limit(1);
      const q = r[0];
      return q ? { grade: q.grade, overallScore: q.overallScore, recommendation: q.recommendation, version: q.version } : null;
    },
    async opportunities(companyId) {
      const opps = await db.select().from(crmOpportunities).where(and(eq(crmOpportunities.companyId, companyId), isNull(crmOpportunities.archivedAt)));
      const auditRows = await db.select().from(auditsTable).where(eq(auditsTable.companyId, companyId));
      const projRows = await db.select().from(projectsTable).where(eq(projectsTable.companyId, companyId));
      return opps.map((o) => ({
        id: o.id, name: o.name, stage: o.stage ?? null, status: o.status ?? null, valueCents: o.valueCents ?? 0,
        serviceInterest: o.serviceInterest ?? [], nextAction: o.nextAction ?? null, linkedProposalId: o.proposalId ?? null,
        linkedAuditIds: auditRows.filter((a) => a.opportunityId === o.id).map((a) => a.id),
        linkedProjectIds: projRows.filter((p) => p.opportunityId === o.id).map((p) => p.id),
      }));
    },
    async meetings(companyId) {
      const ms = await db.select().from(meetingsTable).where(and(eq(meetingsTable.companyId, companyId), isNull(meetingsTable.archivedAt)));
      const out: JourneyMeeting[] = [];
      for (const m of ms) {
        const facts = await db.select().from(meetingIntelligence).where(eq(meetingIntelligence.meetingId, m.id));
        out.push({ id: m.id, title: m.title, meetingType: m.meetingType, status: m.status, discoveryFactCount: facts.length, approvedDiscoveryFacts: facts.filter((f) => f.status === "approved").length });
      }
      return out;
    },
    async audits(companyId) {
      const rows = await db.select().from(auditsTable).where(eq(auditsTable.companyId, companyId));
      return {
        paid: rows.filter((a) => a.kind === "paid").map((a) => ({ id: a.id, status: a.status, businessName: a.businessName ?? null })),
        freeCount: rows.filter((a) => a.kind === "free").length,
      };
    },
    async proposals(companyId) {
      const rows = await db.select().from(proposalsTable).where(and(eq(proposalsTable.companyId, companyId), isNull(proposalsTable.archivedAt)));
      return rows.map((p) => ({ id: p.id, title: p.title, status: p.status, version: p.version }));
    },
    async projects(companyId) {
      const rows = await db.select().from(projectsTable).where(and(eq(projectsTable.companyId, companyId), isNull(projectsTable.archivedAt)));
      return rows.map((p) => ({ id: p.id, name: p.name, status: p.status, healthScore: p.healthScore ?? null }));
    },
  };
}
