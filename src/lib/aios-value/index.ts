// AIOS Value / KPI framework — service (Doctrine 9).
//
// Fetches the task inventory + org metrics for a scope through injectable providers and computes the
// evidence-tiered value snapshot. Ships with an in-memory task store so the whole framework is DB-free
// testable; the lead swaps `store` for a Drizzle-backed `task_inventory` store and wires `orgMetrics`
// to finance/HR without touching the domain math.
import {
  buildAiosValueSnapshot,
  buildTaskInventoryItem,
  type AiosOrgMetrics,
  type AiosValueScope,
  type AiosValueSnapshot,
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

// A module-level in-memory store is the default so the service is usable and DB-free out of the box.
// The lead replaces this with a Drizzle-backed store writing to `task_inventory` + `aios_value_snapshots`.
let _defaultStore: TaskInventoryStore | undefined;
function defaultStore(): TaskInventoryStore {
  if (!_defaultStore) _defaultStore = inMemoryTaskStore();
  return _defaultStore;
}
