import { and, desc, eq, isNull } from "drizzle-orm";
import { proposals as proposalsTable } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  PROPOSAL_MODULE,
  buildProposalRow,
  canTransitionProposal,
  proposalInputFromAudit,
  type CreateProposalInput,
  type ProposalRow,
  type ProposalStatus,
} from "@/lib/domain/proposal";
import { getAudit } from "@/lib/free-audit";
import { createInvoice } from "@/lib/finance";

/**
 * Proposals service (IO). Build a proposal from an audit, run the founder-gated lifecycle, and — on
 * ACCEPT — draft an invoice automatically (the Audit → Proposal → Invoice loop). Soft-delete only.
 */

export interface ProposalStore {
  insertProposal(row: ProposalRow): Promise<void>;
  listProposals(q: { status?: string; includeArchived?: boolean; limit: number }): Promise<ProposalRow[]>;
  getProposal(id: string): Promise<ProposalRow | null>;
  updateProposal(id: string, fields: Partial<ProposalRow>): Promise<void>;
}

export interface ProposalDeps {
  store?: ProposalStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  getAuditRow?: (id: string) => Promise<{ id: string; businessName: string; companyId: string | null; opportunityId: string | null; report: Record<string, unknown> } | null>;
  draftInvoice?: (input: { companyId?: string; opportunityId?: string; proposalId: string; totalCents: number; description: string; createdBy?: string }) => Promise<{ id: string } | null>;
  now?: Date;
}

async function audit(deps: ProposalDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

export async function createProposal(input: CreateProposalInput, deps: ProposalDeps = {}): Promise<ProposalRow> {
  const store = deps.store ?? defaultStore();
  const row = buildProposalRow(input, { now: deps.now });
  await store.insertProposal(row);
  await audit(deps, { eventType: "proposal.created", module: PROPOSAL_MODULE, entityType: "proposal", entityId: row.id, actor: row.createdBy ?? "system", metadata: { title: row.title, pricingCents: row.pricingCents, auditId: row.auditId } });
  return row;
}

/** Build + persist a proposal deterministically from an audit's findings. */
export async function createProposalFromAudit(auditId: string, input: { createdBy?: string } = {}, deps: ProposalDeps = {}): Promise<ProposalRow | null> {
  const getRow = deps.getAuditRow ?? (async (id: string) => {
    const a = await getAudit(id);
    return a ? { id: a.id, businessName: a.businessName, companyId: a.companyId, opportunityId: a.opportunityId, report: a.report as unknown as Record<string, unknown> } : null;
  });
  const auditRow = await getRow(auditId);
  if (!auditRow) return null;
  const proposalInput = proposalInputFromAudit(auditRow);
  return createProposal({ ...proposalInput, createdBy: input.createdBy }, deps);
}

export async function listProposals(query: { status?: string; includeArchived?: boolean; limit?: number } = {}, deps: ProposalDeps = {}): Promise<ProposalRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listProposals({ status: query.status, includeArchived: query.includeArchived, limit: Math.min(Math.max(query.limit ?? 200, 1), 500) });
}

export async function getProposal(id: string, deps: ProposalDeps = {}): Promise<ProposalRow | null> {
  return (deps.store ?? defaultStore()).getProposal(id);
}

export type ProposalAction = "approve" | "send" | "accept" | "reject";

/** Founder-gated lifecycle. accept → auto-draft an invoice for the proposal total. */
export async function proposalAction(id: string, action: ProposalAction, input: { actor: string; reason?: string }, deps: ProposalDeps = {}): Promise<{ proposal: ProposalRow; invoiceId?: string } | null> {
  const store = deps.store ?? defaultStore();
  const prop = await store.getProposal(id);
  if (!prop) return null;
  const now = deps.now ?? new Date();
  const target: ProposalStatus = action === "approve" ? "approved" : action === "send" ? "sent" : action === "accept" ? "accepted" : "rejected";
  if (!canTransitionProposal(prop.status, target)) return null;

  const fields: Partial<ProposalRow> = { status: target, updatedAt: now };
  if (action === "approve") fields.approvedBy = input.actor;
  if (action === "send") fields.sentAt = now;
  if (action === "accept") fields.acceptedAt = now;
  if (action === "reject") fields.rejectedReason = input.reason ?? null;
  await store.updateProposal(id, fields);

  let invoiceId: string | undefined;
  if (action === "accept" && prop.pricingCents > 0) {
    const draft = deps.draftInvoice ?? (async (i) => {
      const inv = await createInvoice({ companyId: i.companyId, opportunityId: i.opportunityId, proposalId: i.proposalId, lineItems: [{ description: i.description, quantity: 1, unitPriceCents: i.totalCents }], createdBy: i.createdBy }, {});
      return { id: inv.id };
    });
    const inv = await draft({ companyId: prop.companyId ?? undefined, opportunityId: prop.opportunityId ?? undefined, proposalId: prop.id, totalCents: prop.pricingCents, description: prop.title, createdBy: input.actor });
    invoiceId = inv?.id;
  }

  await audit(deps, { eventType: `proposal.${action}`, module: PROPOSAL_MODULE, entityType: "proposal", entityId: id, actor: input.actor, metadata: { from: prop.status, to: target, invoiceId } });
  return { proposal: { ...prop, ...fields }, invoiceId };
}

export function defaultStore(db: Db = getDb()): ProposalStore {
  return {
    async insertProposal(row) { await db.insert(proposalsTable).values(row); },
    async listProposals(q) {
      const conds = [];
      if (q.status) conds.push(eq(proposalsTable.status, q.status));
      if (!q.includeArchived) conds.push(isNull(proposalsTable.archivedAt));
      const base = db.select().from(proposalsTable);
      const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(desc(proposalsTable.createdAt)).limit(q.limit);
      return rows as ProposalRow[];
    },
    async getProposal(id) { const r = await db.select().from(proposalsTable).where(eq(proposalsTable.id, id)).limit(1); return (r[0] as ProposalRow) ?? null; },
    async updateProposal(id, fields) { await db.update(proposalsTable).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() }).where(eq(proposalsTable.id, id)); },
  };
}
