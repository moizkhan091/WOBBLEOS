import { and, eq, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { providerUsage } from "@/db/schema";
import {
  buildProviderUsageRow,
  aggregateUnitUsage,
  type BuildProviderUsageInput,
  type ProviderUsageRow,
} from "@/lib/domain/provider-usage";

/**
 * Provider-usage service (Phase 3). Records the normalized ACTUAL usage of every provider call,
 * idempotently by (provider_request_id, attempt) so a retry or a duplicate provider callback never
 * double-charges. Budgets settle against the aggregated actual usage for a unit of work.
 */

export interface ProviderUsageStore {
  findByRequest(providerRequestId: string, attempt: number): Promise<ProviderUsageRow | null>;
  insert(row: ProviderUsageRow): Promise<void>;
  listForUnit(departmentSlug: string, workflowId: string, taskId: string): Promise<ProviderUsageRow[]>;
  listForWorkflow(workflowId: string): Promise<ProviderUsageRow[]>;
  listForDepartmentSince(departmentSlug: string, since: Date): Promise<ProviderUsageRow[]>;
}

/** Estimated-vs-actual summary for a set of usage rows (for the Command Centre budget view). */
export function summarizeUsage(rows: ProviderUsageRow[]): { actualCostCents: number; actualRows: number; estimatedRows: number; unverifiedRows: number } {
  const agg = aggregateUnitUsage(rows);
  return { actualCostCents: agg.costCents, actualRows: rows.filter((r) => r.estimationStatus === "actual").length, estimatedRows: rows.filter((r) => r.estimationStatus === "estimated").length, unverifiedRows: rows.filter((r) => r.verificationStatus !== "verified").length };
}

export interface ProviderUsageDeps {
  store?: ProviderUsageStore;
  now?: Date;
}

/** Record one provider call's normalized usage. Idempotent: a duplicate (providerRequestId, attempt)
 *  returns the existing row without inserting again — retries and duplicate callbacks converge. */
export async function recordProviderUsage(input: BuildProviderUsageInput, deps: ProviderUsageDeps = {}): Promise<{ row: ProviderUsageRow; deduped: boolean }> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const row = buildProviderUsageRow(input, { now });
  const existing = await store.findByRequest(row.providerRequestId, row.attempt);
  if (existing) return { row: existing, deduped: true };
  try {
    await store.insert(row);
  } catch {
    const raced = await store.findByRequest(row.providerRequestId, row.attempt);
    if (raced) return { row: raced, deduped: true };
    throw new Error("provider-usage: insert failed");
  }
  return { row, deduped: false };
}

/** The settled actual cost (cents) + tokens for a unit of work, from its recorded provider usage. */
export async function usageForUnit(departmentSlug: string, workflowId: string, taskId: string, deps: ProviderUsageDeps = {}): Promise<{ costCents: number; tokens: number; anyActual: boolean; allVerified: boolean; rows: number }> {
  const store = deps.store ?? defaultStore();
  const rows = await store.listForUnit(departmentSlug, workflowId, taskId);
  const agg = aggregateUnitUsage(rows);
  return { ...agg, rows: rows.length };
}

/** Estimated-vs-actual roll-up for a workflow (for the Command Centre). */
export async function usageForWorkflow(workflowId: string, deps: ProviderUsageDeps = {}): Promise<{ costCents: number; tokens: number; actualRows: number; estimatedRows: number; unverifiedRows: number }> {
  const store = deps.store ?? defaultStore();
  const rows = await store.listForWorkflow(workflowId);
  const agg = aggregateUnitUsage(rows);
  return { costCents: agg.costCents, tokens: agg.tokens, actualRows: rows.filter((r) => r.estimationStatus === "actual").length, estimatedRows: rows.filter((r) => r.estimationStatus === "estimated").length, unverifiedRows: rows.filter((r) => r.verificationStatus !== "verified").length };
}

function rowFrom(r: typeof providerUsage.$inferSelect): ProviderUsageRow {
  return r as unknown as ProviderUsageRow;
}

export function defaultStore(db: Db = getDb()): ProviderUsageStore {
  return {
    async findByRequest(providerRequestId, attempt) {
      const rows = await db.select().from(providerUsage).where(and(eq(providerUsage.providerRequestId, providerRequestId), eq(providerUsage.attempt, attempt))).limit(1);
      return rows[0] ? rowFrom(rows[0]) : null;
    },
    async insert(row) {
      await db.insert(providerUsage).values(row as never);
    },
    async listForUnit(departmentSlug, workflowId, taskId) {
      const rows = await db.select().from(providerUsage).where(and(eq(providerUsage.departmentSlug, departmentSlug), eq(providerUsage.workflowId, workflowId), eq(providerUsage.taskId, taskId)));
      return rows.map(rowFrom);
    },
    async listForWorkflow(workflowId) {
      const rows = await db.select().from(providerUsage).where(eq(providerUsage.workflowId, workflowId));
      return rows.map(rowFrom);
    },
    async listForDepartmentSince(departmentSlug, since) {
      const rows = await db.select().from(providerUsage).where(and(eq(providerUsage.departmentSlug, departmentSlug), sql`${providerUsage.createdAt} >= ${since}`));
      return rows.map(rowFrom);
    },
  };
}

/** Convenience count for tests/proofs. */
export async function countProviderUsage(db: Db = getDb()): Promise<number> {
  const r = await db.select({ n: sql<number>`count(*)::int` }).from(providerUsage);
  return Number(r[0]?.n ?? 0);
}
