import { createEscalation, defaultStore as escalationDefaultStore, type EscalationStore } from "@/lib/departments/escalation";
import type { EscalationInput } from "@/lib/domain/escalation";
import type { AuditEventInput } from "@/lib/domain/audit";
import type { CreateApprovalInput } from "@/lib/approvals";
import type { ProposalRow } from "@/lib/domain/proposal";
import { criterionResult, type QaCriterion, type QaCriterionResult } from "@/lib/domain/qa-board";
// The security board lives in boards.ts with the other implemented boards. No cycle: qa/index.ts does
// not import gate.ts, and boards.ts only reaches qa/index.ts.
import { securityTenantIsolationBoardImpl } from "@/lib/qa/boards";
import {
  runQaReview,
  createInMemoryQaReviewStore,
  createDbQaReviewStore,
  type QaBoard,
  type QaBoardEvaluationInput,
  type QaReview,
  type QaReviewStore,
  type QaRoutingTarget,
  type QaSubmission,
  type QaVerdict,
} from "@/lib/qa";

/**
 * QA GATE (Phase 4 — the piece that makes the QA board framework GATE LIVE WORKFLOWS).
 *
 * The QA framework (src/lib/qa) is a proven, persisting, INDEPENDENT review library, but on its own it only
 * *renders a verdict* — nothing in the live flows is stopped by it. This module is the reusable gate that
 * turns a verdict into an ENFORCED decision the caller acts on at a product-emission point:
 *
 *   - pass    → RELEASE the downstream emission, and record the accepted artifact (the passing qa_reviews
 *               row IS the record) so a duplicate gate call for the same unit of work does NOT re-emit.
 *   - fail    → BLOCK the downstream emission, keep the evidence-backed findings, and raise a real
 *               founder-visible escalation (repeated_qa_failure / high).
 *   - revise  → BLOCK the downstream emission and return the EXACT failed stage(s) to redo (completed
 *               stages preserved) — the caller routes the revision, it does not emit.
 *   - blocked → BLOCK (the board could not assess) and raise a real escalation (downstream_rejection).
 *
 * Independence is NOT re-implemented here — it is architectural in the framework: runQaReview enforces
 * `reviewer ∉ (author ∪ contributors)` and THROWS `QaIndependenceError` before any evaluation. The gate lets
 * that error propagate (a mis-wired self-review is a configuration bug, never a silent pass).
 *
 * Every dependency is injectable (qa store, escalation store, escalation raiser, clock) so the gate is
 * DB-free unit-testable; in production the caller wires the DB-backed stores.
 */

// ---------------------------------------------------------------- decision contract

export interface QaGateInput<T> {
  /** Every board must PASS for the gate to release. Content needs quality + brand; proposal needs
   *  technical + commercial; paid-audit needs paid_audit_qa. */
  boards: QaBoard<T>[];
  /** The authored product + its authoring identity + lineage (independence is checked against it). */
  submission: QaSubmission<T>;
}

export interface QaGateDeps {
  /** QA review store (append-only). Defaults to DB-backed when DATABASE_URL is set, else in-memory. */
  store?: QaReviewStore;
  /** Escalation store used to raise founder-visible escalations on a non-pass verdict. */
  escalationStore?: EscalationStore;
  /** Override the escalation raiser (tests). Default: createEscalation against escalationStore / the DB. */
  raiseEscalation?: (input: EscalationInput) => Promise<void>;
  /** Optional founder-approval hook (forwarded to runQaReview). */
  openApproval?: (input: CreateApprovalInput) => Promise<void>;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
  /** Deterministic review ids for proofs: boardSlug → id. */
  reviewIdFor?: (boardSlug: string) => string | undefined;
}

export interface QaGateDecision<T = unknown> {
  /** true iff EVERY board returned `pass` — the ONLY state in which the caller may emit downstream. */
  released: boolean;
  /** The worst verdict across the boards (blocked > fail > revise > pass). */
  verdict: QaVerdict;
  reviews: QaReview<T>[];
  /** The first blocking board's routing target (exact failed stage(s) + preserved stages). Null on pass/blocked. */
  routingTarget: QaRoutingTarget | null;
  /** The board that produced the blocking verdict (first non-pass), or null on release. */
  blockingBoardSlug: string | null;
  /** Real escalation ids raised on a non-pass verdict (empty on release / on an idempotent replay). */
  escalationIds: string[];
  /** true when THIS call produced the release (fresh reviews). false when every board's review was reused
   *  from a prior gate call for the same unit of work → the caller must NOT re-emit (duplicate prevented). */
  firstRelease: boolean;
  reason: string | null;
}

/** Thrown by a caller that chooses to HARD-block on a non-pass gate (e.g. the proposal vertical) so the
 *  work does not silently complete. The gate itself never throws this — the caller does, using the decision. */
export class QaGateBlockedError extends Error {
  readonly decision: QaGateDecision;
  constructor(decision: QaGateDecision) {
    super(`QA gate BLOCKED (${decision.verdict}) on board '${decision.blockingBoardSlug ?? "?"}': ${decision.reason ?? "not released"}`);
    this.name = "QaGateBlockedError";
    this.decision = decision;
  }
}

const VERDICT_SEVERITY: Record<QaVerdict, number> = { pass: 0, revise: 1, fail: 2, blocked: 3 };

function resolveStore(deps: QaGateDeps): QaReviewStore {
  return deps.store ?? (process.env.DATABASE_URL ? createDbQaReviewStore() : createInMemoryQaReviewStore());
}

/** Build the escalation raiser: caller override → the injected store → the DB default (only when a DB is
 *  configured) → none (a pure unit env with no store cannot persist an escalation, and must not try). */
function resolveRaiser(deps: QaGateDeps, escalationIds: string[]): ((input: EscalationInput) => Promise<void>) | undefined {
  if (deps.raiseEscalation) return deps.raiseEscalation;
  const store = deps.escalationStore ?? (process.env.DATABASE_URL ? escalationDefaultStore() : undefined);
  if (!store) return undefined;
  return async (input: EscalationInput) => {
    const { escalation } = await createEscalation(input, { store, recordAudit: deps.recordAudit, now: deps.now });
    escalationIds.push(escalation.id);
  };
}

/**
 * Run the QA gate over one or more boards for a single authored product. Returns the ENFORCED decision;
 * the caller performs the actual emit/block. Idempotent per unit of work: a board that already has a review
 * for this (workflow, task) is REUSED rather than re-run, so a duplicate gate call does not duplicate the
 * escalation, the review row, or the release signal.
 */
export async function runQaGate<T>(input: QaGateInput<T>, deps: QaGateDeps = {}): Promise<QaGateDecision<T>> {
  const { boards, submission } = input;
  if (boards.length === 0) throw new Error("runQaGate: at least one board is required (a gate with no board reviews nothing)");

  const store = resolveStore(deps);
  const escalationIds: string[] = [];
  const raiseEscalation = resolveRaiser(deps, escalationIds);

  const reviews: QaReview<T>[] = [];
  let anyFresh = false;

  for (const board of boards) {
    // Idempotency: reuse a prior review for this (board, workflow, task) instead of re-running — a replayed
    // gate must not raise the escalation twice or write a second review row. runQaReview throws
    // QaIndependenceError BEFORE any store write on a self-review, so a reused row is always independent.
    const existing = (await store.findLatestForTask(board.boardSlug, submission.workflowId, submission.taskId ?? null)) as QaReview<T> | null;
    if (existing) {
      reviews.push(existing);
      continue;
    }
    anyFresh = true;
    const review = await runQaReview<T>(
      { board, submission },
      { store, raiseEscalation, openApproval: deps.openApproval, recordAudit: deps.recordAudit, now: deps.now, reviewId: deps.reviewIdFor?.(board.boardSlug) },
    );
    reviews.push(review);
  }

  const released = reviews.every((r) => r.verdict === "pass");
  const worst = reviews.reduce<QaVerdict>((w, r) => (VERDICT_SEVERITY[r.verdict] > VERDICT_SEVERITY[w] ? r.verdict : w), "pass");
  const blocking = reviews.find((r) => r.verdict !== "pass") ?? null;

  const decision: QaGateDecision<T> = {
    released,
    verdict: worst,
    reviews,
    routingTarget: blocking?.routingTarget ?? null,
    blockingBoardSlug: blocking?.boardSlug ?? null,
    escalationIds,
    firstRelease: released && anyFresh,
    reason: released ? null : blocking?.summary ?? "not released",
  };

  if (deps.recordAudit) {
    await deps.recordAudit({
      eventType: "qa.gate_decision",
      module: "qa",
      entityType: "qa_gate",
      entityId: submission.workflowId,
      actor: "qa_gate",
      metadata: {
        department: submission.department,
        artifactSchema: submission.artifactSchema,
        boards: boards.map((b) => b.boardSlug),
        released: decision.released,
        verdict: decision.verdict,
        firstRelease: decision.firstRelease,
        blockingBoardSlug: decision.blockingBoardSlug,
        failedStages: decision.routingTarget?.failedStages ?? [],
        escalationIds: decision.escalationIds,
      },
    });
  }

  return decision;
}

// ================================================================ proposal QA boards (evaluator build)
//
// The proposal boards (proposal_technical_review / proposal_commercial_review) are DECLARED in
// src/lib/qa/boards.ts — identity + criteria defined, no evaluator, so the framework refuses to run them
// (a declared board can never fake a pass). To GATE the proposal flow we build their evaluators HERE, over
// the real proposal artifact (the department's ProposalProduct), reusing the declared boards' identity so
// the registry in boards.ts stays the single source of truth for board definitions.

/** The proposal artifact the boards judge: the versioned proposal + the solution architect's synthesis. */
export interface ProposalQaArtifact {
  proposal: Pick<ProposalRow, "id" | "version" | "pricingCents" | "scope" | "services" | "timeline" | "companyId">;
  synthesis: { technicalSolution: string; integrationDesign: string; roiAssumptions: string; risks: string[] };
}

function txt(v: string | null | undefined): string {
  return (v ?? "").trim();
}

const PROPOSAL_TECHNICAL_CRITERIA: QaCriterion[] = [
  { key: "solution_grounded", stage: "solution_design", required: true, weight: 1.5, description: "The technical solution is substantive and maps to the audit's opportunities (proposal has real service items)." },
  { key: "integration_feasible", stage: "solution_design", required: true, weight: 1, description: "The integration design is concrete, not a placeholder." },
  { key: "sequencing_sound", stage: "solution_design", required: false, weight: 1, description: "Delivery is phased/sequenced (the proposal carries a timeline)." },
];

function evaluateProposalTechnical(input: QaBoardEvaluationInput<ProposalQaArtifact>): QaCriterionResult[] {
  const art = input.submission.artifact;
  const byKey = Object.fromEntries(PROPOSAL_TECHNICAL_CRITERIA.map((c) => [c.key, c])) as Record<string, QaCriterion>;

  // No artifact → the board cannot assess the required criteria (drives `blocked`, not a fake fail).
  if (!art || !art.proposal || !art.synthesis) {
    return PROPOSAL_TECHNICAL_CRITERIA.map((c) =>
      criterionResult(c, { assessable: false, passed: false, score: 0, rationale: "no proposal artifact present", evidence: [{ ref: "artifact", kind: "artifact_field", summary: "proposal artifact missing", value: null }] }),
    );
  }

  const solLen = txt(art.synthesis.technicalSolution).length;
  const services = art.proposal.services?.length ?? 0;
  const integLen = txt(art.synthesis.integrationDesign).length;
  const phases = art.proposal.timeline?.length ?? 0;

  const solutionGrounded = solLen >= 120 && services >= 1;
  const integrationFeasible = integLen >= 60;
  const sequencingSound = phases >= 1;

  return [
    criterionResult(byKey.solution_grounded, {
      passed: solutionGrounded,
      score: Math.max(0, Math.min(1, (Math.min(solLen, 400) / 400) * 0.6 + (services >= 1 ? 0.4 : 0))),
      rationale: `technical solution ${solLen} chars; ${services} service item(s) mapped from the audit`,
      evidence: [
        { ref: "synthesis.technicalSolution.length", kind: "metric", summary: "technical solution length", value: solLen },
        { ref: "proposal.services.count", kind: "metric", summary: "service items", value: services },
      ],
    }),
    criterionResult(byKey.integration_feasible, {
      passed: integrationFeasible,
      score: Math.max(0, Math.min(1, Math.min(integLen, 300) / 300)),
      rationale: `integration design ${integLen} chars`,
      evidence: [{ ref: "synthesis.integrationDesign.length", kind: "metric", summary: "integration design length", value: integLen }],
    }),
    criterionResult(byKey.sequencing_sound, {
      passed: sequencingSound,
      score: sequencingSound ? 1 : 0,
      rationale: `${phases} timeline phase(s)`,
      evidence: [{ ref: "proposal.timeline.count", kind: "metric", summary: "timeline phases", value: phases }],
    }),
  ];
}

const PROPOSAL_COMMERCIAL_CRITERIA: QaCriterion[] = [
  { key: "pricing_defensible", stage: "assemble", required: true, weight: 1.5, description: "Pricing is present (a proposal with zero price is not defensible)." },
  { key: "roi_realistic", stage: "solution_design", required: true, weight: 1, description: "ROI assumptions are stated (present, so the founder can judge inflation)." },
  { key: "scope_bounded", stage: "assemble", required: false, weight: 1, description: "Scope is present and bounded (not open-ended / empty)." },
];

function evaluateProposalCommercial(input: QaBoardEvaluationInput<ProposalQaArtifact>): QaCriterionResult[] {
  const art = input.submission.artifact;
  const byKey = Object.fromEntries(PROPOSAL_COMMERCIAL_CRITERIA.map((c) => [c.key, c])) as Record<string, QaCriterion>;

  if (!art || !art.proposal || !art.synthesis) {
    return PROPOSAL_COMMERCIAL_CRITERIA.map((c) =>
      criterionResult(c, { assessable: false, passed: false, score: 0, rationale: "no proposal artifact present", evidence: [{ ref: "artifact", kind: "artifact_field", summary: "proposal artifact missing", value: null }] }),
    );
  }

  const pricing = art.proposal.pricingCents ?? 0;
  const roiLen = txt(art.synthesis.roiAssumptions).length;
  const scopeLen = txt(art.proposal.scope).length;
  const services = art.proposal.services?.length ?? 0;

  const pricingDefensible = pricing > 0;
  const roiRealistic = roiLen >= 40;
  // Bounded = scope described AND a finite service set (not an open-ended "everything" commitment).
  const scopeBounded = scopeLen >= 40 && services >= 1 && services <= 12;

  return [
    criterionResult(byKey.pricing_defensible, {
      passed: pricingDefensible,
      score: pricingDefensible ? 1 : 0,
      rationale: `pricing ${pricing} cents`,
      evidence: [{ ref: "proposal.pricingCents", kind: "artifact_field", summary: "proposal price (cents)", value: pricing }],
    }),
    criterionResult(byKey.roi_realistic, {
      passed: roiRealistic,
      score: Math.max(0, Math.min(1, roiLen / 120)),
      rationale: `ROI assumptions ${roiLen} chars`,
      evidence: [{ ref: "synthesis.roiAssumptions.length", kind: "metric", summary: "ROI assumptions length", value: roiLen }],
    }),
    criterionResult(byKey.scope_bounded, {
      passed: scopeBounded,
      score: scopeBounded ? 1 : 0,
      rationale: `scope ${scopeLen} chars over ${services} service item(s)`,
      evidence: [
        { ref: "proposal.scope.length", kind: "metric", summary: "scope length", value: scopeLen },
        { ref: "proposal.services.count", kind: "metric", summary: "service items", value: services },
      ],
    }),
  ];
}

/**
 * IMPLEMENTED proposal technical board — the declared identity from boards.ts (slug, reviewer, policy,
 * memory scope, criteria, thresholds) with a real evaluator attached. Kept out of the boards.ts registry so
 * the declared/implemented split there is preserved; used by the proposal gate wiring.
 */
export const proposalTechnicalReviewBoardImpl: QaBoard<ProposalQaArtifact> = {
  boardSlug: "proposal_technical_review",
  name: "Proposal Technical Review Board",
  reviewerAgentSlug: "proposal_technical_reviewer",
  department: "proposal",
  targetArtifactSchema: "proposal_artifact",
  systemPolicy: "Independent technical reviewer for the proposal: verify the solution architecture, integration design and sequencing are sound and grounded in the audit.",
  memoryScopes: ["qa_rubric", "company"],
  criteria: PROPOSAL_TECHNICAL_CRITERIA,
  thresholds: { passScore: 0.8, reviseFloor: 0.5 },
  status: "implemented",
  evaluate: evaluateProposalTechnical,
};

export const proposalCommercialReviewBoardImpl: QaBoard<ProposalQaArtifact> = {
  boardSlug: "proposal_commercial_review",
  name: "Proposal Commercial Review Board",
  reviewerAgentSlug: "proposal_commercial_reviewer",
  department: "proposal",
  targetArtifactSchema: "proposal_artifact",
  systemPolicy: "Independent commercial reviewer for the proposal: verify pricing, ROI assumptions and scope are defensible and margin-safe before it reaches the client.",
  memoryScopes: ["qa_rubric", "offer"],
  criteria: PROPOSAL_COMMERCIAL_CRITERIA,
  thresholds: { passScore: 0.8, reviseFloor: 0.5 },
  status: "implemented",
  evaluate: evaluateProposalCommercial,
};

/** Both proposal boards (technical + commercial) — the pair the proposal gate requires to release. */
export const PROPOSAL_QA_BOARDS: QaBoard<ProposalQaArtifact>[] = [proposalTechnicalReviewBoardImpl, proposalCommercialReviewBoardImpl];

/** The full Proposal authoring team — a reviewer that is any of these is NOT independent. */
export const PROPOSAL_AUTHORING_AGENTS = ["proposal_orchestrator", "proposal_solution_architect", "defaultSynthesize"];
export const PROPOSAL_QA_STAGES = ["solution_design", "assemble"];

/** Build the QA submission for a real Proposal product (what runProposalDepartment produces). */
export function buildProposalQaSubmission(
  artifact: ProposalQaArtifact,
  ctx: { workflowId: string; taskId?: string | null; clientWorkspaceId?: string | null; authorAgentSlug?: string },
): QaSubmission<ProposalQaArtifact> {
  return {
    artifactSchema: "proposal_artifact",
    artifact,
    authorAgentSlug: ctx.authorAgentSlug ?? "proposal_orchestrator",
    contributingAgents: PROPOSAL_AUTHORING_AGENTS,
    department: "proposal",
    workflowId: ctx.workflowId,
    taskId: ctx.taskId ?? null,
    clientWorkspaceId: ctx.clientWorkspaceId ?? null,
    completedStages: [...PROPOSAL_QA_STAGES],
  };
}

// ================================================================ research validation QA board (evaluator)
//
// The research_validation board is DECLARED in src/lib/qa/boards.ts (identity + criteria, no evaluator). To
// GATE live research output we build its evaluator HERE, over the real validated-intelligence artifact (the
// analyst's insight set + its provenance), reusing the declared board's identity. The board verifies each
// proposed insight is backed by real source provenance and derived from non-stale observations BEFORE the
// intelligence is allowed to propagate (to the Founder Command Centre / memory).

/** The validated-intelligence artifact the board judges: counts derived from the real analyst/dreamer run. */
export interface ResearchQaArtifact {
  /** Real observations the analyst considered this run. */
  analyzedItems: number;
  /** Insights proposed this run (each PENDING founder approval). */
  proposedInsights: number;
  /** How many of the proposed insights carry ≥1 real evidence item id (source provenance). */
  insightsWithEvidence: number;
  /** Observations scouted this run (a freshness signal; 0 when no scout ran). */
  scouted: number;
}

const RESEARCH_VALIDATION_CRITERIA: QaCriterion[] = [
  { key: "sourced", stage: "analyse", required: true, weight: 1.5, description: "Every proposed insight carries source provenance (≥1 real evidence item)." },
  { key: "fresh", stage: "scout", required: false, weight: 1, description: "Insights were derived from real, non-stale analyzed observations." },
  { key: "non_duplicate", stage: "analyse", required: false, weight: 1, description: "The proposal set is bounded (not a flood of low-evidence duplicates)." },
];

function evaluateResearchValidation(input: QaBoardEvaluationInput<ResearchQaArtifact>): QaCriterionResult[] {
  const art = input.submission.artifact;
  const byKey = Object.fromEntries(RESEARCH_VALIDATION_CRITERIA.map((c) => [c.key, c])) as Record<string, QaCriterion>;

  // No proposed insights → the board cannot assess the required criterion (drives `blocked`, not a fake fail).
  if (!art || art.proposedInsights === 0) {
    return RESEARCH_VALIDATION_CRITERIA.map((c) =>
      criterionResult(c, { assessable: false, passed: false, score: 0, rationale: "no proposed insights to validate", evidence: [{ ref: "proposedInsights", kind: "metric", summary: "proposed insights", value: 0 }] }),
    );
  }

  const sourced = art.insightsWithEvidence === art.proposedInsights;
  const fresh = art.analyzedItems > 0;
  // Flood guard: an insight set far larger than the observations that back it signals low-evidence duplicates.
  const bounded = art.proposedInsights <= Math.max(art.analyzedItems, 1) * 3;

  return [
    criterionResult(byKey.sourced, {
      passed: sourced,
      score: Math.max(0, Math.min(1, art.insightsWithEvidence / art.proposedInsights)),
      rationale: `${art.insightsWithEvidence}/${art.proposedInsights} proposed insights carry source provenance`,
      evidence: [
        { ref: "insightsWithEvidence", kind: "provenance", summary: "insights with ≥1 evidence item", value: art.insightsWithEvidence },
        { ref: "proposedInsights", kind: "metric", summary: "proposed insights", value: art.proposedInsights },
      ],
    }),
    criterionResult(byKey.fresh, {
      passed: fresh,
      score: fresh ? 1 : 0,
      rationale: `${art.analyzedItems} non-stale observation(s) analyzed; ${art.scouted} scouted this run`,
      evidence: [{ ref: "analyzedItems", kind: "metric", summary: "observations analyzed", value: art.analyzedItems }],
    }),
    criterionResult(byKey.non_duplicate, {
      passed: bounded,
      score: bounded ? 1 : 0.5,
      rationale: `${art.proposedInsights} insight(s) from ${art.analyzedItems} observation(s)`,
      evidence: [{ ref: "ratio", kind: "metric", summary: "insights per observation", value: art.analyzedItems ? Math.round((art.proposedInsights / art.analyzedItems) * 100) / 100 : art.proposedInsights }],
    }),
  ];
}

/** IMPLEMENTED research validation board — the declared identity from boards.ts with a real evaluator. */
export const researchValidationBoardImpl: QaBoard<ResearchQaArtifact> = {
  boardSlug: "research_validation",
  name: "Research Validation Board",
  reviewerAgentSlug: "research_validation_reviewer",
  department: "research_intelligence",
  targetArtifactSchema: "validated_intelligence",
  systemPolicy: "Independent validation reviewer for research intelligence: verify each proposed insight is backed by real source provenance and derived from non-stale observations before it may propagate to the founder / memory.",
  memoryScopes: ["qa_rubric", "research"],
  criteria: RESEARCH_VALIDATION_CRITERIA,
  thresholds: { passScore: 0.8, reviseFloor: 0.5 },
  status: "implemented",
  evaluate: evaluateResearchValidation,
};

/** The research validation board (the single board the research gate requires to release). */
export const RESEARCH_QA_BOARDS: QaBoard<ResearchQaArtifact>[] = [researchValidationBoardImpl];

/**
 * IMPLEMENTED boards a founder may run on-demand through the QA API (`POST /api/qa/reviews`). Only boards
 * with a real evaluator are exposed — a DECLARED-only board (identity + criteria, no evaluator) is never
 * runnable, so the API can never fake a verdict for a board that cannot actually assess. The gate's
 * independence guard + verdict derivation are the SAME code the live department flows run.
 */
export const RUNNABLE_QA_BOARDS: Record<string, QaBoard<unknown>> = {
  proposal_technical_review: proposalTechnicalReviewBoardImpl as unknown as QaBoard<unknown>,
  proposal_commercial_review: proposalCommercialReviewBoardImpl as unknown as QaBoard<unknown>,
  research_validation: researchValidationBoardImpl as unknown as QaBoard<unknown>,
  // WOB-UAT-024: the security board now has a real, DETERMINISTIC evaluator (it scores against
  // validateHandoff's actual output), so it is runnable. Before this it was declared-only and nothing
  // could execute it — the department it belongs to had no working capability at all.
  security_tenant_isolation: securityTenantIsolationBoardImpl as unknown as QaBoard<unknown>,
};

/** The full Research authoring team — a reviewer that is any of these is NOT independent. */
export const RESEARCH_AUTHORING_AGENTS = ["research_intelligence_orchestrator", "intelligence_analyst", "intelligence_dreamer", "competitor_scout", "runIntelligenceAnalyst", "runDreamer"];
export const RESEARCH_QA_STAGES = ["scout", "analyse"];

/** Build the QA submission for a real validated-intelligence product (what runResearchIntelligenceDepartment produces). */
export function buildResearchQaSubmission(
  artifact: ResearchQaArtifact,
  ctx: { workflowId: string; taskId?: string | null; clientWorkspaceId?: string | null; authorAgentSlug?: string },
): QaSubmission<ResearchQaArtifact> {
  return {
    artifactSchema: "validated_intelligence",
    artifact,
    authorAgentSlug: ctx.authorAgentSlug ?? "research_intelligence_orchestrator",
    contributingAgents: RESEARCH_AUTHORING_AGENTS,
    department: "research_intelligence",
    workflowId: ctx.workflowId,
    taskId: ctx.taskId ?? null,
    clientWorkspaceId: ctx.clientWorkspaceId ?? null,
    completedStages: [...RESEARCH_QA_STAGES],
  };
}
