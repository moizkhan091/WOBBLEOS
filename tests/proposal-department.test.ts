import { describe, expect, it } from "vitest";
import { buildDepartmentRow } from "@/lib/domain/department";
import { buildDepartmentMemberRow, type DepartmentMemberRow } from "@/lib/domain/department-membership";
import type { HandoffStore } from "@/lib/handoff";
import type { HandoffRow } from "@/lib/domain/handoff-delivery";
import type { ProposalRow } from "@/lib/domain/proposal";
import type { ProposalStore } from "@/lib/proposals";
import { proposalAction } from "@/lib/proposals";
import { runProposalDepartment, defaultSynthesize, type SolutionSynthesis } from "@/lib/departments/verticals/proposal";

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
    // The architect's synthesis is PERSISTED onto the artifact (metadata.solutionDesign) — the paid LLM
    // judgment is not computed-then-discarded.
    expect((proposal.metadata as { solutionDesign?: SolutionSynthesis }).solutionDesign?.technicalSolution).toContain("Missed-call");
    expect(proposal.status).toBe("draft"); // awaits founder approval — the chain has NOT fired yet
    expect(audits).toEqual(expect.arrayContaining(["department.accepted", "department.completed"]));
  });

  it("on founder ACCEPT an opportunity-linked proposal atomically emits the Sales/CRM outbox handoff (chain owns won+invoice+delivery)", async () => {
    const { store } = makeHandoffStore();
    const { store: proposalStore } = makeProposalStore();
    const emitted: import("@/lib/domain/handoff").HandoffEnvelope[] = [];
    const seen = new Set<string>();
    const acceptAndEmit = async (id: string, buildEnvelope: (p: ProposalRow) => import("@/lib/domain/handoff").HandoffEnvelope, at: Date) => {
      const p = await proposalStore.getProposal(id);
      if (!p || p.status !== "sent") return null;
      await proposalStore.updateProposal(id, { status: "accepted", acceptedAt: at, updatedAt: at });
      const env = buildEnvelope({ ...p, status: "accepted" });
      const emit = !seen.has(env.idempotencyKey);
      if (emit) { seen.add(env.idempotencyKey); emitted.push(env); }
      return { proposal: { ...p, status: "accepted" as const }, handoffId: `h_${env.idempotencyKey}`, emitted: emit };
    };
    const proposalDeps = { store: proposalStore, getAuditRow: async (id: string) => auditRow(id, "opp_9", "clientA"), acceptAndEmit, recordAudit: async () => {} };

    const res = await runProposalDepartment(
      { auditId: "aud_2", businessName: "Acme", companyId: "clientA", requestedBy: "Moiz", workflowId: "wf_prop_2" },
      { ...registry, handoffStore: store, synthesize: async () => CANNED_SYNTHESIS, proposalDeps, recordAudit: async () => {}, now },
    );
    const proposalId = res.product!.proposal.id;

    // Founder-gated lifecycle: draft → approved → sent → accepted. Accept emits the outbox handoff.
    await proposalAction(proposalId, "approve", { actor: "Moiz" }, proposalDeps);
    await proposalAction(proposalId, "send", { actor: "Moiz" }, proposalDeps);
    const accepted = await proposalAction(proposalId, "accept", { actor: "Moiz" }, proposalDeps);

    expect(accepted?.proposal.status).toBe("accepted");
    expect(accepted?.handoffId).toBeTruthy();
    expect(accepted?.invoiceId).toBeUndefined(); // no inline invoice — the commercial chain owns it
    expect(emitted).toHaveLength(1);
    expect(emitted[0].department).toBe("sales_crm");
    expect((emitted[0].previousAgentOutputs as { opportunityId?: string }).opportunityId).toBe("opp_9");

    // Duplicate acceptance loses the atomic claim → the chain never runs twice.
    expect(await proposalAction(proposalId, "accept", { actor: "Moiz" }, proposalDeps)).toBeNull();
    expect(emitted).toHaveLength(1);
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

  it("CONTEXT OS: the synthesizer injects the client's approved trusted-context block as a distinct system message when wired", async () => {
    let seen: Array<{ role: string; content: string }> = [];
    const provider = async (i: { messages: Array<{ role: string; content: unknown }> }) => { seen = i.messages.map((m) => ({ role: m.role, content: String(m.content) })); return { text: JSON.stringify({ technicalSolution: "x", integrationDesign: "y", roiAssumptions: "z", risks: [] }) }; };
    await defaultSynthesize({ auditId: "a1", businessName: "Acme", trustedContext: "APPROVED CLIENT CONTEXT: - They are on the Enterprise tier" }, { provider });
    // the trusted block is present AND it is its own system message (not the base architect prompt)
    expect(seen.some((m) => m.role === "system" && m.content.includes("APPROVED CLIENT CONTEXT"))).toBe(true);
    expect(seen.filter((m) => m.role === "system").length).toBe(2); // base prompt + the trusted block
  });

  it("CONTEXT OS: no trusted context → the synthesizer prompt has no such block (default off)", async () => {
    let seen: Array<{ role: string; content: string }> = [];
    const provider = async (i: { messages: Array<{ role: string; content: unknown }> }) => { seen = i.messages.map((m) => ({ role: m.role, content: String(m.content) })); return { text: JSON.stringify({ technicalSolution: "x", integrationDesign: "y", roiAssumptions: "z", risks: [] }) }; };
    await defaultSynthesize({ auditId: "a1", businessName: "Acme" }, { provider });
    expect(seen.some((m) => m.content.includes("APPROVED"))).toBe(false);
    expect(seen.filter((m) => m.role === "system").length).toBe(1); // just the base architect prompt
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
