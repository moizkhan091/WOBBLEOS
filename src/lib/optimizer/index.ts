import { and, desc, eq, gte } from "drizzle-orm";
import {
  optimizerCycles,
  optimizerObservations,
  improvementProposals,
  optimizerActivations,
  optimizerMonitoring,
  optimizerRollbackEvents,
  qaReviews,
  revisionCycles,
  handoffs,
  providerUsage,
  crmOpportunities,
  proposals as proposalsTable,
  projects as projectsTable,
  scheduledPosts,
  feedbackEvents,
} from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { newId } from "@/lib/ids";
import type { RiskTier } from "@/lib/domain/autonomy";
import {
  scoreProposal,
  canActivate,
  shouldRollback,
  type ImprovementProposal,
} from "@/lib/domain/optimizer";

export const OPTIMIZER_MODULE = "optimizer";

// ---- Observations (the real evidence) ----
export interface Observation {
  signalType: string;
  metricKey: string;
  /** A HEALTH metric normalized so HIGHER = better (e.g. pass rate), so the historical test (candidate>baseline) is consistent. */
  metricValue: number;
  sampleSize: number;
  evidenceRef: Record<string, unknown>;
}

/** A collector reads a REAL production table over a window and returns 0..n observations. Injectable for proofs. */
export type EvidenceCollector = (ctx: { db: Db; since: Date; now: Date }) => Promise<Observation[]>;

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

/** QA health: pass rate over the window (higher = better). Evidence: the qa_reviews rows counted. */
const qaFailureCollector: EvidenceCollector = async ({ db, since }) => {
  const rows = await db.select({ verdict: qaReviews.verdict }).from(qaReviews).where(gte(qaReviews.createdAt, since));
  if (!rows.length) return [];
  const total = rows.length;
  const passed = rows.filter((r) => r.verdict === "pass").length;
  return [{ signalType: "qa_failure", metricKey: "qa_pass_rate", metricValue: passed / total, sampleSize: total, evidenceRef: { total, passed, failed: total - passed } }];
};

/** Revision load: fewer revision cycles per window = healthier (higher = better → we invert with a bounded score). */
const revisionFrequencyCollector: EvidenceCollector = async ({ db, since }) => {
  const rows = await db.select({ id: revisionCycles.id }).from(revisionCycles).where(gte(revisionCycles.createdAt, since));
  const count = rows.length;
  // Health = 1 / (1 + count): 0 revisions → 1.0; grows worse as revisions climb. Bounded 0..1.
  return [{ signalType: "revision_frequency", metricKey: "revision_health", metricValue: 1 / (1 + count), sampleSize: count, evidenceRef: { revisionCycles: count } }];
};

/** Delivery reliability: share of handoffs NOT dead-lettered (higher = better). Evidence: the handoff counts. */
const deadLetterCollector: EvidenceCollector = async ({ db, since }) => {
  const rows = await db.select({ state: handoffs.deliveryState }).from(handoffs).where(gte(handoffs.createdAt, since));
  if (!rows.length) return [];
  const total = rows.length;
  const dead = rows.filter((r) => r.state === "dead_lettered").length;
  return [{ signalType: "dead_letter", metricKey: "handoff_delivery_health", metricValue: (total - dead) / total, sampleSize: total, evidenceRef: { total, dead_lettered: dead } }];
};

/** Cost efficiency: a bounded health from average provider cost (higher = cheaper = better). Evidence: usage rows. */
const providerCostCollector: EvidenceCollector = async ({ db, since }) => {
  const rows = await db.select({ cost: providerUsage.calculatedCostUsd }).from(providerUsage).where(gte(providerUsage.createdAt, since));
  if (!rows.length) return [];
  const total = rows.length;
  const avg = rows.reduce((s, r) => s + num(r.cost), 0) / total;
  // Health = 1 / (1 + avgCost): free ≈ 1.0, expensive → 0. Bounded.
  return [{ signalType: "provider_cost", metricKey: "cost_efficiency", metricValue: 1 / (1 + avg), sampleSize: total, evidenceRef: { avgCostUsd: Math.round(avg * 10000) / 10000, samples: total } }];
};

/** Workflow retries: share of handoffs delivered WITHOUT a retry (higher = better). Evidence: retry counts. */
const workflowRetryCollector: EvidenceCollector = async ({ db, since }) => {
  const rows = await db.select({ retries: handoffs.retryCount }).from(handoffs).where(gte(handoffs.createdAt, since));
  if (!rows.length) return [];
  const total = rows.length;
  const clean = rows.filter((r) => Number(r.retries ?? 0) === 0).length;
  return [{ signalType: "workflow_retry", metricKey: "first_try_delivery_rate", metricValue: clean / total, sampleSize: total, evidenceRef: { total, retried: total - clean } }];
};

/** Tool/provider reliability: share of provider calls that SUCCEEDED (higher = better). Evidence: provider_usage. */
const toolFailureCollector: EvidenceCollector = async ({ db, since }) => {
  const rows = await db.select({ status: providerUsage.status }).from(providerUsage).where(gte(providerUsage.createdAt, since));
  if (!rows.length) return [];
  const total = rows.length;
  const ok = rows.filter((r) => r.status === "succeeded").length;
  return [{ signalType: "tool_failure", metricKey: "tool_success_rate", metricValue: ok / total, sampleSize: total, evidenceRef: { total, failed: total - ok } }];
};

/** Sales outcomes: win rate over RESOLVED opportunities (won vs lost; higher = better). Evidence: crm_opportunities. */
const salesOutcomeCollector: EvidenceCollector = async ({ db, since }) => {
  const rows = await db.select({ status: crmOpportunities.status }).from(crmOpportunities).where(gte(crmOpportunities.createdAt, since));
  const resolved = rows.filter((r) => r.status === "won" || r.status === "lost");
  if (!resolved.length) return [];
  const won = resolved.filter((r) => r.status === "won").length;
  return [{ signalType: "sales_outcome", metricKey: "win_rate", metricValue: won / resolved.length, sampleSize: resolved.length, evidenceRef: { won, lost: resolved.length - won } }];
};

/** Proposal outcomes: acceptance rate over DECIDED proposals (accepted vs rejected; higher = better). */
const proposalOutcomeCollector: EvidenceCollector = async ({ db, since }) => {
  const rows = await db.select({ status: proposalsTable.status }).from(proposalsTable).where(gte(proposalsTable.createdAt, since));
  const decided = rows.filter((r) => r.status === "accepted" || r.status === "rejected");
  if (!decided.length) return [];
  const accepted = decided.filter((r) => r.status === "accepted").length;
  return [{ signalType: "proposal_outcome", metricKey: "acceptance_rate", metricValue: accepted / decided.length, sampleSize: decided.length, evidenceRef: { accepted, rejected: decided.length - accepted } }];
};

/** Delivery outcomes: average project health (0..1, higher = better). Evidence: project health scores. */
const deliveryOutcomeCollector: EvidenceCollector = async ({ db, since }) => {
  const rows = await db.select({ health: projectsTable.healthScore }).from(projectsTable).where(gte(projectsTable.createdAt, since));
  const scored = rows.filter((r) => r.health !== null && r.health !== undefined);
  if (!scored.length) return [];
  const avg = scored.reduce((s, r) => s + num(r.health), 0) / scored.length;
  return [{ signalType: "delivery_outcome", metricKey: "avg_delivery_health", metricValue: Math.min(1, Math.max(0, avg / 100)), sampleSize: scored.length, evidenceRef: { avgHealthScore: Math.round(avg * 100) / 100, projects: scored.length } }];
};

/** Content outcomes: share of scheduled posts that PUBLISHED cleanly (higher = better). Evidence: scheduled_posts. */
const contentOutcomeCollector: EvidenceCollector = async ({ db, since }) => {
  const rows = await db.select({ status: scheduledPosts.status }).from(scheduledPosts).where(gte(scheduledPosts.createdAt, since));
  const terminal = rows.filter((r) => r.status === "published" || r.status === "failed");
  if (!terminal.length) return [];
  const published = terminal.filter((r) => r.status === "published").length;
  return [{ signalType: "content_outcome", metricKey: "publish_success_rate", metricValue: published / terminal.length, sampleSize: terminal.length, evidenceRef: { published, failed: terminal.length - published } }];
};

/** Founder feedback: approval rate over decisive feedback (higher = better). REJECT and ARCHIVE both count as
 *  dissatisfaction — consistent with the taste engine's `decisionSign` (both are −1) — so archiving bad output
 *  correctly lowers the rate. Ambiguous decisions (edit/regenerate/needs_review) are excluded. Evidence: feedback_events. */
const founderFeedbackCollector: EvidenceCollector = async ({ db, since }) => {
  const rows = await db.select({ decision: feedbackEvents.decision }).from(feedbackEvents).where(gte(feedbackEvents.createdAt, since));
  const decided = rows.filter((r) => r.decision === "approve" || r.decision === "reject" || r.decision === "archive");
  if (!decided.length) return [];
  const approved = decided.filter((r) => r.decision === "approve").length;
  return [{ signalType: "founder_feedback", metricKey: "founder_approval_rate", metricValue: approved / decided.length, sampleSize: decided.length, evidenceRef: { approved, dissatisfied: decided.length - approved } }];
};

export const DEFAULT_COLLECTORS: EvidenceCollector[] = [
  qaFailureCollector, revisionFrequencyCollector, deadLetterCollector, providerCostCollector,
  workflowRetryCollector, toolFailureCollector, salesOutcomeCollector, proposalOutcomeCollector,
  deliveryOutcomeCollector, contentOutcomeCollector, founderFeedbackCollector,
];

// ---- Opportunity formation ----
/** A signal below this health threshold (with enough samples) becomes an evidence-backed opportunity. */
const OPPORTUNITY_HEALTH_THRESHOLD = 0.8;
const MIN_SAMPLE_SIZE = 3;
/** The projected TARGET an improvement aims for — an ESTIMATE, never a realized actual and NOT a backtest: it just
 *  quantifies the gap worth closing so proposals can be ranked. It is deliberately not used as an approval gate. */
const PROJECTED_GAP_CLOSURE = 0.5;

// ---- Historical EVIDENCE evaluation (the real approval gate — it CAN fail) ----
// Approval requires the underlying evidence to be STRONG: enough samples that the signal is not noise, AND a
// problem that is CLEARLY below the health threshold (a meaningful margin, not a borderline blip). A marginal or
// thin opportunity is still surfaced as `proposed` so the founder sees it, but it is NOT approvable until the
// evidence is strong enough to justify a change. This is a genuine gate — unlike the projected target, it can fail.
const APPROVAL_MIN_SAMPLE = 8;
const APPROVAL_MARGIN = 0.05; // baseline must be at least this far BELOW the threshold to be "clearly" a problem

export interface EvidenceEvaluation { passed: boolean; reason: string; minSample: number; marginThreshold: number }

/** Evaluate whether a proposal's HISTORICAL EVIDENCE is strong enough to justify approval. Deterministic; can fail. */
export function evaluateEvidence(input: { baseline: number; sampleSize: number }): EvidenceEvaluation {
  const marginThreshold = OPPORTUNITY_HEALTH_THRESHOLD - APPROVAL_MARGIN;
  if (input.sampleSize < APPROVAL_MIN_SAMPLE) return { passed: false, reason: `insufficient evidence: ${input.sampleSize} samples < ${APPROVAL_MIN_SAMPLE} required to approve`, minSample: APPROVAL_MIN_SAMPLE, marginThreshold };
  if (input.baseline > marginThreshold) return { passed: false, reason: `marginal signal: health ${input.baseline.toFixed(2)} is only just below the ${OPPORTUNITY_HEALTH_THRESHOLD} threshold (needs ≤ ${marginThreshold.toFixed(2)})`, minSample: APPROVAL_MIN_SAMPLE, marginThreshold };
  return { passed: true, reason: `strong evidence: ${input.sampleSize} samples, health ${input.baseline.toFixed(2)} clearly below ${marginThreshold.toFixed(2)}`, minSample: APPROVAL_MIN_SAMPLE, marginThreshold };
}

const SIGNAL_TARGET: Record<string, { targetType: string; targetRef: string; risk: RiskTier; costCents: number; hypothesis: (o: Observation) => string; pattern: (o: Observation) => string }> = {
  qa_failure: { targetType: "qa_rubric", targetRef: "qa.gate", risk: "medium", costCents: 0, pattern: (o) => `QA pass rate is ${(o.metricValue * 100).toFixed(0)}% over ${o.sampleSize} reviews`, hypothesis: () => "Tighten the upstream generation prompt + add a targeted self-check for the most-failed criterion to lift pass rate." },
  revision_frequency: { targetType: "workflow", targetRef: "selective_revision", risk: "low", costCents: 0, pattern: (o) => `${o.sampleSize} revision cycles in the window (revision health ${o.metricValue.toFixed(2)})`, hypothesis: () => "Add a pre-QA lint pass to catch the common revision triggers before they reach the gate." },
  dead_letter: { targetType: "workflow", targetRef: "handoff_delivery", risk: "medium", costCents: 0, pattern: (o) => `Handoff delivery health ${(o.metricValue * 100).toFixed(0)}% over ${o.sampleSize} handoffs`, hypothesis: () => "Raise the retry ceiling + add a backoff for the most-common failure_reason to reduce dead letters." },
  provider_cost: { targetType: "model", targetRef: "model_role_map", risk: "low", costCents: 0, pattern: (o) => `Cost efficiency ${o.metricValue.toFixed(2)} (avg per-call cost is elevated) over ${o.sampleSize} calls`, hypothesis: () => "Route the cheapest-viable role to a smaller model where QA pass rate is unaffected." },
  workflow_retry: { targetType: "workflow", targetRef: "handoff_delivery", risk: "low", costCents: 0, pattern: (o) => `First-try delivery ${(o.metricValue * 100).toFixed(0)}% over ${o.sampleSize} handoffs (retries are common)`, hypothesis: () => "Add idempotency + a warm-up/backoff to the most-retried destination so more handoffs land first try." },
  tool_failure: { targetType: "tool", targetRef: "provider_tools", risk: "medium", costCents: 0, pattern: (o) => `Tool success ${(o.metricValue * 100).toFixed(0)}% over ${o.sampleSize} provider calls`, hypothesis: () => "Add a validation + single retry around the most-failing tool call before it surfaces as an error." },
  sales_outcome: { targetType: "prompt", targetRef: "sales_playbook", risk: "medium", costCents: 0, pattern: (o) => `Win rate ${(o.metricValue * 100).toFixed(0)}% over ${o.sampleSize} resolved opportunities`, hypothesis: () => "Tighten the qualification + follow-up cadence on the stages where deals are most often lost." },
  proposal_outcome: { targetType: "prompt", targetRef: "proposal_synthesis", risk: "medium", costCents: 0, pattern: (o) => `Proposal acceptance ${(o.metricValue * 100).toFixed(0)}% over ${o.sampleSize} decided proposals`, hypothesis: () => "Sharpen the ROI framing + scope specificity in the proposal synthesis where proposals are most often rejected." },
  delivery_outcome: { targetType: "workflow", targetRef: "delivery", risk: "medium", costCents: 0, pattern: (o) => `Average delivery health ${(o.metricValue * 100).toFixed(0)}% over ${o.sampleSize} projects`, hypothesis: () => "Add an earlier at-risk checkpoint + milestone-slip alert so delivery health is corrected before it drops." },
  content_outcome: { targetType: "workflow", targetRef: "content_publishing", risk: "low", costCents: 0, pattern: (o) => `Publish success ${(o.metricValue * 100).toFixed(0)}% over ${o.sampleSize} scheduled posts`, hypothesis: () => "Add a pre-publish validation (media/link/format) to cut the most-common publish failure." },
  founder_feedback: { targetType: "prompt", targetRef: "generation_prompts", risk: "low", costCents: 0, pattern: (o) => `Founder approval ${(o.metricValue * 100).toFixed(0)}% over ${o.sampleSize} decisions`, hypothesis: () => "Feed the most-common founder rejection reason back into the generation prompt as an explicit constraint." },
};

export interface OptimizerStore {
  insertCycle(row: Record<string, unknown>): Promise<void>;
  updateCycle(id: string, fields: Record<string, unknown>): Promise<void>;
  insertObservation(row: Record<string, unknown>): Promise<void>;
  insertProposal(row: Record<string, unknown>): Promise<void>;
  getProposal(id: string): Promise<Record<string, unknown> | null>;
  updateProposal(id: string, fields: Record<string, unknown>): Promise<void>;
  listProposals(q: { status?: string; cycleId?: string; limit: number }): Promise<Record<string, unknown>[]>;
  listCycles(q: { limit: number }): Promise<Record<string, unknown>[]>;
  listObservations(cycleId: string): Promise<Record<string, unknown>[]>;
  insertActivation(row: Record<string, unknown>): Promise<void>;
  getActiveActivation(proposalId: string): Promise<Record<string, unknown> | null>;
  updateActivation(id: string, fields: Record<string, unknown>): Promise<void>;
  insertMonitoring(row: Record<string, unknown>): Promise<void>;
  insertRollbackEvent(row: Record<string, unknown>): Promise<void>;
}

export interface OptimizerDeps {
  store?: OptimizerStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  collectors?: EvidenceCollector[];
  db?: Db;
  now?: Date;
  /** Observation window in ms (default 30 days). */
  windowMs?: number;
}

async function audit(deps: OptimizerDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

export interface CycleResult {
  cycleId: string;
  observations: number;
  opportunities: number;
  proposalIds: string[];
}

/**
 * Run ONE optimizer cycle (the scheduled unit of work): OBSERVE real signals → form EVIDENCE-backed opportunities
 * → HISTORICAL test each → persist as `proposed`. It NEVER approves, activates, or changes any prompt/workflow/
 * model/skill/agent/tool/policy/QA-rubric — the only outputs are rows in the optimizer's own tables for a founder
 * to inspect. Bounded: at most one proposal per signal, and only when the health is below threshold with enough samples.
 */
export async function runOptimizerCycle(opts: { trigger?: "scheduled" | "manual"; scope?: string } = {}, deps: OptimizerDeps = {}): Promise<CycleResult> {
  // db is needed by the default store + default (real-table) collectors. When a store + in-memory collectors are
  // injected (tests) there may be no DATABASE_URL — resolve db best-effort so those never force a real connection.
  let db: Db;
  try { db = deps.db ?? getDb(); } catch { db = undefined as unknown as Db; }
  const store = deps.store ?? defaultStore(db);
  const now = deps.now ?? new Date();
  const since = new Date(now.getTime() - (deps.windowMs ?? 30 * 86400_000));
  const collectors = deps.collectors ?? DEFAULT_COLLECTORS;
  const cycleId = newId("optcyc");

  await store.insertCycle({ id: cycleId, trigger: opts.trigger ?? "scheduled", status: "observing", scope: opts.scope ?? "os", startedAt: now, createdAt: now });
  await audit(deps, { eventType: "optimizer.cycle_started", module: OPTIMIZER_MODULE, entityType: "optimizer_cycle", entityId: cycleId, actor: "optimizer", metadata: { trigger: opts.trigger ?? "scheduled" } });

  // OBSERVE (bounded): each collector reads a real table; a failure in one collector never fails the cycle.
  const observations: Array<Observation & { id: string }> = [];
  for (const collect of collectors) {
    try {
      const obs = await collect({ db, since, now });
      for (const o of obs) {
        const obsId = newId("optobs");
        await store.insertObservation({ id: obsId, cycleId, signalType: o.signalType, metricKey: o.metricKey, metricValue: String(o.metricValue), sampleSize: o.sampleSize, evidenceRef: o.evidenceRef, observedAt: now, createdAt: now });
        observations.push({ ...o, id: obsId });
      }
    } catch (error) {
      await audit(deps, { eventType: "optimizer.collector_failed", module: OPTIMIZER_MODULE, entityType: "optimizer_cycle", entityId: cycleId, actor: "optimizer", metadata: { error: error instanceof Error ? error.message : String(error) } });
    }
  }

  // FORM opportunities: a below-threshold, well-sampled signal → an evidence-backed, historically-tested proposal.
  const proposalIds: string[] = [];
  for (const o of observations) {
    const spec = SIGNAL_TARGET[o.signalType];
    if (!spec) continue;
    if (o.sampleSize < MIN_SAMPLE_SIZE) continue;
    if (o.metricValue >= OPPORTUNITY_HEALTH_THRESHOLD) continue; // healthy enough — no opportunity (never fabricate one)
    const baseline = o.metricValue;
    // A projected TARGET (estimate, NOT a backtest): close part of the gap to 1.0. Used only to rank proposals.
    const projectedTarget = Math.min(1, baseline + (1 - baseline) * PROJECTED_GAP_CLOSURE);
    const estimatedValue = Math.round((projectedTarget - baseline) * 100 * 100) / 100; // 0..100 value from the gap worth closing
    // The REAL gate: is the historical evidence strong enough to justify a change? (can fail — marginal/thin → no approval)
    const evaluation = evaluateEvidence({ baseline, sampleSize: o.sampleSize });
    const proposalId = newId("optprop");
    const score = scoreProposal({ estimatedValue, estimatedCostCents: spec.costCents, riskLevel: spec.risk });
    await store.insertProposal({
      id: proposalId, cycleId, pattern: spec.pattern(o), hypothesis: spec.hypothesis(o), targetType: spec.targetType, targetRef: spec.targetRef,
      evidence: [o.id], estimatedValue: String(estimatedValue), estimatedCostCents: spec.costCents, riskLevel: spec.risk, score: String(score),
      historicalBaselineMetric: String(baseline), historicalCandidateMetric: String(projectedTarget), historicalSampleSize: o.sampleSize,
      // Persist the signal + metricKey so the auto-monitor can re-measure THIS activation's target metric later.
      metadata: { evaluation, projectedTarget, signalType: o.signalType, metricKey: o.metricKey, estimateNote: "projectedTarget is an estimate of the gap worth closing — NOT a backtest of the change" },
      status: "proposed", version: 1, createdAt: now, updatedAt: now,
    });
    await audit(deps, { eventType: "optimizer.opportunity_proposed", module: OPTIMIZER_MODULE, entityType: "improvement_proposal", entityId: proposalId, actor: "optimizer", metadata: { signalType: o.signalType, targetType: spec.targetType, estimatedValue, score, baseline, projectedTarget, evaluationPassed: evaluation.passed } });
    proposalIds.push(proposalId);
  }

  await store.updateCycle(cycleId, { status: "complete", observationCount: observations.length, opportunityCount: proposalIds.length, completedAt: now });
  return { cycleId, observations: observations.length, opportunities: proposalIds.length, proposalIds };
}

export interface MonitorResult {
  monitored: number;
  degraded: number;
  rolledBack: number;
}

/**
 * AUTO-MONITOR the self-improvement loop's tail (closes the loop the founder named). For every ACTIVE
 * activation, RE-MEASURE its target metric NOW — by running the same evidence collectors and matching each
 * activation's persisted `metricKey` to the freshly-observed value — then `recordMonitoring(..., autoRollback:true)`.
 * If the live metric has dropped below the activation's pinned baseline, the improvement is automatically ROLLED
 * BACK (and the event audited). So an activated change that turns out to hurt is caught + reverted on the daily
 * cadence instead of never being measured. Best-effort per activation; a failure on one never blocks the rest.
 */
export async function runOptimizerMonitoring(deps: OptimizerDeps = {}): Promise<MonitorResult> {
  let db: Db;
  try { db = deps.db ?? getDb(); } catch { db = undefined as unknown as Db; }
  const store = deps.store ?? defaultStore(db);
  const now = deps.now ?? new Date();
  const since = new Date(now.getTime() - (deps.windowMs ?? 30 * 86400_000));
  const collectors = deps.collectors ?? DEFAULT_COLLECTORS;

  // Re-measure every metric ONCE (the current production reality).
  const currentByMetric = new Map<string, { value: number; sampleSize: number }>();
  for (const collect of collectors) {
    try {
      for (const o of await collect({ db, since, now })) {
        currentByMetric.set(o.metricKey, { value: o.metricValue, sampleSize: o.sampleSize });
      }
    } catch {
      // a broken collector must never abort monitoring of the others
    }
  }

  const active = await store.listProposals({ status: "active", limit: 200 });
  const result: MonitorResult = { monitored: 0, degraded: 0, rolledBack: 0 };
  for (const row of active) {
    const metricKey = (row.metadata as { metricKey?: unknown } | null)?.metricKey;
    if (typeof metricKey !== "string") continue; // pre-metricKey proposal — nothing to re-measure against
    const current = currentByMetric.get(metricKey);
    if (!current) continue; // no fresh signal for this metric this window — skip (never fabricate a measurement)
    const r = await recordMonitoring(String(row.id), { measuredMetric: current.value, sampleSize: current.sampleSize, autoRollback: true }, deps).catch(() => null);
    if (r?.ok) {
      result.monitored += 1;
      if (r.degraded) result.degraded += 1;
      if (r.rolledBack) result.rolledBack += 1;
    }
  }
  return result;
}

// Hydrate a DB proposal row into the pure-domain shape for the governance functions.
function toDomain(row: Record<string, unknown>): ImprovementProposal {
  const ht = row.historicalBaselineMetric !== null && row.historicalBaselineMetric !== undefined
    ? { baselineMetric: num(row.historicalBaselineMetric), candidateMetric: num(row.historicalCandidateMetric), sampleSize: Number(row.historicalSampleSize ?? 0) }
    : null;
  return {
    id: String(row.id), pattern: String(row.pattern ?? ""), evidence: (row.evidence as string[]) ?? [], hypothesis: String(row.hypothesis ?? ""),
    estimatedValue: num(row.estimatedValue), estimatedCostCents: Number(row.estimatedCostCents ?? 0), riskLevel: (row.riskLevel as RiskTier) ?? "low",
    historicalTest: ht, status: row.status as ImprovementProposal["status"], version: Number(row.version ?? 1),
  };
}

/**
 * APPROVE a proposed improvement (founder). Governed: the proposal must be `proposed` AND its historical EVIDENCE
 * evaluation must PASS (strong enough evidence — enough samples + a clearly-below-threshold problem). This is a
 * REAL gate that can fail: a marginal or thin opportunity is surfaced but cannot be approved until the evidence is
 * strong. (The projected target is only an estimate for ranking — it is NOT used as an approval precondition.)
 */
export async function approveProposal(id: string, opts: { approvedBy: string }, deps: OptimizerDeps = {}): Promise<{ ok: boolean; error?: string }> {
  const store = deps.store ?? defaultStore(deps.db ?? getDb());
  const now = deps.now ?? new Date();
  const row = await store.getProposal(id);
  if (!row) return { ok: false, error: "proposal not found" };
  if (row.status !== "proposed") return { ok: false, error: `cannot approve a '${row.status}' proposal (must be proposed)` };
  // Re-evaluate the evidence from the persisted metrics (don't trust a possibly-stale stored flag).
  const evaluation = evaluateEvidence({ baseline: num(row.historicalBaselineMetric), sampleSize: Number(row.historicalSampleSize ?? 0) });
  if (!evaluation.passed) return { ok: false, error: `cannot approve — ${evaluation.reason}` };
  await store.updateProposal(id, { status: "approved", approvedBy: opts.approvedBy, approvedAt: now, updatedAt: now });
  await audit(deps, { eventType: "optimizer.proposal_approved", module: OPTIMIZER_MODULE, entityType: "improvement_proposal", entityId: id, actor: opts.approvedBy, metadata: { evaluation: evaluation.reason } });
  return { ok: true };
}

export async function rejectProposal(id: string, opts: { rejectedBy: string; reason?: string }, deps: OptimizerDeps = {}): Promise<{ ok: boolean; error?: string }> {
  const store = deps.store ?? defaultStore(deps.db ?? getDb());
  const now = deps.now ?? new Date();
  const row = await store.getProposal(id);
  if (!row) return { ok: false, error: "proposal not found" };
  if (row.status !== "proposed" && row.status !== "approved") return { ok: false, error: `cannot reject a '${row.status}' proposal` };
  await store.updateProposal(id, { status: "rejected", rejectedReason: opts.reason ?? null, updatedAt: now });
  await audit(deps, { eventType: "optimizer.proposal_rejected", module: OPTIMIZER_MODULE, entityType: "improvement_proposal", entityId: id, actor: opts.rejectedBy, metadata: { reason: opts.reason ?? null } });
  return { ok: true };
}

/**
 * ACTIVATE an approved improvement — the ONLY path to an `active` improvement, and it is founder-driven. Activation
 * writes ONLY an `optimizer_activations` record (versioned, pinned to the baseline it must beat) + flips the proposal
 * to `active`. It NEVER mutates a prompt/skill/workflow/model/etc. — a consumer READS the approved record; nothing is
 * changed silently. Returns the activation id.
 */
export async function activateProposal(id: string, opts: { activatedBy: string; config?: Record<string, unknown> }, deps: OptimizerDeps = {}): Promise<{ ok: boolean; error?: string; activationId?: string }> {
  const store = deps.store ?? defaultStore(deps.db ?? getDb());
  const now = deps.now ?? new Date();
  const row = await store.getProposal(id);
  if (!row) return { ok: false, error: "proposal not found" };
  const p = toDomain(row);
  if (!canActivate(p)) return { ok: false, error: `cannot activate a '${p.status}' proposal (must be approved first)` };
  const activationId = newId("optact");
  const baseline = num(row.historicalBaselineMetric);
  await store.insertActivation({ id: activationId, proposalId: id, version: Number(row.version ?? 1), baselineMetric: String(baseline), config: opts.config ?? {}, status: "active", activatedBy: opts.activatedBy, activatedAt: now, createdAt: now });
  await store.updateProposal(id, { status: "active", activatedAt: now, updatedAt: now });
  await audit(deps, { eventType: "optimizer.proposal_activated", module: OPTIMIZER_MODULE, entityType: "improvement_proposal", entityId: id, actor: opts.activatedBy, metadata: { activationId, baseline } });
  return { ok: true, activationId };
}

/**
 * Record a MONITORED outcome for an active improvement vs its baseline. If it DEGRADED (measured < baseline) and
 * `autoRollback` is set, roll it back automatically (a degrading improvement must not persist). Returns degraded + whether it rolled back.
 */
export async function recordMonitoring(id: string, input: { measuredMetric: number; sampleSize?: number; autoRollback?: boolean }, deps: OptimizerDeps = {}): Promise<{ ok: boolean; error?: string; degraded?: boolean; rolledBack?: boolean }> {
  const store = deps.store ?? defaultStore(deps.db ?? getDb());
  const now = deps.now ?? new Date();
  const row = await store.getProposal(id);
  if (!row) return { ok: false, error: "proposal not found" };
  if (row.status !== "active") return { ok: false, error: `proposal is not active (status: ${row.status})` };
  const activation = await store.getActiveActivation(id);
  if (!activation) return { ok: false, error: "no active activation to monitor" };
  const baseline = num(activation.baselineMetric);
  const degraded = shouldRollback({ activeMetric: input.measuredMetric, baselineMetric: baseline });
  await store.insertMonitoring({ id: newId("optmon"), proposalId: id, activationId: String(activation.id), measuredMetric: String(input.measuredMetric), baselineMetric: String(baseline), sampleSize: input.sampleSize ?? 0, degraded, observedAt: now, createdAt: now });
  await audit(deps, { eventType: "optimizer.monitored", module: OPTIMIZER_MODULE, entityType: "improvement_proposal", entityId: id, actor: "optimizer", metadata: { measured: input.measuredMetric, baseline, degraded } });
  let rolledBack = false;
  if (degraded && input.autoRollback) {
    const rb = await rollbackProposal(id, { rolledBackBy: "system", reason: `monitored metric ${input.measuredMetric} dropped below baseline ${baseline}` }, deps);
    rolledBack = rb.ok;
  }
  return { ok: true, degraded, rolledBack };
}

/** ROLL BACK an active improvement (system on degradation, or a founder). Reverts the proposal + activation + logs the event. */
export async function rollbackProposal(id: string, opts: { rolledBackBy: string; reason: string; force?: boolean }, deps: OptimizerDeps = {}): Promise<{ ok: boolean; error?: string }> {
  const store = deps.store ?? defaultStore(deps.db ?? getDb());
  const now = deps.now ?? new Date();
  const row = await store.getProposal(id);
  if (!row) return { ok: false, error: "proposal not found" };
  if (row.status !== "active") return { ok: false, error: `cannot roll back a '${row.status}' proposal` };
  const activation = await store.getActiveActivation(id);
  await store.updateProposal(id, { status: "rolled_back", updatedAt: now });
  if (activation) await store.updateActivation(String(activation.id), { status: "rolled_back" });
  await store.insertRollbackEvent({ id: newId("optrb"), proposalId: id, activationId: activation ? String(activation.id) : null, reason: opts.reason, measuredMetric: null, baselineMetric: activation ? String(num(activation.baselineMetric)) : null, rolledBackBy: opts.rolledBackBy, createdAt: now });
  await audit(deps, { eventType: "optimizer.proposal_rolled_back", module: OPTIMIZER_MODULE, entityType: "improvement_proposal", entityId: id, actor: opts.rolledBackBy, metadata: { reason: opts.reason } });
  return { ok: true };
}

// ---- Reads ----
export async function listCycles(limit = 50, deps: OptimizerDeps = {}): Promise<Record<string, unknown>[]> {
  return (deps.store ?? defaultStore(deps.db ?? getDb())).listCycles({ limit: Math.min(Math.max(limit, 1), 200) });
}
export async function listProposals(query: { status?: string; cycleId?: string; limit?: number } = {}, deps: OptimizerDeps = {}): Promise<Record<string, unknown>[]> {
  return (deps.store ?? defaultStore(deps.db ?? getDb())).listProposals({ status: query.status, cycleId: query.cycleId, limit: Math.min(Math.max(query.limit ?? 100, 1), 500) });
}
export async function listObservations(cycleId: string, deps: OptimizerDeps = {}): Promise<Record<string, unknown>[]> {
  return (deps.store ?? defaultStore(deps.db ?? getDb())).listObservations(cycleId);
}

export function defaultStore(db: Db = getDb()): OptimizerStore {
  return {
    async insertCycle(row) { await db.insert(optimizerCycles).values(row as never); },
    async updateCycle(id, fields) { await db.update(optimizerCycles).set(fields as never).where(eq(optimizerCycles.id, id)); },
    async insertObservation(row) { await db.insert(optimizerObservations).values(row as never); },
    async insertProposal(row) { await db.insert(improvementProposals).values(row as never); },
    async getProposal(id) { const r = await db.select().from(improvementProposals).where(eq(improvementProposals.id, id)).limit(1); return r[0] ?? null; },
    async updateProposal(id, fields) { await db.update(improvementProposals).set({ ...fields, updatedAt: (fields as { updatedAt?: Date }).updatedAt ?? new Date() } as never).where(eq(improvementProposals.id, id)); },
    async listProposals(q) {
      const conds = [];
      if (q.status) conds.push(eq(improvementProposals.status, q.status));
      if (q.cycleId) conds.push(eq(improvementProposals.cycleId, q.cycleId));
      const base = db.select().from(improvementProposals);
      return (await (conds.length ? base.where(and(...conds)) : base).orderBy(desc(improvementProposals.createdAt)).limit(q.limit)) as Record<string, unknown>[];
    },
    async listCycles(q) { return (await db.select().from(optimizerCycles).orderBy(desc(optimizerCycles.startedAt)).limit(q.limit)) as Record<string, unknown>[]; },
    async listObservations(cycleId) { return (await db.select().from(optimizerObservations).where(eq(optimizerObservations.cycleId, cycleId)).orderBy(desc(optimizerObservations.observedAt))) as Record<string, unknown>[]; },
    async insertActivation(row) { await db.insert(optimizerActivations).values(row as never); },
    async getActiveActivation(proposalId) { const r = await db.select().from(optimizerActivations).where(and(eq(optimizerActivations.proposalId, proposalId), eq(optimizerActivations.status, "active"))).orderBy(desc(optimizerActivations.activatedAt)).limit(1); return r[0] ?? null; },
    async updateActivation(id, fields) { await db.update(optimizerActivations).set(fields as never).where(eq(optimizerActivations.id, id)); },
    async insertMonitoring(row) { await db.insert(optimizerMonitoring).values(row as never); },
    async insertRollbackEvent(row) { await db.insert(optimizerRollbackEvents).values(row as never); },
  };
}

/** Cadence gate: has a scheduled cycle run within the last `everyMs`? Used by the scheduler to run at most 1/day. */
export async function optimizerCycleDue(everyMs: number, deps: OptimizerDeps = {}): Promise<boolean> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const recent = await db.select({ startedAt: optimizerCycles.startedAt }).from(optimizerCycles).where(and(eq(optimizerCycles.trigger, "scheduled"), gte(optimizerCycles.startedAt, new Date(now.getTime() - everyMs)))).limit(1);
  return recent.length === 0;
}
