import { CronExpressionParser } from "cron-parser";
import { listAutomations, runAutomation } from "@/lib/automations";
import { listResearchTargets, markResearchTargetScouted } from "@/lib/intelligence";
import { dispatchDuePosts } from "@/lib/library";
import { harvestPendingConversations } from "@/lib/memory-harvester";
import { purgeExpiredArchivedMemory } from "@/lib/memory";
import { purgeExpiredGraphCheckpoints, GRAPH_CHECKPOINT_RETENTION_MS } from "@/lib/graph-checkpoint";
import { reclaimExpiredHandoffLeases, purgeExpiredHandoffs, HANDOFF_RETENTION_MS } from "@/lib/handoff";
import { reconcileApprovalEffects } from "@/lib/approval-effects";
import { refreshAllDepartmentHealth } from "@/lib/departments/health";
import { GOVERNANCE_REVIEW_JOB_TYPE } from "@/lib/security-governance/job";
import { expireStaleReservations } from "@/lib/departments/budget";
import { escalateDeadLetteredHandoffs } from "@/lib/departments/escalation";
import { runDepartmentConsumerTick } from "@/lib/departments/consumer";
import { proposeDecisionPolicies } from "@/lib/decision-learning";
import { buildAndStoreDailyBrief } from "@/lib/daily-brief";
import { runOptimizerCycle, optimizerCycleDue } from "@/lib/optimizer";
import { purgeExpiredWebhookReplayClaims } from "@/lib/webhook-replay";
import { APPROVAL_EFFECT_APPLIERS } from "@/lib/approval-effects/appliers";
import { enqueueJob, reclaimStalledJobs } from "@/lib/jobs";
import { writeAuditEvent } from "@/lib/audit";
import type { ResearchCadence } from "@/lib/domain/intelligence";

/**
 * THE SCHEDULER — the keystone the OS was missing. Every "runs on its own / on a cadence"
 * feature was inert because nothing ever fired it. This tick is invoked periodically by the
 * worker loop (and can be triggered manually) and drives ALL due work:
 *   1. Automation rules with triggerType='schedule' (cron)  -> runAutomation
 *   2. Approved research targets whose nextRunAt is due      -> enqueue intelligence.scout
 *   3. Scheduled posts that are due                          -> dispatchDuePosts
 *   4. Daily maintenance                                     -> memory harvest + purge
 * Every section is independently guarded so one failure never stops the others.
 */

const CADENCE_MS: Record<ResearchCadence, number | null> = {
  manual: null,
  on_trigger: null,
  hourly: 60 * 60_000,
  daily: 24 * 60 * 60_000,
  weekly: 7 * 24 * 60 * 60_000,
  monthly: 30 * 24 * 60 * 60_000,
};

export interface SchedulerDeps {
  now?: Date;
  enqueue?: (input: { queue: string; type: string; payload: Record<string, unknown>; linkedModule?: string }) => Promise<{ job: { id: string } }>;
  recordAudit?: (input: Parameters<typeof writeAuditEvent>[0]) => Promise<void>;
  /** Reclaim jobs stuck 'active' from a crashed worker. Injectable for tests; defaults to the DB store. */
  reclaimStalled?: (now: Date) => Promise<number>;
  /** run daily-maintenance this tick (the worker gates this to ~once/day) */
  runMaintenance?: boolean;
  /**
   * Drive the department CONSUMER loop this tick — claim + run routed inter-department handoffs so the
   * chain is autonomous. OPT-IN (the worker enables it); default OFF so unit ticks never claim real
   * handoffs or fire real provider calls. Injectable override for the tick itself (proofs/tests).
   */
  runDepartmentConsumers?: boolean;
  consumeDepartments?: (now: Date) => Promise<{ claimed: number; completed: number; failed: number }>;
  /**
   * Continuous Research (Phase 5) cadence seam: analyse recent observations → validate through the
   * research_validation QA gate → propagate only released intelligence. Runs in the daily-maintenance block.
   * Injectable so proofs/tests inject canned analyst/dreamer (no LLM); the default runs the real department
   * with the QA gate enabled. Analysis is cost-safe — the analyst returns early (no LLM) when there is
   * nothing new to analyse.
   */
  researchTick?: (now: Date) => Promise<{ insights: number; released: boolean }>;
}

export interface SchedulerResult {
  automationsFired: number;
  scoutsEnqueued: number;
  postsDispatched: number;
  postsHeldForConfirm: number;
  deadLetterAutoRetried: number;
  stalledReclaimed: number;
  departmentHandoffsConsumed: number;
  decisionPoliciesProposed: number;
  dailyBriefGenerated: boolean;
  continuousResearchInsights: number;
  optimizerOpportunities: number;
  maintenanceRan: boolean;
  errors: string[];
}

/**
 * Default Continuous Research tick: run the Research & Intelligence department for the org scope WITH the
 * research_validation QA gate enabled, so validated intelligence propagates to the Founder Command Centre
 * only on PASS (a non-pass blocks propagation + raises an escalation). Lazy import avoids a scheduler↔dept
 * cycle. Returns the insight count + whether the intelligence was released.
 */
async function defaultResearchTick(now: Date): Promise<{ insights: number; released: boolean }> {
  const { runResearchIntelligenceDepartment } = await import("@/lib/departments/verticals/research-intelligence");
  const res = await runResearchIntelligenceDepartment({ scope: "wobble", requestedBy: "scheduler" }, { qa: { deps: {} }, now });
  return { insights: res.product?.analysis.proposedInsights ?? 0, released: res.routedTo.some((r) => r.department === "founder_command_centre") };
}

/** Is a cron schedule due since it last ran? */
export function cronDue(schedule: string, since: Date, now: Date): boolean {
  try {
    const it = CronExpressionParser.parse(schedule, { currentDate: since });
    const next = it.next().toDate();
    return next.getTime() <= now.getTime();
  } catch {
    return false; // unparseable cron -> never fire (don't crash the tick)
  }
}

export async function runScheduledTick(deps: SchedulerDeps = {}): Promise<SchedulerResult> {
  const now = deps.now ?? new Date();
  const enqueue = deps.enqueue ?? (async (i) => { const r = await enqueueJob(i); return { job: { id: r.job.id } }; });
  const recordAudit = deps.recordAudit ?? ((i: Parameters<typeof writeAuditEvent>[0]) => writeAuditEvent(i));
  const result: SchedulerResult = { automationsFired: 0, scoutsEnqueued: 0, postsDispatched: 0, postsHeldForConfirm: 0, deadLetterAutoRetried: 0, stalledReclaimed: 0, departmentHandoffsConsumed: 0, decisionPoliciesProposed: 0, dailyBriefGenerated: false, continuousResearchInsights: 0, optimizerOpportunities: 0, maintenanceRan: false, errors: [] };

  // 0. Crash recovery: a worker that died mid-job leaves it 'active' forever. Reclaim stalled jobs
  // every tick (active > 5 min) so a peer crash self-heals in minutes instead of never.
  try {
    result.stalledReclaimed = await (deps.reclaimStalled ?? ((n: Date) => reclaimStalledJobs({ now: n })))(now);
  } catch (e) {
    result.errors.push(`reclaim: ${e instanceof Error ? e.message : e}`);
  }
  // Crash recovery for the handoff backbone: reclaim leases whose consumer died mid-processing.
  try {
    await reclaimExpiredHandoffLeases({ now });
  } catch (e) {
    result.errors.push(`handoff-reclaim: ${e instanceof Error ? e.message : e}`);
  }
  // Approval-effects outbox reconciliation: apply any pending downstream effect whose inline apply
  // never completed (process crashed between the atomic flip+record and the effect). Converges.
  try {
    await reconcileApprovalEffects(APPROVAL_EFFECT_APPLIERS, { now });
  } catch (e) {
    result.errors.push(`approval-effects: ${e instanceof Error ? e.message : e}`);
  }
  // Refresh truthful department health from live signals (orchestrator/team availability, handoff
  // backlog/dead-letters/failures, budget, blocked approvals) so the Command Centre never shows a stale
  // or falsely-healthy department.
  try {
    await refreshAllDepartmentHealth({ now });
  } catch (e) {
    result.errors.push(`department-health: ${e instanceof Error ? e.message : e}`);
  }
  // Governance runs on a CADENCE, not only when a founder clicks (WOB-UAT-024). Enqueued as a durable
  // job so it survives a restart; the idempotency key is the UTC hour, so repeated ticks within the hour
  // dedupe to one review instead of flooding the queue with reviews of identical state.
  try {
    const hourKey = `governance.review:${now.toISOString().slice(0, 13)}`;
    await enqueueJob({ queue: "general", type: GOVERNANCE_REVIEW_JOB_TYPE, payload: { requestedBy: "scheduler" }, idempotencyKey: hourKey, linkedModule: "security_governance" }, { now });
  } catch (e) {
    // A kill switch on governance is a legitimate founder decision, not a scheduler fault — record it
    // without treating it as an error the operator must chase.
    const msg = e instanceof Error ? e.message : String(e);
    if (!/kill switch/i.test(msg)) result.errors.push(`governance-review: ${msg}`);
  }
  // Release abandoned budget reservations (work that reserved spend but never settled) so a crashed job
  // can't hold a department's budget hostage.
  try {
    await expireStaleReservations({ now });
  } catch (e) {
    result.errors.push(`budget-expiry: ${e instanceof Error ? e.message : e}`);
  }
  // Surface blocked inter-agent work: an earned `workflow.retry` grant AUTO-REDRIVES a dead-lettered handoff once
  // (bounded); otherwise raise a founder escalation (deduped) so it appears in the Command Centre for a decision.
  try {
    const dl = await escalateDeadLetteredHandoffs({ now, enforceAutonomy: true });
    result.deadLetterAutoRetried = dl.autoRetried;
  } catch (e) {
    result.errors.push(`dead-letter-escalation: ${e instanceof Error ? e.message : e}`);
  }
  // Department CONSUMER loop (opt-in): claim routed inter-department handoffs and run the destination
  // department so the chain is autonomous (and a RESUMED handoff actually re-executes). Off by default so
  // unit ticks never claim real handoffs or fire real provider calls.
  if (deps.runDepartmentConsumers) {
    try {
      // enableQaGates: when the autonomous consumer runs in production, the Proposal consumer applies its
      // independent QA gate (technical + commercial boards) — a non-pass proposal is hard-blocked + escalated.
      const consumed = await (deps.consumeDepartments ?? (async (n: Date) => runDepartmentConsumerTick({ now: n, enableQaGates: true })))(now);
      result.departmentHandoffsConsumed = consumed.completed;
      for (let i = 0; i < consumed.failed; i++) result.errors.push("department-consumer: a handoff failed and was requeued/dead-lettered");
    } catch (e) {
      result.errors.push(`department-consumer: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 1. Schedule-triggered automation rules (cron).
  try {
    const rules = await listAutomations({ enabled: true, limit: 500 });
    for (const rule of rules) {
      if (rule.triggerType !== "schedule" || !rule.schedule) continue;
      const since = rule.lastRunAt ?? rule.createdAt;
      if (cronDue(rule.schedule, since, now)) {
        await runAutomation(rule.id, { actor: "scheduler" }, { now }).catch((e) => result.errors.push(`automation ${rule.id}: ${e?.message ?? e}`));
        result.automationsFired++;
      }
    }
  } catch (e) { result.errors.push(`automations: ${e instanceof Error ? e.message : e}`); }

  // 2. Approved research targets due for a scout.
  try {
    const targets = await listResearchTargets({ approvalStatus: "approved", limit: 200 });
    for (const t of targets) {
      const stepMs = CADENCE_MS[(t.cadence as ResearchCadence) ?? "manual"];
      if (stepMs == null) continue;                     // manual/on_trigger -> not scheduled
      if (!t.handleOrUrl) continue;                     // nothing to scout
      const due = !t.nextRunAt || t.nextRunAt.getTime() <= now.getTime();
      if (!due) continue;
      await enqueue({ queue: "general", type: "intelligence.scout", payload: { handleOrUrl: t.handleOrUrl, platform: t.platform ?? "instagram", targetId: t.id, scope: t.scope, clientId: t.clientId ?? undefined }, linkedModule: "intelligence" });
      await markResearchTargetScouted(t.id, { lastCheckedAt: now, nextRunAt: new Date(now.getTime() + stepMs) }).catch(() => {});
      result.scoutsEnqueued++;
    }
  } catch (e) { result.errors.push(`research-targets: ${e instanceof Error ? e.message : e}`); }

  // 3. Scheduled posts that are due. EARNED-AUTONOMY ENFORCED on the live cadence: an external post fires
  // autonomously only under an explicit `content.publish` grant; otherwise it is HELD for a founder confirm
  // (never silently auto-posted). This is the real production trigger for the autonomy gate.
  try {
    const d = await dispatchDuePosts({ now, enforceAutonomy: true });
    result.postsDispatched = d.dispatched;
    result.postsHeldForConfirm = d.heldForConfirm;
  } catch (e) { result.errors.push(`posts: ${e instanceof Error ? e.message : e}`); }

  // 4. Daily maintenance (worker gates this to ~once/day via runMaintenance).
  if (deps.runMaintenance) {
    try {
      await harvestPendingConversations({ limit: 20 }).catch((e) => result.errors.push(`harvest: ${e?.message ?? e}`));
      await purgeExpiredArchivedMemory({ limit: 100 }).catch((e) => result.errors.push(`purge: ${e?.message ?? e}`));
      // Retention sweep for abandoned graph checkpoints (runs that never completed or were cancelled).
      await purgeExpiredGraphCheckpoints(new Date(now.getTime() - GRAPH_CHECKPOINT_RETENTION_MS)).catch((e) => result.errors.push(`ckpt-purge: ${e?.message ?? e}`));
      // Retention sweep for terminal handoffs (completed/cancelled/dead-lettered past the cutoff).
      await purgeExpiredHandoffs(new Date(now.getTime() - HANDOFF_RETENTION_MS)).catch((e) => result.errors.push(`handoff-purge: ${e?.message ?? e}`));
      // Inbound webhook delivery claims are retained for 30 days, then removed by this durable sweep.
      await purgeExpiredWebhookReplayClaims(now).catch((e) => result.errors.push(`webhook-replay-purge: ${e?.message ?? e}`));
      // Decision Learning: derive scoped policy PROPOSALS from committed Decision Room decisions. Never
      // auto-applied — every result is a `proposed` row awaiting explicit founder approval. Idempotent by
      // natural key (a direction already tracked is not re-proposed), so running daily never duplicates.
      await proposeDecisionPolicies({}).then((p) => { result.decisionPoliciesProposed = p.length; }).catch((e) => result.errors.push(`decision-learning: ${e?.message ?? e}`));
      // Daily Founder Brief: assemble the company-wide brief from the real wired signals (escalations,
      // approvals-due, delivery-risks, finance-alerts) and PERSIST it durably. The founder surface reads the
      // latest row. Best-effort — a provider failure degrades that one category, never the whole tick.
      await buildAndStoreDailyBrief({ type: "company", cadence: "daily" }, { now }).then(() => { result.dailyBriefGenerated = true; }).catch((e) => result.errors.push(`daily-brief: ${e?.message ?? e}`));
      // Continuous Research (Phase 5): analyse recent observations into insights + suggestions, VALIDATE them
      // through the research_validation QA gate, and propagate only released intelligence. Cost-safe (the
      // analyst returns early without an LLM call when there is nothing new to analyse). This is what makes
      // the research gate LIVE on a real production cadence.
      if (deps.researchTick || process.env.DATABASE_URL) {
        await (deps.researchTick ?? defaultResearchTick)(now).then((r) => { result.continuousResearchInsights = r.insights; }).catch((e) => result.errors.push(`continuous-research: ${e?.message ?? e}`));
      }
      // Controlled Dream / Optimizer (Phase 8): ONCE/day, run a cycle that OBSERVES real signals (QA, revisions,
      // dead letters, provider cost) and PROPOSES evidence-backed opportunities. It never approves/activates/
      // changes anything — every output is a `proposed` row awaiting explicit founder approval. Cadence-gated so
      // repeated ticks in a day never re-run it.
      if (process.env.DATABASE_URL && await optimizerCycleDue(20 * 3600_000, { now })) {
        await runOptimizerCycle({ trigger: "scheduled" }, { now }).then((r) => { result.optimizerOpportunities = r.opportunities; }).catch((e) => result.errors.push(`optimizer: ${e?.message ?? e}`));
      }
      result.maintenanceRan = true;
    } catch (e) { result.errors.push(`maintenance: ${e instanceof Error ? e.message : e}`); }
  }

  if (result.automationsFired || result.scoutsEnqueued || result.postsDispatched || result.stalledReclaimed || result.departmentHandoffsConsumed || result.decisionPoliciesProposed || result.dailyBriefGenerated || result.continuousResearchInsights || result.optimizerOpportunities || result.maintenanceRan || result.errors.length) {
    await recordAudit({ eventType: "scheduler.tick", module: "scheduler", entityType: "system", actor: "scheduler", metadata: { ...result } }).catch(() => {});
  }
  return result;
}
