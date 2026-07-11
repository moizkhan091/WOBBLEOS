import { and, eq, lte, or, isNull } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { approvals as approvalsTable, approvalEffects as approvalEffectsTable } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  buildApprovalEffectRow,
  decideEffectRetry,
  type ApprovalEffectRow,
  type ApprovalEffectState,
  type BuildApprovalEffectInput,
} from "@/lib/domain/approval-effect";

/**
 * Approval-effects outbox runtime. `claimApprovalAndRecordEffect` flips the approval AND records the
 * downstream-effect intent in ONE transaction (atomic). `reconcileApprovalEffects` then APPLIES each
 * pending effect idempotently via a registered applier and marks it applied — so a crash between the
 * flip and the effect converges (effect stays pending, reconciler retries), and duplicates apply once.
 */

export interface ApprovalEffectStore {
  insert(row: ApprovalEffectRow): Promise<void>;
  getById(id: string): Promise<ApprovalEffectRow | null>;
  listDuePending(now: Date, limit: number): Promise<ApprovalEffectRow[]>;
  transition(id: string, from: ApprovalEffectState, fields: Partial<ApprovalEffectRow>): Promise<boolean>;
}

export interface ApprovalEffectDeps {
  store?: ApprovalEffectStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

/** An idempotent applier for an effect type. MUST be safe to run more than once (crash/duplicate). */
export type ApprovalEffectApplier = (effect: ApprovalEffectRow) => Promise<void>;

async function audit(deps: ApprovalEffectDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

/**
 * Atomically: claim the approval (flip pending→approved only if still pending) AND record its
 * downstream-effect intent in the outbox — one DB transaction. Returns whether THIS call won the claim.
 * If it did not (already actioned), no effect is recorded. Callers apply the effect afterwards
 * (inline fast-path) and/or let the reconciler pick it up (crash safety net).
 */
export async function claimApprovalAndRecordEffect(
  input: { approvalId: string; approvedBy: string; effect: BuildApprovalEffectInput },
  deps: { db?: Db; now?: Date } = {},
): Promise<{ claimed: boolean; effectId: string | null }> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  return db.transaction(async (tx) => {
    const claimedRows = await tx
      .update(approvalsTable)
      .set({ status: "approved", approvalAction: "approve", approvedBy: input.approvedBy, approvedAt: now, updatedAt: now })
      .where(and(eq(approvalsTable.id, input.approvalId), eq(approvalsTable.status, "pending")))
      .returning({ id: approvalsTable.id });
    if (!claimedRows.length) return { claimed: false, effectId: null };
    const effect = buildApprovalEffectRow(input.effect, { now });
    await tx.insert(approvalEffectsTable).values(effect); // same tx = atomic with the flip
    return { claimed: true, effectId: effect.id };
  });
}

/**
 * Apply pending, due effects idempotently. Called inline (fast path, one id) and by the scheduler
 * (safety net). Reclaims nothing to lease — appliers are idempotent, so at-least-once is safe.
 */
export async function reconcileApprovalEffects(
  appliers: Record<string, ApprovalEffectApplier>,
  deps: ApprovalEffectDeps & { onlyId?: string } = {},
): Promise<{ applied: number; retried: number; failed: number }> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const result = { applied: 0, retried: 0, failed: 0 };

  const due = deps.onlyId ? [await store.getById(deps.onlyId)].filter((e): e is ApprovalEffectRow => Boolean(e) && e!.state === "pending") : await store.listDuePending(now, 50);
  for (const effect of due) {
    const applier = appliers[effect.effectType];
    if (!applier) {
      await store.transition(effect.id, "pending", { state: "failed", lastError: `no applier for effectType '${effect.effectType}'`, updatedAt: now });
      result.failed += 1;
      continue;
    }
    try {
      await applier(effect); // idempotent
      const ok = await store.transition(effect.id, "pending", { state: "applied", appliedAt: now, updatedAt: now });
      if (ok) {
        result.applied += 1;
        await audit(deps, { eventType: "approval_effect.applied", module: "approvals", entityType: effect.entityType, entityId: effect.entityId, actor: effect.actor ?? "system", metadata: { approvalId: effect.approvalId, effectType: effect.effectType } });
      }
    } catch (error) {
      const decision = decideEffectRetry({ attempts: effect.attempts + 1, maxAttempts: effect.maxAttempts });
      await store.transition(effect.id, "pending", {
        state: decision.next,
        attempts: effect.attempts + 1,
        runAfter: decision.next === "pending" ? new Date(now.getTime() + decision.backoffMs) : null,
        lastError: error instanceof Error ? error.message : String(error),
        updatedAt: now,
      });
      if (decision.next === "failed") {
        result.failed += 1;
        await audit(deps, { eventType: "approval_effect.failed", module: "approvals", entityType: effect.entityType, entityId: effect.entityId, actor: effect.actor ?? "system", metadata: { approvalId: effect.approvalId, effectType: effect.effectType, error: error instanceof Error ? error.message : String(error) } });
      } else {
        result.retried += 1;
      }
    }
  }
  return result;
}

/**
 * One-call approval resolution via the outbox: atomically flip the approval + record its effect, then
 * apply it inline (idempotent, fast-path). The scheduler reconciler is the crash safety net. Returns
 * whether THIS call won the claim (false = already actioned = idempotent no-op for the caller).
 * Injectable `claim` for tests; `appliers` defaults to the registry.
 */
export async function resolveApprovalEffect(
  input: { approvalId: string; approvedBy: string; effectType: string; entityType: string; entityId: string; payload?: Record<string, unknown> },
  deps: {
    now?: Date;
    claim?: (i: { approvalId: string; approvedBy: string; effect: BuildApprovalEffectInput }) => Promise<{ claimed: boolean; effectId: string | null }>;
    appliers?: Record<string, ApprovalEffectApplier>;
    store?: ApprovalEffectStore;
  } = {},
): Promise<{ claimed: boolean; effectId: string | null }> {
  const now = deps.now ?? new Date();
  const claimFn = deps.claim ?? ((i) => claimApprovalAndRecordEffect(i, { now }));
  const claim = await claimFn({
    approvalId: input.approvalId,
    approvedBy: input.approvedBy,
    effect: { approvalId: input.approvalId, effectType: input.effectType, entityType: input.entityType, entityId: input.entityId, payload: input.payload, actor: input.approvedBy },
  });
  // Inline fast-path only when we used the REAL claim (tests inject `claim` and drive apply themselves).
  if (claim.claimed && claim.effectId && !deps.claim) {
    try {
      const appliers = deps.appliers ?? (await import("@/lib/approval-effects/appliers")).APPROVAL_EFFECT_APPLIERS;
      await reconcileApprovalEffects(appliers, { onlyId: claim.effectId, now, store: deps.store });
    } catch { /* the scheduler reconciler is the safety net */ }
  }
  return claim;
}

// ---------------------------------------------------------------- default store (DB)

export function defaultStore(db: Db = getDb()): ApprovalEffectStore {
  return {
    async insert(row) {
      await db.insert(approvalEffectsTable).values(row);
    },
    async getById(id) {
      const rows = await db.select().from(approvalEffectsTable).where(eq(approvalEffectsTable.id, id)).limit(1);
      return (rows[0] as unknown as ApprovalEffectRow) ?? null;
    },
    async listDuePending(now, limit) {
      const rows = await db
        .select()
        .from(approvalEffectsTable)
        .where(and(eq(approvalEffectsTable.state, "pending"), or(isNull(approvalEffectsTable.runAfter), lte(approvalEffectsTable.runAfter, now))))
        .orderBy(approvalEffectsTable.createdAt)
        .limit(limit);
      return rows as unknown as ApprovalEffectRow[];
    },
    async transition(id, from, fields) {
      const updated = await db.update(approvalEffectsTable).set(fields as Record<string, unknown>).where(and(eq(approvalEffectsTable.id, id), eq(approvalEffectsTable.state, from))).returning({ id: approvalEffectsTable.id });
      return updated.length > 0;
    },
  };
}
