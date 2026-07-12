import { newId } from "@/lib/ids";

/**
 * QA Board domain (Phase 4) — the pure, DB-free contract for GENUINELY INDEPENDENT quality assurance.
 *
 * A QA board is NOT a second prompt to the authoring agent. It is a SEPARATE evaluator identity with its
 * OWN agent slug, its OWN system policy/charter, and its OWN memory scope, and it judges ONLY against
 * EXPLICIT evidence + criteria — never the author's working memory. This file encodes:
 *
 *  1. Board identity (distinct evaluator slug + policy + memory scope).
 *  2. The independence RULE as a HARD guard: a reviewer may not be the artifact's author, nor any agent
 *     that contributed to it. A self-review is rejected (`QaIndependenceError`), never silently allowed.
 *  3. The verdict contract: exactly one of pass | fail | revise | blocked, evidence-backed (per-criterion
 *     results + the evidence each was judged against), and — on fail/revise — a routing target naming the
 *     EXACT failed stage(s) to revise while PRESERVING the completed, valid stages and retaining evidence.
 *
 * The framework (src/lib/qa) wires real evaluators + an injectable store + the Command-Centre hook onto
 * this contract; the concrete boards (src/lib/qa/boards.ts) define criteria + evaluation for real artifacts.
 */

// ---------------------------------------------------------------- verdict contract

export const QA_VERDICTS = ["pass", "fail", "revise", "blocked"] as const;
export type QaVerdict = (typeof QA_VERDICTS)[number];

/** A single piece of evidence the board evaluated. Evidence is retained on every result. */
export interface QaEvidenceItem {
  /** Stable pointer to the evidence: an artifact field path, a source id, a metric name, etc. */
  ref: string;
  /** What kind of evidence this is (artifact_field | metric | source | provenance | memory_note | catalog). */
  kind: string;
  /** Human-readable description of what was observed. */
  summary: string;
  /** The actual observed value that was judged (kept so the verdict is auditable, not just asserted). */
  value?: unknown;
}

/** A criterion the board judges the artifact against. Each criterion names the EXACT authoring stage that
 *  must be revised if it fails — this is what makes a fail/revise route precisely instead of "redo it all". */
export interface QaCriterion {
  key: string;
  description: string;
  /** The exact authoring stage/component (e.g. a graph node) revised when this criterion fails. */
  stage: string;
  /** Aggregate weight (default 1). */
  weight?: number;
  /** A must-pass gate: while it fails, the board cannot return `pass` (minimum outcome is `revise`). */
  required?: boolean;
}

/** The per-criterion outcome — evidence-backed, so the verdict can never be a bare assertion. */
export interface QaCriterionResult {
  key: string;
  stage: string;
  required: boolean;
  weight: number;
  /** false → the board lacked the evidence to judge this criterion at all (drives a `blocked` verdict when
   *  a REQUIRED criterion is unassessable — the board refuses to fake a pass/fail it cannot support). */
  assessable: boolean;
  passed: boolean;
  /** 0..1 quality on this criterion. */
  score: number;
  rationale: string;
  /** The evidence THIS criterion was judged against (retained on the review). */
  evidence: QaEvidenceItem[];
}

export interface QaBoardThresholds {
  /** score ≥ passScore AND no required criterion failed → pass. */
  passScore: number;
  /** not a pass, but score ≥ reviseFloor → revise (salvageable); below → fail (rejected). */
  reviseFloor: number;
}

export const DEFAULT_QA_THRESHOLDS: QaBoardThresholds = { passScore: 0.8, reviseFloor: 0.5 };

// ---------------------------------------------------------------- board identity + submission

/** The board's DISTINCT evaluator identity. The reviewer agent is architecturally separate from any
 *  authoring agent, has its own charter (systemPolicy) and its own read-only memory scope. */
export interface QaBoardIdentity {
  boardSlug: string;
  /** The board's OWN evaluator agent slug — never one of the authoring agents. */
  reviewerAgentSlug: string;
  /** The board's OWN system policy/charter (a distinct evaluator identity, NOT the author's prompt). */
  systemPolicy: string;
  /** The board's OWN memory scope(s): rubric/standards it reads. Independent of the author's write scopes.
   *  An empty list means "evidence-only" — the board reads nothing but the explicit evidence + criteria. */
  memoryScopes: string[];
}

/** The authored work submitted for review. Carries the WHOLE authoring team + lineage so independence can
 *  be enforced against every contributor and a revise can route back to the exact run + stage. */
export interface QaSubmission<TArtifact = unknown> {
  /** The artifact's schema (e.g. "business_audit", "content_pack"). Must match the board's target. */
  artifactSchema: string;
  artifact: TArtifact;
  /** The agent that produced the final artifact. */
  authorAgentSlug: string;
  /** EVERY agent that contributed to the artifact. A reviewer that is any of these is NOT independent. */
  contributingAgents: string[];
  department: string;
  workflowId: string;
  taskId?: string | null;
  clientWorkspaceId?: string | null;
  /** The authoring stages that are COMPLETED + valid — preserved (not re-run) on a revise. */
  completedStages: string[];
}

// ---------------------------------------------------------------- independence (HARD rule)

export interface IndependenceResult {
  independent: boolean;
  violations: string[];
}

/**
 * The hard independence rule. A QA board is independent ONLY when its reviewer identity is neither the
 * artifact's author nor any agent that contributed to it. This is what makes QA architectural rather than
 * a second prompt to the same identity: the authoring agent physically cannot be the reviewer.
 */
export function evaluateIndependence(
  identity: Pick<QaBoardIdentity, "boardSlug" | "reviewerAgentSlug">,
  submission: Pick<QaSubmission, "authorAgentSlug" | "contributingAgents">,
): IndependenceResult {
  const violations: string[] = [];
  const reviewer = identity.reviewerAgentSlug.trim();
  if (!reviewer) {
    violations.push("QA board has no reviewer identity");
  }
  if (reviewer && reviewer === submission.authorAgentSlug) {
    violations.push(`reviewer '${reviewer}' is the artifact's author — a QA board cannot review its own output`);
  }
  if (reviewer && submission.contributingAgents.includes(reviewer)) {
    violations.push(`reviewer '${reviewer}' contributed to the artifact — not an independent reviewer`);
  }
  return { independent: violations.length === 0, violations };
}

/** Thrown when a review is attempted by a non-independent reviewer. Independence is a guard, not a warning. */
export class QaIndependenceError extends Error {
  readonly boardSlug: string;
  readonly violations: string[];
  constructor(boardSlug: string, violations: string[]) {
    super(`QA board '${boardSlug}' independence violated: ${violations.join("; ")}`);
    this.name = "QaIndependenceError";
    this.boardSlug = boardSlug;
    this.violations = violations;
  }
}

/** Enforce independence or throw. Call BEFORE any evaluation so a self-review never even runs. */
export function assertIndependence(
  identity: Pick<QaBoardIdentity, "boardSlug" | "reviewerAgentSlug">,
  submission: Pick<QaSubmission, "authorAgentSlug" | "contributingAgents">,
): void {
  const result = evaluateIndependence(identity, submission);
  if (!result.independent) throw new QaIndependenceError(identity.boardSlug, result.violations);
}

// ---------------------------------------------------------------- routing (exact failed stage)

/** Where a fail/revise routes: the EXACT failed stage(s) to redo, and the completed stages preserved. */
export interface QaRoutingTarget {
  department: string;
  workflowId: string;
  taskId: string | null;
  /** The exact authoring stage(s) that must be revised (from the failed criteria). */
  failedStages: string[];
  /** Completed stages that remain valid and must NOT be re-run (completed − failed). */
  preservedStages: string[];
  /** What the receiving orchestrator should do: revise only the failed stages. */
  action: "revise_stages";
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

/** Build the routing target for a non-pass verdict, preserving completed work. Null for pass/blocked. */
export function buildRoutingTarget<T>(
  submission: QaSubmission<T>,
  criteria: QaCriterionResult[],
  verdict: QaVerdict,
): QaRoutingTarget | null {
  if (verdict === "pass" || verdict === "blocked") return null;
  const failedStages = uniq(criteria.filter((c) => c.assessable && !c.passed).map((c) => c.stage));
  const preservedStages = submission.completedStages.filter((s) => !failedStages.includes(s));
  return {
    department: submission.department,
    workflowId: submission.workflowId,
    taskId: submission.taskId ?? null,
    failedStages,
    preservedStages,
    action: "revise_stages",
  };
}

// ---------------------------------------------------------------- verdict derivation

export interface VerdictDerivation {
  verdict: QaVerdict;
  score: number;
  blockedReason: string | null;
}

/**
 * Derive the single verdict from the per-criterion results. Deterministic + evidence-driven:
 *  - blocked: the board cannot render a verdict — schema mismatch, no criteria, or a REQUIRED criterion is
 *    unassessable (missing evidence). This is an inability to judge, distinct from author quality.
 *  - pass:   no required criterion failed AND weighted score ≥ passScore.
 *  - revise: not a pass, but weighted score ≥ reviseFloor — salvageable; routes the failed stages.
 *  - fail:   weighted score < reviseFloor — the artifact is rejected.
 */
export function deriveVerdict(
  criteria: QaCriterionResult[],
  thresholds: QaBoardThresholds,
  ctx: { schemaMatches: boolean },
): VerdictDerivation {
  if (!ctx.schemaMatches) return { verdict: "blocked", score: 0, blockedReason: "artifact schema does not match the board's target schema" };
  if (criteria.length === 0) return { verdict: "blocked", score: 0, blockedReason: "no criteria were evaluated" };

  const requiredUnassessable = criteria.filter((c) => c.required && !c.assessable);
  if (requiredUnassessable.length > 0) {
    return { verdict: "blocked", score: 0, blockedReason: `insufficient evidence to assess required criteria: ${requiredUnassessable.map((c) => c.key).join(", ")}` };
  }

  const assessable = criteria.filter((c) => c.assessable);
  if (assessable.length === 0) return { verdict: "blocked", score: 0, blockedReason: "no criterion was assessable" };

  const totalWeight = assessable.reduce((s, c) => s + c.weight, 0) || 1;
  const score = assessable.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight;
  const requiredFailed = assessable.filter((c) => c.required && !c.passed);

  if (requiredFailed.length === 0 && score >= thresholds.passScore) return { verdict: "pass", score, blockedReason: null };
  if (score >= thresholds.reviseFloor) return { verdict: "revise", score, blockedReason: null };
  return { verdict: "fail", score, blockedReason: null };
}

// ---------------------------------------------------------------- the review (result)

export interface QaReview<TArtifact = unknown> {
  id: string;
  boardSlug: string;
  reviewerAgentSlug: string;
  department: string;
  artifactSchema: string;
  authorAgentSlug: string;
  workflowId: string;
  taskId: string | null;
  clientWorkspaceId: string | null;
  verdict: QaVerdict;
  /** Aggregate weighted score 0..1 (0 when blocked). */
  score: number;
  /** Always true on a persisted review — the guard rejects non-independent reviews before they are built. */
  independent: boolean;
  criteria: QaCriterionResult[];
  /** All evidence evaluated across the criteria (deduped by ref), retained on the review. */
  evidence: QaEvidenceItem[];
  /** The exact failed stage to revise (set on fail/revise; null on pass/blocked). */
  routingTarget: QaRoutingTarget | null;
  summary: string;
  /** Set on `blocked`: why the board could not render a verdict. */
  blockedReason: string | null;
  createdAt: Date;
}

function dedupeEvidence(items: QaEvidenceItem[]): QaEvidenceItem[] {
  const seen = new Map<string, QaEvidenceItem>();
  for (const item of items) if (!seen.has(item.ref)) seen.set(item.ref, item);
  return [...seen.values()];
}

function summarize(verdict: QaVerdict, boardSlug: string, criteria: QaCriterionResult[], blockedReason: string | null): string {
  if (verdict === "blocked") return `${boardSlug}: BLOCKED — ${blockedReason ?? "cannot assess"}`;
  const failed = criteria.filter((c) => c.assessable && !c.passed).map((c) => c.key);
  if (verdict === "pass") return `${boardSlug}: PASS — all ${criteria.length} criteria satisfied`;
  return `${boardSlug}: ${verdict.toUpperCase()} — failed: ${failed.join(", ") || "none"}`;
}

/**
 * Assemble a QA review from a board identity + submission + per-criterion results. This is the pure core
 * of the framework: it ENFORCES independence (throws `QaIndependenceError` on a self-review), derives the
 * single verdict, retains all evidence, and — on fail/revise — builds the exact-stage routing target that
 * preserves completed work. No DB, no clock ambient state (both injectable).
 */
export function assembleQaReview<T>(params: {
  board: QaBoardIdentity & { targetArtifactSchema: string; thresholds: QaBoardThresholds };
  submission: QaSubmission<T>;
  criteria: QaCriterionResult[];
  id?: string;
  now?: Date;
}): QaReview<T> {
  const { board, submission, criteria } = params;
  // HARD gate: a non-independent reviewer never produces a review.
  assertIndependence(board, submission);

  const schemaMatches = submission.artifactSchema === board.targetArtifactSchema;
  const { verdict, score, blockedReason } = deriveVerdict(criteria, board.thresholds, { schemaMatches });
  const evidence = dedupeEvidence(criteria.flatMap((c) => c.evidence));
  const routingTarget = buildRoutingTarget(submission, criteria, verdict);

  return {
    id: params.id ?? newId("qareview"),
    boardSlug: board.boardSlug,
    reviewerAgentSlug: board.reviewerAgentSlug,
    department: submission.department,
    artifactSchema: submission.artifactSchema,
    authorAgentSlug: submission.authorAgentSlug,
    workflowId: submission.workflowId,
    taskId: submission.taskId ?? null,
    clientWorkspaceId: submission.clientWorkspaceId ?? null,
    verdict,
    score,
    independent: true,
    criteria,
    evidence,
    routingTarget,
    summary: summarize(verdict, board.boardSlug, criteria, blockedReason),
    blockedReason,
    createdAt: params.now ?? new Date(),
  };
}

// ---------------------------------------------------------------- evaluator authoring helper

/** Small helper for board evaluators: assemble a per-criterion result from a criterion + judgment. */
export function criterionResult(
  criterion: QaCriterion,
  judgment: { assessable?: boolean; passed: boolean; score?: number; rationale: string; evidence: QaEvidenceItem[] },
): QaCriterionResult {
  return {
    key: criterion.key,
    stage: criterion.stage,
    required: criterion.required ?? false,
    weight: criterion.weight ?? 1,
    assessable: judgment.assessable ?? true,
    passed: judgment.passed,
    score: judgment.score ?? (judgment.passed ? 1 : 0),
    rationale: judgment.rationale,
    evidence: judgment.evidence,
  };
}
