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

// ---- Artifact lineage: the DERIVATION graph for an org's commercial artifacts (provenance edges). ----

export interface ArtifactNode { id: string; type: "opportunity" | "meeting" | "audit" | "proposal" | "project"; label: string }
export interface ArtifactEdge { from: string; to: string; relation: "opp_audit" | "opp_proposal" | "opp_project" | "audit_proposal" | "proposal_project" | "meeting_opp" }
export interface ArtifactLineage { companyId: string; nodes: ArtifactNode[]; edges: ArtifactEdge[] }

export interface LineageStore {
  opportunities(companyId: string): Promise<Array<{ id: string; name: string }>>;
  meetings(companyId: string): Promise<Array<{ id: string; title: string; opportunityId: string | null }>>;
  audits(companyId: string): Promise<Array<{ id: string; businessName: string | null; opportunityId: string | null }>>;
  proposals(companyId: string): Promise<Array<{ id: string; title: string; opportunityId: string | null; auditId: string | null }>>;
  projects(companyId: string): Promise<Array<{ id: string; name: string; opportunityId: string | null; proposalId: string | null }>>;
}

/**
 * Trace how a company's artifacts DERIVE from each other. Edges only exist where the underlying record carries
 * the FK (proposal.auditId, project.proposalId, *.opportunityId) — provenance is never invented.
 */
export async function getArtifactLineage(companyId: string, deps: { store?: LineageStore } = {}): Promise<ArtifactLineage> {
  const store = deps.store ?? defaultLineageStore();
  const [opps, mtgs, auds, props, projs] = await Promise.all([
    store.opportunities(companyId), store.meetings(companyId), store.audits(companyId), store.proposals(companyId), store.projects(companyId),
  ]);
  const nodes: ArtifactNode[] = [
    ...opps.map((o) => ({ id: o.id, type: "opportunity" as const, label: o.name })),
    ...mtgs.map((m) => ({ id: m.id, type: "meeting" as const, label: m.title })),
    ...auds.map((a) => ({ id: a.id, type: "audit" as const, label: a.businessName ?? "audit" })),
    ...props.map((p) => ({ id: p.id, type: "proposal" as const, label: p.title })),
    ...projs.map((p) => ({ id: p.id, type: "project" as const, label: p.name })),
  ];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: ArtifactEdge[] = [];
  const link = (from: string | null, to: string, relation: ArtifactEdge["relation"]) => { if (from && nodeIds.has(from) && nodeIds.has(to)) edges.push({ from, to, relation }); };
  for (const m of mtgs) link(m.opportunityId, m.id, "meeting_opp");
  for (const a of auds) link(a.opportunityId, a.id, "opp_audit");
  for (const p of props) { link(p.opportunityId, p.id, "opp_proposal"); link(p.auditId, p.id, "audit_proposal"); }
  for (const p of projs) { link(p.opportunityId, p.id, "opp_project"); link(p.proposalId, p.id, "proposal_project"); }
  return { companyId, nodes, edges };
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

export function defaultLineageStore(db: Db = getDb()): LineageStore {
  return {
    async opportunities(companyId) {
      const r = await db.select().from(crmOpportunities).where(and(eq(crmOpportunities.companyId, companyId), isNull(crmOpportunities.archivedAt)));
      return r.map((o) => ({ id: o.id, name: o.name }));
    },
    async meetings(companyId) {
      const r = await db.select().from(meetingsTable).where(and(eq(meetingsTable.companyId, companyId), isNull(meetingsTable.archivedAt)));
      return r.map((m) => ({ id: m.id, title: m.title, opportunityId: m.opportunityId ?? null }));
    },
    async audits(companyId) {
      const r = await db.select().from(auditsTable).where(eq(auditsTable.companyId, companyId));
      return r.map((a) => ({ id: a.id, businessName: a.businessName ?? null, opportunityId: a.opportunityId ?? null }));
    },
    async proposals(companyId) {
      const r = await db.select().from(proposalsTable).where(and(eq(proposalsTable.companyId, companyId), isNull(proposalsTable.archivedAt)));
      return r.map((p) => ({ id: p.id, title: p.title, opportunityId: p.opportunityId ?? null, auditId: p.auditId ?? null }));
    },
    async projects(companyId) {
      const r = await db.select().from(projectsTable).where(and(eq(projectsTable.companyId, companyId), isNull(projectsTable.archivedAt)));
      return r.map((p) => ({ id: p.id, name: p.name, opportunityId: p.opportunityId ?? null, proposalId: p.proposalId ?? null }));
    },
  };
}
