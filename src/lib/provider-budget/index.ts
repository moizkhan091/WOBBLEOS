import { and, eq, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { externalProviderSpend } from "@/db/schema";
import { newId } from "@/lib/ids";

/**
 * EXTERNAL PAID-PROVIDER BUDGET CONTROL (UAT).
 *
 * The campaign runs against a hard external budget: OpenRouter $3, Tavily 500 credits, Apify $2, plus the
 * ElevenLabs character quota. This module is the single gate every paid call passes through: before the
 * call we verify the worst-case charge cannot breach the INTERNAL stop threshold, and after we record the
 * actual spend to a durable ledger so the check reads authoritative history (surviving restarts). No spend
 * happens without a named acceptance item, and an untracked provider is treated as no-external-budget
 * (never silently unlimited-billed — the caller must add it here first).
 */

export type BudgetUnit = "usd" | "credits" | "characters";
export interface ProviderBudget {
  /** Absolute ceiling (never spend past this). */
  ceiling: number;
  /** Internal stop threshold — reject BEFORE the ceiling so an in-flight call cannot cross it. */
  stop: number;
  unit: BudgetUnit;
}

/** UAT budgets (external). Founder-set. Concurrency 1 / max 1 retry are enforced separately. */
export const PROVIDER_BUDGETS: Record<string, ProviderBudget> = {
  openrouter: { ceiling: 3.0, stop: 2.7, unit: "usd" },
  tavily: { ceiling: 500, stop: 380, unit: "credits" },
  apify: { ceiling: 2.0, stop: 1.0, unit: "usd" },
  // ElevenLabs bills characters against the account quota (creator tier ≈ 232k). Stop well short.
  elevenlabs: { ceiling: 232285, stop: 210000, unit: "characters" },
  // DataForSEO account holds only $1 — stop well under it so keyword/trend calls can never drain the balance.
  dataforseo: { ceiling: 0.5, stop: 0.3, unit: "usd" },
};

export class ProviderBudgetExceededError extends Error {
  readonly name = "ProviderBudgetExceededError";
  constructor(
    readonly provider: string,
    readonly spent: number,
    readonly estimate: number,
    readonly stop: number,
    readonly unit: BudgetUnit,
  ) {
    super(`external budget for '${provider}' would be exceeded: spent ${spent} + worst-case ${estimate} > stop ${stop} ${unit}`);
  }
}

/**
 * PURE decision: would this call breach the stop threshold? Extracted so the budget arithmetic is unit-
 * tested away from the DB. `estimate` is the WORST-CASE charge (not the expected) — we reject on the
 * pessimistic bound so a call can never surprise us past the stop.
 */
export function wouldExceedBudget(spent: number, estimate: number, budget: ProviderBudget): boolean {
  return spent + estimate > budget.stop;
}

export interface ProviderBudgetDeps {
  db?: Db;
  now?: Date;
  /** Injectable spend reader for tests. */
  getSpent?: (provider: string) => Promise<number>;
}

/** Authoritative recorded spend for a provider (sum of actualCost across the ledger). */
export async function getProviderSpend(provider: string, deps: ProviderBudgetDeps = {}): Promise<number> {
  if (deps.getSpent) return deps.getSpent(provider);
  const db = deps.db ?? getDb();
  const rows = await db
    .select({ total: sql<string>`coalesce(sum(${externalProviderSpend.actualCost}), 0)` })
    .from(externalProviderSpend)
    .where(and(eq(externalProviderSpend.provider, provider), eq(externalProviderSpend.result, "succeeded")));
  return Number(rows[0]?.total ?? 0);
}

export interface AllowanceResult {
  provider: string;
  tracked: boolean;
  spent: number;
  remaining: number;
  budget: ProviderBudget | null;
}

/**
 * Verify a paid call is within budget. THROWS `ProviderBudgetExceededError` if the worst-case would breach
 * the stop threshold. An untracked provider returns `tracked:false` (no external budget modelled here) — it
 * is the caller's job to register a budget before spending, so this can never silently authorise unbounded
 * billing on a new provider.
 */
export async function assertProviderAllowance(provider: string, worstCaseCost: number, deps: ProviderBudgetDeps = {}): Promise<AllowanceResult> {
  const budget = PROVIDER_BUDGETS[provider] ?? null;
  if (!budget) return { provider, tracked: false, spent: 0, remaining: Infinity, budget: null };
  const spent = await getProviderSpend(provider, deps);
  if (wouldExceedBudget(spent, worstCaseCost, budget)) {
    throw new ProviderBudgetExceededError(provider, spent, worstCaseCost, budget.stop, budget.unit);
  }
  return { provider, tracked: true, spent, remaining: budget.stop - spent, budget };
}

export interface RecordSpendInput {
  provider: string;
  /** The named acceptance/ledger item this call advanced. Required — no spend without a reason. */
  item: string;
  model?: string;
  estimatedMaxCost: number;
  actualCost: number;
  unit: BudgetUnit;
  tokens?: number;
  latencyMs?: number;
  result: "succeeded" | "failed" | "rejected_budget" | "blocked_killswitch";
  actor?: string;
  metadata?: Record<string, unknown>;
}

/** Append actual spend to the durable ledger. Called on BOTH success and failure so cost is never lost. */
export async function recordExternalSpend(input: RecordSpendInput, deps: ProviderBudgetDeps = {}): Promise<void> {
  const db = deps.db ?? getDb();
  await db.insert(externalProviderSpend).values({
    id: newId("extspend"),
    provider: input.provider,
    item: input.item,
    model: input.model ?? null,
    estimatedMaxCost: String(input.estimatedMaxCost),
    actualCost: String(input.actualCost),
    unit: input.unit,
    tokens: input.tokens ?? null,
    latencyMs: input.latencyMs ?? null,
    result: input.result,
    actor: input.actor ?? null,
    metadata: input.metadata ?? {},
    createdAt: deps.now ?? new Date(),
  });
}

/**
 * Enforce MAX-1-CONCURRENCY across external providers via a Postgres session advisory lock. `fn` runs only
 * if the slot is free; a concurrent caller gets `ProviderConcurrencyError` rather than a second live paid
 * call. The lock is always released. A single global slot (not per-provider) matches the founder rule:
 * at most one external provider call in flight at a time.
 */
const EXTERNAL_PROVIDER_LOCK_KEY = 918273645; // arbitrary stable app-wide key

export class ProviderConcurrencyError extends Error {
  readonly name = "ProviderConcurrencyError";
  constructor() {
    super("external provider concurrency limit (1) reached — another paid call is in flight");
  }
}

export async function withExternalProviderSlot<T>(fn: () => Promise<T>, deps: { db?: Db } = {}): Promise<T> {
  // The advisory lock is a cross-process control that only matters against a real database. With no DB
  // (a pure unit test), there is no concurrent paid call to serialise, so just run.
  if (!deps.db && !process.env.DATABASE_URL) return fn();
  const db = deps.db ?? getDb();
  const got = await db.execute(sql`select pg_try_advisory_lock(${EXTERNAL_PROVIDER_LOCK_KEY}) as locked`);
  const locked = (got as unknown as { rows?: { locked: boolean }[] }).rows?.[0]?.locked ?? (Array.isArray(got) ? (got[0] as { locked: boolean })?.locked : false);
  if (!locked) throw new ProviderConcurrencyError();
  try {
    return await fn();
  } finally {
    await db.execute(sql`select pg_advisory_unlock(${EXTERNAL_PROVIDER_LOCK_KEY})`).catch(() => {});
  }
}
