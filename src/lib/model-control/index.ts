import { and, desc, eq, gte, sql } from "drizzle-orm";
import { budgetCaps, externalProviderSpend, modelRuns } from "@/db/schema";
import { getDb } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { getModelCatalog, getModelRoleMap, setModelForRole } from "@/lib/model-registry";
import {
  MODEL_CONTROL_MODULE,
  MODEL_ROLE_CATALOG,
  ROLE_BY_NAME,
  detectPreset,
  downgradeWarnings,
  resolveChanges,
  type ApplyModelChange,
  type ModelRoleDef,
} from "@/lib/domain/model-control";

/**
 * Model Control service.
 *
 * Assembles one view of what every part of the OS is running, what it has cost, and how busy it is,
 * and applies changes through the EXISTING setModelForRole so a switch is picked up on the very next
 * provider call. The role map is read live inside runTextProvider, so nothing needs restarting and a
 * change cannot silently fail to take effect.
 */

export interface RoleView extends ModelRoleDef {
  /** What it is running right now. */
  model: string;
  provider: string;
  /** True when no explicit choice has been made and the default is in force. */
  usingDefault: boolean;
  /** Live telemetry, from model_runs. */
  runs: number;
  failures: number;
  costUsd: number;
  avgLatencyMs: number | null;
  lastRunAt: string | null;
}

export interface ModelControlView {
  roles: RoleView[];
  preset: ReturnType<typeof detectPreset>;
  catalog: Array<{ id: string; label: string; costTier: string; provider: string }>;
  spend: {
    todayUsd: number;
    totalUsd: number;
    dailyCapUsd: number | null;
    capEnabled: boolean;
    /** How much of today's cap is gone, 0-1. */
    capUsed: number;
  };
  totals: { runs: number; failures: number; costUsd: number };
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

/** Everything the Model Control page renders, in one query pass. */
export async function getModelControlView(): Promise<ModelControlView> {
  const db = getDb();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const [roleMap, catalog, stats, todaySpend, totalSpend, caps] = await Promise.all([
    getModelRoleMap(),
    getModelCatalog().catch(() => []),
    db
      .select({
        role: modelRuns.role,
        runs: sql<number>`count(*)`,
        failures: sql<number>`count(*) filter (where ${modelRuns.status} <> 'succeeded')`,
        cost: sql<number>`coalesce(sum(coalesce(${modelRuns.actualCost}, ${modelRuns.estimatedCost})), 0)`,
        avgLatency: sql<number>`avg(${modelRuns.latencyMs})`,
        lastRun: sql<string>`max(${modelRuns.createdAt})`,
      })
      .from(modelRuns)
      .groupBy(modelRuns.role),
    db
      .select({ cost: sql<number>`coalesce(sum(${externalProviderSpend.actualCost}), 0)` })
      .from(externalProviderSpend)
      .where(and(eq(externalProviderSpend.provider, "openrouter"), gte(externalProviderSpend.createdAt, startOfDay))),
    db.select({ cost: sql<number>`coalesce(sum(${externalProviderSpend.actualCost}), 0)` }).from(externalProviderSpend).where(eq(externalProviderSpend.provider, "openrouter")),
    db.select().from(budgetCaps).where(eq(budgetCaps.id, "budget_openrouter_daily")).limit(1),
  ]);

  const statByRole = new Map(stats.map((s) => [s.role, s]));
  const current: Record<string, string> = {};

  // What an UNSET role actually runs is the 'default' role, not the catalog default. Showing the catalog
  // default here would make the page state a model the provider never uses, which is the one thing this
  // page must never do.
  const houseDefault = roleMap.default;

  const roles: RoleView[] = MODEL_ROLE_CATALOG.map((def) => {
    const configured = roleMap[def.role];
    const model = configured?.model ?? houseDefault?.model ?? def.defaultModel;
    current[def.role] = model;
    const s = statByRole.get(def.role);
    return {
      ...def,
      model,
      provider: configured?.provider ?? houseDefault?.provider ?? "openrouter",
      usingDefault: !configured,
      runs: num(s?.runs),
      failures: num(s?.failures),
      costUsd: num(s?.cost),
      avgLatencyMs: s?.avgLatency ? Math.round(num(s.avgLatency)) : null,
      lastRunAt: s?.lastRun ? new Date(s.lastRun).toISOString() : null,
    };
  });

  const cap = caps[0];
  const todayUsd = num(todaySpend[0]?.cost);
  const dailyCapUsd = cap ? num(cap.amount) : null;

  return {
    roles,
    preset: detectPreset(current),
    catalog: (catalog as Array<{ id: string; label?: string; costTier?: string; provider?: string }>).map((m) => ({
      id: m.id,
      label: m.label ?? m.id,
      costTier: m.costTier ?? "mid",
      provider: m.provider ?? "openrouter",
    })),
    spend: {
      todayUsd,
      totalUsd: num(totalSpend[0]?.cost),
      dailyCapUsd,
      capEnabled: Boolean(cap?.enabled),
      capUsed: dailyCapUsd && dailyCapUsd > 0 ? Math.min(1, todayUsd / dailyCapUsd) : 0,
    },
    totals: {
      runs: roles.reduce((a, r) => a + r.runs, 0),
      failures: roles.reduce((a, r) => a + r.failures, 0),
      costUsd: roles.reduce((a, r) => a + r.costUsd, 0),
    },
  };
}

export interface ApplyResult {
  applied: Array<{ role: string; model: string }>;
  warnings: string[];
  failed: Array<{ role: string; error: string }>;
}

/** Apply a change. Writes through setModelForRole, which the provider reads live on the next call. */
export async function applyModelChange(
  input: ApplyModelChange,
  actor: string,
  deps: { recordAudit?: (i: AuditEventInput) => Promise<void> } = {},
): Promise<ApplyResult> {
  const changes = resolveChanges(input);
  if (!changes.length) return { applied: [], warnings: [], failed: [] };

  const catalog = (await getModelCatalog().catch(() => [])) as Array<{ id: string; costTier?: string }>;
  const cheapModels = new Set(catalog.filter((m) => m.costTier === "cheap").map((m) => m.id));
  // The catalog may not be seeded; fall back to the known cheap default so the warning still fires.
  if (!cheapModels.size) cheapModels.add("openai/gpt-4o-mini");

  const applied: Array<{ role: string; model: string }> = [];
  const failed: Array<{ role: string; error: string }> = [];

  // setModelForRole validates against the catalog and THROWS on an unknown, deprecated or incompatible
  // model. One bad role must not abandon the rest of a preset, so each is applied independently and the
  // failures are reported rather than swallowed.
  for (const change of changes) {
    try {
      await setModelForRole({ role: change.role, modelId: change.model, changedBy: actor, reason: input.preset ? `preset: ${input.preset}` : "model control" });
      applied.push(change);
    } catch (error) {
      failed.push({ role: change.role, error: error instanceof Error ? error.message : "failed" });
    }
  }

  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))({
    eventType: "model_control.changed",
    module: MODEL_CONTROL_MODULE,
    entityType: "setting",
    entityId: "model_roles",
    actor,
    metadata: { requested: input, applied: applied.length, failed: failed.length, roles: applied.map((a) => `${a.role}=${a.model}`) },
  });

  return { applied, warnings: downgradeWarnings(applied, cheapModels), failed };
}

/** Roles that exist in code but have never been given an explicit model. */
export async function unsetRoles(): Promise<string[]> {
  const roleMap = await getModelRoleMap();
  return MODEL_ROLE_CATALOG.filter((r) => !roleMap[r.role]).map((r) => r.role);
}

export { ROLE_BY_NAME };
