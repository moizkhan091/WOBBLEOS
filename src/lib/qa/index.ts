import { and, desc, eq } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { qaReviews as qaReviewsTable } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import type { EscalationInput, EscalationReason, EscalationSeverity } from "@/lib/domain/escalation";
import type { CreateApprovalInput } from "@/lib/approvals";
import {
  assembleQaReview,
  evaluateIndependence,
  QaIndependenceError,
  type QaBoardIdentity,
  type QaBoardThresholds,
  type QaCriterion,
  type QaCriterionResult,
  type QaReview,
  type QaSubmission,
  type QaVerdict,
} from "@/lib/domain/qa-board";

/**
 * QA Board framework (Phase 4) — the runtime that turns the pure QA contract (src/lib/domain/qa-board) into
 * a real, INDEPENDENT quality gate: a board REGISTRY, the review runner, an injectable store (DB-free
 * testable, in-memory default), and the Command-Centre hook (typed against the EXISTING escalation +
 * approval contract shapes so QA integrates with them rather than duplicating them).
 *
 * Independence is architectural: a board carries its OWN reviewer agent slug + system policy + memory scope,
 * and the runner enforces `reviewer ∉ (author ∪ contributors)` BEFORE any evaluation — a self-review is
 * rejected, never re-prompted. A `revise`/`fail` produces a routing target naming the exact failed stage.
 */

// ---------------------------------------------------------------- board definition

export interface QaBoardEvaluationInput<T> {
  board: QaBoard<T>;
  submission: QaSubmission<T>;
}

/** A board's evaluation logic: judge the artifact against explicit evidence + criteria → per-criterion
 *  results. Pure w.r.t. the artifact — no DB, no author memory; only the evidence carried on the submission. */
export type QaBoardEvaluator<T> = (input: QaBoardEvaluationInput<T>) => QaCriterionResult[] | Promise<QaCriterionResult[]>;

export interface QaBoard<T = unknown> extends QaBoardIdentity {
  name: string;
  /** The department whose work this board reviews (revise routes back here). */
  department: string;
  /** The artifact schema this board evaluates (must match the submission). */
  targetArtifactSchema: string;
  criteria: QaCriterion[];
  thresholds: QaBoardThresholds;
  /** `implemented` boards carry a real evaluator; `declared` boards are registry definitions awaiting a build. */
  status: "implemented" | "declared";
  /** Present iff `status === "implemented"`. A declared board cannot be run (no decorative pass). */
  evaluate?: QaBoardEvaluator<T>;
}

// ---------------------------------------------------------------- registry

export interface QaBoardRegistry {
  get(slug: string): QaBoard | undefined;
  require(slug: string): QaBoard;
  list(): QaBoard[];
  listImplemented(): QaBoard[];
  /** Boards that review a given artifact schema (a department may have several boards over one artifact). */
  forArtifact(schema: string): QaBoard[];
}

export class QaBoardDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QaBoardDefinitionError";
  }
}

export class QaBoardUnknownError extends Error {
  constructor(slug: string) {
    super(`QA board '${slug}' is not registered`);
    this.name = "QaBoardUnknownError";
  }
}

export class QaBoardNotImplementedError extends Error {
  readonly boardSlug: string;
  constructor(slug: string) {
    super(`QA board '${slug}' is declared but has no evaluator — it cannot render a verdict`);
    this.name = "QaBoardNotImplementedError";
    this.boardSlug = slug;
  }
}

/**
 * Build a registry with integrity guards: board slugs are unique, reviewer identities are unique AND
 * distinct from every board slug's… no — the meaningful guard is that a reviewer agent slug is unique to
 * one board and an `implemented` board actually carries an evaluator. These prevent two boards masquerading
 * as the same evaluator, or a "declared" board silently passing work.
 */
export function createQaBoardRegistry(boards: QaBoard[]): QaBoardRegistry {
  const bySlug = new Map<string, QaBoard>();
  const reviewers = new Map<string, string>();
  for (const board of boards) {
    if (bySlug.has(board.boardSlug)) throw new QaBoardDefinitionError(`duplicate QA board slug '${board.boardSlug}'`);
    if (reviewers.has(board.reviewerAgentSlug)) {
      throw new QaBoardDefinitionError(`reviewer '${board.reviewerAgentSlug}' is shared by boards '${reviewers.get(board.reviewerAgentSlug)}' and '${board.boardSlug}' — each board needs its OWN evaluator identity`);
    }
    if (board.status === "implemented" && !board.evaluate) throw new QaBoardDefinitionError(`board '${board.boardSlug}' is marked implemented but has no evaluator`);
    if (board.status === "declared" && board.evaluate) throw new QaBoardDefinitionError(`board '${board.boardSlug}' is marked declared but carries an evaluator — mark it implemented`);
    bySlug.set(board.boardSlug, board);
    reviewers.set(board.reviewerAgentSlug, board.boardSlug);
  }
  return {
    get: (slug) => bySlug.get(slug),
    require: (slug) => {
      const b = bySlug.get(slug);
      if (!b) throw new QaBoardUnknownError(slug);
      return b;
    },
    list: () => [...bySlug.values()],
    listImplemented: () => [...bySlug.values()].filter((b) => b.status === "implemented"),
    forArtifact: (schema) => [...bySlug.values()].filter((b) => b.targetArtifactSchema === schema),
  };
}

// ---------------------------------------------------------------- injectable store (in-memory default)

export interface QaReviewListQuery {
  boardSlug?: string;
  department?: string;
  verdict?: QaVerdict;
  workflowId?: string;
  limit?: number;
}

export interface QaReviewStore {
  insert(row: QaReview): Promise<void>;
  getById(id: string): Promise<QaReview | null>;
  /** Latest review for a board on a given unit of work (used to inspect/idempotency-check). */
  findLatestForTask(boardSlug: string, workflowId: string, taskId: string | null): Promise<QaReview | null>;
  list(query: QaReviewListQuery & { limit: number }): Promise<QaReview[]>;
}

/** A fresh in-memory store (for isolated tests). */
export function createInMemoryQaReviewStore(): QaReviewStore {
  const rows: QaReview[] = [];
  return {
    async insert(row) {
      rows.push(row);
    },
    async getById(id) {
      return rows.find((r) => r.id === id) ?? null;
    },
    async findLatestForTask(boardSlug, workflowId, taskId) {
      const matches = rows
        .filter((r) => r.boardSlug === boardSlug && r.workflowId === workflowId && (r.taskId ?? null) === (taskId ?? null))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return matches[0] ?? null;
    },
    async list(query) {
      return rows
        .filter((r) => (query.boardSlug ? r.boardSlug === query.boardSlug : true))
        .filter((r) => (query.department ? r.department === query.department : true))
        .filter((r) => (query.verdict ? r.verdict === query.verdict : true))
        .filter((r) => (query.workflowId ? r.workflowId === query.workflowId : true))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, query.limit);
    },
  };
}

/** Map a QaReview domain object ↔ the `qa_reviews` row (numeric score ↔ number; jsonb columns). */
function rowToReview(r: typeof qaReviewsTable.$inferSelect): QaReview {
  return {
    id: r.id,
    boardSlug: r.boardSlug,
    reviewerAgentSlug: r.reviewerAgentSlug,
    department: r.department,
    artifactSchema: r.artifactSchema,
    authorAgentSlug: r.authorAgentSlug,
    workflowId: r.workflowId,
    taskId: r.taskId ?? null,
    clientWorkspaceId: r.clientWorkspaceId ?? null,
    verdict: r.verdict as QaVerdict,
    score: Number(r.score),
    independent: r.independent,
    criteria: (r.criteria ?? []) as unknown as QaReview["criteria"],
    evidence: (r.evidence ?? []) as unknown as QaReview["evidence"],
    routingTarget: (r.routingTarget ?? null) as unknown as QaReview["routingTarget"],
    summary: r.summary,
    blockedReason: r.blockedReason ?? null,
    createdAt: r.createdAt,
  };
}

/** DB-backed store against the `qa_reviews` table (append-only). Used when DATABASE_URL is configured. */
export function createDbQaReviewStore(db: Db = getDb()): QaReviewStore {
  return {
    async insert(row) {
      await db.insert(qaReviewsTable).values({
        id: row.id, boardSlug: row.boardSlug, reviewerAgentSlug: row.reviewerAgentSlug, department: row.department,
        artifactSchema: row.artifactSchema, authorAgentSlug: row.authorAgentSlug, workflowId: row.workflowId,
        taskId: row.taskId, clientWorkspaceId: row.clientWorkspaceId, verdict: row.verdict, score: String(row.score),
        independent: row.independent, criteria: row.criteria as never, evidence: row.evidence as never,
        routingTarget: (row.routingTarget ?? null) as never, summary: row.summary, blockedReason: row.blockedReason,
        createdAt: row.createdAt,
      } as never);
    },
    async getById(id) {
      const rows = await db.select().from(qaReviewsTable).where(eq(qaReviewsTable.id, id)).limit(1);
      return rows[0] ? rowToReview(rows[0]) : null;
    },
    async findLatestForTask(boardSlug, workflowId, taskId) {
      const conds = [eq(qaReviewsTable.boardSlug, boardSlug), eq(qaReviewsTable.workflowId, workflowId)];
      const rows = await db.select().from(qaReviewsTable).where(and(...conds)).orderBy(desc(qaReviewsTable.createdAt)).limit(20);
      const match = rows.find((r) => (r.taskId ?? null) === (taskId ?? null));
      return match ? rowToReview(match) : null;
    },
    async list(query) {
      const conds = [];
      if (query.boardSlug) conds.push(eq(qaReviewsTable.boardSlug, query.boardSlug));
      if (query.department) conds.push(eq(qaReviewsTable.department, query.department));
      if (query.verdict) conds.push(eq(qaReviewsTable.verdict, query.verdict));
      if (query.workflowId) conds.push(eq(qaReviewsTable.workflowId, query.workflowId));
      const base = db.select().from(qaReviewsTable);
      const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(desc(qaReviewsTable.createdAt)).limit(query.limit);
      return rows.map(rowToReview);
    },
  };
}

// Process-wide default: DB-backed when DATABASE_URL is configured (real persistence), else an in-memory
// store so pure-domain tests never touch a DB.
let _defaultStore: QaReviewStore | undefined;
function defaultStore(): QaReviewStore {
  return (_defaultStore ??= process.env.DATABASE_URL ? createDbQaReviewStore() : createInMemoryQaReviewStore());
}

// ---------------------------------------------------------------- Command-Centre hooks + deps

/** Hooks onto the EXISTING contracts (escalation + approval). Injectable so tests never touch a DB; in
 *  production the lead wires `raiseEscalation` → createEscalation and `openApproval` → createApproval. */
export interface QaCommandCentreHooks {
  raiseEscalation?: (input: EscalationInput) => Promise<void>;
  openApproval?: (input: CreateApprovalInput) => Promise<void>;
}

export interface QaReviewDeps extends QaCommandCentreHooks {
  store?: QaReviewStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
  /** Override the generated review id (for deterministic proofs). */
  reviewId?: string;
}

async function audit(deps: QaReviewDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

/** Map a non-pass verdict to a structured escalation reason + severity for the Command Centre. */
function escalationFor(verdict: QaVerdict): { reason: EscalationReason; severity: EscalationSeverity } {
  switch (verdict) {
    case "fail":
      return { reason: "repeated_qa_failure", severity: "high" };
    case "revise":
      return { reason: "repeated_qa_failure", severity: "medium" };
    case "blocked":
      return { reason: "downstream_rejection", severity: "high" };
    default:
      return { reason: "other", severity: "low" };
  }
}

/** Build the escalation payload (existing EscalationInput shape) carrying the exact routing target. */
export function qaEscalationInput(review: QaReview): EscalationInput {
  const { reason, severity } = escalationFor(review.verdict);
  const failed = review.routingTarget?.failedStages ?? [];
  const preserved = review.routingTarget?.preservedStages ?? [];
  const requiredDecision = review.verdict === "blocked"
    ? `QA board '${review.boardSlug}' could not assess the ${review.artifactSchema} (${review.blockedReason}). Founder: provide the missing evidence, re-run the stage, or terminate.`
    : `QA board '${review.boardSlug}' returned '${review.verdict}' on ${review.artifactSchema}. Revise stage(s): ${failed.join(", ") || "n/a"}. Preserve completed: ${preserved.join(", ") || "none"}.`;
  return {
    departmentSlug: review.department,
    workflowId: review.workflowId,
    taskId: review.taskId,
    clientWorkspaceId: review.clientWorkspaceId,
    sourceAgent: review.reviewerAgentSlug,
    reason,
    severity,
    requiredDecision,
    assignee: "founder_command_centre",
    evidence: {
      qaReviewId: review.id,
      boardSlug: review.boardSlug,
      reviewerAgentSlug: review.reviewerAgentSlug,
      verdict: review.verdict,
      score: review.score,
      blockedReason: review.blockedReason,
      routingTarget: review.routingTarget,
      failedCriteria: review.criteria.filter((c) => c.assessable && !c.passed).map((c) => ({ key: c.key, stage: c.stage, rationale: c.rationale })),
    },
    attemptedRecoveries: [],
  };
}

/** Build a founder-approval payload (existing CreateApprovalInput shape) for the verdict. */
export function qaApprovalInput(review: QaReview): CreateApprovalInput {
  return {
    approvalType: "qa_review",
    entityType: "qa_review",
    entityId: review.id,
    riskLevel: review.verdict === "pass" ? "normal" : "high",
    requestedBy: review.reviewerAgentSlug,
    metadata: { boardSlug: review.boardSlug, verdict: review.verdict, score: review.score, department: review.department, workflowId: review.workflowId, routingTarget: review.routingTarget },
  };
}

// ---------------------------------------------------------------- the runner

export interface RunQaReviewInput<T> {
  board: QaBoard<T>;
  submission: QaSubmission<T>;
}

/**
 * Run an independent QA review end-to-end:
 *  1. HARD independence gate — audited + thrown; a self-review never even evaluates.
 *  2. The board must be implemented (a declared-only board throws — no fake pass).
 *  3. Evaluate the artifact against explicit evidence + criteria.
 *  4. Assemble the evidence-backed verdict + exact-stage routing (re-enforcing independence).
 *  5. Persist (injectable store).
 *  6. Surface any non-pass verdict to the Command Centre via the escalation hook (with the routing target).
 *  7. Optionally open a founder approval for the verdict.
 */
export async function runQaReview<T>(input: RunQaReviewInput<T>, deps: QaReviewDeps = {}): Promise<QaReview<T>> {
  const { board, submission } = input;
  const now = deps.now ?? new Date();
  const store = deps.store ?? defaultStore();

  // 1. Independence — the architectural guard. Never re-prompt a non-independent reviewer; reject it.
  const independence = evaluateIndependence(board, submission);
  if (!independence.independent) {
    await audit(deps, {
      eventType: "qa.independence_violation",
      module: "qa",
      entityType: "qa_board",
      entityId: board.boardSlug,
      actor: board.reviewerAgentSlug,
      metadata: { workflowId: submission.workflowId, authorAgentSlug: submission.authorAgentSlug, violations: independence.violations },
    });
    throw new QaIndependenceError(board.boardSlug, independence.violations);
  }

  // 2. No decorative verdict from a declared-only board.
  if (!board.evaluate) throw new QaBoardNotImplementedError(board.boardSlug);

  // 3. Evaluate against explicit evidence + criteria only.
  const criteria = await board.evaluate({ board, submission });

  // 4. Assemble the verdict (re-checks independence; retains evidence; routes the exact failed stage).
  const review = assembleQaReview<T>({ board, submission, criteria, id: deps.reviewId, now });

  // 5. Persist.
  await store.insert(review);
  await audit(deps, {
    eventType: "qa.reviewed",
    module: "qa",
    entityType: "qa_review",
    entityId: review.id,
    actor: review.reviewerAgentSlug,
    metadata: {
      boardSlug: review.boardSlug,
      department: review.department,
      workflowId: review.workflowId,
      verdict: review.verdict,
      score: review.score,
      failedStages: review.routingTarget?.failedStages ?? [],
      blockedReason: review.blockedReason,
    },
  });

  // 6. Surface a non-pass verdict to the Command Centre (real routing target carried in the escalation).
  if (review.verdict !== "pass" && deps.raiseEscalation) {
    await deps.raiseEscalation(qaEscalationInput(review));
  }

  // 7. Optional founder approval hook.
  if (deps.openApproval) await deps.openApproval(qaApprovalInput(review));

  return review;
}

// Re-export the domain contract so consumers import the whole QA surface from one module.
export {
  assembleQaReview,
  evaluateIndependence,
  assertIndependence,
  deriveVerdict,
  buildRoutingTarget,
  criterionResult,
  QaIndependenceError,
  QA_VERDICTS,
  DEFAULT_QA_THRESHOLDS,
} from "@/lib/domain/qa-board";
export type {
  QaBoardIdentity,
  QaBoardThresholds,
  QaCriterion,
  QaCriterionResult,
  QaEvidenceItem,
  QaReview,
  QaRoutingTarget,
  QaSubmission,
  QaVerdict,
  IndependenceResult,
  VerdictDerivation,
} from "@/lib/domain/qa-board";
