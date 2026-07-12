import { describe, expect, it } from "vitest";
import { buildDepartmentRow } from "@/lib/domain/department";
import { buildDepartmentMemberRow, type DepartmentMemberRow } from "@/lib/domain/department-membership";
import type { HandoffStore } from "@/lib/handoff";
import type { HandoffRow } from "@/lib/domain/handoff-delivery";
import type { ProposalRow } from "@/lib/domain/proposal";
import type { ProposalStore } from "@/lib/proposals";
import type { SolutionSynthesis } from "@/lib/departments/verticals/proposal";
import { dispatchBusinessAuditToProposal } from "@/lib/departments/verticals/paid-audit";
import { runDepartmentConsumerTick } from "@/lib/departments/consumer";

const now = new Date("2026-07-12T12:00:00.000Z");

const CANNED_SYNTHESIS: SolutionSynthesis = {
  technicalSolution: "Missed-call-text-back + AI intake concierge.",
  integrationDesign: "Twilio ↔ CRM webhook.",
  roiAssumptions: "Recover 18% of missed calls.",
  risks: ["Telephony rate limits"],
};

const AUDIT_REPORT: Record<string, unknown> = {
  executiveSummary: "Acme leaks acquisition at the phone.",
  opportunities: [{ title: "Missed-call text-back", description: "Auto-text every missed call" }],
  roadmap: [{ title: "Phase 1", months: "0-3", focus: "Recover missed calls" }],
  roi: { estimatedImplementationCents: 480000 },
};

/** In-memory handoff store that ACTUALLY implements department claiming + the delivery state machine. */
function makeClaimableHandoffStore() {
  const rows = new Map<string, HandoffRow>();
  const key = (r: { workflowId: string; idempotencyKey: string }) => `${r.workflowId}::${r.idempotencyKey}`;
  const store: HandoffStore = {
    findByIdempotency: async (wf, k) => [...rows.values()].find((r) => r.workflowId === wf && r.idempotencyKey === k) ?? null,
    insert: async (row) => { if ([...rows.values()].some((r) => key(r) === key(row))) throw new Error("duplicate key value violates unique constraint"); rows.set(row.id, row); },
    getById: async (id) => rows.get(id) ?? null,
    claimNext: async () => null,
    // Claim the next `delivered` handoff for the department: delivered → processing (atomic, lease held).
    claimNextForDepartment: async (department, lease, at) => {
      const r = [...rows.values()].find((x) => x.department === department && x.deliveryState === "delivered" && (!x.runAfter || x.runAfter.getTime() <= at.getTime()));
      if (!r) return null;
      const claimed = { ...r, deliveryState: "processing" as const, leaseOwner: lease.owner, leaseExpiresAt: lease.expiresAt, updatedAt: at };
      rows.set(r.id, claimed);
      return claimed;
    },
    transition: async (id, from, fields) => { const r = rows.get(id); if (!r || r.deliveryState !== from) return false; rows.set(id, { ...r, ...fields }); return true; },
    reclaimExpiredLeases: async () => 0,
    list: async () => [...rows.values()],
    countByState: async () => ({}),
    deleteExpired: async () => 0,
  };
  return { store, rows };
}

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
    io: { acceptedHandoffSchemas: ["business_audit", "audit_report"], inboundCapabilities: ["design_solution"], outboundProducts: ["proposal_artifact"], downstreamConsumers: [] },
    permissions: { authorizedMemoryScopes: ["company", "offer", "research"], permittedDataClassifications: ["internal", "client_confidential"], allowedTools: ["run_node"], deniedTools: [] },
  },
  { now },
);

const architect: DepartmentMemberRow = buildDepartmentMemberRow(
  { departmentSlug: "proposal", memberType: "agent", memberRef: "proposal_solution_architect", role: "solution_architect", responsibility: "design", priority: 10, capabilities: ["solution_design"], toolGrants: ["run_node"], memoryGrants: ["company", "offer", "research"] },
  { now },
);

const registry = {
  loadDepartments: async () => [proposalDept],
  loadDepartment: async (slug: string) => (slug === "proposal" ? proposalDept : null),
  loadMembers: async (slug: string) => (slug === "proposal" ? [architect] : []),
};

function auditRow(id: string, companyId: string | null) {
  return { id, businessName: "Acme", companyId, opportunityId: "opp_1", report: AUDIT_REPORT };
}

describe("Department consumer loop (autonomous inter-department chain)", () => {
  it("autonomously CLAIMS a routed business_audit handoff and RUNS the Proposal department — no manual claim", async () => {
    const { store, rows } = makeClaimableHandoffStore();
    const { store: proposalStore, rows: proposalRows } = makeProposalStore();

    // Origination: a completed paid audit routes a business_audit handoff to proposal (delivered).
    const routed = await dispatchBusinessAuditToProposal({ auditId: "aud_x", businessName: "Acme", companyId: "clientA" }, { store, recordAudit: async () => {}, now });
    expect(rows.get(routed.handoffId)?.deliveryState).toBe("delivered");

    // The consumer tick claims + runs + completes it with NOBODY hand-claiming the handoff.
    const res = await runDepartmentConsumerTick({
      ...registry,
      handoffStore: store,
      proposal: { synthesize: async () => CANNED_SYNTHESIS, proposalDeps: { store: proposalStore, getAuditRow: async (id) => auditRow(id, "clientA"), recordAudit: async () => {} } },
      recordAudit: async () => {},
      now,
    });

    expect(res.claimed).toBe(1);
    expect(res.completed).toBe(1);
    expect(res.failed).toBe(0);
    // The Proposal department really ran: a proposal was created from the audit carried on the handoff.
    const proposal = [...proposalRows.values()][0];
    expect(proposal).toBeTruthy();
    expect(proposal.auditId).toBe("aud_x");
    // FIX-2: the architect's synthesis is PERSISTED onto the artifact (not discarded).
    expect((proposal.metadata as { solutionDesign?: SolutionSynthesis }).solutionDesign?.technicalSolution).toContain("Missed-call");
    // The handoff is durably completed (exactly-once).
    expect(rows.get(routed.handoffId)?.deliveryState).toBe("completed");
  });

  it("FAILS (retries/dead-letters) a handoff whose department run throws — never silently completes", async () => {
    const { store, rows } = makeClaimableHandoffStore();
    const { store: proposalStore } = makeProposalStore();
    const routed = await dispatchBusinessAuditToProposal({ auditId: "missing", businessName: "Acme", companyId: null }, { store, recordAudit: async () => {}, now });

    const res = await runDepartmentConsumerTick({
      ...registry,
      handoffStore: store,
      // getAuditRow returns null → runProposalDepartment throws "audit 'missing' not found".
      proposal: { synthesize: async () => CANNED_SYNTHESIS, proposalDeps: { store: proposalStore, getAuditRow: async () => null, recordAudit: async () => {} } },
      recordAudit: async () => {},
      now,
    });

    expect(res.claimed).toBe(1);
    expect(res.completed).toBe(0);
    expect(res.failed).toBe(1);
    // The handoff is NOT completed — it was requeued (delivered, retry) or dead-lettered for the founder.
    expect(["delivered", "dead_lettered"]).toContain(rows.get(routed.handoffId)?.deliveryState);
  });

  it("skips departments with no registered consumer (no decorative claiming)", async () => {
    const { store } = makeClaimableHandoffStore();
    const otherDept = buildDepartmentRow({ slug: "security_governance", name: "Sec", purpose: "p", status: "active" }, { now });
    const res = await runDepartmentConsumerTick({
      loadDepartments: async () => [otherDept],
      handoffStore: store,
      recordAudit: async () => {},
      now,
    });
    expect(res.claimed).toBe(0);
    expect(res.completed).toBe(0);
  });
});
