import { z } from "zod";
import { newId } from "@/lib/ids";

/**
 * Chunk 06: Job Queue domain (pure, DB-free).
 *
 * A Postgres-backed queue built on the existing `jobs` / `job_attempts` tables.
 * This file owns the rules: what a valid job looks like, how a job row is
 * shaped, and what happens on failure (retry with exponential backoff, or give
 * up). Keeping it pure makes retry/idempotency logic unit-testable without a DB.
 *
 * Lifecycle: pending -> active -> completed | failed (with pending re-queues
 * in between while retries remain).
 */

export type JobStatus = "pending" | "active" | "completed" | "failed" | "cancelled";

export const enqueueJobSchema = z.object({
  queue: z.string().trim().min(1, "queue is required"),
  type: z.string().trim().min(1, "type is required"),
  payload: z.record(z.string(), z.unknown()).default({}),
  priority: z.number().int().default(0),
  maxAttempts: z.number().int().min(1).default(3),
  idempotencyKey: z.string().trim().min(1).optional(),
  linkedModule: z.string().trim().min(1).optional(),
  linkedEntityType: z.string().trim().min(1).optional(),
  linkedEntityId: z.string().trim().min(1).optional(),
  runAfter: z.date().optional(),
});

export type EnqueueJobInput = z.input<typeof enqueueJobSchema>;

export interface JobRow {
  id: string;
  queue: string;
  type: string;
  status: JobStatus;
  priority: number;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  idempotencyKey: string | null;
  linkedModule: string | null;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  attempts: number;
  maxAttempts: number;
  runAfter: Date | null;
  lockedAt: Date | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function buildJobRow(input: EnqueueJobInput, opts: { id?: string; now?: Date } = {}): JobRow {
  const parsed = enqueueJobSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("job"),
    queue: parsed.queue,
    type: parsed.type,
    status: "pending",
    priority: parsed.priority,
    payload: parsed.payload ?? {},
    result: null,
    idempotencyKey: parsed.idempotencyKey ?? null,
    linkedModule: parsed.linkedModule ?? null,
    linkedEntityType: parsed.linkedEntityType ?? null,
    linkedEntityId: parsed.linkedEntityId ?? null,
    attempts: 0,
    maxAttempts: parsed.maxAttempts,
    runAfter: parsed.runAfter ?? null,
    lockedAt: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    completedAt: null,
    failedAt: null,
    failureReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface JobFailureInput {
  /** attempts already consumed (incremented when the job was claimed) */
  attempts: number;
  maxAttempts: number;
  now?: Date;
  baseDelayMs?: number;
  /** Cap on the backoff so a high attempt count can't schedule a retry hours/days out. Default 30min. */
  maxDelayMs?: number;
  /** A provider-supplied hint (e.g. a 429 `Retry-After`, in ms). When present it OVERRIDES the computed
   *  backoff — honouring the server's rate-limit window is strictly better than guessing. */
  retryAfterMs?: number;
  /** Injectable RNG for the jitter, so tests are deterministic. Defaults to Math.random. */
  random?: () => number;
}

export interface JobFailureDecision {
  willRetry: boolean;
  nextStatus: JobStatus;
  runAfter: Date | null;
  delayMs: number;
}

/**
 * Decide what happens after a job throws. If retries remain, re-queue with
 * exponential backoff; otherwise mark failed (dead).
 */
export function evaluateJobFailure(input: JobFailureInput): JobFailureDecision {
  const now = input.now ?? new Date();
  const base = input.baseDelayMs ?? 1000;
  const maxDelay = input.maxDelayMs ?? 30 * 60_000; // 30min cap — a retry must never be scheduled hours out
  const rand = input.random ?? Math.random;
  const willRetry = input.attempts < input.maxAttempts;
  if (!willRetry) return { willRetry: false, nextStatus: "failed", runAfter: null, delayMs: 0 };

  let delayMs: number;
  if (input.retryAfterMs != null && input.retryAfterMs >= 0) {
    // Honour the provider's own rate-limit window (429 Retry-After) instead of guessing.
    delayMs = Math.min(input.retryAfterMs, maxDelay);
  } else {
    // Exponential backoff with FULL JITTER: delay = half + random(0, half). Plain exponential makes a
    // fleet of workers retry in lockstep (thundering herd) and re-hammer a recovering dependency; the
    // jitter spreads them out. Capped so late attempts don't schedule absurdly far in the future.
    const ceiling = Math.min(base * 2 ** Math.max(0, input.attempts - 1), maxDelay);
    const half = ceiling / 2;
    delayMs = Math.round(half + rand() * half);
  }
  return { willRetry: true, nextStatus: "pending", runAfter: new Date(now.getTime() + delayMs), delayMs };
}
