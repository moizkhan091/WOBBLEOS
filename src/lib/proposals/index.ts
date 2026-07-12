import { and, desc, eq, isNull } from "drizzle-orm";
import { proposals as proposalsTable, handoffs as handoffsTable } from "@/db/schema";
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
import { buildHandoffEnvelope, type HandoffEnvelope } from "@/lib/domain/handoff";
import { buildHandoffRow } from "@/lib/domain/handoff-delivery";
import { getAudit } from "@/lib/free-audit";
import { createInvoice } from "@/lib/finance";

/** Sales & CRM's authorized memory grant — the emitted proposal_artifact handoff narrows to this. */
const SALES_CRM_GRANT = ["company", "offer"];

/**
 * Build the `proposal_artifact` outbox envelope addressed to the Sales & CRM department. On founder
 * acceptance this is emitted (exactly-once) so the autonomous commercial chain (Sales/CRM → Finance →
 * Delivery) advances the deal, drafts the invoice and stands up the project — no inline duplication.
 */
export function buildProposalArtifactEnvelope(proposal: ProposalRow, actor: string, now: Date): HandoffEnvelope {
  const workflowId = proposal.opportunityId ?? proposal.id;
  return buildHandoffEnvelope(
    {
      workflowId,
      department: "sales_crm",
      sourceAgent: "proposal_orchestrator",
      destinationAgent: "sales_crm_orchestrator",
      actor,
      objective: `Advance the accepted proposal ${proposal.id} to a won deal`,
      requestedAction: "advance_deal",
      expectedOutputSchema: "proposal_artifact",
      confidence: 0.9,
      companyId: proposal.companyId ?? null,
      clientWorkspaceId: proposal.companyId ?? null,
      dataClassification: proposal.companyId ? "client_confidential" : "internal",
      authorizedMemoryScopes: SALES_CRM_GRANT,
      previousAgentOutputs: {
        opportunityId: proposal.opportunityId,
        proposalId: proposal.id,
        businessName: proposal.title,
        valueCents: proposal.pricingCents,
      },
      idempotencyKey: `${workflowId}:proposal_accept`,
    },
    { now },
  );
}

export interface AcceptAndEmitResult {
  proposal: ProposalRow;
  handoffId: string;
  /** true if THIS call emitted the outbox handoff; false if it was already emitted (deduped). */
  emitted: boolean;
}

/**
 * ATOMIC accept + transactional outbox: in ONE database transaction, claim the sent→accepted transition
 * (only one caller wins) AND persist the Sales/CRM handoff. A crash after commit cannot lose the downstream
 * work (both rows are committed together); a duplicate acceptance loses the claim and never re-runs the
 * chain; the handoff's (workflowId, idempotencyKey) unique index makes the emit exactly-once. Returns null
 * when the proposal is not in `sent` (already accepted / wrong state) — the caller treats null as no-op.
 */
export async function defaultAcceptAndEmit(id: string, buildEnvelope: (p: ProposalRow) => HandoffEnvelope, now: Date, db: Db = getDb()): Promise<AcceptAndEmitResult | null> {
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(proposalsTable)
      .set({ status: "accepted", acceptedAt: now, updatedAt: now })
      .where(and(eq(proposalsTable.id, id), eq(proposalsTable.status, "sent")))
      .returning();
    if (!claimed[0]) return null; // lost the atomic claim → no double-run
    const proposal = claimed[0] as ProposalRow;
    const row = buildHandoffRow(buildEnvelope(proposal), { now });
    const inserted = await tx
      .insert(handoffsTable)
      .values(row as never)
      .onConflictDoNothing({ target: [handoffsTable.workflowId, handoffsTable.idempotencyKey] })
      .returning({ id: handoffsTable.id });
    return { proposal, handoffId: inserted[0]?.id ?? row.id, emitted: inserted.length > 0 };
  });
}

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
  /** Advance the linked CRM opportunity to 'won' when a proposal is accepted (which creates delivery).
   *  Injectable for tests; the default is DB-backed + env-gated. Used only for the OPP-LESS edge path. */
  advanceOpportunityToWon?: (opportunityId: string, actor: string) => Promise<void>;
  /** ATOMIC accept + Sales/CRM outbox emit (opportunity-linked proposals). Injectable for tests; the
   *  default is a real DB transaction (claim + emit). */
  acceptAndEmit?: (id: string, buildEnvelope: (p: ProposalRow) => HandoffEnvelope, now: Date) => Promise<AcceptAndEmitResult | null>;
  now?: Date;
}

/** Default: move the linked opportunity to 'won' (idempotent — moveOpportunityStage no-ops if already won). */
async function defaultAdvanceOpportunityToWon(opportunityId: string, actor: string): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { moveOpportunityStage } = await import("@/lib/crm");
    await moveOpportunityStage(opportunityId, "won", { actor, reason: "proposal accepted" });
  } catch (error) {
    console.error("proposal-accept -> opportunity-won failed:", error instanceof Error ? error.message : error);
  }
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

/**
 * Structured judgment enrichment (the Proposal department's solution architect) persisted ONTO the
 * proposal artifact. The deterministic service still owns the write; the architect's synthesis is stored
 * so it is not paid-for-then-discarded — it rides the persisted artifact for founder review + downstream.
 */
export interface ProposalEnrichment {
  technicalSolution?: string;
  integrationDesign?: string;
  roiAssumptions?: string;
  risks?: string[];
}

/** Build + persist a proposal deterministically from an audit's findings (optionally enriched by the
 *  solution architect's synthesis, which is PERSISTED onto the artifact — never discarded). */
export async function createProposalFromAudit(auditId: string, input: { createdBy?: string; enrichment?: ProposalEnrichment } = {}, deps: ProposalDeps = {}): Promise<ProposalRow | null> {
  const getRow = deps.getAuditRow ?? (async (id: string) => {
    const a = await getAudit(id);
    return a ? { id: a.id, businessName: a.businessName, companyId: a.companyId, opportunityId: a.opportunityId, report: a.report as unknown as Record<string, unknown> } : null;
  });
  const auditRow = await getRow(auditId);
  if (!auditRow) return null;
  const proposalInput = proposalInputFromAudit(auditRow);
  const enrichment = input.enrichment;
  // The architect's technical solution enriches the visible scope when the audit's own summary is thin,
  // and the full synthesis is persisted structurally under metadata.solutionDesign.
  const scope = proposalInput.scope || (enrichment?.technicalSolution ? enrichment.technicalSolution.slice(0, 4000) : undefined);
  const metadata = enrichment && (enrichment.technicalSolution || enrichment.integrationDesign || enrichment.roiAssumptions || (enrichment.risks?.length ?? 0) > 0)
    ? { solutionDesign: enrichment }
    : undefined;
  return createProposal({ ...proposalInput, scope, metadata, createdBy: input.createdBy }, deps);
}

export async function listProposals(query: { status?: string; includeArchived?: boolean; limit?: number } = {}, deps: ProposalDeps = {}): Promise<ProposalRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listProposals({ status: query.status, includeArchived: query.includeArchived, limit: Math.min(Math.max(query.limit ?? 200, 1), 500) });
}

export async function getProposal(id: string, deps: ProposalDeps = {}): Promise<ProposalRow | null> {
  return (deps.store ?? defaultStore()).getProposal(id);
}

export type ProposalAction = "approve" | "send" | "accept" | "reject";

/**
 * Founder-gated lifecycle. On ACCEPT of an OPPORTUNITY-LINKED proposal, the accept commits atomically with
 * a Sales/CRM outbox handoff (exactly-once), and the AUTONOMOUS commercial department chain (Sales/CRM →
 * Finance → Delivery) advances the deal to won, drafts the invoice and creates the project — replacing the
 * old inline synchronous invoice/won/project writes (which were non-atomic; reviewer #5). BEHAVIOUR CHANGE
 * (intentional, documented): for opportunity-linked proposals the invoice + project now appear when the
 * consumer processes the handoff (a running worker) rather than synchronously inside the accept call. An
 * OPP-LESS proposal has no deal to advance, so it keeps the inline invoice draft (unchanged edge case).
 */
export async function proposalAction(id: string, action: ProposalAction, input: { actor: string; reason?: string }, deps: ProposalDeps = {}): Promise<{ proposal: ProposalRow; invoiceId?: string; handoffId?: string } | null> {
  const store = deps.store ?? defaultStore();
  const prop = await store.getProposal(id);
  if (!prop) return null;
  const now = deps.now ?? new Date();

  // ACCEPT + opportunity-linked → atomic accept + Sales/CRM outbox emit (the commercial chain owns the rest).
  if (action === "accept" && prop.opportunityId) {
    if (!canTransitionProposal(prop.status, "accepted")) return null;
    const emit = deps.acceptAndEmit ?? defaultAcceptAndEmit;
    const result = await emit(id, (p) => buildProposalArtifactEnvelope(p, input.actor, now), now);
    if (!result) return null; // lost the atomic claim (already accepted / not `sent`) → no double-run
    await audit(deps, { eventType: "proposal.accept", module: PROPOSAL_MODULE, entityType: "proposal", entityId: id, actor: input.actor, metadata: { from: prop.status, to: "accepted", emittedHandoffId: result.handoffId, deduped: !result.emitted } });
    return { proposal: result.proposal, handoffId: result.handoffId };
  }

  const target: ProposalStatus = action === "approve" ? "approved" : action === "send" ? "sent" : action === "accept" ? "accepted" : "rejected";
  if (!canTransitionProposal(prop.status, target)) return null;

  const fields: Partial<ProposalRow> = { status: target, updatedAt: now };
  if (action === "approve") fields.approvedBy = input.actor;
  if (action === "send") fields.sentAt = now;
  if (action === "accept") fields.acceptedAt = now;
  if (action === "reject") fields.rejectedReason = input.reason ?? null;
  await store.updateProposal(id, fields);

  // OPP-LESS accept: no deal to advance → keep the inline invoice draft (unchanged edge-case behaviour).
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
