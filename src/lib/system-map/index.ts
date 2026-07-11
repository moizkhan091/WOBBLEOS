import { desc, eq, sql } from "drizzle-orm";
import { agents as agentsTable, approvals as approvalsTable } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { getModelCatalog, getModelRoleMap } from "@/lib/model-registry";
import { MODULES } from "@/lib/os/modules";
import type { ModelCatalog } from "@/lib/domain/model-registry";
import type { ModelRoleMap } from "@/lib/domain/providers";

/**
 * System Map — a live, structured snapshot of the whole OS that Ask WOBBLE (and any
 * orchestrator) reads so it genuinely "knows everything": every agent, every module,
 * what is waiting on approval, and what model each role uses. Read-only + injectable,
 * so it is testable without a DB and cheap to assemble into a prompt.
 */

export interface AgentSummary {
  slug: string;
  name: string;
  module: string;
  team: string | null;
  status: string;
  purpose: string;
}

export interface ModuleSummary {
  id: string;
  label: string;
  status: string;
}

export interface SystemSnapshot {
  agents: { total: number; active: number; byTeam: Record<string, number>; list: AgentSummary[] };
  modules: { total: number; wired: number; planned: number; backendReady: number; list: ModuleSummary[] };
  approvals: { pending: number; byType: Record<string, number> };
  models: { roles: ModelRoleMap; catalogCount: number; catalog: ModelCatalog };
  /** Live inter-agent handoff backbone: how many handoffs sit in each delivery state right now. */
  handoffs: Record<string, number>;
}

export interface SystemMapDeps {
  listAgents?: () => Promise<AgentSummary[]>;
  countPendingApprovalsByType?: () => Promise<Record<string, number>>;
  getModelRoleMap?: () => Promise<ModelRoleMap>;
  getModelCatalog?: () => Promise<ModelCatalog>;
  getHandoffCounts?: () => Promise<Record<string, number>>;
  modules?: ModuleSummary[];
}

function defaultModules(): ModuleSummary[] {
  return Object.values(MODULES).map((m) => ({ id: m.id, label: m.label, status: m.status }));
}

export async function getSystemSnapshot(deps: SystemMapDeps = {}): Promise<SystemSnapshot> {
  const listAgents = deps.listAgents ?? defaultListAgents;
  const countPending = deps.countPendingApprovalsByType ?? defaultCountPendingApprovalsByType;
  const roleMapFn = deps.getModelRoleMap ?? (() => getModelRoleMap());
  const catalogFn = deps.getModelCatalog ?? (() => getModelCatalog());
  const modules = deps.modules ?? defaultModules();
  // Env-gated default so this stays DB-free in tests that don't inject the dep.
  const getHandoffCounts = deps.getHandoffCounts ?? (async () => (process.env.DATABASE_URL ? (await import("@/lib/handoff")).handoffStateCounts() : {}));

  const [agents, byType, roles, catalog, handoffs] = await Promise.all([listAgents(), countPending(), roleMapFn(), catalogFn(), getHandoffCounts()]);

  const byTeam: Record<string, number> = {};
  let active = 0;
  for (const agent of agents) {
    if (agent.status === "active") active += 1;
    const team = agent.team ?? "unassigned";
    byTeam[team] = (byTeam[team] ?? 0) + 1;
  }

  const pending = Object.values(byType).reduce((sum, n) => sum + n, 0);

  return {
    agents: { total: agents.length, active, byTeam, list: agents },
    modules: {
      total: modules.length,
      wired: modules.filter((m) => m.status === "wired").length,
      planned: modules.filter((m) => m.status === "planned").length,
      backendReady: modules.filter((m) => m.status === "backend-ready").length,
      list: modules,
    },
    approvals: { pending, byType },
    models: { roles, catalogCount: catalog.length, catalog },
    handoffs,
  };
}

/** Compact, authoritative text block describing live OS state, for the Ask WOBBLE prompt. */
export function formatSystemSnapshot(snapshot: SystemSnapshot, opts: { maxAgents?: number } = {}): string {
  const maxAgents = opts.maxAgents ?? 60;
  const teamStr = Object.entries(snapshot.agents.byTeam)
    .map(([team, n]) => `${team} ${n}`)
    .join(", ");
  const agentLines = snapshot.agents.list
    .slice(0, maxAgents)
    .map((a) => `  - ${a.slug} (${a.name}) [module=${a.module}, team=${a.team ?? "-"}, ${a.status}]: ${a.purpose}`)
    .join("\n");
  const overflow = snapshot.agents.list.length > maxAgents ? `\n  …and ${snapshot.agents.list.length - maxAgents} more` : "";

  const approvalStr = snapshot.approvals.pending
    ? Object.entries(snapshot.approvals.byType)
        .map(([type, n]) => `${type} ${n}`)
        .join(", ")
    : "none";

  const roleStr = Object.entries(snapshot.models.roles)
    .map(([role, cfg]) => `${role}=${cfg.model}`)
    .join(", ");

  const moduleWired = snapshot.modules.list
    .filter((m) => m.status === "wired")
    .map((m) => m.id)
    .join(", ");

  const handoffStr = Object.keys(snapshot.handoffs).length
    ? Object.entries(snapshot.handoffs).map(([state, n]) => `${state} ${n}`).join(", ")
    : "none";

  return [
    `AGENTS: ${snapshot.agents.total} total (${snapshot.agents.active} active). By team: ${teamStr}.`,
    `${agentLines}${overflow}`,
    `MODULES: ${snapshot.modules.total} total — ${snapshot.modules.wired} wired, ${snapshot.modules.backendReady} backend-ready, ${snapshot.modules.planned} planned. Wired: ${moduleWired}.`,
    `APPROVALS PENDING: ${snapshot.approvals.pending} (${approvalStr}).`,
    `INTER-AGENT HANDOFFS (live backbone): ${handoffStr}.`,
    `MODEL ROLES: ${roleStr}. Model catalog: ${snapshot.models.catalogCount} models.`,
  ].join("\n");
}

async function defaultListAgents(db: Db = getDb()): Promise<AgentSummary[]> {
  const rows = await db
    .select({
      slug: agentsTable.slug,
      name: agentsTable.name,
      module: agentsTable.module,
      team: agentsTable.team,
      status: agentsTable.status,
      purpose: agentsTable.purpose,
    })
    .from(agentsTable)
    .orderBy(agentsTable.team, agentsTable.slug);
  return rows.map((r) => ({ ...r, purpose: truncate(r.purpose, 140) }));
}

async function defaultCountPendingApprovalsByType(db: Db = getDb()): Promise<Record<string, number>> {
  const rows = await db
    .select({ approvalType: approvalsTable.approvalType, count: sql<number>`count(*)::int` })
    .from(approvalsTable)
    .where(eq(approvalsTable.status, "pending"))
    .groupBy(approvalsTable.approvalType)
    .orderBy(desc(sql`count(*)`));
  const out: Record<string, number> = {};
  for (const row of rows) out[row.approvalType] = Number(row.count);
  return out;
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
