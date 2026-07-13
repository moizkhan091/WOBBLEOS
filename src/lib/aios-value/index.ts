// AIOS Value / KPI framework — service (Doctrine 9).
//
// Fetches the task inventory + org metrics for a scope through injectable providers and computes the
// evidence-tiered value snapshot. Ships with an in-memory task store so the whole framework is DB-free
// testable; the lead swaps `store` for a Drizzle-backed `task_inventory` store and wires `orgMetrics`
// to finance/HR without touching the domain math.
import { and, eq } from "drizzle-orm";
import { taskInventory as taskInventoryTable } from "@/db/schema";
import { getDb, type Db } from "@/db";
import {
  buildAiosValueSnapshot,
  buildTaskInventoryItem,
  type AiosOrgMetrics,
  type AiosValueScope,
  type AiosValueSnapshot,
  type AutomationState,
  type ConfidenceLabel,
  type AiosEvidenceTier,
  type FrequencyPeriod,
  type TaskInventoryInput,
  type TaskInventoryItem,
} from "@/lib/domain/aios-value";

/** Persistence contract for the task/work inventory. In-memory by default; Drizzle-backed in prod. */
export interface TaskInventoryStore {
  upsertTask(item: TaskInventoryItem): Promise<void>;
  listTasks(scope: AiosValueScope): Promise<TaskInventoryItem[]>;
}

/** Supplies the org metrics the inventory can't: headcount, revenue, automation cost, founder rate. */
export type OrgMetricsProvider = (scope: AiosValueScope) => Promise<AiosOrgMetrics>;

export interface AiosValueDeps {
  store?: TaskInventoryStore;
  orgMetrics?: OrgMetricsProvider;
  now?: Date;
}

/** Org metrics with everything unknown — the honest default when finance/HR aren't wired yet. */
export function emptyOrgMetrics(founders: string[] = []): AiosOrgMetrics {
  return {
    headcount: null,
    revenueCents: null,
    revenuePeriodMonths: 1,
    revenueEvidenceTier: null,
    automationCostCentsPerMonth: null,
    automationCostEvidenceTier: null,
    founderHourlyRateCents: null,
    founderHourlyRateEvidenceTier: null,
    founders,
  };
}

/** The canonical set of REVERSED/VOID invoice statuses whose money must NOT count as collected revenue — mirrors
 *  `revenueSummary` in domain/finance.ts (the single source of truth for what "collected revenue" means). */
const VOID_INVOICE_STATUSES = new Set(["cancelled", "refunded", "written_off", "draft", "needs_approval"]);

/**
 * REAL org metrics from finance — REVENUE is a measured actual, computed from the PAYMENTS LEDGER (not the invoice
 * cache) so each payment is attributed to the period it was ACTUALLY received (fixes installment misattribution),
 * and only payments against NON-VOID invoices count (a cancelled/refunded/written-off invoice's money is NEVER
 * reported as revenue — consistent with domain/finance.ts). Revenue = sum of payment amounts received in the period
 * (1 month = MRR), tier `verified-financial`. If NO non-void payment has EVER been received, revenue stays null
 * (no financial actual yet — never a fabricated 0). Headcount = the founder team so revenue/employee is computable;
 * automation cost + founder rate stay honestly null (HR/config not wired). `listInvoices`/`listPayments` injectable.
 */
export function makeFinanceOrgMetrics(deps: { listInvoices?: (q: { limit?: number }) => Promise<Array<{ id: string; companyId: string | null; status: string }>>; listPayments?: () => Promise<Array<{ invoiceId: string; amountCents: number; createdAt: Date }>>; now?: Date; periodMonths?: number; founders?: string[] } = {}): OrgMetricsProvider {
  return async (scope: AiosValueScope): Promise<AiosOrgMetrics> => {
    const listInvoices = deps.listInvoices ?? (async (q) => (await import("@/lib/finance")).listInvoices(q));
    const listPayments = deps.listPayments ?? (async () => {
      const { payments } = await import("@/db/schema");
      return (await getDb().select({ invoiceId: payments.invoiceId, amountCents: payments.amountCents, createdAt: payments.createdAt }).from(payments)) as Array<{ invoiceId: string; amountCents: number; createdAt: Date }>;
    });
    const [invoices, payments] = await Promise.all([listInvoices({ limit: 5000 }), listPayments()]);
    const periodMonths = deps.periodMonths ?? 1;
    const since = new Date((deps.now ?? new Date()).getTime() - periodMonths * 30 * 86_400_000);
    // In-scope, NON-VOID invoices only (a payment against a void invoice is not collected revenue).
    const eligible = new Map(invoices.filter((inv) => !VOID_INVOICE_STATUSES.has(inv.status) && (scope.type !== "client" || inv.companyId === scope.id)).map((inv) => [inv.id, inv]));
    const eligiblePayments = payments.filter((p) => eligible.has(p.invoiceId));
    const everPaid = eligiblePayments.length > 0;
    const revenueCents = everPaid
      ? eligiblePayments.filter((p) => p.createdAt.getTime() >= since.getTime()).reduce((s, p) => s + Math.max(0, p.amountCents), 0)
      : null;
    const founders = deps.founders ?? [];
    return {
      ...emptyOrgMetrics(founders),
      headcount: founders.length > 0 ? founders.length : null, // the team = the founders; null (not 0) when unknown
      revenueCents,
      revenuePeriodMonths: periodMonths,
      revenueEvidenceTier: (revenueCents !== null ? "verified-financial" : null) as AiosEvidenceTier | null,
    };
  };
}

/** A simple in-memory task inventory store — used in tests and as the default until the DB store is wired. */
export function inMemoryTaskStore(seed: TaskInventoryItem[] = []): TaskInventoryStore {
  const rows = new Map<string, TaskInventoryItem>(seed.map((r) => [r.id, r]));
  const inScope = (item: TaskInventoryItem, scope: AiosValueScope): boolean => {
    if (scope.type === "company") return true;
    if (scope.type === "department") return item.department === scope.id;
    // client/project scoping travels on metadata the lead sets when ingesting the inventory.
    if (scope.type === "client") return item.metadata.clientId === scope.id;
    if (scope.type === "project") return item.metadata.projectId === scope.id;
    return false;
  };
  return {
    async upsertTask(item) {
      rows.set(item.id, item);
    },
    async listTasks(scope) {
      return [...rows.values()].filter((r) => inScope(r, scope));
    },
  };
}

/** Add a task to the inventory (validated) via the store. Returns the built row. */
export async function addTaskToInventory(input: TaskInventoryInput, deps: AiosValueDeps = {}): Promise<TaskInventoryItem> {
  const store = deps.store ?? defaultStore();
  const item = buildTaskInventoryItem(input);
  await store.upsertTask(item);
  return item;
}

/** Compute the AIOS value snapshot for a scope from the wired inventory + org metrics. */
export async function getAiosValueSnapshot(scope: AiosValueScope, deps: AiosValueDeps = {}): Promise<AiosValueSnapshot> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const tasks = await store.listTasks(scope);
  const org = deps.orgMetrics ? await deps.orgMetrics(scope) : emptyOrgMetrics();
  return buildAiosValueSnapshot(scope, { tasks, org }, { now });
}

// ---------------------------------------------------------------- Drizzle-backed store (task_inventory)

/** Revive a persisted row into the domain item (numeric strings → numbers, jsonb frequency/metadata). */
function rowToItem(row: typeof taskInventoryTable.$inferSelect): TaskInventoryItem {
  return {
    id: row.id,
    task: row.task,
    owner: row.owner,
    department: row.department,
    frequency: { per: row.frequency.per as FrequencyPeriod, count: Number(row.frequency.count) },
    baselineMinutes: Number(row.baselineMinutes),
    currentMinutes: Number(row.currentMinutes),
    automationState: row.automationState as AutomationState,
    humanReviewMinutes: Number(row.humanReviewMinutes),
    evidenceSource: row.evidenceSource as AiosEvidenceTier,
    confidence: row.confidence as ConfidenceLabel,
    completedCount: row.completedCount,
    metadata: row.metadata,
  };
}

/** DB-backed task inventory. clientId/projectId are denormalized from metadata for scope queries; upsert is
 *  idempotent on the item id so re-ingesting the same inventory item overwrites rather than duplicating. */
export function createDbTaskInventoryStore(db: Db = getDb()): TaskInventoryStore {
  return {
    async upsertTask(item) {
      const values = {
        id: item.id, task: item.task, owner: item.owner, department: item.department,
        frequency: item.frequency as never, baselineMinutes: String(item.baselineMinutes), currentMinutes: String(item.currentMinutes),
        automationState: item.automationState, humanReviewMinutes: String(item.humanReviewMinutes),
        evidenceSource: item.evidenceSource, confidence: item.confidence, completedCount: item.completedCount,
        clientId: (item.metadata.clientId as string | undefined) ?? null, projectId: (item.metadata.projectId as string | undefined) ?? null,
        metadata: item.metadata as never, updatedAt: new Date(),
      };
      await db.insert(taskInventoryTable).values(values as never).onConflictDoUpdate({ target: taskInventoryTable.id, set: values as never });
    },
    async listTasks(scope) {
      const base = db.select().from(taskInventoryTable);
      const rows = scope.type === "company" || !scope.id
        ? await base
        : scope.type === "department"
          ? await base.where(eq(taskInventoryTable.department, scope.id))
          : scope.type === "client"
            ? await base.where(eq(taskInventoryTable.clientId, scope.id))
            : await base.where(and(eq(taskInventoryTable.projectId, scope.id)));
      return rows.map(rowToItem);
    },
  };
}

// A module-level store is the default: DB-backed when DATABASE_URL is configured (real persistence to
// `task_inventory`), else in-memory so pure/domain tests never touch a DB.
let _defaultStore: TaskInventoryStore | undefined;
function defaultStore(): TaskInventoryStore {
  if (!_defaultStore) _defaultStore = process.env.DATABASE_URL ? createDbTaskInventoryStore() : inMemoryTaskStore();
  return _defaultStore;
}
