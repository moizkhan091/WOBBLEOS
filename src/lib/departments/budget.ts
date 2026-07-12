import { and, eq, lte, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { budgetReservations } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { getDepartment, type DepartmentRegistryDeps } from "@/lib/departments/registry";
import type { DepartmentRow } from "@/lib/domain/department";
import {
  aggregateUsage,
  buildBudgetReservationRow,
  evaluateBudget,
  windowBoundaries,
  type BudgetReservationRow,
  type BudgetReservationState,
  type BudgetReservationInput,
  type BudgetEvaluation,
} from "@/lib/domain/department-budget";

/**
 * Department budget runtime (Phase 3). Enforces the department's windowed caps via reserve → settle, with
 * a per-department lock so two concurrent jobs can never both spend the same remaining budget. A
 * reservation is idempotent per unit of work (department, workflow, task) so a retry never double-charges;
 * abandoned reservations expire and release their hold. A founder can override an over-budget block
 * (explicit + audited). Over budget → BLOCKED before the provider call.
 */

/** The tx-scoped context the reservation critical section runs against (under the department lock). */
export interface BudgetLockCtx {
  getUnit(departmentSlug: string, workflowId: string, taskId: string): Promise<BudgetReservationRow | null>;
  windowRows(departmentSlug: string, monthStart: Date): Promise<BudgetReservationRow[]>;
  insert(row: BudgetReservationRow): Promise<void>;
}

export interface BudgetStore {
  /** Serialize the reservation critical section for a department (locks the department row). */
  withDepartmentLock<T>(departmentSlug: string, fn: (ctx: BudgetLockCtx) => Promise<T>): Promise<T>;
  getById(id: string): Promise<BudgetReservationRow | null>;
  transition(id: string, from: BudgetReservationState, fields: Partial<BudgetReservationRow>): Promise<boolean>;
  listExpired(now: Date, limit: number): Promise<BudgetReservationRow[]>;
  windowRows(departmentSlug: string, monthStart: Date): Promise<BudgetReservationRow[]>;
}

export interface BudgetDeps extends DepartmentRegistryDeps {
  budgetStore?: BudgetStore;
  /** A pre-loaded department (avoids a registry round-trip when the caller already has it). */
  department?: DepartmentRow;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

async function audit(deps: BudgetDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

export interface ReserveBudgetInput extends BudgetReservationInput {
  /** Founder override — reserve even if over budget (audited). */
  overrideBy?: string;
}

export interface ReserveBudgetResult {
  ok: boolean;
  reservation: BudgetReservationRow | null;
  evaluation: BudgetEvaluation;
  deduped: boolean;
  degraded: boolean;
  overridden: boolean;
}

/**
 * Reserve estimated spend for a unit of work BEFORE the provider call. Blocks (ok=false, no row) when a
 * cap would be exceeded, unless a founder override is supplied. Idempotent: an existing live reservation
 * for (department, workflow, task) is returned as-is (a retry never double-charges).
 */
export async function reserveBudget(input: ReserveBudgetInput, deps: BudgetDeps = {}): Promise<ReserveBudgetResult> {
  const store = deps.budgetStore ?? defaultBudgetStore();
  const now = deps.now ?? new Date();
  const department = deps.department ?? await getDepartment(input.departmentSlug, deps);
  if (!department) throw new Error(`budget: department '${input.departmentSlug}' not found`);
  const { monthStart } = windowBoundaries(now);
  const request = { estimatedCents: input.estimatedCents ?? 0, estimatedTokens: input.estimatedTokens ?? 0, provider: input.provider ?? null };

  const outcome = await store.withDepartmentLock(input.departmentSlug, async (ctx) => {
    // Idempotency: a live reservation for this unit means this is a retry — reuse it.
    const existing = await ctx.getUnit(input.departmentSlug, input.workflowId, input.taskId);
    if (existing && (existing.state === "reserved" || existing.state === "settled")) {
      return { reservation: existing, evaluation: { ok: true, degraded: false, blockedBy: null, reasons: [], remaining: { dailyCents: null, monthlyCents: null, dailyTokens: null, monthlyTokens: null } } as BudgetEvaluation, deduped: true, blocked: false, degraded: false };
    }
    const usage = aggregateUsage(await ctx.windowRows(input.departmentSlug, monthStart), now);
    const evaluation = evaluateBudget(department.budget, department.limits, usage, request);
    const overridden = !evaluation.ok && !!input.overrideBy;
    if (!evaluation.ok && !overridden) {
      return { reservation: null, evaluation, deduped: false, blocked: true, degraded: false };
    }
    const row = buildBudgetReservationRow(input, { now, overrideBy: overridden ? input.overrideBy ?? null : null });
    await ctx.insert(row);
    return { reservation: row, evaluation, deduped: false, blocked: false, degraded: evaluation.degraded, overridden };
  });

  const overridden = !!("overridden" in outcome && outcome.overridden);
  if (outcome.blocked) {
    await audit(deps, { eventType: "budget.blocked", module: "departments", entityType: "department", entityId: input.departmentSlug, actor: input.workflowId, metadata: { workflowId: input.workflowId, taskId: input.taskId, blockedBy: outcome.evaluation.blockedBy, reasons: outcome.evaluation.reasons } });
    return { ok: false, reservation: null, evaluation: outcome.evaluation, deduped: false, degraded: false, overridden: false };
  }
  if (!outcome.deduped) {
    await audit(deps, { eventType: overridden ? "budget.override" : "budget.reserved", module: "departments", entityType: "budget_reservation", entityId: outcome.reservation!.id, actor: overridden ? input.overrideBy! : input.workflowId, metadata: { departmentSlug: input.departmentSlug, workflowId: input.workflowId, taskId: input.taskId, estimatedCents: request.estimatedCents, estimatedTokens: request.estimatedTokens, degraded: outcome.degraded, overrideBy: overridden ? input.overrideBy : null } });
  }
  return { ok: true, reservation: outcome.reservation, evaluation: outcome.evaluation, deduped: outcome.deduped, degraded: outcome.degraded ?? false, overridden };
}

/** Settle a reservation against the ACTUAL cost. Idempotent (a second settle is a no-op). */
export async function settleBudget(reservationId: string, actual: { actualCents: number; actualTokens: number }, deps: BudgetDeps = {}): Promise<boolean> {
  const store = deps.budgetStore ?? defaultBudgetStore();
  const now = deps.now ?? new Date();
  const row = await store.getById(reservationId);
  if (!row) return false;
  if (row.state !== "reserved") return row.state === "settled"; // already settled = success; released/expired = no
  const ok = await store.transition(reservationId, "reserved", { state: "settled", actualCents: Math.max(0, Math.trunc(actual.actualCents)), actualTokens: Math.max(0, Math.trunc(actual.actualTokens)), settledAt: now, updatedAt: now });
  if (ok) await audit(deps, { eventType: "budget.settled", module: "departments", entityType: "budget_reservation", entityId: reservationId, actor: "system", metadata: { departmentSlug: row.departmentSlug, actualCents: actual.actualCents, actualTokens: actual.actualTokens, estimatedCents: row.estimatedCents } });
  return ok;
}

/** Release a reservation whose work was abandoned (frees the hold immediately). */
export async function releaseBudget(reservationId: string, deps: BudgetDeps = {}): Promise<boolean> {
  const store = deps.budgetStore ?? defaultBudgetStore();
  const now = deps.now ?? new Date();
  const row = await store.getById(reservationId);
  if (!row) return false;
  const ok = await store.transition(reservationId, "reserved", { state: "released", releasedAt: now, updatedAt: now });
  if (ok) await audit(deps, { eventType: "budget.released", module: "departments", entityType: "budget_reservation", entityId: reservationId, actor: "system", metadata: { departmentSlug: row.departmentSlug } });
  return ok;
}

/** Sweep reserved-but-expired reservations → released (the scheduler calls this). */
export async function expireStaleReservations(deps: BudgetDeps = {}): Promise<number> {
  const store = deps.budgetStore ?? defaultBudgetStore();
  const now = deps.now ?? new Date();
  const stale = await store.listExpired(now, 500);
  let n = 0;
  for (const r of stale) {
    if (await store.transition(r.id, "reserved", { state: "expired", releasedAt: now, updatedAt: now })) n += 1;
  }
  if (n > 0) await audit(deps, { eventType: "budget.reservations_expired", module: "departments", entityType: "system", actor: "system", metadata: { count: n } });
  return n;
}

export interface BudgetState {
  departmentSlug: string;
  usage: ReturnType<typeof aggregateUsage>;
  caps: { dailyCents: number | null; monthlyCents: number | null; dailyTokens: number | null; monthlyTokens: number | null; concurrencyLimit: number };
  remaining: { dailyCents: number | null; monthlyCents: number | null; dailyTokens: number | null; monthlyTokens: number | null };
}

/** Read-only budget state for the Command Centre: current windowed usage, caps and remaining. */
export async function getBudgetState(departmentSlug: string, deps: BudgetDeps = {}): Promise<BudgetState | null> {
  const store = deps.budgetStore ?? defaultBudgetStore();
  const now = deps.now ?? new Date();
  const department = deps.department ?? await getDepartment(departmentSlug, deps);
  if (!department) return null;
  const { monthStart } = windowBoundaries(now);
  const usage = aggregateUsage(await store.windowRows(departmentSlug, monthStart), now);
  const b = department.budget;
  const rem = (cap: number | null, used: number) => (cap === null ? null : Math.max(0, cap - used));
  return {
    departmentSlug,
    usage,
    caps: { dailyCents: b.dailyCents, monthlyCents: b.monthlyCents, dailyTokens: b.dailyTokens, monthlyTokens: b.monthlyTokens, concurrencyLimit: department.limits.concurrencyLimit },
    remaining: { dailyCents: rem(b.dailyCents, usage.dailyCents), monthlyCents: rem(b.monthlyCents, usage.monthlyCents), dailyTokens: rem(b.dailyTokens, usage.dailyTokens), monthlyTokens: rem(b.monthlyTokens, usage.monthlyTokens) },
  };
}

// ---- DB store: the department lock serializes concurrent reservations (no double-spend) ----

function rowFrom(r: typeof budgetReservations.$inferSelect): BudgetReservationRow {
  return { ...r, provider: r.provider ?? null, reason: r.reason ?? null, overrideBy: r.overrideBy ?? null } as unknown as BudgetReservationRow;
}

export function defaultBudgetStore(db: Db = getDb()): BudgetStore {
  return {
    async withDepartmentLock(departmentSlug, fn) {
      return db.transaction(async (tx) => {
        // Serialize per-department reservations: hold the department row lock for the whole section.
        await tx.execute(sql`SELECT id FROM departments WHERE slug = ${departmentSlug} FOR UPDATE`);
        const ctx: BudgetLockCtx = {
          getUnit: async (dept, wf, task) => {
            const rows = await tx.select().from(budgetReservations).where(and(eq(budgetReservations.departmentSlug, dept), eq(budgetReservations.workflowId, wf), eq(budgetReservations.taskId, task))).limit(1);
            return rows[0] ? rowFrom(rows[0]) : null;
          },
          windowRows: async (dept, monthStart) => {
            const rows = await tx.select().from(budgetReservations).where(and(eq(budgetReservations.departmentSlug, dept), sql`${budgetReservations.createdAt} >= ${monthStart}`));
            return rows.map(rowFrom);
          },
          insert: async (row) => { await tx.insert(budgetReservations).values(row as never); },
        };
        return fn(ctx);
      });
    },
    async getById(id) {
      const rows = await db.select().from(budgetReservations).where(eq(budgetReservations.id, id)).limit(1);
      return rows[0] ? rowFrom(rows[0]) : null;
    },
    async transition(id, from, fields) {
      const updated = await db.update(budgetReservations).set(fields as never).where(and(eq(budgetReservations.id, id), eq(budgetReservations.state, from))).returning({ id: budgetReservations.id });
      return updated.length > 0;
    },
    async listExpired(now, limit) {
      const rows = await db.select().from(budgetReservations).where(and(eq(budgetReservations.state, "reserved"), lte(budgetReservations.expiresAt, now))).limit(limit);
      return rows.map(rowFrom);
    },
    async windowRows(departmentSlug, monthStart) {
      const rows = await db.select().from(budgetReservations).where(and(eq(budgetReservations.departmentSlug, departmentSlug), sql`${budgetReservations.createdAt} >= ${monthStart}`));
      return rows.map(rowFrom);
    },
  };
}
