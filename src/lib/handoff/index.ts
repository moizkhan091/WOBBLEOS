import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { handoffs as handoffsTable } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { validateHandoff, type HandoffEnvelope, type HandoffReceiverContext } from "@/lib/domain/handoff";
import {
  buildHandoffRow,
  decideHandoffFailure,
  HANDOFF_LEASE_MS,
  type HandoffDeliveryState,
  type HandoffRow,
} from "@/lib/domain/handoff-delivery";

/**
 * Durable handoff runtime (Phase 2). The real inter-agent communication backbone: a sender PERSISTS
 * an envelope, a consumer CLAIMS it under a lease, ACKs/COMPLETES/FAILS it, expired leases are
 * RECLAIMED (crash recovery), out-of-retry handoffs DEAD-LETTER, and a founder can REDRIVE them. All
 * transitions are conditional (optimistic) so duplicate delivery executes once and concurrent
 * consumers can't double-process. Store is injectable so the whole state machine is DB-free testable.
 */

export interface HandoffStore {
  findByIdempotency(workflowId: string, idempotencyKey: string): Promise<HandoffRow | null>;
  insert(row: HandoffRow): Promise<void>;
  getById(id: string): Promise<HandoffRow | null>;
  /** Atomically claim the next due `delivered` handoff for `destinationAgent`, setting a lease. */
  claimNext(destinationAgent: string, lease: { owner: string; expiresAt: Date }, now: Date): Promise<HandoffRow | null>;
  /** Conditional transition: apply `fields` (incl. deliveryState) only if still at `from`. Returns claimed. */
  transition(id: string, from: HandoffDeliveryState, fields: Partial<HandoffRow>): Promise<boolean>;
  /** Reclaim `processing` handoffs whose lease expired → back to `delivered`. Returns count. */
  reclaimExpiredLeases(now: Date): Promise<number>;
  list(query: { workflowId?: string; deliveryState?: HandoffDeliveryState; clientWorkspaceId?: string; limit: number }): Promise<HandoffRow[]>;
  countByState(): Promise<Record<string, number>>;
  deleteExpired(before: Date): Promise<number>;
}

export interface HandoffDeps {
  store?: HandoffStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

async function audit(deps: HandoffDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

function auditMeta(row: HandoffRow): Record<string, unknown> {
  return { workflowId: row.workflowId, taskId: row.taskId, correlationId: row.correlationId, department: row.department, from: row.sourceAgent, to: row.destinationAgent ?? row.destinationCapability, state: row.deliveryState, clientWorkspaceId: row.clientWorkspaceId };
}

/**
 * Persist a validated handoff for delivery. Rejects wrong-workspace / over-authorized-memory-scope /
 * malformed envelopes BEFORE anything is stored. Idempotent: a duplicate (same workflowId +
 * idempotencyKey) returns the existing row without inserting again — duplicate delivery executes once.
 */
export async function dispatchHandoff(
  envelope: HandoffEnvelope,
  receiverCtx: HandoffReceiverContext,
  deps: HandoffDeps = {},
): Promise<{ handoff: HandoffRow; deduped: boolean }> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();

  const check = validateHandoff(envelope, receiverCtx);
  if (!check.ok) throw new Error(`handoff rejected: ${check.errors.join("; ")}`);

  const existing = await store.findByIdempotency(envelope.workflowId, envelope.idempotencyKey);
  if (existing) return { handoff: existing, deduped: true };

  const row = buildHandoffRow(envelope, { now });
  try {
    await store.insert(row);
  } catch (error) {
    // Lost a concurrent dispatch race (unique idempotency index) — re-read the winner (still once).
    const raced = await store.findByIdempotency(envelope.workflowId, envelope.idempotencyKey);
    if (raced) return { handoff: raced, deduped: true };
    throw error;
  }
  await audit(deps, { eventType: "handoff.dispatched", module: "handoff", entityType: "handoff", entityId: row.id, actor: row.actor, metadata: auditMeta(row) });
  return { handoff: row, deduped: false };
}

/** Claim the next due handoff for a consuming agent under a fresh lease. Null if none available. */
export async function claimNextHandoff(destinationAgent: string, leaseOwner: string, deps: HandoffDeps = {}): Promise<HandoffRow | null> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const expiresAt = new Date(now.getTime() + HANDOFF_LEASE_MS);
  const claimed = await store.claimNext(destinationAgent, { owner: leaseOwner, expiresAt }, now);
  if (claimed) await audit(deps, { eventType: "handoff.claimed", module: "handoff", entityType: "handoff", entityId: claimed.id, actor: leaseOwner, metadata: auditMeta(claimed) });
  return claimed;
}

export async function acknowledgeHandoff(id: string, deps: HandoffDeps = {}): Promise<boolean> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  return store.transition(id, "processing", { deliveryState: "acknowledged", acknowledgedAt: now, updatedAt: now });
}

export async function completeHandoff(id: string, telemetry: { costEstimate?: number; latencyMs?: number; qualityScore?: number } = {}, deps: HandoffDeps = {}): Promise<boolean> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const row = await store.getById(id);
  if (!row) return false;
  const ok = await store.transition(id, row.deliveryState, {
    deliveryState: "completed",
    completedAt: now,
    leaseOwner: null,
    leaseExpiresAt: null,
    costEstimate: telemetry.costEstimate !== undefined ? String(telemetry.costEstimate) : row.costEstimate,
    latencyMs: telemetry.latencyMs ?? row.latencyMs,
    qualityScore: telemetry.qualityScore !== undefined ? String(telemetry.qualityScore) : row.qualityScore,
    updatedAt: now,
  });
  if (ok) await audit(deps, { eventType: "handoff.completed", module: "handoff", entityType: "handoff", entityId: id, actor: row.actor, metadata: auditMeta(row) });
  return ok;
}

/** Fail a handoff: retry (bounded backoff) or dead-letter when out of attempts. */
export async function failHandoff(id: string, reason: string, deps: HandoffDeps = {}): Promise<{ next: "delivered" | "dead_lettered" } | null> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const row = await store.getById(id);
  if (!row) return null;
  const decision = decideHandoffFailure({ retryCount: row.retryCount, maxRetries: row.maxRetries });
  const fields: Partial<HandoffRow> =
    decision.next === "delivered"
      ? { deliveryState: "delivered", retryCount: row.retryCount + 1, runAfter: new Date(now.getTime() + decision.backoffMs), failureReason: reason, leaseOwner: null, leaseExpiresAt: null, updatedAt: now }
      : { deliveryState: "dead_lettered", deadLetteredAt: now, failureReason: reason, leaseOwner: null, leaseExpiresAt: null, updatedAt: now };
  const ok = await store.transition(id, row.deliveryState, fields);
  if (!ok) return null;
  await audit(deps, { eventType: decision.next === "dead_lettered" ? "handoff.dead_lettered" : "handoff.retry", module: "handoff", entityType: "handoff", entityId: id, actor: row.actor, metadata: { ...auditMeta(row), reason, retryCount: row.retryCount + 1 } });
  return { next: decision.next };
}

/** Crash recovery: reclaim `processing` handoffs whose lease expired → `delivered` (safe to re-run). */
export async function reclaimExpiredHandoffLeases(deps: HandoffDeps = {}): Promise<number> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const n = await store.reclaimExpiredLeases(now);
  if (n > 0) await audit(deps, { eventType: "handoff.leases_reclaimed", module: "handoff", entityType: "system", actor: "system", metadata: { count: n } });
  return n;
}

/** Manual redrive: put a dead-lettered (or failed) handoff back into delivery, resetting retries. */
export async function redriveHandoff(id: string, actor: string, deps: HandoffDeps = {}): Promise<boolean> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const row = await store.getById(id);
  if (!row) return false;
  const ok = await store.transition(id, row.deliveryState, { deliveryState: "delivered", retryCount: 0, runAfter: null, failureReason: null, deliveredAt: now, updatedAt: now });
  if (ok) await audit(deps, { eventType: "handoff.redriven", module: "handoff", entityType: "handoff", entityId: id, actor, metadata: auditMeta(row) });
  return ok;
}

export async function cancelHandoff(id: string, actor: string, deps: HandoffDeps = {}): Promise<boolean> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const row = await store.getById(id);
  if (!row) return false;
  const ok = await store.transition(id, row.deliveryState, { deliveryState: "cancelled", cancelledAt: now, leaseOwner: null, leaseExpiresAt: null, updatedAt: now });
  if (ok) await audit(deps, { eventType: "handoff.cancelled", module: "handoff", entityType: "handoff", entityId: id, actor, metadata: auditMeta(row) });
  return ok;
}

export async function purgeExpiredHandoffs(before: Date, deps: HandoffDeps = {}): Promise<number> {
  const store = deps.store ?? defaultStore();
  return store.deleteExpired(before);
}

export async function listHandoffs(query: { workflowId?: string; deliveryState?: HandoffDeliveryState; clientWorkspaceId?: string; limit?: number } = {}, deps: HandoffDeps = {}): Promise<HandoffRow[]> {
  const store = deps.store ?? defaultStore();
  return store.list({ ...query, limit: Math.min(Math.max(query.limit ?? 100, 1), 500) });
}

/** Founder Command Centre visibility: how many handoffs sit in each delivery state right now. */
export async function handoffStateCounts(deps: HandoffDeps = {}): Promise<Record<string, number>> {
  const store = deps.store ?? defaultStore();
  return store.countByState();
}

export const HANDOFF_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // completed/cancelled kept 7 days

// ---------------------------------------------------------------- default store (DB)

export function defaultStore(db: Db = getDb()): HandoffStore {
  return {
    async findByIdempotency(workflowId, idempotencyKey) {
      const rows = await db.select().from(handoffsTable).where(and(eq(handoffsTable.workflowId, workflowId), eq(handoffsTable.idempotencyKey, idempotencyKey))).limit(1);
      return (rows[0] as unknown as HandoffRow) ?? null;
    },
    async insert(row) {
      // envelope column is jsonb (Record<string,unknown>); HandoffEnvelope has no index signature.
      await db.insert(handoffsTable).values({ ...row, envelope: row.envelope as unknown as Record<string, unknown> });
    },
    async getById(id) {
      const rows = await db.select().from(handoffsTable).where(eq(handoffsTable.id, id)).limit(1);
      return (rows[0] as unknown as HandoffRow) ?? null;
    },
    async claimNext(destinationAgent, lease, now) {
      // Atomic claim: pick one due `delivered` handoff for this agent and lease it. FOR UPDATE SKIP
      // LOCKED so concurrent consumers never grab the same row.
      const claimed = await db.execute(sql`
        UPDATE handoffs SET
          delivery_state = 'processing', lease_owner = ${lease.owner}, lease_expires_at = ${lease.expiresAt}, updated_at = ${now}
        WHERE id = (
          SELECT id FROM handoffs
          WHERE destination_agent = ${destinationAgent} AND delivery_state = 'delivered'
            AND (run_after IS NULL OR run_after <= ${now})
          ORDER BY created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING *;
      `);
      const row = (claimed.rows?.[0] ?? null) as unknown as HandoffRow | null;
      return row ? await this.getById(row.id) : null;
    },
    async transition(id, from, fields) {
      const updated = await db.update(handoffsTable).set(fields as Record<string, unknown>).where(and(eq(handoffsTable.id, id), eq(handoffsTable.deliveryState, from))).returning({ id: handoffsTable.id });
      return updated.length > 0;
    },
    async reclaimExpiredLeases(now) {
      const reclaimed = await db
        .update(handoffsTable)
        .set({ deliveryState: "delivered", leaseOwner: null, leaseExpiresAt: null, updatedAt: now })
        .where(and(eq(handoffsTable.deliveryState, "processing"), lte(handoffsTable.leaseExpiresAt, now)))
        .returning({ id: handoffsTable.id });
      return reclaimed.length;
    },
    async list(query) {
      const conds = [];
      if (query.workflowId) conds.push(eq(handoffsTable.workflowId, query.workflowId));
      if (query.deliveryState) conds.push(eq(handoffsTable.deliveryState, query.deliveryState));
      if (query.clientWorkspaceId) conds.push(eq(handoffsTable.clientWorkspaceId, query.clientWorkspaceId));
      const base = db.select().from(handoffsTable);
      const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(handoffsTable.createdAt).limit(query.limit);
      return rows as unknown as HandoffRow[];
    },
    async countByState() {
      const rows = await db.select({ state: handoffsTable.deliveryState, n: sql<number>`count(*)` }).from(handoffsTable).groupBy(handoffsTable.deliveryState);
      const out: Record<string, number> = {};
      for (const r of rows) out[r.state as string] = Number(r.n);
      return out;
    },
    async deleteExpired(before) {
      // Only reap terminal states (completed/cancelled/dead_lettered) past the cutoff — never live work.
      const deleted = await db
        .delete(handoffsTable)
        .where(and(lte(handoffsTable.updatedAt, before), or(eq(handoffsTable.deliveryState, "completed"), eq(handoffsTable.deliveryState, "cancelled"), eq(handoffsTable.deliveryState, "dead_lettered"))))
        .returning({ id: handoffsTable.id });
      return deleted.length;
    },
  };
}
