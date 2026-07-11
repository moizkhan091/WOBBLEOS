import { newId } from "@/lib/ids";

/**
 * Approval-effects outbox (pure domain). A row records the INTENT to run an approval's downstream
 * effect. It is inserted in the SAME transaction as the approval flip, then a reconciler APPLIES it
 * idempotently and marks it `applied`. This is the transactional-outbox pattern: a crash between the
 * flip and the effect converges (the effect stays `pending`), and a duplicate applies exactly once
 * (unique (approvalId, effectType) + idempotent appliers).
 */

export const APPROVAL_EFFECT_STATES = ["pending", "applied", "failed"] as const;
export type ApprovalEffectState = (typeof APPROVAL_EFFECT_STATES)[number];

export const APPROVAL_EFFECT_DEFAULT_MAX_ATTEMPTS = 8;

export interface ApprovalEffectRow {
  id: string;
  approvalId: string;
  effectType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  state: ApprovalEffectState;
  attempts: number;
  maxAttempts: number;
  runAfter: Date | null;
  lastError: string | null;
  actor: string | null;
  createdAt: Date;
  appliedAt: Date | null;
  updatedAt: Date;
}

export interface BuildApprovalEffectInput {
  approvalId: string;
  effectType: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
  actor?: string | null;
  maxAttempts?: number;
}

export function buildApprovalEffectRow(input: BuildApprovalEffectInput, opts: { now: Date; id?: string }): ApprovalEffectRow {
  const now = opts.now;
  return {
    id: opts.id ?? newId("aeffect"),
    approvalId: input.approvalId,
    effectType: input.effectType,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: input.payload ?? {},
    state: "pending",
    attempts: 0,
    maxAttempts: input.maxAttempts ?? APPROVAL_EFFECT_DEFAULT_MAX_ATTEMPTS,
    runAfter: null,
    lastError: null,
    actor: input.actor ?? null,
    createdAt: now,
    appliedAt: null,
    updatedAt: now,
  };
}

/** On a failed apply: retry with backoff until out of attempts, then mark `failed` (needs manual attention). */
export function decideEffectRetry(input: { attempts: number; maxAttempts?: number }): { next: "pending" | "failed"; backoffMs: number } {
  const max = input.maxAttempts ?? APPROVAL_EFFECT_DEFAULT_MAX_ATTEMPTS;
  if (input.attempts >= max) return { next: "failed", backoffMs: 0 };
  return { next: "pending", backoffMs: Math.min(60_000, 1000 * 2 ** input.attempts) };
}
