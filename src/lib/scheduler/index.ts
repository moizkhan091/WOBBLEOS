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
}

export interface SchedulerResult {
  automationsFired: number;
  scoutsEnqueued: number;
  postsDispatched: number;
  stalledReclaimed: number;
  maintenanceRan: boolean;
  errors: string[];
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
  const result: SchedulerResult = { automationsFired: 0, scoutsEnqueued: 0, postsDispatched: 0, stalledReclaimed: 0, maintenanceRan: false, errors: [] };

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

  // 3. Scheduled posts that are due.
  try {
    const d = await dispatchDuePosts({ now });
    result.postsDispatched = d.dispatched;
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
      result.maintenanceRan = true;
    } catch (e) { result.errors.push(`maintenance: ${e instanceof Error ? e.message : e}`); }
  }

  if (result.automationsFired || result.scoutsEnqueued || result.postsDispatched || result.stalledReclaimed || result.maintenanceRan || result.errors.length) {
    await recordAudit({ eventType: "scheduler.tick", module: "scheduler", entityType: "system", actor: "scheduler", metadata: { ...result } }).catch(() => {});
  }
  return result;
}
