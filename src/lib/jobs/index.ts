import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { jobAttempts, jobs } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { newId } from "@/lib/ids";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { loadEngagedSwitches, blockedJobType, blockedJobTypes, KillSwitchEngagedError, type EnforcementDeps } from "@/lib/security-governance/enforcement";
import {
  buildJobRow,
  enqueueJobSchema,
  evaluateJobFailure,
  type EnqueueJobInput,
  type JobRow,
  type JobStatus,
} from "@/lib/domain/jobs";
import { assertJobConnectionsAllowed } from "@/lib/connections";

/**
 * Chunk 06: Job Queue service.
 *
 * enqueueJob() inserts a pending job (deduped by idempotency key).
 * processNextJob() atomically claims the next pending job, runs its registered
 * handler, and records completion / retry / failure. Store + audit are
 * injectable so the flow is testable without Postgres. The default store uses
 * `FOR UPDATE SKIP LOCKED` so multiple workers never grab the same job.
 */

export interface JobAttemptRow {
  id: string;
  jobId: string;
  attemptNumber: number;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  error: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface JobStore {
  findActiveByIdempotencyKey(key: string): Promise<JobRow | null>;
  /**
   * Any job with this key, IN ANY STATUS — including completed/failed.
   *
   * Distinct from `findActiveByIdempotencyKey` on purpose. Active-only is the right rule for ordinary
   * idempotency (do not double-enqueue in-flight work; a completed job should not block a legitimately
   * new request). It is the WRONG rule for a CADENCE: a job that completes in a second leaves nothing
   * "active", so every subsequent tick re-enqueues it. That is exactly how the governance review ran 50×
   * in one hour instead of once (WOB-UAT-036).
   */
  findByIdempotencyKeyAnyStatus(key: string): Promise<JobRow | null>;
  insert(row: JobRow): Promise<void>;
  /** atomically pick the next runnable job, mark it active, increment attempts */
  /**
   * `blockedTypes` are job types under an engaged kill switch. They are excluded IN THE CLAIM QUERY, not
   * after claiming: `claimNext` does `attempts = attempts + 1` and `requeue` never decrements, so a
   * claim-then-defer would burn an attempt every poll and a switch engaged for minutes would silently
   * exhaust maxAttempts and permanently FAIL queued work. Filtering here leaves the job untouched and
   * `pending`, so it runs normally the moment the switch is released (WOB-UAT-024 enforcement).
   */
  claimNext(queue: string, now: Date, blockedTypes?: string[], lease?: { owner: string; expiresAt: Date }): Promise<JobRow | null>;
  complete(id: string, result: Record<string, unknown>, now: Date, leaseOwner?: string): Promise<void>;
  requeue(id: string, runAfter: Date | null, now: Date, reason: string, leaseOwner?: string): Promise<void>;
  markFailed(id: string, now: Date, reason: string, leaseOwner?: string): Promise<void>;
  recordAttempt(attempt: JobAttemptRow): Promise<void>;
  /** Reset jobs whose LEASE expired (worker crashed) back to 'pending' (or 'failed' if out of attempts). Returns count. */
  reclaimStalled(olderThan: Date, now: Date): Promise<number>;
  /** Extend an owned active job's lease; returns whether this owner still holds it (optional — for long jobs). */
  renewLease?(id: string, owner: string, expiresAt: Date): Promise<boolean>;
}

export type JobHandler = (job: JobRow) => Promise<Record<string, unknown> | void>;
export type JobHandlerRegistry = Record<string, JobHandler>;

export interface JobDeps {
  store?: JobStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
  /** Kill-switch enforcement (WOB-UAT-024). Injectable so tests can engage a switch without a database. */
  enforcement?: EnforcementDeps;
  /** Unique owner token for the multi-worker execution lease. When set, this job claim is leased + renewed +
   *  compare-and-set on completion. Absent (tests / single-run) → the prior no-lease behaviour. */
  leaseOwner?: string;
  /** Lease duration (ms). The job is renewed at half this cadence while its handler runs. Default 120s. */
  leaseMs?: number;
}

/** Default execution-lease window for a general job (renewed at half-cadence while the handler runs). */
export const JOB_LEASE_MS = Number(process.env.JOB_LEASE_MS) > 0 ? Number(process.env.JOB_LEASE_MS) : 120_000;


/**
 * Best-effort actor for a job-level audit event. Jobs carry no actor column; the enqueuing route knows
 * the founder and conventionally puts it in the payload. Returns "unknown" rather than null so an
 * unattributable action is stated, not implied by absence.
 */
function attributedActor(payload: Record<string, unknown> | undefined): string {
  for (const key of ["requestedBy", "createdBy", "actor", "founder", "openedBy"]) {
    const v = payload?.[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "unknown";
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

// ---------- enqueue ----------

export interface EnqueueResult {
  job: JobRow;
  deduped: boolean;
}

/** Postgres unique-violation (SQLSTATE 23505), however the driver wraps it. */
function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; cause?: { code?: string }; message?: string };
  return e.code === "23505" || e.cause?.code === "23505" || Boolean(e.message?.includes("duplicate key value"));
}


/**
 * Has a job with this idempotency key EVER been enqueued? The correct guard for a CADENCE.
 *
 * `enqueueJob`'s own dedupe is active-only and cannot express "already ran this period" — a fast job
 * completes, leaves nothing active, and the next tick re-enqueues it (WOB-UAT-036: 50 governance reviews
 * in one hour against an hourly key). Pair this with a period-derived key (e.g. `...:2026-07-16T13`) to
 * get a real once-per-period cadence that survives restarts, because the JOBS TABLE is the record — no
 * in-memory timer to lose.
 */
export async function jobExistsForIdempotencyKey(key: string, deps: JobDeps = {}): Promise<boolean> {
  const store = deps.store ?? defaultStore();
  return Boolean(await store.findByIdempotencyKeyAnyStatus(key));
}

export async function enqueueJob(input: EnqueueJobInput, deps: JobDeps = {}): Promise<EnqueueResult> {
  const row = buildJobRow(input, { now: deps.now });
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;

  await assertJobConnectionsAllowed(row, { recordAudit });

  // No NEW work enters the queue for a killed target. Throwing (rather than silently dropping or
  // returning a fake job) is the point: the caller must learn the work did not happen. Blocked work
  // never reports success.
  const engaged = await loadEngagedSwitches(deps.enforcement);
  const blocked = blockedJobType(engaged, row.type);
  if (blocked) {
    await recordAudit({
      eventType: "job.enqueue_blocked_by_kill_switch",
      module: "jobs",
      entityType: "job",
      entityId: row.id,
      // "Who tried to run contained work?" is a security question, so the block MUST carry an actor.
      // The first live probe recorded `actor: null`, which answers it with silence. `enqueueJob` has no
      // actor parameter, so this reads the attribution the payload already carries and says "unknown"
      // honestly when there is none — rather than a null that reads as "not applicable".
      actor: attributedActor(row.payload),
      metadata: { type: row.type, targetType: blocked.targetType, targetRef: blocked.targetRef, reason: blocked.reason },
    });
    throw new KillSwitchEngagedError(blocked.targetType, blocked.targetRef, blocked.reason);
  }

  if (row.idempotencyKey) {
    const existing = await store.findActiveByIdempotencyKey(row.idempotencyKey);
    if (existing) {
      return { job: existing, deduped: true };
    }
  }

  try {
    await store.insert(row);
  } catch (error) {
    // Race: another enqueue inserted the same idempotency key between our check and insert.
    // The partial unique index rejects the dupe — fall back to the winner instead of failing.
    if (row.idempotencyKey && isUniqueViolation(error)) {
      const winner = await store.findActiveByIdempotencyKey(row.idempotencyKey);
      if (winner) return { job: winner, deduped: true };
    }
    throw error;
  }
  await recordAudit({
    eventType: "job.enqueued",
    module: "jobs",
    entityType: "job",
    entityId: row.id,
    metadata: { queue: row.queue, type: row.type, idempotencyKey: row.idempotencyKey },
  });

  return { job: row, deduped: false };
}

// ---------- process ----------

export interface ProcessResult {
  processed: boolean;
  jobId?: string;
  outcome?: "completed" | "retry" | "failed";
}

function buildAttempt(job: JobRow, status: string, now: Date, error?: string): JobAttemptRow {
  return {
    id: newId("jobattempt"),
    jobId: job.id,
    attemptNumber: job.attempts,
    status,
    startedAt: job.lockedAt ?? now,
    completedAt: now,
    error: error ?? null,
    metadata: {},
    createdAt: now,
  };
}

export async function processNextJob(
  queue: string,
  registry: JobHandlerRegistry,
  deps: JobDeps = {},
): Promise<ProcessResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  // Kill-switch enforcement (WOB-UAT-024): killed types are excluded from the claim, so a contained job
  // is never picked up, never burns an attempt, and resumes untouched when the switch is released.
  const switches = await loadEngagedSwitches(deps.enforcement);
  const leaseOwner = deps.leaseOwner;
  const leaseMs = deps.leaseMs ?? JOB_LEASE_MS;
  const lease = leaseOwner ? { owner: leaseOwner, expiresAt: new Date(now.getTime() + leaseMs) } : undefined;
  const job = await store.claimNext(queue, now, blockedJobTypes(switches), lease);
  if (!job) return { processed: false };

  // Keep this worker's lease fresh while its handler runs, so reclaimStalled never re-hands a live long job to
  // another worker (the double-execution guard). Stops as soon as the handler returns. Best-effort renewal.
  let renewTimer: ReturnType<typeof setInterval> | undefined;
  if (leaseOwner && store.renewLease) {
    renewTimer = setInterval(() => {
      store.renewLease!(job.id, leaseOwner, new Date(Date.now() + leaseMs)).catch(() => {});
    }, Math.max(5_000, Math.floor(leaseMs / 2)));
    renewTimer.unref?.();
  }
  const stopRenew = () => { if (renewTimer) clearInterval(renewTimer); };

  // Defence in depth: a switch engaged in the instant between the claim query and here. Requeue with a
  // real backoff rather than run it. This DOES cost the job one attempt, which is the honest tradeoff for
  // a race this narrow — the alternative is executing work a founder has explicitly contained.
  const raced = blockedJobType(switches, job.type);
  if (raced) {
    stopRenew();
    await store.requeue(job.id, new Date(now.getTime() + 60_000), now, `deferred: ${raced.targetType}:${raced.targetRef} kill switch — ${raced.reason}`, leaseOwner);
    await recordAudit({
      eventType: "job.deferred_by_kill_switch",
      module: "jobs",
      entityType: "job",
      entityId: job.id,
      metadata: { queue: job.queue, type: job.type, targetType: raced.targetType, targetRef: raced.targetRef, reason: raced.reason },
    });
    return { processed: true, jobId: job.id, outcome: "retry" };
  }

  const handler = registry[job.type];
  if (!handler) {
    stopRenew();
    return failJob(job, `no handler registered for job type '${job.type}'`, { store, recordAudit, now, leaseOwner });
  }

  try {
    const result = (await handler(job)) ?? {};
    stopRenew();
    await store.complete(job.id, result, now, leaseOwner);
    await store.recordAttempt(buildAttempt(job, "completed", now));
    await recordAudit({
      eventType: "job.completed",
      module: "jobs",
      entityType: "job",
      entityId: job.id,
      metadata: { queue: job.queue, type: job.type, attempt: job.attempts },
    });
    return { processed: true, jobId: job.id, outcome: "completed" };
  } catch (err) {
    stopRenew();
    return failJob(job, err instanceof Error ? err.message : String(err), { store, recordAudit, now, leaseOwner });
  }
}

async function failJob(
  job: JobRow,
  reason: string,
  ctx: { store: JobStore; recordAudit: (input: AuditEventInput) => Promise<void>; now: Date; leaseOwner?: string },
): Promise<ProcessResult> {
  const decision = evaluateJobFailure({ attempts: job.attempts, maxAttempts: job.maxAttempts, now: ctx.now });
  await ctx.store.recordAttempt(buildAttempt(job, "failed", ctx.now, reason));

  if (decision.willRetry) {
    await ctx.store.requeue(job.id, decision.runAfter, ctx.now, reason, ctx.leaseOwner);
    await ctx.recordAudit({
      eventType: "job.retry",
      module: "jobs",
      entityType: "job",
      entityId: job.id,
      metadata: { attempt: job.attempts, maxAttempts: job.maxAttempts, reason, runAfter: decision.runAfter },
    });
    return { processed: true, jobId: job.id, outcome: "retry" };
  }

  await ctx.store.markFailed(job.id, ctx.now, reason, ctx.leaseOwner);
  await ctx.recordAudit({
    eventType: "job.failed",
    module: "jobs",
    entityType: "job",
    entityId: job.id,
    metadata: { attempt: job.attempts, maxAttempts: job.maxAttempts, reason },
  });
  return { processed: true, jobId: job.id, outcome: "failed" };
}

// ---------- read ----------

export interface ListJobsQuery {
  queue?: string;
  status?: JobStatus;
  type?: string;
  limit?: number;
}

export function clampJobLimit(limit?: number): number {
  if (limit === undefined || Number.isNaN(limit)) return 50;
  return Math.min(Math.max(Math.trunc(limit), 1), 200);
}

export async function listJobs(query: ListJobsQuery = {}, db: Db = getDb()) {
  const conditions = [];
  if (query.queue) conditions.push(eq(jobs.queue, query.queue));
  if (query.status) conditions.push(eq(jobs.status, query.status));
  if (query.type) conditions.push(eq(jobs.type, query.type));
  const where = conditions.length ? and(...conditions) : undefined;
  return db.select().from(jobs).where(where).orderBy(desc(jobs.createdAt)).limit(clampJobLimit(query.limit));
}

// ---------- default Drizzle store ----------

function mapJobRow(r: Record<string, unknown>): JobRow {
  return {
    id: r.id as string,
    queue: r.queue as string,
    type: r.type as string,
    status: r.status as JobStatus,
    priority: Number(r.priority),
    payload: (r.payload as Record<string, unknown>) ?? {},
    result: (r.result as Record<string, unknown> | null) ?? null,
    idempotencyKey: (r.idempotency_key as string | null) ?? null,
    linkedModule: (r.linked_module as string | null) ?? null,
    linkedEntityType: (r.linked_entity_type as string | null) ?? null,
    linkedEntityId: (r.linked_entity_id as string | null) ?? null,
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
    runAfter: (r.run_after as Date | null) ?? null,
    lockedAt: (r.locked_at as Date | null) ?? null,
    leaseOwner: (r.lease_owner as string | null) ?? null,
    leaseExpiresAt: (r.lease_expires_at as Date | null) ?? null,
    completedAt: (r.completed_at as Date | null) ?? null,
    failedAt: (r.failed_at as Date | null) ?? null,
    failureReason: (r.failure_reason as string | null) ?? null,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  };
}

export function defaultStore(db: Db = getDb()): JobStore {
  return {
    async findByIdempotencyKeyAnyStatus(key) {
      const rows = await db.select().from(jobs).where(eq(jobs.idempotencyKey, key)).limit(1);
      return rows[0] ? (rows[0] as unknown as JobRow) : null;
    },
    async findActiveByIdempotencyKey(key) {
      const rows = await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.idempotencyKey, key), inArray(jobs.status, ["pending", "active"])))
        .limit(1);
      return rows[0] ? (rows[0] as unknown as JobRow) : null;
    },
    async insert(row) {
      await db.insert(jobs).values(row);
    },
    async claimNext(queue, now, blockedTypes, lease) {
      // An empty array must NOT become `type <> ALL('{}')` semantics we have to reason about — skip the
      // clause entirely when nothing is blocked, which is the overwhelmingly common case.
      const blockFilter = blockedTypes?.length ? sql` AND type <> ALL(${sql.raw(`ARRAY[${blockedTypes.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")}]::text[]`)})` : sql``;
      // Stamp the lease on claim so this worker owns the job until the lease expires (it renews while alive).
      const leaseSet = lease ? sql`, lease_owner = ${lease.owner}, lease_expires_at = ${lease.expiresAt}` : sql``;
      const result = await db.execute(sql`
        UPDATE jobs SET status = 'active', attempts = attempts + 1, locked_at = ${now}, updated_at = ${now}${leaseSet}
        WHERE id = (
          SELECT id FROM jobs
          WHERE queue = ${queue} AND status = 'pending' AND (run_after IS NULL OR run_after <= ${now})${blockFilter}
          ORDER BY priority DESC, created_at ASC
          LIMIT 1 FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `);
      const row = (result.rows as Record<string, unknown>[])[0];
      return row ? mapJobRow(row) : null;
    },
    // The terminal writes COMPARE-AND-SET on the lease owner (when one was taken): a worker that lost the lease
    // (its job was reclaimed after the lease expired) cannot double-complete/requeue/fail it. `and(..., undefined)`
    // drops the owner clause for legacy/no-lease callers, preserving prior behaviour + all existing tests.
    async complete(id, result, now, leaseOwner) {
      await db
        .update(jobs)
        .set({ status: "completed", result, completedAt: now, lockedAt: null, leaseOwner: null, leaseExpiresAt: null, updatedAt: now })
        .where(and(eq(jobs.id, id), leaseOwner ? eq(jobs.leaseOwner, leaseOwner) : undefined));
    },
    async requeue(id, runAfter, now, reason, leaseOwner) {
      await db
        .update(jobs)
        .set({ status: "pending", runAfter, lockedAt: null, leaseOwner: null, leaseExpiresAt: null, failureReason: reason, updatedAt: now })
        .where(and(eq(jobs.id, id), leaseOwner ? eq(jobs.leaseOwner, leaseOwner) : undefined));
    },
    async markFailed(id, now, reason, leaseOwner) {
      await db
        .update(jobs)
        .set({ status: "failed", failedAt: now, lockedAt: null, leaseOwner: null, leaseExpiresAt: null, failureReason: reason, updatedAt: now })
        .where(and(eq(jobs.id, id), leaseOwner ? eq(jobs.leaseOwner, leaseOwner) : undefined));
    },
    async recordAttempt(attempt) {
      await db.insert(jobAttempts).values(attempt);
    },
    async reclaimStalled(olderThan, now) {
      // A worker that crashed mid-run leaves its job 'active'. Reclaim ONLY jobs whose LEASE has expired (the
      // owning worker died and stopped renewing) — a live worker renews its lease, so its long job is never
      // reclaimed mid-run (no double execution under horizontal scaling). Legacy jobs with no lease fall back to
      // the locked_at window. Clears the lease so a fresh claim gets clean ownership.
      const result = await db.execute(sql`
        UPDATE jobs
        SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
            locked_at = NULL,
            lease_owner = NULL,
            lease_expires_at = NULL,
            failed_at = CASE WHEN attempts >= max_attempts THEN ${now} ELSE failed_at END,
            failure_reason = 'reclaimed: worker lease expired (stalled or crashed mid-run)',
            updated_at = ${now}
        WHERE status = 'active' AND (
          (lease_expires_at IS NOT NULL AND lease_expires_at < ${now})
          OR (lease_expires_at IS NULL AND locked_at IS NOT NULL AND locked_at < ${olderThan})
        )
        RETURNING id
      `);
      return (result.rows as unknown[]).length;
    },
    async renewLease(id, owner, expiresAt) {
      // Extend a still-owned active job's lease. Returns whether THIS worker still owns it (compare-and-set) —
      // false means it was reclaimed, so the worker should stop (its terminal write will also no-op).
      const res = await db
        .update(jobs)
        .set({ leaseExpiresAt: expiresAt })
        .where(and(eq(jobs.id, id), eq(jobs.status, "active"), eq(jobs.leaseOwner, owner)))
        .returning({ id: jobs.id });
      return (res as unknown[]).length > 0;
    },
  };
}

/**
 * Reclaim jobs stranded in 'active' by a crashed/killed worker (default: locked > 5 min ago).
 * Safe to call periodically from every worker — the UPDATE is atomic and idempotent.
 */
export async function reclaimStalledJobs(deps: JobDeps = {}, opts: { timeoutMs?: number } = {}): Promise<number> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const olderThan = new Date(now.getTime() - (opts.timeoutMs ?? 5 * 60_000));
  return store.reclaimStalled(olderThan, now);
}

/** Default retention window for terminal job rows before the daily sweep removes them. Configurable. */
export const JOBS_RETENTION_MS = (Number(process.env.JOBS_RETENTION_DAYS) > 0 ? Number(process.env.JOBS_RETENTION_DAYS) : 14) * 86_400_000;

/**
 * Retention sweep: delete TERMINAL jobs (completed/failed — never reclaimed, so never re-run) and attempt-log
 * rows older than the cutoff. Without this the `jobs` table (which the hot claim query scans) and the append-only
 * `job_attempts` log grow forever on a long-lived VPS, inflating storage + slowly degrading claim latency (audit
 * MED-7). Recent history is kept for inspection. Only ever removes terminal rows — an active/pending job is never
 * touched. Idempotent + safe to run daily.
 */
export async function purgeTerminalJobs(cutoff: Date, deps: { db?: Db } = {}): Promise<{ jobs: number; attempts: number }> {
  const db = deps.db ?? getDb();
  const removedJobs = await db
    .delete(jobs)
    .where(and(inArray(jobs.status, ["completed", "failed", "cancelled"]), lt(jobs.updatedAt, cutoff)))
    .returning({ id: jobs.id });
  const removedAttempts = await db
    .delete(jobAttempts)
    .where(lt(jobAttempts.createdAt, cutoff))
    .returning({ id: jobAttempts.id });
  return { jobs: removedJobs.length, attempts: removedAttempts.length };
}
