import { describe, it, expect } from "vitest";
import { buildHandoffEnvelope, validateHandoff, type HandoffReceiverContext } from "@/lib/domain/handoff";
import { securityTenantIsolationBoardImpl, buildSecurityIsolationSubmission, type SecurityIsolationArtifact } from "@/lib/qa/boards";
import type { QaCriterionResult } from "@/lib/domain/qa-board";
import type { PaidAuditResult } from "@/lib/paid-audit-graph";
import type { PaidAuditReport } from "@/lib/domain/paid-audit-graph";
import type { ContentGraphResult } from "@/lib/content-graph";
import type { EscalationInput } from "@/lib/domain/escalation";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  runQaReview,
  createInMemoryQaReviewStore,
  createQaBoardRegistry,
  QaIndependenceError,
  QaBoardNotImplementedError,
  QaBoardDefinitionError,
  evaluateIndependence,
  type QaReviewDeps,
} from "@/lib/qa";
import type { QaSubmission } from "@/lib/domain/qa-board";
import {
  paidAuditQaBoard,
  contentQualityBoard,
  contentBrandBoard,
  proposalTechnicalReviewBoard,
  qaBoardRegistry,
  QA_BOARDS,
  buildPaidAuditSubmission,
  buildContentSubmission,
} from "@/lib/qa/boards";

// ---------------------------------------------------------------- fixtures (real artifact shapes)

const NOW = new Date("2026-07-12T00:00:00.000Z");
const REAL_SLUGS = ["speed-to-lead-system", "missed-call-text-back-system", "website-chat-booking-agent", "appointment-setter-system"];

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
    executiveSummary: "",
    currentState: { situation: "", acquisition: [], delivery: [], support: [], bottlenecks: [], keyMetrics: [] },
    opportunities: [],
    prioritization: { quickWins: [], bigSwings: [], rationale: "" },
    roadmap: [],
    roi: undefined,
    risks: [],
  };
}

const audit = (report: PaidAuditReport | undefined): PaidAuditResult => ({ auditId: "audit_1", agentRunCount: 5, modelRunIds: ["m1"], report: report as PaidAuditReport });

function strongContent(): ContentGraphResult {
  return {
    contentTrackId: "track_1", packetId: "packet_1", approvalId: "ap_1", qualityStatus: "passed", agentRunCount: 4, modelRunIds: ["m1"],
    brief: { topic: "topic", angle: "sharp POV", platform: "linkedin", format: "carousel", targetAudience: "founders", objective: "educate", rationale: "r" },
    scores: { predictedImpact: 82, brandFit: 88, platformFit: 75 },
    provenance: { insightIds: ["i1"], chunkIds: ["c1"], sourceIds: ["s1"] },
  };
}

function makeDeps() {
  const escalations: EscalationInput[] = [];
  const events: AuditEventInput[] = [];
  const approvals: unknown[] = [];
  const store = createInMemoryQaReviewStore();
  const d: QaReviewDeps = {
    store, now: NOW,
    recordAudit: async (e) => void events.push(e),
    raiseEscalation: async (i) => void escalations.push(i),
    openApproval: async (i) => void approvals.push(i),
  };
  return { d, escalations, events, approvals, store };
}

// ================================================================ independence (the hard rule)

describe("independence is architecturally enforced", () => {
  it("rejects a self-review: reviewer === author is refused, not re-prompted", async () => {
    const { d } = makeDeps();
    // author IS the board's own reviewer identity → not independent.
    const submission = buildPaidAuditSubmission(audit(strongReport()), { workflowId: "wf1", authorAgentSlug: paidAuditQaBoard.reviewerAgentSlug });
    await expect(runQaReview({ board: paidAuditQaBoard, submission }, d)).rejects.toBeInstanceOf(QaIndependenceError);
  });

  it("rejects a reviewer that contributed to the artifact (not just the final author)", async () => {
    const { d } = makeDeps();
    const submission: QaSubmission<PaidAuditResult> = {
      ...buildPaidAuditSubmission(audit(strongReport()), { workflowId: "wf1" }),
      authorAgentSlug: "someone_else",
      contributingAgents: ["audit_discovery_mapper", paidAuditQaBoard.reviewerAgentSlug], // reviewer is a contributor
    };
    const check = evaluateIndependence(paidAuditQaBoard, submission);
    expect(check.independent).toBe(false);
    await expect(runQaReview({ board: paidAuditQaBoard, submission }, d)).rejects.toBeInstanceOf(QaIndependenceError);
  });

  it("an independent reviewer (distinct identity, not a contributor) proceeds", async () => {
    const { d } = makeDeps();
    const submission = buildPaidAuditSubmission(audit(strongReport()), { workflowId: "wf1" });
    expect(evaluateIndependence(paidAuditQaBoard, submission).independent).toBe(true);
    const review = await runQaReview({ board: paidAuditQaBoard, submission }, d);
    expect(review.independent).toBe(true);
    expect(review.reviewerAgentSlug).toBe("paid_audit_qa_reviewer");
    expect(submission.contributingAgents).not.toContain(review.reviewerAgentSlug);
  });
});

// ================================================================ all four verdicts, evidence-backed

describe("every verdict is reachable and evidence-backed", () => {
  it("PASS on a strong audit", async () => {
    const { d } = makeDeps();
    const review = await runQaReview({ board: paidAuditQaBoard, submission: buildPaidAuditSubmission(audit(strongReport()), { workflowId: "wf_pass" }) }, d);
    expect(review.verdict).toBe("pass");
    expect(review.routingTarget).toBeNull();
    expect(review.evidence.length).toBeGreaterThan(0);
    expect(review.criteria.every((c) => c.evidence.length > 0)).toBe(true);
  });

  it("FAIL on a hollow audit (below the revise floor)", async () => {
    const { d, escalations } = makeDeps();
    const review = await runQaReview({ board: paidAuditQaBoard, submission: buildPaidAuditSubmission(audit(weakReport()), { workflowId: "wf_fail" }) }, d);
    expect(review.verdict).toBe("fail");
    expect(review.score).toBeLessThan(paidAuditQaBoard.thresholds.reviseFloor);
    expect(escalations).toHaveLength(1); // surfaced to the Command Centre
    expect(escalations[0].reason).toBe("repeated_qa_failure");
  });

  it("REVISE on a salvageable audit with a required gate failing", async () => {
    const { d } = makeDeps();
    // opportunities stage under-delivers (5, none grounded) → required 'opportunities_grounded' fails, rest hold.
    const review = await runQaReview({ board: paidAuditQaBoard, submission: buildPaidAuditSubmission(audit({ ...strongReport(), opportunities: oppSet(5, 0) }), { workflowId: "wf_revise" }) }, d);
    expect(review.verdict).toBe("revise");
    expect(review.score).toBeGreaterThanOrEqual(paidAuditQaBoard.thresholds.reviseFloor);
  });

  it("BLOCKED when the board cannot assess (no report on the artifact)", async () => {
    const { d, escalations } = makeDeps();
    const review = await runQaReview({ board: paidAuditQaBoard, submission: buildPaidAuditSubmission(audit(undefined), { workflowId: "wf_blocked" }) }, d);
    expect(review.verdict).toBe("blocked");
    expect(review.blockedReason).toMatch(/insufficient evidence/i);
    expect(review.routingTarget).toBeNull();
    expect(escalations[0].reason).toBe("downstream_rejection");
  });

  it("BLOCKED when the artifact schema does not match the board target", async () => {
    const { d } = makeDeps();
    const submission: QaSubmission<PaidAuditResult> = { ...buildPaidAuditSubmission(audit(strongReport()), { workflowId: "wf_schema" }), artifactSchema: "not_a_business_audit" };
    const review = await runQaReview({ board: paidAuditQaBoard, submission }, d);
    expect(review.verdict).toBe("blocked");
    expect(review.blockedReason).toMatch(/schema/i);
  });
});

// ================================================================ routing to the exact failed stage

describe("revise routes to the EXACT failed stage and preserves completed work", () => {
  it("routes only the failed opportunity stage; the other completed stages are preserved", async () => {
    const { d } = makeDeps();
    const submission = buildPaidAuditSubmission(audit({ ...strongReport(), opportunities: oppSet(5, 0) }), { workflowId: "wf_route", taskId: "task_route" });
    const review = await runQaReview({ board: paidAuditQaBoard, submission }, d);

    expect(review.verdict).toBe("revise");
    expect(review.routingTarget).not.toBeNull();
    expect(review.routingTarget!.failedStages).toEqual(["opportunity"]);
    // completed − failed = preserved (discovery / prioritization / roadmap / report keep their valid work).
    expect(review.routingTarget!.preservedStages).toEqual(["discovery", "prioritization", "roadmap", "report"]);
    expect(review.routingTarget!.action).toBe("revise_stages");
    expect(review.routingTarget!.department).toBe("paid_audit");
    expect(review.routingTarget!.workflowId).toBe("wf_route");
    expect(review.routingTarget!.taskId).toBe("task_route");
  });

  it("the escalation to the Command Centre carries the exact routing target", async () => {
    const { d, escalations } = makeDeps();
    const submission = buildPaidAuditSubmission(audit({ ...strongReport(), opportunities: oppSet(5, 0) }), { workflowId: "wf_esc" });
    await runQaReview({ board: paidAuditQaBoard, submission }, d);
    expect(escalations).toHaveLength(1);
    const routing = (escalations[0].evidence as { routingTarget: { failedStages: string[] } }).routingTarget;
    expect(routing.failedStages).toEqual(["opportunity"]);
  });
});

// ================================================================ evidence retained

describe("evidence is retained on the result", () => {
  it("each criterion carries the evidence it was judged against, deduped onto the review", async () => {
    const { d, store } = makeDeps();
    const review = await runQaReview({ board: paidAuditQaBoard, submission: buildPaidAuditSubmission(audit(strongReport()), { workflowId: "wf_ev" }) }, d);
    // per-criterion evidence
    const oppCriterion = review.criteria.find((c) => c.key === "opportunities_grounded")!;
    expect(oppCriterion.evidence.map((e) => e.ref)).toContain("opportunities.count");
    expect(oppCriterion.evidence.find((e) => e.ref === "opportunities.count")!.value).toBe(8);
    // review-level evidence retained + refs unique
    expect(review.evidence.length).toBeGreaterThan(0);
    expect(new Set(review.evidence.map((e) => e.ref)).size).toBe(review.evidence.length);
    // persisted
    const persisted = await store.getById(review.id);
    expect(persisted?.evidence.length).toBe(review.evidence.length);
  });
});

// ================================================================ second implemented board (content) end-to-end

describe("content boards evaluate the real content pack", () => {
  it("content quality PASSES a strong pack", async () => {
    const { d } = makeDeps();
    const review = await runQaReview({ board: contentQualityBoard, submission: buildContentSubmission(strongContent(), { workflowId: "c_pass" }) }, d);
    expect(review.verdict).toBe("pass");
    expect(review.criteria.find((c) => c.key === "grounded_provenance")!.passed).toBe(true);
  });

  it("content brand REVISES when brand fit is below the bar and routes to copywriting", async () => {
    const { d } = makeDeps();
    const pack = { ...strongContent(), scores: { predictedImpact: 82, brandFit: 50, platformFit: 75 } };
    const review = await runQaReview({ board: contentBrandBoard, submission: buildContentSubmission(pack, { workflowId: "c_revise" }) }, d);
    expect(review.verdict).toBe("revise");
    expect(review.routingTarget!.failedStages).toEqual(["copywriting"]);
    expect(review.routingTarget!.preservedStages).toEqual(["strategy", "research", "scoring"]);
  });
});

// ================================================================ registry integrity

describe("board registry integrity", () => {
  it("registers all nine required boards with distinct reviewer identities", () => {
    const slugs = QA_BOARDS.map((b) => b.boardSlug);
    for (const required of [
      "paid_audit_qa", "proposal_technical_review", "proposal_commercial_review", "research_validation",
      "contradiction_review", "content_brand_review", "content_quality_review", "architecture_review", "security_tenant_isolation",
    ]) expect(slugs).toContain(required);
    // reviewer identities are unique (no two boards share an evaluator identity).
    const reviewers = QA_BOARDS.map((b) => b.reviewerAgentSlug);
    expect(new Set(reviewers).size).toBe(reviewers.length);
    // and none of them is an authoring agent.
    expect(reviewers).not.toContain("paid_audit_orchestrator");
    expect(reviewers).not.toContain("content_orchestrator");
  });

  it("a declared (unimplemented) board refuses to run — no decorative pass", async () => {
    const { d } = makeDeps();
    const submission: QaSubmission<unknown> = {
      artifactSchema: "proposal_artifact", artifact: {}, authorAgentSlug: "proposal_orchestrator",
      contributingAgents: ["proposal_solution_architect"], department: "proposal", workflowId: "p1", completedStages: ["solution_design"],
    };
    await expect(runQaReview({ board: proposalTechnicalReviewBoard, submission }, d)).rejects.toBeInstanceOf(QaBoardNotImplementedError);
  });

  it("rejects two boards sharing a reviewer identity", () => {
    expect(() => createQaBoardRegistry([paidAuditQaBoard as never, { ...contentQualityBoard, boardSlug: "dupe", reviewerAgentSlug: "paid_audit_qa_reviewer" } as never])).toThrow(QaBoardDefinitionError);
  });

  it("the default registry requires a known board and rejects an unknown one", () => {
    expect(qaBoardRegistry.require("paid_audit_qa").boardSlug).toBe("paid_audit_qa");
    expect(() => qaBoardRegistry.require("nope")).toThrow();
    expect(qaBoardRegistry.forArtifact("content_pack").map((b) => b.boardSlug).sort()).toEqual(["content_brand_review", "content_quality_review"]);
  });
});

// ================================================================ Security & Tenant Isolation (WOB-UAT-024)

/**
 * WOB-UAT-024. This board was DECLARED-only — identity + criteria, no evaluator — so nothing could run
 * it, and the department that owns it (`security_governance`) had no working capability at all. It also
 * pointed at `department: "platform"`, a slug that does not exist in the seed, so a `revise` verdict
 * routed nowhere.
 *
 * The evaluator is DELIBERATELY DETERMINISTIC: it scores against `validateHandoff`'s actual output
 * rather than an LLM's opinion. The board's three criteria were already an exact restatement of
 * validateHandoff's three real checks, so a model re-judging them would be slower, costly,
 * non-reproducible, and — the disqualifying part — capable of PASSING an envelope the dispatcher would
 * reject. A security verdict that can disagree with the enforcement it describes is worthless.
 */
describe("security_tenant_isolation board (deterministic, scored against real enforcement)", () => {
  const now = new Date("2026-07-16T00:00:00.000Z");

  const envelopeFor = (over: Partial<Parameters<typeof buildHandoffEnvelope>[0]> = {}) =>
    buildHandoffEnvelope(
      {
        workflowId: "wf_sec_1",
        department: "content",
        sourceAgent: "content_orchestrator",
        objective: "produce a content pack",
        requestedAction: "generate_content_pack",
        expectedOutputSchema: "content_pack",
        destinationAgent: "design_intelligence_orchestrator",
        dataClassification: "client_confidential",
        clientWorkspaceId: "client_alpha",
        authorizedMemoryScopes: ["content", "brand"],
        ...over,
      },
      { now, taskId: "task_sec_1" },
    );

  const submit = (artifact: SecurityIsolationArtifact) =>
    buildSecurityIsolationSubmission(artifact, { workflowId: "wf_sec_1", clientWorkspaceId: "client_alpha", authorAgentSlug: "content_orchestrator" });

  it("is RUNNABLE — it is no longer a declared board that nothing can execute", async () => {
    const { d } = makeDeps();
    const review = await runQaReview(
      { board: securityTenantIsolationBoardImpl, submission: submit({ envelope: envelopeFor(), receiver: { clientWorkspaceId: "client_alpha", grantedMemoryScopes: ["content", "brand"], permittedDataClassifications: ["client_confidential"] } }) },
      d,
    );
    expect(review.verdict).toBe("pass");
    expect(review.reviewerAgentSlug).toBe("security_isolation_reviewer");
  });

  it("routes a revise back to security_governance — NOT the non-existent 'platform' department", () => {
    expect(securityTenantIsolationBoardImpl.department).toBe("security_governance");
  });

  it("FAILS a genuine cross-tenant envelope (Alpha's work handed to Beta's receiver)", async () => {
    const { d } = makeDeps();
    const review = await runQaReview(
      {
        board: securityTenantIsolationBoardImpl,
        submission: submit({ envelope: envelopeFor({ clientWorkspaceId: "client_alpha" }), receiver: { clientWorkspaceId: "client_beta", grantedMemoryScopes: ["content", "brand"], permittedDataClassifications: ["client_confidential"] } }),
      },
      d,
    );
    expect(review.verdict).not.toBe("pass");
    const tenant = review.criteria.find((c) => c.key === "tenant_isolated")!;
    expect(tenant.passed).toBe(false);
    expect(tenant.rationale).toMatch(/client isolation/);
  });

  it("FAILS an envelope that widens memory scope beyond the receiver's grant", async () => {
    const { d } = makeDeps();
    const review = await runQaReview(
      {
        board: securityTenantIsolationBoardImpl,
        submission: submit({ envelope: envelopeFor({ authorizedMemoryScopes: ["content", "finance"] }), receiver: { clientWorkspaceId: "client_alpha", grantedMemoryScopes: ["content"], permittedDataClassifications: ["client_confidential"] } }),
      },
      d,
    );
    expect(review.verdict).not.toBe("pass");
    const scope = review.criteria.find((c) => c.key === "memory_scope_authorized")!;
    expect(scope.passed).toBe(false);
    expect(scope.rationale).toMatch(/finance/);
  });

  it("FAILS an envelope whose classification the destination may not handle", async () => {
    const { d } = makeDeps();
    const review = await runQaReview(
      {
        board: securityTenantIsolationBoardImpl,
        submission: submit({ envelope: envelopeFor({ dataClassification: "restricted" }), receiver: { clientWorkspaceId: "client_alpha", grantedMemoryScopes: ["content", "brand"], permittedDataClassifications: ["internal"] } }),
      },
      d,
    );
    expect(review.verdict).not.toBe("pass");
    expect(review.criteria.find((c) => c.key === "classification_permitted")!.passed).toBe(false);
  });

  it("is BLOCKED — not passed — when there is no envelope to assess", async () => {
    const { d } = makeDeps();
    const review = await runQaReview({ board: securityTenantIsolationBoardImpl, submission: submit({ envelope: null, receiver: {} }) }, d);
    expect(review.verdict).toBe("blocked");
    expect(review.criteria.every((c) => c.assessable === false)).toBe(true);
  });

  /**
   * A MALFORMED envelope is unknowable, not failing. `validateHandoff` short-circuits on a schema-parse
   * failure and returns ONLY the parse errors — the isolation checks never execute — so we genuinely do
   * not know whether it leaks. "fail: cross-tenant" would invent a finding; "pass" would hide one.
   * `blocked` is the only honest verdict. (Learned from a live probe, not from a unit test.)
   */
  it("is BLOCKED — not failed, not passed — on a malformed envelope it cannot assess", async () => {
    const { d } = makeDeps();
    const review = await runQaReview(
      { board: securityTenantIsolationBoardImpl, submission: submit({ envelope: { workflowId: "wf", nonsense: true }, receiver: { clientWorkspaceId: "client_alpha" } }) },
      d,
    );
    expect(review.verdict).toBe("blocked");
    expect(review.criteria.every((c) => c.assessable === false)).toBe(true);
    expect(review.criteria[0].rationale).toMatch(/malformed/);
  });

  /**
   * Found LIVE, not by unit test: a probe carrying a genuine Alpha→Beta leak reported only
   * "envelope is not valid for dispatch: priority: Invalid option" — the structural branch overwrote the
   * tenant result and buried the leak behind a triviality. A security reviewer must always name the leak;
   * a structural problem is ADDITIONAL, never a substitute.
   */
  it("names the LEAK even when the envelope is also structurally invalid", async () => {
    const { d } = makeDeps();
    // A SEMANTIC fault (schemaVersion drift) — the envelope still parses, so the isolation checks DO run
    // and both findings must be reported. Contrast the malformed case below, which is unknowable.
    const leaky = { ...(envelopeFor() as unknown as Record<string, unknown>), schemaVersion: 99 };
    const review = await runQaReview(
      { board: securityTenantIsolationBoardImpl, submission: submit({ envelope: leaky, receiver: { clientWorkspaceId: "client_beta", grantedMemoryScopes: ["content", "brand"], permittedDataClassifications: ["client_confidential"] } }) },
      d,
    );
    expect(review.verdict).not.toBe("pass");
    const tenant = review.criteria.find((c) => c.key === "tenant_isolated")!;
    expect(tenant.passed).toBe(false);
    expect(tenant.rationale).toMatch(/client isolation/);   // the leak is named
    expect(tenant.rationale).toMatch(/not valid for dispatch/); // and so is the structural fault
  });

  it("agrees with the runtime: whatever validateHandoff rejects, the board never passes", () => {
    // The property that makes this board worth having. If these two could disagree, the verdict is noise.
    const cases: { envelope: unknown; receiver: HandoffReceiverContext }[] = [
      { envelope: envelopeFor(), receiver: { clientWorkspaceId: "client_alpha", grantedMemoryScopes: ["content", "brand"], permittedDataClassifications: ["client_confidential"] } },
      { envelope: envelopeFor(), receiver: { clientWorkspaceId: "client_beta", grantedMemoryScopes: ["content", "brand"] } },
      { envelope: envelopeFor({ authorizedMemoryScopes: ["secret"] }), receiver: { clientWorkspaceId: "client_alpha", grantedMemoryScopes: ["content"] } },
      { envelope: envelopeFor({ dataClassification: "restricted" }), receiver: { clientWorkspaceId: "client_alpha", permittedDataClassifications: ["internal"] } },
    ];
    for (const c of cases) {
      const runtimeOk = validateHandoff(c.envelope, c.receiver).ok;
      const results = securityTenantIsolationBoardImpl.evaluate!({ board: securityTenantIsolationBoardImpl, submission: submit(c as SecurityIsolationArtifact) }) as QaCriterionResult[];
      const boardOk = results.every((r) => r.passed);
      expect(boardOk, `board and runtime disagreed for receiver ${JSON.stringify(c.receiver)}`).toBe(runtimeOk);
    }
  });
});
