import { z } from "zod";
import { newId } from "@/lib/ids";
import type { DepartmentBudget, DepartmentLimits } from "@/lib/domain/department";

/**
 * Department operational budget domain (Phase 3). Real enforcement, not stored fields: expensive work
 * RESERVES an estimated spend against the department's windowed caps (per-run / daily / monthly cents +
 * tokens, provider caps, concurrency) BEFORE the provider call, and SETTLES the actual cost afterward.
 * Reservations that are abandoned expire and release their hold. A reservation is idempotent per unit of
 * work (department, workflow, task) so a retry never double-charges.
 */

export const BUDGET_RESERVATION_STATES = ["reserved", "settled", "released", "expired"] as const;
export type BudgetReservationState = (typeof BUDGET_RESERVATION_STATES)[number];

/** How long a reservation is held before the sweeper releases it if never settled. */
export const BUDGET_RESERVATION_TTL_MS = 15 * 60_000;

export interface BudgetReservationRow {
  id: string;
  departmentSlug: string;
  workflowId: string;
  /** The unit of work — idempotency is per (department, workflow, task); a retry reuses the reservation. */
  taskId: string;
  estimatedCents: number;
  estimatedTokens: number;
  actualCents: number | null;
  actualTokens: number | null;
  provider: string | null;
  state: BudgetReservationState;
  reason: string | null;
  /** Set when a founder explicitly overrode an over-budget block (audited). */
  overrideBy: string | null;
  expiresAt: Date;
  createdAt: Date;
  settledAt: Date | null;
  releasedAt: Date | null;
  updatedAt: Date;
}

export const budgetReservationInputSchema = z.object({
  departmentSlug: z.string().trim().min(1),
  workflowId: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
  estimatedCents: z.number().int().nonnegative().default(0),
  estimatedTokens: z.number().int().nonnegative().default(0),
  provider: z.string().trim().min(1).nullable().default(null),
  reason: z.string().trim().min(1).nullable().default(null),
});
export type BudgetReservationInput = z.input<typeof budgetReservationInputSchema>;

export function buildBudgetReservationRow(input: BudgetReservationInput, opts: { id?: string; now: Date; ttlMs?: number; overrideBy?: string | null }): BudgetReservationRow {
  const parsed = budgetReservationInputSchema.parse(input);
  const now = opts.now;
  return {
    id: opts.id ?? newId("budgetres"),
    departmentSlug: parsed.departmentSlug,
    workflowId: parsed.workflowId,
    taskId: parsed.taskId,
    estimatedCents: parsed.estimatedCents,
    estimatedTokens: parsed.estimatedTokens,
    actualCents: null,
    actualTokens: null,
    provider: parsed.provider,
    state: "reserved",
    reason: parsed.reason,
    overrideBy: opts.overrideBy ?? null,
    expiresAt: new Date(now.getTime() + (opts.ttlMs ?? BUDGET_RESERVATION_TTL_MS)),
    createdAt: now,
    settledAt: null,
    releasedAt: null,
    updatedAt: now,
  };
}

/** Start-of-day / start-of-month (UTC) for the given instant — the calendar window boundaries. */
export function windowBoundaries(now: Date): { dayStart: Date; monthStart: Date } {
  return {
    dayStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
    monthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  };
}

/**
 * Aggregate a department's month-window reservations into current usage. A reservation counts its ACTUAL
 * cost once settled, else its RESERVED estimate (the hold); released/expired reservations count for
 * nothing. `activeReservations` counts still-reserved rows (for the concurrency cap).
 */
export function aggregateUsage(rows: BudgetReservationRow[], now: Date): BudgetUsage {
  const { dayStart } = windowBoundaries(now);
  const usage: BudgetUsage = { dailyCents: 0, dailyTokens: 0, monthlyCents: 0, monthlyTokens: 0, providerTokens: {}, activeReservations: 0 };
  for (const r of rows) {
    if (r.state !== "reserved" && r.state !== "settled") continue; // released / expired hold nothing
    const cents = r.actualCents ?? r.estimatedCents;
    const tokens = r.actualTokens ?? r.estimatedTokens;
    usage.monthlyCents += cents;
    usage.monthlyTokens += tokens;
    if (r.createdAt.getTime() >= dayStart.getTime()) {
      usage.dailyCents += cents;
      usage.dailyTokens += tokens;
      if (r.provider) usage.providerTokens[r.provider] = (usage.providerTokens[r.provider] ?? 0) + tokens;
    }
    if (r.state === "reserved") usage.activeReservations += 1;
  }
  return usage;
}

/** The committed + held spend for a department across the windows the caps care about. */
export interface BudgetUsage {
  dailyCents: number;
  dailyTokens: number;
  monthlyCents: number;
  monthlyTokens: number;
  /** Sum per provider (daily window) for provider caps. */
  providerTokens: Record<string, number>;
  /** Number of active (reserved, unsettled) reservations — for the concurrency cap. */
  activeReservations: number;
}

export interface BudgetRequest {
  estimatedCents: number;
  estimatedTokens: number;
  provider?: string | null;
}

export interface BudgetEvaluation {
  ok: boolean;
  /** Allowed but near exhaustion (>= degradedAtFraction of a windowed cap) — run in degraded mode. */
  degraded: boolean;
  /** The cap that blocked (when !ok). */
  blockedBy: string | null;
  reasons: string[];
  /** Remaining headroom per window after this request would land (for display). */
  remaining: { dailyCents: number | null; monthlyCents: number | null; dailyTokens: number | null; monthlyTokens: number | null };
}

/** Fraction of a windowed cap at/after which a department runs "degraded" (still allowed). */
export const BUDGET_DEGRADED_FRACTION = 0.9;

/**
 * Pure budget evaluation: would this request stay within every configured cap? Enforces per-run,
 * daily, monthly (cents + tokens), per-provider, and concurrency caps. A null cap is unbounded. When a
 * projected window usage reaches {@link BUDGET_DEGRADED_FRACTION} of its cap it is allowed but marked
 * `degraded`. Blocking (`!ok`) is the "before the provider call" gate.
 */
export function evaluateBudget(budget: DepartmentBudget, limits: DepartmentLimits, usage: BudgetUsage, request: BudgetRequest): BudgetEvaluation {
  const reasons: string[] = [];
  let blockedBy: string | null = null;
  let degraded = false;

  const block = (cap: number | null, projected: number, label: string) => {
    if (cap === null) return;
    if (projected > cap) { blockedBy = blockedBy ?? label; reasons.push(`${label}: ${projected} exceeds cap ${cap}`); }
    else if (projected >= cap * BUDGET_DEGRADED_FRACTION) { degraded = true; }
  };

  // Per-run caps apply to THIS request alone.
  block(budget.perRunCents, request.estimatedCents, "per_run_cents");
  block(budget.perRunTokens, request.estimatedTokens, "per_run_tokens");

  // Daily / monthly windows = existing usage + this request.
  const dCents = usage.dailyCents + request.estimatedCents;
  const mCents = usage.monthlyCents + request.estimatedCents;
  const dTokens = usage.dailyTokens + request.estimatedTokens;
  const mTokens = usage.monthlyTokens + request.estimatedTokens;
  block(budget.dailyCents, dCents, "daily_cents");
  block(budget.monthlyCents, mCents, "monthly_cents");
  block(budget.dailyTokens, dTokens, "daily_tokens");
  block(budget.monthlyTokens, mTokens, "monthly_tokens");

  // Overall lifetime operating cap (monthly usage is the best available proxy for "recent" spend here;
  // the monthly window is the enforced recurring cap and operatingBudgetCents is the hard ceiling).
  block(budget.operatingBudgetCents, mCents, "operating_cents");
  block(budget.tokenBudget, mTokens, "token_budget");

  // Provider cap (daily window).
  if (request.provider) {
    const cap = budget.providerBudgets[request.provider];
    const projected = (usage.providerTokens[request.provider] ?? 0) + request.estimatedTokens;
    block(cap ?? null, projected, `provider_${request.provider}`);
  }

  // Concurrency: this reservation would be the (activeReservations + 1)-th.
  if (limits.concurrencyLimit && usage.activeReservations + 1 > limits.concurrencyLimit) {
    blockedBy = blockedBy ?? "concurrency";
    reasons.push(`concurrency: ${usage.activeReservations + 1} exceeds limit ${limits.concurrencyLimit}`);
  }

  const rem = (cap: number | null, used: number) => (cap === null ? null : Math.max(0, cap - used));
  return {
    ok: blockedBy === null,
    degraded: degraded && blockedBy === null,
    blockedBy,
    reasons,
    remaining: { dailyCents: rem(budget.dailyCents, dCents), monthlyCents: rem(budget.monthlyCents, mCents), dailyTokens: rem(budget.dailyTokens, dTokens), monthlyTokens: rem(budget.monthlyTokens, mTokens) },
  };
}
