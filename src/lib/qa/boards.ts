import { WOBBLE_SERVICES } from "@/lib/domain/free-audit";
import { PAID_AUDIT_AGENTS } from "@/lib/domain/paid-audit-graph";
import { CONTENT_GRAPH_AGENTS } from "@/lib/domain/content-graph";
import type { PaidAuditResult } from "@/lib/paid-audit-graph";
import type { ContentGraphResult } from "@/lib/content-graph";
import { criterionResult, type QaCriterion, type QaCriterionResult, type QaEvidenceItem, type QaSubmission } from "@/lib/domain/qa-board";
import { validateHandoff, type HandoffReceiverContext } from "@/lib/domain/handoff";
import { createQaBoardRegistry, type QaBoard, type QaBoardEvaluationInput } from "@/lib/qa";

/**
 * Concrete QA boards (Phase 4). The board REGISTRY covering every required board as a definition, with
 * three FULLY IMPLEMENTED + proven end-to-end against the real artifacts the flows produce:
 *   - paid_audit_qa            → evaluates the Paid Audit department's `business_audit` (PaidAuditResult).
 *   - content_quality_review   → evaluates the Content department's `content_pack` (ContentGraphResult).
 *   - content_brand_review     → evaluates the same `content_pack` for brand fit.
 * The remaining boards are declared definitions (criteria + distinct reviewer identity) awaiting their
 * evaluator build — the runner refuses to run a declared board, so none can fake a pass.
 *
 * Every reviewer identity is architecturally SEPARATE from the authoring team: a board's reviewerAgentSlug
 * is never one of PAID_AUDIT_AGENTS / CONTENT_GRAPH_AGENTS / the department orchestrator (see the
 * submission builders below, which list the whole authoring team as contributors so the independence guard
 * has the full set to check against).
 */

// ---------------------------------------------------------------- evidence helpers

const WOBBLE_SERVICE_SLUGS = new Set(WOBBLE_SERVICES.map((s) => s.slug));

function ev(ref: string, kind: string, summary: string, value?: unknown): QaEvidenceItem {
  return { ref, kind, summary, value };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ================================================================ Paid Audit QA (IMPLEMENTED)

const PAID_AUDIT_CRITERIA: QaCriterion[] = [
  { key: "current_state_mapped", stage: "discovery", required: true, weight: 1, description: "The current-state map has real process steps and named bottlenecks with root cause + business impact." },
  { key: "opportunities_grounded", stage: "opportunity", required: true, weight: 1.5, description: "A comprehensive opportunity set (≥8) grounded in the Wobble service catalog." },
  { key: "prioritized", stage: "prioritization", required: false, weight: 1, description: "Opportunities are sorted into quick wins vs big swings with a rationale." },
  { key: "roadmap_phased", stage: "roadmap", required: false, weight: 1, description: "A phased 12-month roadmap (≥3 phases) with objectives and deliverables per phase." },
  { key: "executive_report_complete", stage: "report", required: true, weight: 1.5, description: "A substantial executive summary with grounded ROI and named risks + mitigations." },
];

function evaluatePaidAudit(input: QaBoardEvaluationInput<PaidAuditResult>): QaCriterionResult[] {
  const report = input.submission.artifact?.report;
  const byKey = Object.fromEntries(PAID_AUDIT_CRITERIA.map((c) => [c.key, c])) as Record<string, QaCriterion>;

  // No report → the board cannot assess the required criteria (drives a `blocked` verdict, not a fake fail).
  if (!report) {
    return PAID_AUDIT_CRITERIA.map((c) =>
      criterionResult(c, { assessable: false, passed: false, score: 0, rationale: "no audit report present on the artifact", evidence: [ev("report", "artifact_field", "report missing", null)] }),
    );
  }

  const results: QaCriterionResult[] = [];

  // 1. Current-state mapped.
  {
    const steps = report.currentState.acquisition.length + report.currentState.delivery.length + report.currentState.support.length;
    const bottlenecks = report.currentState.bottlenecks.length;
    const groundedBottlenecks = report.currentState.bottlenecks.filter((b) => b.pain.trim().length > 0 && (b.rootCause.trim().length > 0 || b.businessImpact.trim().length > 0)).length;
    const passed = steps >= 3 && bottlenecks >= 1;
    const score = clamp01((Math.min(steps, 6) / 6) * 0.5 + (Math.min(groundedBottlenecks, 3) / 3) * 0.5);
    results.push(criterionResult(byKey.current_state_mapped, {
      passed, score,
      rationale: `mapped ${steps} process steps and ${bottlenecks} bottleneck(s) (${groundedBottlenecks} with root cause / business impact)`,
      evidence: [ev("currentState.processSteps", "metric", "process steps mapped", steps), ev("currentState.bottlenecks", "metric", "bottlenecks with grounding", { total: bottlenecks, grounded: groundedBottlenecks })],
    }));
  }

  // 2. Opportunities grounded in the service catalog.
  {
    const opps = report.opportunities;
    const grounded = opps.filter((o) => o.service && WOBBLE_SERVICE_SLUGS.has(o.service)).length;
    const groundedRatio = opps.length ? grounded / opps.length : 0;
    const passed = opps.length >= 8 && grounded >= Math.ceil(opps.length * 0.3);
    const score = clamp01((Math.min(opps.length, 12) / 12) * 0.6 + groundedRatio * 0.4);
    results.push(criterionResult(byKey.opportunities_grounded, {
      passed, score,
      rationale: `${opps.length} opportunities, ${grounded} grounded in the Wobble service catalog (${Math.round(groundedRatio * 100)}%)`,
      evidence: [ev("opportunities.count", "metric", "opportunity count", opps.length), ev("opportunities.grounded", "catalog", "grounded in service catalog", grounded)],
    }));
  }

  // 3. Prioritization.
  {
    const p = report.prioritization;
    const titles = new Set(report.opportunities.map((o) => o.title));
    const referenced = [...p.quickWins, ...p.bigSwings].filter((t) => titles.has(t)).length;
    const total = p.quickWins.length + p.bigSwings.length;
    const passed = total >= 1 && (total === 0 || referenced / Math.max(total, 1) >= 0.5);
    const score = clamp01(total === 0 ? 0 : (Math.min(total, 6) / 6) * 0.5 + (referenced / total) * 0.5);
    results.push(criterionResult(byKey.prioritized, {
      passed, score,
      rationale: `${total} prioritized item(s) (${p.quickWins.length} quick wins, ${p.bigSwings.length} big swings); ${referenced} reference a real opportunity title`,
      evidence: [ev("prioritization", "artifact_field", "quick wins vs big swings", { quickWins: p.quickWins.length, bigSwings: p.bigSwings.length, referenced })],
    }));
  }

  // 4. Roadmap phased.
  {
    const phases = report.roadmap;
    const withPlan = phases.filter((ph) => ph.objectives.length > 0 && ph.deliverables.length > 0).length;
    const passed = phases.length >= 3 && withPlan >= Math.min(3, phases.length);
    const score = clamp01((Math.min(phases.length, 4) / 4) * 0.5 + (phases.length ? withPlan / phases.length : 0) * 0.5);
    results.push(criterionResult(byKey.roadmap_phased, {
      passed, score,
      rationale: `${phases.length} phase(s), ${withPlan} with objectives + deliverables`,
      evidence: [ev("roadmap.phases", "metric", "roadmap phases", phases.length), ev("roadmap.withPlan", "metric", "phases with objectives + deliverables", withPlan)],
    }));
  }

  // 5. Executive report + ROI (required).
  {
    const summaryLen = report.executiveSummary.trim().length;
    const roiUpside = report.roi?.estimatedMonthlyUpsideCents ?? 0;
    const risks = report.risks.length;
    const passed = summaryLen >= 200 && roiUpside > 0 && risks >= 1;
    const score = clamp01((summaryLen >= 200 ? 0.4 : (summaryLen / 200) * 0.4) + (roiUpside > 0 ? 0.4 : 0) + (risks >= 1 ? 0.2 : 0));
    results.push(criterionResult(byKey.executive_report_complete, {
      passed, score,
      rationale: `executive summary ${summaryLen} chars; ROI monthly upside ${roiUpside} cents; ${risks} risk(s) named`,
      evidence: [ev("executiveSummary.length", "metric", "executive summary length", summaryLen), ev("roi.estimatedMonthlyUpsideCents", "artifact_field", "ROI monthly upside (cents)", roiUpside), ev("risks.count", "metric", "risks named", risks)],
    }));
  }

  return results;
}

// ================================================================ Content Quality Review (IMPLEMENTED)

const CONTENT_QUALITY_CRITERIA: QaCriterion[] = [
  { key: "impact_threshold", stage: "copywriting", required: true, weight: 1.5, description: "Predicted impact meets the post-worthiness bar." },
  { key: "platform_fit", stage: "strategy", required: false, weight: 1, description: "The pack fits the chosen platform's format + audience." },
  { key: "grounded_provenance", stage: "research", required: true, weight: 1.5, description: "Claims are grounded — the pack carries source/chunk/insight provenance." },
  { key: "quality_gate_passed", stage: "scoring", required: false, weight: 1, description: "The graph's own quality gate did not fail/block the pack." },
];

const IMPACT_BAR = 70; // 0..100
const PLATFORM_BAR = 60;

function evaluateContentQuality(input: QaBoardEvaluationInput<ContentGraphResult>): QaCriterionResult[] {
  const r = input.submission.artifact;
  const byKey = Object.fromEntries(CONTENT_QUALITY_CRITERIA.map((c) => [c.key, c])) as Record<string, QaCriterion>;

  if (!r || !r.scores) {
    return CONTENT_QUALITY_CRITERIA.map((c) =>
      criterionResult(c, { assessable: false, passed: false, score: 0, rationale: "no scored content pack present", evidence: [ev("scores", "artifact_field", "scores missing", null)] }),
    );
  }

  const prov = r.provenance ?? { insightIds: [], chunkIds: [], sourceIds: [] };
  const provCount = prov.sourceIds.length + prov.chunkIds.length + prov.insightIds.length;

  return [
    criterionResult(byKey.impact_threshold, {
      passed: r.scores.predictedImpact >= IMPACT_BAR,
      score: clamp01(r.scores.predictedImpact / 100),
      rationale: `predicted impact ${r.scores.predictedImpact}/100 (bar ${IMPACT_BAR})`,
      evidence: [ev("scores.predictedImpact", "metric", "predicted impact", r.scores.predictedImpact)],
    }),
    criterionResult(byKey.platform_fit, {
      passed: r.scores.platformFit >= PLATFORM_BAR,
      score: clamp01(r.scores.platformFit / 100),
      rationale: `platform fit ${r.scores.platformFit}/100 (bar ${PLATFORM_BAR})`,
      evidence: [ev("scores.platformFit", "metric", "platform fit", r.scores.platformFit)],
    }),
    criterionResult(byKey.grounded_provenance, {
      passed: provCount > 0,
      score: clamp01(provCount / 3),
      rationale: `provenance: ${prov.sourceIds.length} source(s), ${prov.chunkIds.length} chunk(s), ${prov.insightIds.length} insight(s)`,
      evidence: [ev("provenance", "provenance", "grounding ids", { sources: prov.sourceIds.length, chunks: prov.chunkIds.length, insights: prov.insightIds.length })],
    }),
    criterionResult(byKey.quality_gate_passed, {
      passed: r.qualityStatus !== "failed" && r.qualityStatus !== "blocked",
      score: r.qualityStatus === "passed" ? 1 : 0,
      rationale: `graph quality gate = ${r.qualityStatus}`,
      evidence: [ev("qualityStatus", "artifact_field", "graph quality gate", r.qualityStatus)],
    }),
  ];
}

// ================================================================ Content Brand Review (IMPLEMENTED)

const CONTENT_BRAND_CRITERIA: QaCriterion[] = [
  { key: "brand_fit_threshold", stage: "copywriting", required: true, weight: 2, description: "Brand fit meets the WOBBLE premium teach-first voice bar." },
  { key: "on_brand_strategy", stage: "strategy", required: false, weight: 1, description: "The brief frames a clear angle + target audience (an on-brand strategic setup)." },
  { key: "claims_supported", stage: "research", required: false, weight: 1, description: "Claims are backed by evidence (no unsupported brand claims)." },
];

const BRAND_BAR = 75; // 0..100

function evaluateContentBrand(input: QaBoardEvaluationInput<ContentGraphResult>): QaCriterionResult[] {
  const r = input.submission.artifact;
  const byKey = Object.fromEntries(CONTENT_BRAND_CRITERIA.map((c) => [c.key, c])) as Record<string, QaCriterion>;

  if (!r || !r.scores) {
    return CONTENT_BRAND_CRITERIA.map((c) =>
      criterionResult(c, { assessable: false, passed: false, score: 0, rationale: "no scored content pack present", evidence: [ev("scores", "artifact_field", "scores missing", null)] }),
    );
  }

  const brief = r.brief;
  const prov = r.provenance ?? { insightIds: [], chunkIds: [], sourceIds: [] };
  const provCount = prov.sourceIds.length + prov.chunkIds.length + prov.insightIds.length;
  const onBrand = Boolean(brief && brief.angle.trim().length > 0 && brief.targetAudience.trim().length > 0);

  return [
    criterionResult(byKey.brand_fit_threshold, {
      passed: r.scores.brandFit >= BRAND_BAR,
      score: clamp01(r.scores.brandFit / 100),
      rationale: `brand fit ${r.scores.brandFit}/100 (bar ${BRAND_BAR})`,
      evidence: [ev("scores.brandFit", "metric", "brand fit", r.scores.brandFit)],
    }),
    criterionResult(byKey.on_brand_strategy, {
      passed: onBrand,
      score: onBrand ? 1 : 0,
      rationale: onBrand ? `angle "${brief.angle}" for "${brief.targetAudience}"` : "brief lacks a clear angle or target audience",
      evidence: [ev("brief.angle", "artifact_field", "brief angle", brief?.angle ?? null), ev("brief.targetAudience", "artifact_field", "target audience", brief?.targetAudience ?? null)],
    }),
    criterionResult(byKey.claims_supported, {
      passed: provCount > 0,
      score: clamp01(provCount / 2),
      rationale: `${provCount} provenance reference(s) backing the copy`,
      evidence: [ev("provenance.count", "provenance", "grounding references", provCount)],
    }),
  ];
}

// ================================================================ the boards

export const paidAuditQaBoard: QaBoard<PaidAuditResult> = {
  boardSlug: "paid_audit_qa",
  name: "Paid Audit QA Board",
  reviewerAgentSlug: "paid_audit_qa_reviewer",
  department: "paid_audit",
  targetArtifactSchema: "business_audit",
  systemPolicy:
    "You are the INDEPENDENT Paid Audit QA reviewer. You did not author this audit. Judge the business_audit ONLY against the explicit criteria + the evidence carried on it: is the current state genuinely mapped, are opportunities grounded in the Wobble service catalog, is there a real phased roadmap, and is the executive report + ROI substantive? Return pass/fail/revise/blocked with the exact failed stage.",
  memoryScopes: ["qa_rubric", "offer"],
  criteria: PAID_AUDIT_CRITERIA,
  thresholds: { passScore: 0.7, reviseFloor: 0.4 },
  status: "implemented",
  evaluate: evaluatePaidAudit,
};

export const contentQualityBoard: QaBoard<ContentGraphResult> = {
  boardSlug: "content_quality_review",
  name: "Content Quality Review Board",
  reviewerAgentSlug: "content_quality_reviewer",
  department: "content",
  targetArtifactSchema: "content_pack",
  systemPolicy:
    "You are the INDEPENDENT Content Quality reviewer. You did not write this pack. Judge the content_pack ONLY against impact, platform fit, grounded provenance, and the graph's own quality gate — using the evidence carried on the pack. Return pass/fail/revise/blocked with the exact failed stage.",
  memoryScopes: ["qa_rubric"],
  criteria: CONTENT_QUALITY_CRITERIA,
  thresholds: { passScore: 0.75, reviseFloor: 0.4 },
  status: "implemented",
  evaluate: evaluateContentQuality,
};

export const contentBrandBoard: QaBoard<ContentGraphResult> = {
  boardSlug: "content_brand_review",
  name: "Content Brand Review Board",
  reviewerAgentSlug: "content_brand_reviewer",
  department: "content",
  targetArtifactSchema: "content_pack",
  systemPolicy:
    "You are the INDEPENDENT Content Brand reviewer. You did not write this pack. Judge brand fit against the WOBBLE premium teach-first voice, the strategic setup (angle + audience), and whether claims are supported — using only the evidence on the pack. Return pass/fail/revise/blocked with the exact failed stage.",
  memoryScopes: ["qa_rubric", "brand"],
  criteria: CONTENT_BRAND_CRITERIA,
  thresholds: { passScore: 0.75, reviseFloor: 0.4 },
  status: "implemented",
  evaluate: evaluateContentBrand,
};

// ================================================================ Security & Tenant Isolation (IMPLEMENTED)

/**
 * The artifact this board reviews: a handoff envelope PLUS the receiver context it is being judged
 * against. Both halves are required — "is this envelope isolated?" is meaningless without knowing which
 * destination is receiving it and what that destination is actually granted.
 */
export interface SecurityIsolationArtifact {
  /** The handoff envelope under review (unknown — `validateHandoff` parses + validates it itself). */
  envelope: unknown;
  /** What the DESTINATION is genuinely permitted: its client workspace, memory grant, classifications. */
  receiver: HandoffReceiverContext;
}

const SECURITY_ISOLATION_CRITERIA: QaCriterion[] = [
  { key: "tenant_isolated", stage: "handoff", required: true, weight: 2, description: "Client/tenant scope matches the receiver — no cross-tenant leakage." },
  { key: "memory_scope_authorized", stage: "handoff", required: true, weight: 1.5, description: "Authorized memory scopes never exceed the receiver's grant." },
  { key: "classification_permitted", stage: "handoff", required: true, weight: 1.5, description: "Data classification is permitted for the destination." },
];

/**
 * DETERMINISTIC security evaluation (WOB-UAT-024) — the whole point of this board.
 *
 * It scores against `validateHandoff`'s ACTUAL output, not an LLM's opinion of a security question. The
 * board's three criteria were already an exact restatement of `validateHandoff`'s three real checks
 * (client isolation / memory-scope widening / classification), so asking a model to re-judge them would
 * be strictly worse: slower, costly, non-reproducible, and capable of passing an envelope the runtime
 * would reject. A security verdict that can disagree with the enforcement it describes is worthless.
 *
 * This means the reviewer cannot be fooled and cannot fabricate: a `pass` here is the same computation
 * the dispatcher performs, so the board and the runtime can never contradict each other.
 */
function evaluateSecurityIsolation(input: QaBoardEvaluationInput<SecurityIsolationArtifact>): QaCriterionResult[] {
  const artifact = input.submission.artifact;
  const byKey = Object.fromEntries(SECURITY_ISOLATION_CRITERIA.map((c) => [c.key, c])) as Record<string, QaCriterion>;

  // No envelope → the board CANNOT assess. Drives a `blocked` verdict, never a fake pass or a fake fail.
  if (!artifact?.envelope) {
    return SECURITY_ISOLATION_CRITERIA.map((c) =>
      criterionResult(c, { assessable: false, passed: false, score: 0, rationale: "no handoff envelope present on the artifact", evidence: [ev("envelope", "artifact_field", "envelope missing", null)] }),
    );
  }

  const validation = validateHandoff(artifact.envelope, artifact.receiver ?? {});
  const errors = validation.errors;
  const find = (needle: RegExp) => errors.filter((e) => needle.test(e));

  // Each criterion owns the exact error signature `validateHandoff` emits for it. If validateHandoff's
  // wording changes, these stop matching and the tests fail loudly rather than silently passing.
  const checks: { criterion: QaCriterion; pattern: RegExp; ok: string }[] = [
    { criterion: byKey.tenant_isolated, pattern: /^client isolation:/, ok: "envelope client workspace matches the receiver" },
    { criterion: byKey.memory_scope_authorized, pattern: /^unauthorized memory scopes:/, ok: "authorized memory scopes are within the receiver's grant" },
    { criterion: byKey.classification_permitted, pattern: /^data classification /, ok: "data classification is permitted for this destination" },
  ];

  const results = checks.map(({ criterion, pattern, ok }) => {
    const hits = find(pattern);
    return criterionResult(criterion, {
      assessable: true,
      passed: hits.length === 0,
      score: hits.length === 0 ? 1 : 0,
      rationale: hits.length === 0 ? ok : hits.join("; "),
      evidence: [ev(criterion.key, "validate_handoff", hits.length === 0 ? ok : hits.join("; "), hits.length ? hits : null)],
    });
  });

  // A malformed envelope (schema/version/required-input failures) is NOT one of the three isolation
  // criteria, but it must not be reported as "isolated and fine" either — those errors are real and the
  // dispatcher would reject on them. Fail the tenant criterion rather than let a broken envelope pass.
  const structural = errors.filter((e) => !checks.some((c) => c.pattern.test(e)));
  if (structural.length) {
    results[0] = criterionResult(byKey.tenant_isolated, {
      assessable: true,
      passed: false,
      score: 0,
      rationale: `envelope is not valid for dispatch: ${structural.join("; ")}`,
      evidence: [ev("envelope", "validate_handoff", "structural validation failed", structural)],
    });
  }

  return results;
}

export const securityTenantIsolationBoardImpl: QaBoard<SecurityIsolationArtifact> = {
  boardSlug: "security_tenant_isolation",
  name: "Security & Tenant Isolation Board",
  reviewerAgentSlug: "security_isolation_reviewer",
  // Was `platform` — a slug that does not exist in the seed, so a `revise` verdict routed nowhere
  // (WOB-UAT-024). Reviews route back to the department that actually owns security.
  department: "security_governance",
  targetArtifactSchema: "handoff_envelope",
  systemPolicy:
    "Independent security reviewer: verify client/tenant isolation and memory-scope authorization are enforced — no cross-tenant leakage, no scope widening — before work is accepted. Judged DETERMINISTICALLY against validateHandoff's real output, never an opinion.",
  memoryScopes: ["qa_rubric"],
  criteria: SECURITY_ISOLATION_CRITERIA,
  // 0.95 keeps the original intent: every required isolation criterion must pass. There is no partial
  // credit for "mostly isolated" — a single cross-tenant leak is a total failure.
  thresholds: { passScore: 0.95, reviseFloor: 0.7 },
  status: "implemented",
  evaluate: evaluateSecurityIsolation,
};

/** Build the QA submission for a real handoff envelope + the receiver it is being dispatched to. */
export function buildSecurityIsolationSubmission(
  artifact: SecurityIsolationArtifact,
  ctx: { workflowId: string; taskId?: string | null; clientWorkspaceId?: string | null; authorAgentSlug: string; contributingAgents?: string[] },
): QaSubmission<SecurityIsolationArtifact> {
  return {
    artifactSchema: "handoff_envelope",
    artifact,
    authorAgentSlug: ctx.authorAgentSlug,
    // The author is whoever built the envelope. `security_isolation_reviewer` must never appear here or
    // the independence guard rejects the review.
    contributingAgents: ctx.contributingAgents ?? [ctx.authorAgentSlug],
    department: "security_governance",
    workflowId: ctx.workflowId,
    taskId: ctx.taskId ?? null,
    clientWorkspaceId: ctx.clientWorkspaceId ?? null,
    completedStages: ["handoff"],
  };
}

// ---------------------------------------------------------------- declared boards (definitions only)

/** A declared board: identity + criteria are defined, but no evaluator yet. The runner refuses to run it
 *  (QaBoardNotImplementedError) so a declared board can never fake a pass. */
function declaredBoard(def: Omit<QaBoard, "status" | "evaluate">): QaBoard {
  return { ...def, status: "declared" };
}

export const proposalTechnicalReviewBoard = declaredBoard({
  boardSlug: "proposal_technical_review",
  name: "Proposal Technical Review Board",
  reviewerAgentSlug: "proposal_technical_reviewer",
  department: "proposal",
  targetArtifactSchema: "proposal_artifact",
  systemPolicy: "Independent technical reviewer for the proposal: verify the solution architecture, integration design and sequencing are sound and grounded in the audit.",
  memoryScopes: ["qa_rubric", "company"],
  thresholds: { passScore: 0.8, reviseFloor: 0.5 },
  criteria: [
    { key: "solution_grounded", stage: "solution_design", required: true, description: "The technical solution maps to the audit's real opportunities." },
    { key: "integration_feasible", stage: "solution_design", required: true, description: "The integration design is concrete and feasible." },
    { key: "sequencing_sound", stage: "solution_design", required: false, description: "Delivery sequencing / phasing is realistic." },
  ],
});

export const proposalCommercialReviewBoard = declaredBoard({
  boardSlug: "proposal_commercial_review",
  name: "Proposal Commercial Review Board",
  reviewerAgentSlug: "proposal_commercial_reviewer",
  department: "proposal",
  targetArtifactSchema: "proposal_artifact",
  systemPolicy: "Independent commercial reviewer for the proposal: verify pricing, ROI assumptions and scope are defensible and margin-safe before it reaches the client.",
  memoryScopes: ["qa_rubric", "offer"],
  thresholds: { passScore: 0.8, reviseFloor: 0.5 },
  criteria: [
    { key: "pricing_defensible", stage: "assemble", required: true, description: "Pricing is present and defensible against scope." },
    { key: "roi_realistic", stage: "solution_design", required: true, description: "ROI assumptions are realistic, not inflated." },
    { key: "scope_bounded", stage: "assemble", required: false, description: "Scope is bounded (no open-ended commitments)." },
  ],
});

export const researchValidationBoard = declaredBoard({
  boardSlug: "research_validation",
  name: "Research Validation Board",
  reviewerAgentSlug: "research_validation_reviewer",
  department: "research_intelligence",
  targetArtifactSchema: "validated_intelligence",
  systemPolicy: "Independent validation reviewer: verify each intelligence insight is backed by real sources with provenance and is not stale before it influences memory.",
  memoryScopes: ["qa_rubric", "research"],
  thresholds: { passScore: 0.8, reviseFloor: 0.5 },
  criteria: [
    { key: "sourced", stage: "analyse", required: true, description: "Every claim carries source provenance." },
    { key: "fresh", stage: "scout", required: false, description: "The underlying observations are not stale." },
    { key: "non_duplicate", stage: "analyse", required: false, description: "The insight is not a duplicate of existing memory." },
  ],
});

export const contradictionReviewBoard = declaredBoard({
  boardSlug: "contradiction_review",
  name: "Contradiction Review Board",
  reviewerAgentSlug: "contradiction_reviewer",
  department: "research_intelligence",
  targetArtifactSchema: "knowledge_note",
  systemPolicy: "Independent contradiction reviewer: detect conclusions that conflict with approved memory or with each other, and route the conflicting stage for reconciliation.",
  memoryScopes: ["qa_rubric", "research", "competitor"],
  thresholds: { passScore: 0.85, reviseFloor: 0.5 },
  criteria: [
    { key: "no_internal_contradiction", stage: "analyse", required: true, description: "The note does not contradict itself." },
    { key: "consistent_with_memory", stage: "analyse", required: true, description: "The note does not contradict approved memory without flagging it." },
  ],
});

export const architectureReviewBoard = declaredBoard({
  boardSlug: "architecture_review",
  name: "Architecture Review Board",
  reviewerAgentSlug: "architecture_reviewer",
  department: "proposal",
  targetArtifactSchema: "architecture",
  systemPolicy: "Independent architecture reviewer: verify the proposed system architecture is coherent, scalable and respects the platform's boundaries.",
  memoryScopes: ["qa_rubric"],
  thresholds: { passScore: 0.8, reviseFloor: 0.5 },
  criteria: [
    { key: "coherent", stage: "solution_design", required: true, description: "Components and data flow are coherent." },
    { key: "scalable", stage: "solution_design", required: false, description: "The design scales to the stated load." },
    { key: "boundaries_respected", stage: "solution_design", required: true, description: "Tenant + module boundaries are respected." },
  ],
});

/**
 * The security board is now IMPLEMENTED — see `securityTenantIsolationBoardImpl` above. It is exported
 * under the old name so every existing reference keeps working, and because a board's identity (slug +
 * reviewer) is what the independence guard and the registry key on.
 */
export const securityTenantIsolationBoard = securityTenantIsolationBoardImpl as unknown as QaBoard;

// ---------------------------------------------------------------- registry

export const QA_BOARDS: QaBoard[] = [
  paidAuditQaBoard as QaBoard,
  contentQualityBoard as QaBoard,
  contentBrandBoard as QaBoard,
  proposalTechnicalReviewBoard,
  proposalCommercialReviewBoard,
  researchValidationBoard,
  contradictionReviewBoard,
  architectureReviewBoard,
  securityTenantIsolationBoard,
];

/** The default QA board registry — the single source of truth for every board + its distinct identity. */
export const qaBoardRegistry = createQaBoardRegistry(QA_BOARDS);

// ---------------------------------------------------------------- submission builders (end-to-end wiring)

/** The full Paid Audit authoring team — a reviewer that is any of these is NOT independent. */
export const PAID_AUDIT_AUTHORING_AGENTS = [...Object.values(PAID_AUDIT_AGENTS), "paid_audit_orchestrator", "assemblePaidAuditReport"];
export const PAID_AUDIT_STAGES = ["discovery", "opportunity", "prioritization", "roadmap", "report"];

/** Build the QA submission for a real Paid Audit result (what runPaidAuditDepartment produces). */
export function buildPaidAuditSubmission(
  result: PaidAuditResult,
  ctx: { workflowId: string; taskId?: string | null; clientWorkspaceId?: string | null; authorAgentSlug?: string },
): QaSubmission<PaidAuditResult> {
  return {
    artifactSchema: "business_audit",
    artifact: result,
    authorAgentSlug: ctx.authorAgentSlug ?? "paid_audit_orchestrator",
    contributingAgents: PAID_AUDIT_AUTHORING_AGENTS,
    department: "paid_audit",
    workflowId: ctx.workflowId,
    taskId: ctx.taskId ?? null,
    clientWorkspaceId: ctx.clientWorkspaceId ?? null,
    completedStages: [...PAID_AUDIT_STAGES],
  };
}

/** The full Content authoring team — a reviewer that is any of these is NOT independent. */
export const CONTENT_AUTHORING_AGENTS = [...Object.values(CONTENT_GRAPH_AGENTS), "content_orchestrator"];
export const CONTENT_STAGES = ["strategy", "research", "copywriting", "scoring"];

/** Build the QA submission for a real Content result (what runContentDepartment produces). */
export function buildContentSubmission(
  result: ContentGraphResult,
  ctx: { workflowId: string; taskId?: string | null; clientWorkspaceId?: string | null; authorAgentSlug?: string },
): QaSubmission<ContentGraphResult> {
  return {
    artifactSchema: "content_pack",
    artifact: result,
    authorAgentSlug: ctx.authorAgentSlug ?? "content_orchestrator",
    contributingAgents: CONTENT_AUTHORING_AGENTS,
    department: "content",
    workflowId: ctx.workflowId,
    taskId: ctx.taskId ?? null,
    clientWorkspaceId: ctx.clientWorkspaceId ?? null,
    completedStages: [...CONTENT_STAGES],
  };
}
