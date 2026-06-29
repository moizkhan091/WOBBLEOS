import { and, desc, eq, gte, sum } from "drizzle-orm";
import { modelRuns } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { newId } from "@/lib/ids";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { estimateCostUsd, type PricingTable } from "@/lib/domain/cost";

/**
 * Chunk 05: Model Runs & Cost Tracking.
 *
 * Every AI/search/media call should go through `recordModelCall`, which times
 * the call and logs a `model_runs` row WITH cost + latency + status — even when
 * the provider call throws. This is what makes spend visible and feeds the
 * Dreaming Engine's cost dimension later. All writers/clocks are injectable so
 * the logic is testable without Postgres.
 */

export type ModelRunStatus = "succeeded" | "error";

export interface ModelRunRow {
  id: string;
  provider: string;
  model: string;
  role: string;
  module: string;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCost: string | null; // numeric -> string for the pg driver
  actualCost: string | null;
  latencyMs: number | null;
  status: ModelRunStatus;
  error: string | null;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  providerRunId: string | null;
  createdAt: Date;
}

export interface ModelRunMeta {
  provider: string;
  model: string;
  role: string;
  module: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
  pricing?: PricingTable;
}

export interface BuildModelRunInput extends ModelRunMeta {
  status: ModelRunStatus;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  actualCost?: number;
  latencyMs?: number;
  error?: string;
  providerRunId?: string;
}

export function buildModelRunRow(input: BuildModelRunInput, opts: { id?: string; now?: Date } = {}): ModelRunRow {
  const estimated =
    input.estimatedCost ??
    estimateCostUsd({
      provider: input.provider,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      pricing: input.pricing,
    });

  return {
    id: opts.id ?? newId("modelrun"),
    provider: input.provider,
    model: input.model,
    role: input.role,
    module: input.module,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    estimatedCost: String(estimated),
    actualCost: input.actualCost !== undefined ? String(input.actualCost) : null,
    latencyMs: input.latencyMs ?? null,
    status: input.status,
    error: input.error ?? null,
    linkedEntityType: input.linkedEntityType ?? null,
    linkedEntityId: input.linkedEntityId ?? null,
    providerRunId: input.providerRunId ?? null,
    createdAt: opts.now ?? new Date(),
  };
}

export interface ModelRunWriter {
  insertModelRun(row: ModelRunRow): Promise<void>;
}

export interface ModelRunDeps {
  writer?: ModelRunWriter;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
  /** returns epoch millis; injectable for deterministic latency in tests */
  clock?: () => number;
}

function defaultWriter(db: Db = getDb()): ModelRunWriter {
  return {
    async insertModelRun(row) {
      await db.insert(modelRuns).values(row);
    },
  };
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

export async function logModelRun(input: BuildModelRunInput, deps: ModelRunDeps = {}): Promise<ModelRunRow> {
  const row = buildModelRunRow(input, { now: deps.now });
  const writer = deps.writer ?? defaultWriter();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;

  await writer.insertModelRun(row);
  await recordAudit({
    eventType: `model.run.${row.status}`,
    module: "costs",
    entityType: row.linkedEntityType ?? "model_run",
    entityId: row.linkedEntityId ?? row.id,
    modelRunId: row.id,
    costEstimate: row.estimatedCost ? Number(row.estimatedCost) : undefined,
    metadata: { provider: row.provider, model: row.model, role: row.role, module: row.module, status: row.status },
  });

  return row;
}

export interface ModelCallResult {
  inputTokens?: number;
  outputTokens?: number;
  providerRunId?: string;
  [key: string]: unknown;
}

/**
 * Wrap a provider call: time it, and log a model_run on BOTH success and
 * failure. Re-throws the original error after logging so callers still see it.
 */
export async function recordModelCall<T extends ModelCallResult>(
  meta: ModelRunMeta,
  call: () => Promise<T>,
  deps: ModelRunDeps = {},
): Promise<{ result: T; run: ModelRunRow }> {
  const clock = deps.clock ?? (() => Date.now());
  const start = clock();
  try {
    const result = await call();
    const run = await logModelRun(
      {
        ...meta,
        status: "succeeded",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        providerRunId: result.providerRunId,
        latencyMs: clock() - start,
      },
      deps,
    );
    return { result, run };
  } catch (err) {
    await logModelRun(
      {
        ...meta,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        latencyMs: clock() - start,
      },
      deps,
    );
    throw err;
  }
}

// ---- read helpers (need a DB) ----

export async function sumEstimatedCostSince(since: Date, db: Db = getDb()): Promise<number> {
  const rows = await db
    .select({ total: sum(modelRuns.estimatedCost) })
    .from(modelRuns)
    .where(gte(modelRuns.createdAt, since));
  return Number(rows[0]?.total ?? 0);
}

export interface CostSummary {
  today: number;
  week: number;
  month: number;
}

export async function costSummary(now: Date = new Date(), db: Db = getDb()): Promise<CostSummary> {
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

  const [today, week, month] = await Promise.all([
    sumEstimatedCostSince(startOfToday, db),
    sumEstimatedCostSince(weekAgo, db),
    sumEstimatedCostSince(monthAgo, db),
  ]);
  return { today, week, month };
}

export interface ListModelRunsQuery {
  module?: string;
  provider?: string;
  status?: ModelRunStatus;
  limit?: number;
}

export function clampRunLimit(limit?: number): number {
  if (limit === undefined || Number.isNaN(limit)) return 50;
  return Math.min(Math.max(Math.trunc(limit), 1), 200);
}

export async function listModelRuns(query: ListModelRunsQuery = {}, db: Db = getDb()) {
  const conditions = [];
  if (query.module) conditions.push(eq(modelRuns.module, query.module));
  if (query.provider) conditions.push(eq(modelRuns.provider, query.provider));
  if (query.status) conditions.push(eq(modelRuns.status, query.status));
  const where = conditions.length ? and(...conditions) : undefined;

  return db.select().from(modelRuns).where(where).orderBy(desc(modelRuns.createdAt)).limit(clampRunLimit(query.limit));
}
