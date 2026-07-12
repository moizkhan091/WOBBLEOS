import { sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { handoffs as handoffsTable, agents as agentsTable } from "@/db/schema";

/**
 * Department roll-up (Phase 3 — real departments). WOBBLE OS is a team of agents per module; this makes
 * each DEPARTMENT a first-class, observable unit. It aggregates the live inter-agent handoff backbone
 * (what each department's agents are doing right now — in-flight / completed / failed work, spend,
 * quality) plus the registered agent team behind it. Read-only + injectable, so the shaping is pure and
 * unit-testable, and the DB queries are single-table GROUP BYs (no brittle joins).
 */

/** One row of the handoff aggregate (GROUP BY department, delivery_state). */
export interface HandoffAggRow {
  department: string;
  deliveryState: string;
  n: number;
  costSum: number;
  qualitySum: number;
  qualityN: number;
  lastAt: Date | null;
}

/** One row of the agent-registry aggregate (GROUP BY team). */
export interface AgentAggRow {
  team: string;
  total: number;
  active: number;
}

export interface DepartmentRollup {
  department: string;
  handoffs: {
    total: number;
    byState: Record<string, number>;
    /** delivered + processing + acknowledged — work the department's agents are actively moving. */
    inFlight: number;
    completed: number;
    /** dead-lettered + failed — needs founder attention (redrive/cancel in the Command Centre). */
    stuck: number;
  };
  cost: { totalEstimate: number };
  quality: { avg: number | null; samples: number };
  agents: { total: number; active: number };
  lastActivityAt: Date | null;
}

export interface DepartmentRollupStore {
  handoffAggByDepartment(): Promise<HandoffAggRow[]>;
  agentCountsByTeam(): Promise<AgentAggRow[]>;
}

export interface DepartmentDeps {
  store?: DepartmentRollupStore;
}

const IN_FLIGHT = new Set(["delivered", "processing", "acknowledged"]);
const STUCK = new Set(["dead_lettered", "failed"]);

/** Pure shaping: merge the two department-keyed aggregates into per-department roll-ups (sorted by
 *  most stuck, then most in-flight, then name — so the founder sees what needs attention first). */
export function shapeDepartmentRollups(handoffRows: HandoffAggRow[], agentRows: AgentAggRow[]): DepartmentRollup[] {
  const byDept = new Map<string, DepartmentRollup>();
  const ensure = (department: string): DepartmentRollup => {
    let d = byDept.get(department);
    if (!d) {
      d = { department, handoffs: { total: 0, byState: {}, inFlight: 0, completed: 0, stuck: 0 }, cost: { totalEstimate: 0 }, quality: { avg: null, samples: 0 }, agents: { total: 0, active: 0 }, lastActivityAt: null };
      byDept.set(department, d);
    }
    return d;
  };

  // Accumulate quality as sum/count to compute a weighted average across states.
  const qual = new Map<string, { sum: number; n: number }>();

  for (const row of handoffRows) {
    const d = ensure(row.department);
    d.handoffs.total += row.n;
    d.handoffs.byState[row.deliveryState] = (d.handoffs.byState[row.deliveryState] ?? 0) + row.n;
    if (IN_FLIGHT.has(row.deliveryState)) d.handoffs.inFlight += row.n;
    if (row.deliveryState === "completed") d.handoffs.completed += row.n;
    if (STUCK.has(row.deliveryState)) d.handoffs.stuck += row.n;
    d.cost.totalEstimate += row.costSum;
    const q = qual.get(row.department) ?? { sum: 0, n: 0 };
    q.sum += row.qualitySum;
    q.n += row.qualityN;
    qual.set(row.department, q);
    if (row.lastAt && (!d.lastActivityAt || row.lastAt.getTime() > d.lastActivityAt.getTime())) d.lastActivityAt = row.lastAt;
  }

  for (const row of agentRows) {
    const d = ensure(row.team);
    d.agents.total += row.total;
    d.agents.active += row.active;
  }

  for (const [department, q] of qual) {
    const d = byDept.get(department)!;
    d.quality = { avg: q.n > 0 ? Math.round((q.sum / q.n) * 100) / 100 : null, samples: q.n };
  }

  return [...byDept.values()].sort((a, b) => b.handoffs.stuck - a.handoffs.stuck || b.handoffs.inFlight - a.handoffs.inFlight || a.department.localeCompare(b.department));
}

export async function getDepartmentRollups(deps: DepartmentDeps = {}): Promise<DepartmentRollup[]> {
  const store = deps.store ?? defaultStore();
  const [handoffRows, agentRows] = await Promise.all([store.handoffAggByDepartment(), store.agentCountsByTeam()]);
  return shapeDepartmentRollups(handoffRows, agentRows);
}

export function defaultStore(db: Db = getDb()): DepartmentRollupStore {
  return {
    async handoffAggByDepartment() {
      const rows = await db
        .select({
          department: handoffsTable.department,
          deliveryState: handoffsTable.deliveryState,
          n: sql<number>`count(*)::int`,
          costSum: sql<number>`coalesce(sum(${handoffsTable.costEstimate}), 0)::float`,
          qualitySum: sql<number>`coalesce(sum(${handoffsTable.qualityScore}), 0)::float`,
          qualityN: sql<number>`count(${handoffsTable.qualityScore})::int`,
          lastAt: sql<Date | null>`max(${handoffsTable.updatedAt})`,
        })
        .from(handoffsTable)
        .groupBy(handoffsTable.department, handoffsTable.deliveryState);
      return rows.map((r) => ({ ...r, n: Number(r.n), costSum: Number(r.costSum), qualitySum: Number(r.qualitySum), qualityN: Number(r.qualityN), lastAt: r.lastAt ? new Date(r.lastAt) : null }));
    },
    async agentCountsByTeam() {
      const rows = await db
        .select({
          team: agentsTable.team,
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${agentsTable.status} = 'active')::int`,
        })
        .from(agentsTable)
        .where(sql`${agentsTable.team} is not null`)
        .groupBy(agentsTable.team);
      return rows.filter((r): r is { team: string; total: number; active: number } => typeof r.team === "string").map((r) => ({ team: r.team, total: Number(r.total), active: Number(r.active) }));
    },
  };
}
