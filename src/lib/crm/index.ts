import { and, desc, eq, isNull } from "drizzle-orm";
import { crmCompanies, crmContacts, crmLeads, crmOpportunities, crmStageHistory } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  CRM_MODULE,
  buildCompanyRow,
  buildContactRow,
  buildLeadRow,
  buildOpportunityRow,
  statusForStage,
  type CompanyRow,
  type ContactRow,
  type CreateCompanyInput,
  type CreateContactInput,
  type CreateLeadInput,
  type CreateOpportunityInput,
  type LeadRow,
  type OpportunityRow,
  type PipelineStage,
  type StageHistoryRow,
} from "@/lib/domain/crm";
import { newId } from "@/lib/ids";

/**
 * Wobble ERP Control Layer — CRM service (IO). Companies/contacts/leads/opportunities with an
 * audited, history-logged pipeline. Soft-delete (archive) only. Everything is dependency-injected
 * so the flows are testable without a DB.
 */

export interface CrmStore {
  insertCompany(row: CompanyRow): Promise<void>;
  listCompanies(q: { status?: string; includeArchived?: boolean; limit: number }): Promise<CompanyRow[]>;
  getCompany(id: string): Promise<CompanyRow | null>;
  updateCompany(id: string, fields: Partial<CompanyRow>): Promise<void>;

  insertContact(row: ContactRow): Promise<void>;
  listContacts(q: { companyId?: string; limit: number }): Promise<ContactRow[]>;

  insertLead(row: LeadRow): Promise<void>;
  listLeads(q: { status?: string; limit: number }): Promise<LeadRow[]>;
  getLead(id: string): Promise<LeadRow | null>;
  updateLead(id: string, fields: Partial<LeadRow>): Promise<void>;

  insertOpportunity(row: OpportunityRow): Promise<void>;
  listOpportunities(q: { stage?: string; status?: string; includeArchived?: boolean; limit: number }): Promise<OpportunityRow[]>;
  getOpportunity(id: string): Promise<OpportunityRow | null>;
  updateOpportunity(id: string, fields: Partial<OpportunityRow>): Promise<void>;

  insertStageHistory(row: StageHistoryRow): Promise<void>;
  listStageHistory(opportunityId: string): Promise<StageHistoryRow[]>;

  /**
   * Run a multi-row write chain atomically. The default (DB) store maps this to a real Postgres
   * transaction so a partial failure rolls back — no orphaned company/opportunity, no half-converted
   * lead. Optional so lightweight test/in-memory stores can omit it; callers fall back to a plain
   * sequential run when it is absent.
   */
  transaction?<T>(fn: (txStore: CrmStore) => Promise<T>): Promise<T>;
}

/** Run `fn` inside the store's transaction when it supports one, else sequentially. */
async function withTransaction<T>(store: CrmStore, fn: (s: CrmStore) => Promise<T>): Promise<T> {
  return store.transaction ? store.transaction(fn) : fn(store);
}

export interface CrmDeps {
  store?: CrmStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

async function audit(deps: CrmDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

// ---------------------------------------------------------------- companies

export async function addCompany(input: CreateCompanyInput, deps: CrmDeps = {}): Promise<CompanyRow> {
  const store = deps.store ?? defaultStore();
  const row = buildCompanyRow(input, { now: deps.now });
  await store.insertCompany(row);
  await audit(deps, { eventType: "crm.company_created", module: CRM_MODULE, entityType: "crm_company", entityId: row.id, actor: row.createdBy ?? "system", metadata: { name: row.name, status: row.status } });
  return row;
}

export async function listCompanies(query: { status?: string; includeArchived?: boolean; limit?: number } = {}, deps: CrmDeps = {}): Promise<CompanyRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listCompanies({ status: query.status, includeArchived: query.includeArchived, limit: Math.min(Math.max(query.limit ?? 200, 1), 500) });
}

export async function getCompany(id: string, deps: CrmDeps = {}): Promise<CompanyRow | null> {
  return (deps.store ?? defaultStore()).getCompany(id);
}

export async function updateCompany(id: string, fields: Partial<CompanyRow>, deps: CrmDeps = {}): Promise<boolean> {
  const store = deps.store ?? defaultStore();
  const existing = await store.getCompany(id);
  if (!existing) return false;
  await store.updateCompany(id, { ...fields, updatedAt: deps.now ?? new Date() });
  await audit(deps, { eventType: "crm.company_updated", module: CRM_MODULE, entityType: "crm_company", entityId: id, actor: "system", metadata: { fields: Object.keys(fields) } });
  return true;
}

export async function archiveCompany(id: string, deps: CrmDeps = {}): Promise<boolean> {
  const store = deps.store ?? defaultStore();
  const existing = await store.getCompany(id);
  if (!existing || existing.archivedAt) return false;
  const now = deps.now ?? new Date();
  await store.updateCompany(id, { archivedAt: now, updatedAt: now });
  await audit(deps, { eventType: "crm.company_archived", module: CRM_MODULE, entityType: "crm_company", entityId: id, actor: "system", metadata: {} });
  return true;
}

// ---------------------------------------------------------------- contacts

export async function addContact(input: CreateContactInput, deps: CrmDeps = {}): Promise<ContactRow> {
  const store = deps.store ?? defaultStore();
  const row = buildContactRow(input, { now: deps.now });
  await store.insertContact(row);
  await audit(deps, { eventType: "crm.contact_created", module: CRM_MODULE, entityType: "crm_contact", entityId: row.id, actor: "system", metadata: { companyId: row.companyId } });
  return row;
}

export async function listContacts(query: { companyId?: string; limit?: number } = {}, deps: CrmDeps = {}): Promise<ContactRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listContacts({ companyId: query.companyId, limit: Math.min(Math.max(query.limit ?? 200, 1), 500) });
}

// ---------------------------------------------------------------- leads

export async function addLead(input: CreateLeadInput, deps: CrmDeps = {}): Promise<LeadRow> {
  const store = deps.store ?? defaultStore();
  const row = buildLeadRow(input, { now: deps.now });
  await store.insertLead(row);
  await audit(deps, { eventType: "crm.lead_created", module: CRM_MODULE, entityType: "crm_lead", entityId: row.id, actor: "system", metadata: { score: row.score, status: row.status } });
  return row;
}

export async function listLeads(query: { status?: string; limit?: number } = {}, deps: CrmDeps = {}): Promise<LeadRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listLeads({ status: query.status, limit: Math.min(Math.max(query.limit ?? 200, 1), 500) });
}

/** Convert a qualified lead into a company + contact + opportunity (the whole chain, connected). */
export async function convertLead(
  leadId: string,
  input: { companyName?: string; contactName?: string; valueCents?: number; stage?: PipelineStage; actor?: string },
  deps: CrmDeps = {},
): Promise<{ company: CompanyRow; contact: ContactRow | null; opportunity: OpportunityRow } | null> {
  const store = deps.store ?? defaultStore();
  const lead = await store.getLead(leadId);
  if (!lead || lead.status === "converted") return null;
  const now = deps.now ?? new Date();

  const companyName = input.companyName || lead.companyName || lead.name;
  const company = buildCompanyRow({ name: companyName, website: lead.website ?? undefined, industry: lead.industry ?? undefined, leadSource: lead.source ?? undefined, status: "qualified_prospect", createdBy: input.actor, metadata: { fromLeadId: leadId } }, { now });

  const contactName = input.contactName || lead.contactName;
  const contact: ContactRow | null = contactName
    ? buildContactRow({ companyId: company.id, fullName: contactName, email: lead.email ?? undefined, phone: lead.phone ?? undefined, whatsapp: lead.whatsapp ?? undefined, leadSource: lead.source ?? undefined }, { now })
    : null;

  const opportunity = buildOpportunityRow(
    { name: `${companyName} — ${(lead.serviceInterest[0] ?? "AI OS")}`, companyId: company.id, contactId: contact?.id, stage: input.stage ?? "qualified", valueCents: input.valueCents ?? 0, serviceInterest: lead.serviceInterest, painPoints: lead.problemStated ?? undefined, source: lead.source ?? undefined, createdBy: input.actor },
    { now },
  );

  // Atomic: company + contact + opportunity + stage history + lead flip commit together or not at
  // all. A failure mid-chain used to orphan a company and leave the lead unconverted (re-running
  // then created a duplicate company). Audit only after the transaction commits.
  await withTransaction(store, async (tx) => {
    await tx.insertCompany(company);
    if (contact) await tx.insertContact(contact);
    await tx.insertOpportunity(opportunity);
    await tx.insertStageHistory({ id: newId("hist"), opportunityId: opportunity.id, oldStage: null, newStage: opportunity.stage, movedBy: input.actor ?? "system", reason: "converted from lead", createdAt: now });
    await tx.updateLead(leadId, { status: "converted", convertedOpportunityId: opportunity.id, updatedAt: now });
  });

  await audit(deps, { eventType: "crm.lead_converted", module: CRM_MODULE, entityType: "crm_lead", entityId: leadId, actor: input.actor ?? "system", metadata: { companyId: company.id, opportunityId: opportunity.id } });
  return { company, contact, opportunity };
}

// ---------------------------------------------------------------- opportunities + pipeline

export async function addOpportunity(input: CreateOpportunityInput, deps: CrmDeps = {}): Promise<OpportunityRow> {
  const store = deps.store ?? defaultStore();
  const row = buildOpportunityRow(input, { now: deps.now });
  row.status = statusForStage(row.stage as PipelineStage);
  await withTransaction(store, async (tx) => {
    await tx.insertOpportunity(row);
    await tx.insertStageHistory({ id: newId("hist"), opportunityId: row.id, oldStage: null, newStage: row.stage, movedBy: row.createdBy ?? "system", reason: "created", createdAt: deps.now ?? new Date() });
  });
  await audit(deps, { eventType: "crm.opportunity_created", module: CRM_MODULE, entityType: "crm_opportunity", entityId: row.id, actor: row.createdBy ?? "system", metadata: { stage: row.stage, valueCents: row.valueCents } });
  return row;
}

export async function listOpportunities(query: { stage?: string; status?: string; includeArchived?: boolean; limit?: number } = {}, deps: CrmDeps = {}): Promise<OpportunityRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listOpportunities({ stage: query.stage, status: query.status, includeArchived: query.includeArchived, limit: Math.min(Math.max(query.limit ?? 300, 1), 5000) });
}

export async function getOpportunity(id: string, deps: CrmDeps = {}): Promise<OpportunityRow | null> {
  return (deps.store ?? defaultStore()).getOpportunity(id);
}

/** Move a deal to a new pipeline stage — audited + written to stage history, resolving win/lost. */
export async function moveOpportunityStage(id: string, newStage: PipelineStage, input: { actor?: string; reason?: string } = {}, deps: CrmDeps = {}): Promise<OpportunityRow | null> {
  const store = deps.store ?? defaultStore();
  const opp = await store.getOpportunity(id);
  if (!opp) return null;
  if (opp.stage === newStage) return opp;
  const now = deps.now ?? new Date();
  const status = statusForStage(newStage);
  const fields: Partial<OpportunityRow> = { stage: newStage, status, updatedAt: now };
  if (newStage === "won") fields.probability = 100;
  await withTransaction(store, async (tx) => {
    await tx.updateOpportunity(id, fields);
    await tx.insertStageHistory({ id: newId("hist"), opportunityId: id, oldStage: opp.stage, newStage, movedBy: input.actor ?? "system", reason: input.reason ?? null, createdAt: now });
  });
  await audit(deps, { eventType: "crm.opportunity_stage_moved", module: CRM_MODULE, entityType: "crm_opportunity", entityId: id, actor: input.actor ?? "system", metadata: { from: opp.stage, to: newStage, status } });
  return { ...opp, ...fields };
}

export async function updateOpportunity(id: string, fields: Partial<OpportunityRow>, deps: CrmDeps = {}): Promise<boolean> {
  const store = deps.store ?? defaultStore();
  const opp = await store.getOpportunity(id);
  if (!opp) return false;
  await store.updateOpportunity(id, { ...fields, updatedAt: deps.now ?? new Date() });
  return true;
}

export async function getStageHistory(opportunityId: string, deps: CrmDeps = {}): Promise<StageHistoryRow[]> {
  return (deps.store ?? defaultStore()).listStageHistory(opportunityId);
}

// ---------------------------------------------------------------- default store (DB)

export function defaultStore(db: Db = getDb()): CrmStore {
  return {
    async insertCompany(row) { await db.insert(crmCompanies).values(row); },
    async listCompanies(q) {
      const conds = [];
      if (q.status) conds.push(eq(crmCompanies.status, q.status));
      if (!q.includeArchived) conds.push(isNull(crmCompanies.archivedAt));
      const base = db.select().from(crmCompanies);
      const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(desc(crmCompanies.createdAt)).limit(q.limit);
      return rows as CompanyRow[];
    },
    async getCompany(id) { const r = await db.select().from(crmCompanies).where(eq(crmCompanies.id, id)).limit(1); return (r[0] as CompanyRow) ?? null; },
    async updateCompany(id, fields) { await db.update(crmCompanies).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() }).where(eq(crmCompanies.id, id)); },

    async insertContact(row) { await db.insert(crmContacts).values(row); },
    async listContacts(q) {
      const base = db.select().from(crmContacts);
      const rows = await (q.companyId ? base.where(eq(crmContacts.companyId, q.companyId)) : base).orderBy(desc(crmContacts.createdAt)).limit(q.limit);
      return rows as ContactRow[];
    },

    async insertLead(row) { await db.insert(crmLeads).values(row); },
    async listLeads(q) {
      const base = db.select().from(crmLeads);
      const rows = await (q.status ? base.where(eq(crmLeads.status, q.status)) : base).orderBy(desc(crmLeads.createdAt)).limit(q.limit);
      return rows as LeadRow[];
    },
    async getLead(id) { const r = await db.select().from(crmLeads).where(eq(crmLeads.id, id)).limit(1); return (r[0] as LeadRow) ?? null; },
    async updateLead(id, fields) { await db.update(crmLeads).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() }).where(eq(crmLeads.id, id)); },

    async insertOpportunity(row) { await db.insert(crmOpportunities).values(row); },
    async listOpportunities(q) {
      const conds = [];
      if (q.stage) conds.push(eq(crmOpportunities.stage, q.stage));
      if (q.status) conds.push(eq(crmOpportunities.status, q.status));
      if (!q.includeArchived) conds.push(isNull(crmOpportunities.archivedAt));
      const base = db.select().from(crmOpportunities);
      const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(desc(crmOpportunities.createdAt)).limit(q.limit);
      return rows as OpportunityRow[];
    },
    async getOpportunity(id) { const r = await db.select().from(crmOpportunities).where(eq(crmOpportunities.id, id)).limit(1); return (r[0] as OpportunityRow) ?? null; },
    async updateOpportunity(id, fields) { await db.update(crmOpportunities).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() }).where(eq(crmOpportunities.id, id)); },

    async insertStageHistory(row) { await db.insert(crmStageHistory).values(row); },
    async listStageHistory(opportunityId) { const rows = await db.select().from(crmStageHistory).where(eq(crmStageHistory.opportunityId, opportunityId)).orderBy(desc(crmStageHistory.createdAt)); return rows as StageHistoryRow[]; },

    // Real Postgres transaction: build a store bound to the tx handle so every write in `fn` commits
    // atomically (or rolls back together on any throw).
    async transaction(fn) {
      return db.transaction((tx) => fn(defaultStore(tx as unknown as Db)));
    },
  };
}
