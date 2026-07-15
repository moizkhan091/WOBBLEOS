import { eq, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { handoffs as handoffsTable, departments as departmentsTable, departmentMembers as departmentMembersTable } from "@/db/schema";
import type { HandoffRow } from "@/lib/domain/handoff-delivery";

/**
 * Department roll-up + detail (Phase 3). The department is a first-class operating unit — its identity,
 * status, health, products and team come from the REGISTRY (departments + department_members), NOT a
 * free-text `team` label. This overlays the registry with the live inter-agent handoff backbone (what
 * each department's agents are doing right now — in-flight / completed / stuck work, spend, quality).
 * Read-only + injectable, so the shaping is pure and unit-testable; DB queries are single-table GROUP BYs.
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

/** One row of the membership aggregate (GROUP BY department_slug over department_members). */
export interface MemberAggRow {
  department: string;
  total: number;
  active: number;
}

/** The registry facts for a department (identity + truthful status/health + products). */
export interface RegisteredDepartment {
  slug: string;
  name: string;
  status: string;
  healthStatus: string;
  purpose: string;
  /** agent_team | human_control_plane — the UI must not render "team 0/0" for a control plane. */
  operatingModel: string;
  orchestratorAgentSlug: string | null;
  outboundProducts: string[];
  downstreamConsumers: string[];
}

export interface DepartmentRollup {
  department: string;
  /** Registry identity — null only for a department seen in handoff activity but not (yet) registered. */
  name: string | null;
  status: string | null;
  healthStatus: string | null;
  /**
   * agent_team | human_control_plane (null for an unregistered department). The UI needs this to avoid
   * rendering "team 0/0" for a control plane whose team is the founders.
   */
  operatingModel: string | null;
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
  /** Registered members (specialist agents + services) for this department. */
  members: { total: number; active: number };
  lastActivityAt: Date | null;
}

/** One member of a department's team (from department_members — the authoritative roster). */
export interface DepartmentMemberSummary {
  memberRef: string;
  memberType: string;
  role: string;
  responsibility: string;
  active: boolean;
  priority: number;
  capabilities: string[];
}

/** Drill-down for one department: registry facts + its team + its most recent inter-agent handoffs. */
export interface DepartmentDetail {
  department: string;
  registry: RegisteredDepartment | null;
  members: DepartmentMemberSummary[];
  recentHandoffs: HandoffRow[];
}

export interface DepartmentRollupStore {
  handoffAggByDepartment(): Promise<HandoffAggRow[]>;
  memberCountsByDepartment(): Promise<MemberAggRow[]>;
  registeredDepartments(): Promise<RegisteredDepartment[]>;
  getRegisteredDepartment(slug: string): Promise<RegisteredDepartment | null>;
  membersByDepartment(slug: string): Promise<DepartmentMemberSummary[]>;
}

export interface DepartmentDeps {
  store?: DepartmentRollupStore;
  /** Recent handoffs for a department (env-gated default delegates to the handoff runtime). Injectable. */
  listRecentHandoffs?: (department: string, limit: number) => Promise<HandoffRow[]>;
}

const IN_FLIGHT = new Set(["delivered", "processing", "acknowledged"]);
const STUCK = new Set(["dead_lettered", "failed"]);

/**
 * Pure shaping: registry ∪ live activity, keyed by department slug. Every REGISTERED department appears
 * (even with no activity yet); a department seen only in handoff activity also appears (name/status null).
 * Sorted by unhealthy-first (stuck), then most in-flight, then name — what needs attention surfaces first.
 */
export function shapeDepartmentRollups(handoffRows: HandoffAggRow[], memberRows: MemberAggRow[], registered: RegisteredDepartment[]): DepartmentRollup[] {
  const byDept = new Map<string, DepartmentRollup>();
  const ensure = (department: string): DepartmentRollup => {
    let d = byDept.get(department);
    if (!d) {
      d = { department, name: null, status: null, healthStatus: null, operatingModel: null, handoffs: { total: 0, byState: {}, inFlight: 0, completed: 0, stuck: 0 }, cost: { totalEstimate: 0 }, quality: { avg: null, samples: 0 }, members: { total: 0, active: 0 }, lastActivityAt: null };
      byDept.set(department, d);
    }
    return d;
  };

  for (const r of registered) {
    const d = ensure(r.slug);
    d.name = r.name;
    d.status = r.status;
    d.healthStatus = r.healthStatus;
    d.operatingModel = r.operatingModel;
  }

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

  for (const row of memberRows) {
    const d = ensure(row.department);
    d.members.total += row.total;
    d.members.active += row.active;
  }

  for (const [department, q] of qual) {
    const d = byDept.get(department)!;
    d.quality = { avg: q.n > 0 ? Math.round((q.sum / q.n) * 100) / 100 : null, samples: q.n };
  }

  return [...byDept.values()].sort((a, b) => b.handoffs.stuck - a.handoffs.stuck || b.handoffs.inFlight - a.handoffs.inFlight || a.department.localeCompare(b.department));
}

export async function getDepartmentRollups(deps: DepartmentDeps = {}): Promise<DepartmentRollup[]> {
  const store = deps.store ?? defaultStore();
  const [handoffRows, memberRows, registered] = await Promise.all([store.handoffAggByDepartment(), store.memberCountsByDepartment(), store.registeredDepartments()]);
  return shapeDepartmentRollups(handoffRows, memberRows, registered);
}

/** Drill into one department: its registry facts + its team (from department_members) + recent handoffs. */
export async function getDepartmentDetail(department: string, deps: DepartmentDeps = {}, limit = 25): Promise<DepartmentDetail> {
  const store = deps.store ?? defaultStore();
  const listRecent = deps.listRecentHandoffs ?? (async (dept: string, lim: number) => (process.env.DATABASE_URL ? (await import("@/lib/handoff")).listHandoffs({ department: dept, limit: lim }) : []));
  const [registry, members, recentHandoffs] = await Promise.all([
    store.getRegisteredDepartment(department),
    store.membersByDepartment(department),
    listRecent(department, Math.min(Math.max(limit, 1), 200)),
  ]);
  return { department, registry, members, recentHandoffs };
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
    async memberCountsByDepartment() {
      const rows = await db
        .select({
          department: departmentMembersTable.departmentSlug,
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${departmentMembersTable.active} = true)::int`,
        })
        .from(departmentMembersTable)
        .groupBy(departmentMembersTable.departmentSlug);
      return rows.map((r) => ({ department: r.department, total: Number(r.total), active: Number(r.active) }));
    },
    async registeredDepartments() {
      const rows = await db.select().from(departmentsTable).orderBy(departmentsTable.slug);
      return rows.map(toRegistered);
    },
    async getRegisteredDepartment(slug) {
      const rows = await db.select().from(departmentsTable).where(eq(departmentsTable.slug, slug)).limit(1);
      return rows[0] ? toRegistered(rows[0]) : null;
    },
    async membersByDepartment(slug) {
      const rows = await db.select().from(departmentMembersTable).where(eq(departmentMembersTable.departmentSlug, slug)).orderBy(departmentMembersTable.priority);
      return rows.map((r) => ({ memberRef: r.memberRef, memberType: r.memberType, role: r.role, responsibility: r.responsibility, active: r.active, priority: Number(r.priority), capabilities: (r.capabilities as string[]) ?? [] }));
    },
  };
}

function toRegistered(r: typeof departmentsTable.$inferSelect): RegisteredDepartment {
  const io = (r.io ?? {}) as { outboundProducts?: string[]; downstreamConsumers?: string[] };
  return {
    slug: r.slug,
    name: r.name,
    status: r.status,
    healthStatus: r.healthStatus,
    purpose: r.purpose,
    operatingModel: r.operatingModel,
    orchestratorAgentSlug: r.orchestratorAgentSlug ?? null,
    outboundProducts: io.outboundProducts ?? [],
    downstreamConsumers: io.downstreamConsumers ?? [],
  };
}
