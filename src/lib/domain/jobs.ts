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
  const willRetry = input.attempts < input.maxAttempts;

  if (willRetry) {
    const delayMs = base * 2 ** Math.max(0, input.attempts - 1);
    return { willRetry: true, nextStatus: "pending", runAfter: new Date(now.getTime() + delayMs), delayMs };
  }
  return { willRetry: false, nextStatus: "failed", runAfter: null, delayMs: 0 };
}
