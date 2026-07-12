import { describe, expect, it } from "vitest";
import { buildDepartmentRow } from "@/lib/domain/department";
import { buildDepartmentMemberRow, type DepartmentMemberRow } from "@/lib/domain/department-membership";
import type { HandoffStore } from "@/lib/handoff";
import type { HandoffRow } from "@/lib/domain/handoff-delivery";
import type { ProposalRow } from "@/lib/domain/proposal";
import type { ProposalStore } from "@/lib/proposals";
import { proposalAction } from "@/lib/proposals";
import { runProposalDepartment, type SolutionSynthesis } from "@/lib/departments/verticals/proposal";

const now = new Date("2026-07-12T12:00:00.000Z");

// A canned solution architect (no live LLM in the unit proof) — the judgment step is injected.
const CANNED_SYNTHESIS: SolutionSynthesis = {
  technicalSolution: "Missed-call-text-back + AI intake concierge on the existing phone stack.",
  integrationDesign: "Twilio ↔ CRM webhook; nightly sync to the audit's data warehouse.",
  roiAssumptions: "Recover 18% of missed calls → ~$6k/mo upside.",
  risks: ["Telephony provider rate limits", "Staff adoption"],
};

// The audit this proposal is designed from (Paid Audit department's product).
const AUDIT_REPORT: Record<string, unknown> = {
  executiveSummary: "Acme leaks acquisition at the phone.",
  opportunities: [
    { title: "Missed-call text-back", description: "Auto-text every missed call" },
    { title: "AI intake concierge", description: "Qualify + book 24/7" },
  ],
  roadmap: [{ title: "Phase 1", months: "0-3", focus: "Recover missed calls" }],
  roi: { estimatedImplementationCents: 480000 },
};

function makeHandoffStore() {
  const rows = new Map<string, HandoffRow>();
  const key = (r: { workflowId: string; idempotencyKey: string }) => `${r.workflowId}::${r.idempotencyKey}`;
  const store: HandoffStore = {
    findByIdempotency: async (wf, k) => [...rows.values()].find((r) => r.workflowId === wf && r.idempotencyKey === k) ?? null,
    insert: async (row) => { if ([...rows.values()].some((r) => key(r) === key(row))) throw new Error("duplicate key value violates unique constraint"); rows.set(row.id, row); },
    getById: async (id) => rows.get(id) ?? null,
    claimNext: async () => null,
    claimNextForDepartment: async () => null,
    transition: async (id, from, fields) => { const r = rows.get(id); if (!r || r.deliveryState !== from) return false; rows.set(id, { ...r, ...fields }); return true; },
    reclaimExpiredLeases: async () => 0,
    list: async () => [...rows.values()],
    countByState: async () => ({}),
    deleteExpired: async () => 0,
  };
  return { store, rows };
}

/** In-memory proposal store (mirrors the DB store's surface). */
function makeProposalStore() {
  const rows = new Map<string, ProposalRow>();
  const store: ProposalStore = {
    insertProposal: async (row) => { rows.set(row.id, row); },
    listProposals: async () => [...rows.values()],
    getProposal: async (id) => rows.get(id) ?? null,
    updateProposal: async (id, fields) => { const r = rows.get(id); if (r) rows.set(id, { ...r, ...fields }); },
  };
  return { store, rows };
}

const proposalDept = buildDepartmentRow(
  {
    slug: "proposal", name: "Proposal & Solution Design", purpose: "p", status: "active", orchestratorAgentSlug: "proposal_orchestrator",
    io: { acceptedHandoffSchemas: ["business_audit", "audit_report"], inboundCapabilities: ["design_solution"], outboundProducts: ["proposal_artifact"], downstreamConsumers: ["sales_crm"] },
    permissions: { authorizedMemoryScopes: ["company", "offer", "research"], permittedDataClassifications: ["internal", "client_confidential"], allowedTools: ["run_node"], deniedTools: [] },
  },
  { now },
);

const architect: DepartmentMemberRow = buildDepartmentMemberRow(
  { departmentSlug: "proposal", memberType: "agent", memberRef: "proposal_solution_architect", role: "solution_architect", responsibility: "design the solution", priority: 10, capabilities: ["solution_design"], toolGrants: ["run_node"], memoryGrants: ["company", "offer", "research"] },
  { now },
);

const registry = {
  loadDepartment: async (slug: string) => (slug === "proposal" ? proposalDept : null),
  loadMembers: async (slug: string) => (slug === "proposal" ? [architect] : []),
};

function auditRow(id: string, opportunityId: string | null, companyId: string | null) {
  return { id, businessName: "Acme", companyId, opportunityId, report: AUDIT_REPORT };
}

describe("Proposal department vertical", () => {
  it("accepts the audit handoff → architect synthesizes → deterministic proposal is created from the audit", async () => {
    const { store } = makeHandoffStore();
    const { store: proposalStore, rows: proposalRows } = makeProposalStore();
    const audits: string[] = [];

    const res = await runProposalDepartment(
      { auditId: "aud_1", businessName: "Acme", companyId: "clientA", requestedBy: "Moiz", workflowId: "wf_prop_1" },
      {
        ...registry,
        handoffStore: store,
        synthesize: async () => CANNED_SYNTHESIS,
        proposalDeps: { store: proposalStore, getAuditRow: async (id) => auditRow(id, "opp_1", "clientA"), recordAudit: async () => {} },
        recordAudit: async (e) => void audits.push(e.eventType),
        now,
      },
    );

    expect(res.accepted).toBe(true);
    // AGENT judgment rode on the product.
    expect(res.product?.synthesis.technicalSolution).toContain("Missed-call");
    // DETERMINISTIC write: the proposal was mapped from the audit (services from opportunities, pricing from ROI).
    const proposal = res.product!.proposal;
    expect(proposalRows.get(proposal.id)).toBeTruthy();
    expect(proposal.auditId).toBe("aud_1");
    expect(proposal.services.map((s) => s.name)).toEqual(["Missed-call text-back", "AI intake concierge"]);
    expect(proposal.pricingCents).toBe(480000);
    expect(proposal.opportunityId).toBe("opp_1");
    expect(proposal.status).toBe("draft"); // awaits founder approval — the chain has NOT fired yet
    expect(audits).toEqual(expect.arrayContaining(["department.accepted", "department.completed"]));
  });

  it("on founder ACCEPT the deterministic commercial chain fires (invoice draft + opportunity→won)", async () => {
    const { store } = makeHandoffStore();
    const { store: proposalStore } = makeProposalStore();
    const invoiced: Array<{ proposalId: string; totalCents: number }> = [];
    const wonOpportunities: string[] = [];

    const proposalDeps = {
      store: proposalStore,
      getAuditRow: async (id: string) => auditRow(id, "opp_9", "clientA"),
      draftInvoice: async (i: { proposalId: string; totalCents: number }) => { invoiced.push({ proposalId: i.proposalId, totalCents: i.totalCents }); return { id: "inv_1" }; },
      advanceOpportunityToWon: async (opportunityId: string) => { wonOpportunities.push(opportunityId); },
      recordAudit: async () => {},
    };

    const res = await runProposalDepartment(
      { auditId: "aud_2", businessName: "Acme", companyId: "clientA", requestedBy: "Moiz", workflowId: "wf_prop_2" },
      { ...registry, handoffStore: store, synthesize: async () => CANNED_SYNTHESIS, proposalDeps, recordAudit: async () => {}, now },
    );
    const proposalId = res.product!.proposal.id;

    // Founder-gated lifecycle: draft → approved → sent → accepted. Accept fires the commercial chain.
    await proposalAction(proposalId, "approve", { actor: "Moiz" }, proposalDeps);
    await proposalAction(proposalId, "send", { actor: "Moiz" }, proposalDeps);
    const accepted = await proposalAction(proposalId, "accept", { actor: "Moiz" }, proposalDeps);

    expect(accepted?.proposal.status).toBe("accepted");
    expect(accepted?.invoiceId).toBe("inv_1");
    expect(invoiced).toEqual([{ proposalId, totalCents: 480000 }]);
    expect(wonOpportunities).toEqual(["opp_9"]); // opportunity advanced → CRM won-hook creates the delivery project
  });

  it("escalates (not silently) when the department has no registered solution architect", async () => {
    const { store } = makeHandoffStore();
    const { store: proposalStore } = makeProposalStore();
    const audits: Array<{ type: string }> = [];

    await runProposalDepartment(
      { auditId: "aud_3", businessName: "Acme", requestedBy: "Moiz", workflowId: "wf_prop_3" },
      {
        loadDepartment: registry.loadDepartment,
        loadMembers: async () => [], // no architect
        handoffStore: store,
        synthesize: async () => CANNED_SYNTHESIS,
        proposalDeps: { store: proposalStore, getAuditRow: async (id) => auditRow(id, null, null), recordAudit: async () => {} },
        recordAudit: async (e) => void audits.push({ type: e.eventType }),
        now,
      },
    );

    expect(audits.some((a) => a.type === "department.escalated")).toBe(true);
  });

  it("throws (not a silent empty proposal) when the source audit is missing", async () => {
    const { store } = makeHandoffStore();
    const { store: proposalStore } = makeProposalStore();

    await expect(
      runProposalDepartment(
        { auditId: "missing", businessName: "Acme", requestedBy: "Moiz", workflowId: "wf_prop_4" },
        { ...registry, handoffStore: store, synthesize: async () => CANNED_SYNTHESIS, proposalDeps: { store: proposalStore, getAuditRow: async () => null, recordAudit: async () => {} }, recordAudit: async () => {}, now },
      ),
    ).rejects.toThrow(/audit 'missing' not found/);
  });
});
