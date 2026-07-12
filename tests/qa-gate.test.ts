import { describe, it, expect } from "vitest";
import type { PaidAuditResult } from "@/lib/paid-audit-graph";
import type { PaidAuditReport } from "@/lib/domain/paid-audit-graph";
import type { EscalationRow } from "@/lib/domain/escalation";
import type { EscalationStore } from "@/lib/departments/escalation";
import type { HandoffStore } from "@/lib/handoff";
import type { HandoffRow } from "@/lib/domain/handoff-delivery";
import { createInMemoryQaReviewStore, QaIndependenceError, type QaReviewStore } from "@/lib/qa";
import { paidAuditQaBoard, buildPaidAuditSubmission } from "@/lib/qa/boards";
import {
  runQaGate,
  QaGateBlockedError,
  PROPOSAL_QA_BOARDS,
  proposalTechnicalReviewBoardImpl,
  proposalCommercialReviewBoardImpl,
  buildProposalQaSubmission,
  type ProposalQaArtifact,
  type QaGateDeps,
} from "@/lib/qa/gate";
import { dispatchBusinessAuditToProposal } from "@/lib/departments/verticals/paid-audit";

/**
 * QA GATE proof (Phase 4). The gate is what turns the proven QA review LIBRARY into a real GATE on live
 * emissions: pass RELEASES the downstream emit (and a replay does not re-emit), fail/blocked BLOCKS it +
 * raises a real escalation, revise BLOCKS it + returns the exact failed stage, and a self-review is rejected
 * outright. Everything is DB-free (injectable in-memory stores).
 */

const NOW = new Date("2026-07-12T00:00:00.000Z");
const noop = async () => {};
const REAL_SLUGS = ["speed-to-lead-system", "missed-call-text-back-system", "website-chat-booking-agent", "appointment-setter-system"];

// ---- paid-audit fixtures (real artifact shape) ----------------------------------------------------

const step = (s: string) => ({ step: s, detail: "detail", tool: "tool", pain: "pain" });
const phase = (title: string) => ({ title, months: "Month 1-3", focus: "focus", objectives: ["o1", "o2"], deliverables: ["d1"], items: ["Opp 1"], expectedOutcome: "outcome" });
function oppSet(n: number, grounded: number): PaidAuditReport["opportunities"] {
  return Array.from({ length: n }, (_, i) => ({
    title: `Opp ${i + 1}`, area: "acquisition", service: i < grounded ? REAL_SLUGS[i % REAL_SLUGS.length] : "",
    description: "desc", howItWorks: "how", expectedOutcome: "outcome", impact: "high" as const, difficulty: "medium" as const, kpis: ["kpi"],
  }));
}
function strongReport(): PaidAuditReport {
  return {
    businessName: "Acme HVAC", industry: "hvac", executiveSummary: "x".repeat(240), situationSummary: "situation",
    currentState: {
      situation: "s", acquisition: [step("ads"), step("intake")], delivery: [step("onboard"), step("build")], support: [step("retain")],
      bottlenecks: [
        { area: "sales", pain: "slow lead response", rootCause: "manual", severity: "high", businessImpact: "lost deals" },
        { area: "ops", pain: "manual scheduling", rootCause: "no system", severity: "medium", businessImpact: "wasted hours" },
      ],
      keyMetrics: [{ label: "leads", value: "100/mo" }],
    },
    opportunities: oppSet(8, 4),
    prioritization: { quickWins: ["Opp 1", "Opp 2"], bigSwings: ["Opp 3"], rationale: "sequence" },
    roadmap: [phase("P1"), phase("P2"), phase("P3")],
    roi: { estimatedMonthlyUpsideCents: 1_800_000, estimatedImplementationCents: 4_500_000, paybackMonths: 6, breakdown: [{ area: "sales", monthlyValueCents: 1_000_000 }] },
    risks: [{ risk: "adoption", mitigation: "training" }],
    successMetrics: ["response time"], recommendedTechStack: ["n8n"], nextSteps: ["kickoff"], serviceCount: 4,
  };
}
function weakReport(): PaidAuditReport {
  return {
    ...strongReport(),
    executiveSummary: "", currentState: { situation: "", acquisition: [], delivery: [], support: [], bottlenecks: [], keyMetrics: [] },
    opportunities: [], prioritization: { quickWins: [], bigSwings: [], rationale: "" }, roadmap: [], roi: undefined, risks: [],
  };
}
const audit = (report: PaidAuditReport | undefined): PaidAuditResult => ({ auditId: "audit_1", agentRunCount: 5, modelRunIds: ["m1"], report: report as PaidAuditReport });

// ---- proposal fixtures ----------------------------------------------------------------------------

function strongProposal(overrides: Partial<ProposalQaArtifact["proposal"]> = {}): ProposalQaArtifact {
  return {
    proposal: { id: "prop_1", version: 1, pricingCents: 480000, scope: "s".repeat(80), services: [{ name: "A" }, { name: "B" }], timeline: [{ phase: "P1" }], companyId: "clientA", ...overrides },
    synthesis: { technicalSolution: "t".repeat(420), integrationDesign: "i".repeat(320), roiAssumptions: "r".repeat(140), risks: ["telephony limits"] },
  };
}

// ---- in-memory stores -----------------------------------------------------------------------------

function makeEscalationStore() {
  const rows: EscalationRow[] = [];
  const store: EscalationStore = {
    findOpen: async (dept, wf, task, reason) => rows.find((r) => r.departmentSlug === dept && r.workflowId === wf && (r.taskId ?? null) === (task ?? null) && r.reason === reason && r.status === "open") ?? null,
    insert: async (row) => void rows.push(row),
    getById: async (id) => rows.find((r) => r.id === id) ?? null,
    transition: async () => true,
    list: async () => rows,
    countByStatus: async () => ({}),
  };
  return { store, rows };
}

/** In-memory handoff store enforcing the (workflowId, idempotencyKey) unique constraint (mirrors dept-consumer test). */
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

function makeGateDeps(): { deps: QaGateDeps; qaStore: QaReviewStore; escRows: EscalationRow[] } {
  const qaStore = createInMemoryQaReviewStore();
  const { store: escalationStore, rows: escRows } = makeEscalationStore();
  return { deps: { store: qaStore, escalationStore, recordAudit: noop, now: NOW }, qaStore, escRows };
}

// ================================================================ independence (the hard rule)

describe("the gate never lets a non-independent reviewer pass", () => {
  it("REJECTS a self-review (reviewer === author) — surfaced as QaIndependenceError, never a silent pass", async () => {
    const { deps } = makeGateDeps();
    const submission = buildPaidAuditSubmission(audit(strongReport()), { workflowId: "wf_self", authorAgentSlug: paidAuditQaBoard.reviewerAgentSlug });
    await expect(runQaGate({ boards: [paidAuditQaBoard], submission }, deps)).rejects.toBeInstanceOf(QaIndependenceError);
  });
});

// ================================================================ pass releases

describe("PASS releases the downstream emission", () => {
  it("a strong audit passes → released, no escalation, and it is the FIRST release", async () => {
    const { deps, escRows } = makeGateDeps();
    const submission = buildPaidAuditSubmission(audit(strongReport()), { workflowId: "wf_pass", taskId: "t1" });
    const decision = await runQaGate({ boards: [paidAuditQaBoard], submission }, deps);
    expect(decision.released).toBe(true);
    expect(decision.verdict).toBe("pass");
    expect(decision.firstRelease).toBe(true);
    expect(decision.routingTarget).toBeNull();
    expect(escRows).toHaveLength(0);
    expect(decision.reviews[0].independent).toBe(true);
  });
});

// ================================================================ fail blocks + escalates

describe("FAIL blocks the emission and raises a real founder escalation", () => {
  it("a hollow audit fails → not released + a real escalation row (repeated_qa_failure)", async () => {
    const { deps, escRows } = makeGateDeps();
    const submission = buildPaidAuditSubmission(audit(weakReport()), { workflowId: "wf_fail", taskId: "t1" });
    const decision = await runQaGate({ boards: [paidAuditQaBoard], submission }, deps);
    expect(decision.released).toBe(false);
    expect(decision.verdict).toBe("fail");
    expect(decision.blockingBoardSlug).toBe("paid_audit_qa");
    expect(escRows).toHaveLength(1);
    expect(escRows[0].reason).toBe("repeated_qa_failure");
    expect(escRows[0].severity).toBe("high");
    expect(decision.escalationIds).toContain(escRows[0].id);
  });
});

// ================================================================ revise returns the exact failed stage

describe("REVISE blocks the emission and returns the EXACT failed stage (does not emit downstream)", () => {
  it("an under-delivered opportunity stage routes back to 'opportunity' and preserves the completed stages", async () => {
    const { deps, escRows } = makeGateDeps();
    const submission = buildPaidAuditSubmission(audit({ ...strongReport(), opportunities: oppSet(5, 0) }), { workflowId: "wf_revise", taskId: "t1" });
    const decision = await runQaGate({ boards: [paidAuditQaBoard], submission }, deps);
    expect(decision.released).toBe(false);
    expect(decision.verdict).toBe("revise");
    expect(decision.routingTarget).not.toBeNull();
    expect(decision.routingTarget!.failedStages).toEqual(["opportunity"]);
    expect(decision.routingTarget!.preservedStages).toEqual(["discovery", "prioritization", "roadmap", "report"]);
    expect(escRows).toHaveLength(1);
    expect(escRows[0].reason).toBe("repeated_qa_failure");
    expect(escRows[0].severity).toBe("medium");
  });
});

// ================================================================ blocked escalates

describe("BLOCKED (board cannot assess) blocks and escalates", () => {
  it("no report on the artifact → blocked, no routing target, a downstream_rejection escalation", async () => {
    const { deps, escRows } = makeGateDeps();
    const submission = buildPaidAuditSubmission(audit(undefined), { workflowId: "wf_blocked", taskId: "t1" });
    const decision = await runQaGate({ boards: [paidAuditQaBoard], submission }, deps);
    expect(decision.released).toBe(false);
    expect(decision.verdict).toBe("blocked");
    expect(decision.routingTarget).toBeNull();
    expect(escRows).toHaveLength(1);
    expect(escRows[0].reason).toBe("downstream_rejection");
  });
});

// ================================================================ multi-board (proposal) — ALL must pass

describe("a multi-board gate releases only when EVERY board passes", () => {
  it("proposal technical + commercial both pass → released", async () => {
    const { deps } = makeGateDeps();
    const submission = buildProposalQaSubmission(strongProposal(), { workflowId: "wf_prop_ok", taskId: "prop_1:v1" });
    const decision = await runQaGate({ boards: PROPOSAL_QA_BOARDS, submission }, deps);
    expect(decision.released).toBe(true);
    expect(decision.verdict).toBe("pass");
    expect(decision.reviews).toHaveLength(2);
    // distinct independent reviewer identities (never an authoring agent).
    const reviewers = decision.reviews.map((r) => r.reviewerAgentSlug).sort();
    expect(reviewers).toEqual(["proposal_commercial_reviewer", "proposal_technical_reviewer"]);
    expect(reviewers).not.toContain("proposal_orchestrator");
  });

  it("a zero-priced proposal fails the COMMERCIAL board → not released, routes to the 'assemble' stage", async () => {
    const { deps, escRows } = makeGateDeps();
    const submission = buildProposalQaSubmission(strongProposal({ pricingCents: 0 }), { workflowId: "wf_prop_bad", taskId: "prop_2:v1" });
    const decision = await runQaGate({ boards: PROPOSAL_QA_BOARDS, submission }, deps);
    expect(decision.released).toBe(false);
    expect(decision.blockingBoardSlug).toBe("proposal_commercial_review");
    expect(decision.routingTarget!.failedStages).toContain("assemble");
    expect(escRows.length).toBeGreaterThanOrEqual(1);
  });

  it("the implemented proposal boards carry real evaluators (the declared registry boards do not)", () => {
    expect(proposalTechnicalReviewBoardImpl.status).toBe("implemented");
    expect(proposalTechnicalReviewBoardImpl.evaluate).toBeTypeOf("function");
    expect(proposalCommercialReviewBoardImpl.status).toBe("implemented");
  });
});

// ================================================================ idempotency — a duplicate gate call does not duplicate effects

describe("a duplicate gate call does not duplicate effects", () => {
  it("re-gating a failing artifact reuses the review → no second escalation, no second review row", async () => {
    const { deps, qaStore, escRows } = makeGateDeps();
    const submission = buildPaidAuditSubmission(audit(weakReport()), { workflowId: "wf_dupe_fail", taskId: "t1" });
    const first = await runQaGate({ boards: [paidAuditQaBoard], submission }, deps);
    const second = await runQaGate({ boards: [paidAuditQaBoard], submission }, deps);
    expect(first.verdict).toBe("fail");
    expect(second.verdict).toBe("fail");
    expect(escRows).toHaveLength(1); // the escalation was NOT raised twice
    expect(second.escalationIds).toHaveLength(0); // the replay raised nothing new
    const persisted = await qaStore.list({ workflowId: "wf_dupe_fail", limit: 100 });
    expect(persisted).toHaveLength(1); // only one review row exists
  });

  it("re-gating a passing artifact releases only the FIRST time (a replay must not re-emit downstream)", async () => {
    const { deps, qaStore } = makeGateDeps();
    const submission = buildPaidAuditSubmission(audit(strongReport()), { workflowId: "wf_dupe_pass", taskId: "t1" });
    const first = await runQaGate({ boards: [paidAuditQaBoard], submission }, deps);
    const second = await runQaGate({ boards: [paidAuditQaBoard], submission }, deps);
    expect(first.released).toBe(true);
    expect(first.firstRelease).toBe(true);
    expect(second.released).toBe(true);
    expect(second.firstRelease).toBe(false); // reused → the caller must NOT re-emit
    const persisted = await qaStore.list({ workflowId: "wf_dupe_pass", limit: 100 });
    expect(persisted).toHaveLength(1);
  });
});

// ================================================================ live wiring — dispatchBusinessAuditToProposal

describe("wired into the paid-audit → proposal origination (the real emission point)", () => {
  it("a PASS releases the business_audit handoff to Proposal", async () => {
    const { store, rows } = makeHandoffStore();
    const { deps } = makeGateDeps();
    const res = await dispatchBusinessAuditToProposal(
      { auditId: "audit_1", businessName: "Acme", companyId: "clientA" },
      { store, recordAudit: noop, now: NOW, qa: { result: audit(strongReport()), deps } },
    );
    expect(res.blocked).toBeUndefined();
    expect(res.qa?.released).toBe(true);
    expect(res.handoffId).not.toBe("");
    expect(rows.size).toBe(1);
    expect([...rows.values()][0].deliveryState).toBe("delivered");
  });

  it("a FAIL blocks the emission — NO business_audit handoff is dispatched, a real escalation exists", async () => {
    const { store, rows } = makeHandoffStore();
    const { deps, escRows } = makeGateDeps();
    const res = await dispatchBusinessAuditToProposal(
      { auditId: "audit_1", businessName: "Acme", companyId: "clientB" },
      { store, recordAudit: noop, now: NOW, qa: { result: audit(weakReport()), deps } },
    );
    expect(res.blocked).toBe(true);
    expect(res.handoffId).toBe("");
    expect(res.qa?.released).toBe(false);
    expect(rows.size).toBe(0); // nothing emitted downstream
    expect(escRows).toHaveLength(1);
    expect(escRows[0].reason).toBe("repeated_qa_failure");
  });

  it("with the gate OFF (no qa dep) the origination behaves exactly as before — the handoff is emitted", async () => {
    const { store, rows } = makeHandoffStore();
    const res = await dispatchBusinessAuditToProposal({ auditId: "audit_1", businessName: "Acme", companyId: "clientC" }, { store, recordAudit: noop, now: NOW });
    expect(res.handoffId).not.toBe("");
    expect(rows.size).toBe(1);
  });
});

// ================================================================ hard-block error carries the decision

describe("QaGateBlockedError carries the enforced decision (the proposal vertical hard-blocks on it)", () => {
  it("wraps the non-released decision with the exact failed stage", async () => {
    const { deps } = makeGateDeps();
    const submission = buildProposalQaSubmission(strongProposal({ pricingCents: 0 }), { workflowId: "wf_err", taskId: "prop_3:v1" });
    const decision = await runQaGate({ boards: PROPOSAL_QA_BOARDS, submission }, deps);
    const err = new QaGateBlockedError(decision);
    expect(err).toBeInstanceOf(QaGateBlockedError);
    expect(err.decision.released).toBe(false);
    expect(err.message).toContain("proposal_commercial_review");
  });
});
