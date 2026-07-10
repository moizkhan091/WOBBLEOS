import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { jobAttempts, jobs } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { newId } from "@/lib/ids";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
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
  insert(row: JobRow): Promise<void>;
  /** atomically pick the next runnable job, mark it active, increment attempts */
  claimNext(queue: string, now: Date): Promise<JobRow | null>;
  complete(id: string, result: Record<string, unknown>, now: Date): Promise<void>;
  requeue(id: string, runAfter: Date | null, now: Date, reason: string): Promise<void>;
  markFailed(id: string, now: Date, reason: string): Promise<void>;
  recordAttempt(attempt: JobAttemptRow): Promise<void>;
  /** Reset jobs stuck in 'active' (worker crashed mid-run) back to 'pending', or 'failed' if out of attempts. Returns count. */
  reclaimStalled(olderThan: Date, now: Date): Promise<number>;
}

export type JobHandler = (job: JobRow) => Promise<Record<string, unknown> | void>;
export type JobHandlerRegistry = Record<string, JobHandler>;

export interface JobDeps {
  store?: JobStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
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

export async function enqueueJob(input: EnqueueJobInput, deps: JobDeps = {}): Promise<EnqueueResult> {
  const row = buildJobRow(input, { now: deps.now });
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;

  await assertJobConnectionsAllowed(row, { recordAudit });

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

  const job = await store.claimNext(queue, now);
  if (!job) return { processed: false };

  const handler = registry[job.type];
  if (!handler) {
    return failJob(job, `no handler registered for job type '${job.type}'`, { store, recordAudit, now });
  }

  try {
    const result = (await handler(job)) ?? {};
    await store.complete(job.id, result, now);
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
    return failJob(job, err instanceof Error ? err.message : String(err), { store, recordAudit, now });
  }
}

async function failJob(
  job: JobRow,
  reason: string,
  ctx: { store: JobStore; recordAudit: (input: AuditEventInput) => Promise<void>; now: Date },
): Promise<ProcessResult> {
  const decision = evaluateJobFailure({ attempts: job.attempts, maxAttempts: job.maxAttempts, now: ctx.now });
  await ctx.store.recordAttempt(buildAttempt(job, "failed", ctx.now, reason));

  if (decision.willRetry) {
    await ctx.store.requeue(job.id, decision.runAfter, ctx.now, reason);
    await ctx.recordAudit({
      eventType: "job.retry",
      module: "jobs",
      entityType: "job",
      entityId: job.id,
      metadata: { attempt: job.attempts, maxAttempts: job.maxAttempts, reason, runAfter: decision.runAfter },
    });
    return { processed: true, jobId: job.id, outcome: "retry" };
  }

  await ctx.store.markFailed(job.id, ctx.now, reason);
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
    completedAt: (r.completed_at as Date | null) ?? null,
    failedAt: (r.failed_at as Date | null) ?? null,
    failureReason: (r.failure_reason as string | null) ?? null,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  };
}

export function defaultStore(db: Db = getDb()): JobStore {
  return {
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
    async claimNext(queue, now) {
      const result = await db.execute(sql`
        UPDATE jobs SET status = 'active', attempts = attempts + 1, locked_at = ${now}, updated_at = ${now}
        WHERE id = (
          SELECT id FROM jobs
          WHERE queue = ${queue} AND status = 'pending' AND (run_after IS NULL OR run_after <= ${now})
          ORDER BY priority DESC, created_at ASC
          LIMIT 1 FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `);
      const row = (result.rows as Record<string, unknown>[])[0];
      return row ? mapJobRow(row) : null;
    },
    async complete(id, result, now) {
      await db
        .update(jobs)
        .set({ status: "completed", result, completedAt: now, lockedAt: null, updatedAt: now })
        .where(eq(jobs.id, id));
    },
    async requeue(id, runAfter, now, reason) {
      await db
        .update(jobs)
        .set({ status: "pending", runAfter, lockedAt: null, failureReason: reason, updatedAt: now })
        .where(eq(jobs.id, id));
    },
    async markFailed(id, now, reason) {
      await db
        .update(jobs)
        .set({ status: "failed", failedAt: now, lockedAt: null, failureReason: reason, updatedAt: now })
        .where(eq(jobs.id, id));
    },
    async recordAttempt(attempt) {
      await db.insert(jobAttempts).values(attempt);
    },
    async reclaimStalled(olderThan, now) {
      // A worker that crashed mid-run leaves its job 'active' forever. Reset stale ones to
      // 'pending' (or 'failed' if out of attempts) so another worker can pick them up.
      const result = await db.execute(sql`
        UPDATE jobs
        SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
            locked_at = NULL,
            failed_at = CASE WHEN attempts >= max_attempts THEN ${now} ELSE failed_at END,
            failure_reason = 'reclaimed: worker stalled or crashed mid-run',
            updated_at = ${now}
        WHERE status = 'active' AND locked_at IS NOT NULL AND locked_at < ${olderThan}
        RETURNING id
      `);
      return (result.rows as unknown[]).length;
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
