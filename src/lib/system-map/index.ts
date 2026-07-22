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

/**
 * Live BUSINESS state — the actual commercial situation, not the OS's own capability map.
 *
 * Without this, Ask WOBBLE knew every agent it had but could not answer "which deals are closest to
 * closing?" — it replied that the detail was "not available in the live system state" while open deals
 * sat in the CRM. A founder's most common questions are about their business, so the business belongs
 * in the snapshot.
 */
export interface BusinessSummary {
  openDeals: { count: number; totalCents: number; byStage: Record<string, number>; top: Array<{ name: string; stage: string; valueCents: number }> };
  wonDeals: { count: number; totalCents: number };
  leads: { open: number; topScored: Array<{ name: string; score: number; status: string }> };
  invoices: { overdue: number; overdueCents: number; outstandingCents: number };
  proposals: { open: number; byStatus: Record<string, number> };
}

export interface SystemSnapshot {
  agents: { total: number; active: number; byTeam: Record<string, number>; list: AgentSummary[] };
  modules: { total: number; wired: number; planned: number; backendReady: number; list: ModuleSummary[] };
  approvals: { pending: number; byType: Record<string, number> };
  models: { roles: ModelRoleMap; catalogCount: number; catalog: ModelCatalog };
  /** Live inter-agent handoff backbone: how many handoffs sit in each delivery state right now. */
  handoffs: Record<string, number>;
  /** Live commercial state. Undefined only when no DB is configured (tests / unconfigured deploy). */
  business?: BusinessSummary;
}

export interface SystemMapDeps {
  listAgents?: () => Promise<AgentSummary[]>;
  countPendingApprovalsByType?: () => Promise<Record<string, number>>;
  getModelRoleMap?: () => Promise<ModelRoleMap>;
  getModelCatalog?: () => Promise<ModelCatalog>;
  getHandoffCounts?: () => Promise<Record<string, number>>;
  getBusinessSummary?: () => Promise<BusinessSummary | undefined>;
  modules?: ModuleSummary[];
}

/**
 * Assemble live commercial state from the CRM/finance/proposal stores. DB-gated and best-effort: any
 * failure degrades to `undefined` (Ask then answers without it) rather than breaking the whole snapshot.
 */
async function defaultBusinessSummary(): Promise<BusinessSummary | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  try {
    const [{ listOpportunities, listLeads }, { listInvoices }, { listProposals }] = await Promise.all([
      import("@/lib/crm"), import("@/lib/finance"), import("@/lib/proposals"),
    ]);
    const [opps, leads, invoices, proposals] = await Promise.all([
      listOpportunities({ limit: 500 }), listLeads({ limit: 300 }), listInvoices({ limit: 500 }), listProposals({ limit: 300 }),
    ]);
    const open = opps.filter((o) => o.status === "open");
    const byStage: Record<string, number> = {};
    for (const o of open) byStage[o.stage] = (byStage[o.stage] ?? 0) + 1;
    const won = opps.filter((o) => o.status === "won");
    const now = Date.now();
    const overdue = invoices.filter((i) => ["sent", "viewed", "partially_paid", "overdue"].includes(i.status) && i.dueDate != null && i.dueDate.getTime() < now && i.totalCents - i.amountPaidCents > 0);
    const outstanding = invoices.filter((i) => !["paid", "cancelled", "draft"].includes(i.status));
    const propByStatus: Record<string, number> = {};
    for (const p of proposals) propByStatus[p.status] = (propByStatus[p.status] ?? 0) + 1;
    const openLeads = leads.filter((l) => l.status !== "converted");
    return {
      openDeals: {
        count: open.length,
        totalCents: open.reduce((s, o) => s + o.valueCents, 0),
        byStage,
        top: [...open].sort((a, b) => b.valueCents - a.valueCents).slice(0, 8).map((o) => ({ name: o.name, stage: o.stage, valueCents: o.valueCents })),
      },
      wonDeals: { count: won.length, totalCents: won.reduce((s, o) => s + o.valueCents, 0) },
      leads: { open: openLeads.length, topScored: [...openLeads].sort((a, b) => b.score - a.score).slice(0, 5).map((l) => ({ name: l.name, score: l.score, status: l.status })) },
      invoices: {
        overdue: overdue.length,
        overdueCents: overdue.reduce((s, i) => s + (i.totalCents - i.amountPaidCents), 0),
        outstandingCents: outstanding.reduce((s, i) => s + (i.totalCents - i.amountPaidCents), 0),
      },
      proposals: { open: proposals.filter((p) => ["sent", "viewed", "approved"].includes(p.status)).length, byStatus: propByStatus },
    };
  } catch (error) {
    console.error("business summary failed:", error instanceof Error ? error.message : error);
    return undefined;
  }
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

  const getBusiness = deps.getBusinessSummary ?? defaultBusinessSummary;

  const [agents, byType, roles, catalog, handoffs, business] = await Promise.all([listAgents(), countPending(), roleMapFn(), catalogFn(), getHandoffCounts(), getBusiness()]);

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
    business,
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

  // LIVE BUSINESS STATE first — it answers the questions founders actually ask ("what's closest to
  // closing?", "who owes us money?"). Ask used to have only the capability map and had to reply that
  // operational detail was unavailable while real deals sat in the CRM.
  const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const b = snapshot.business;
  const businessLines = b
    ? [
        `LIVE BUSINESS STATE (authoritative — read this before saying you lack operational detail):`,
        `  OPEN DEALS: ${b.openDeals.count} worth ${usd(b.openDeals.totalCents)}. By stage: ${Object.entries(b.openDeals.byStage).map(([s, n]) => `${s} ${n}`).join(", ") || "none"}.`,
        b.openDeals.top.length
          ? `  Largest open deals:\n${b.openDeals.top.map((d) => `    - ${d.name} — ${usd(d.valueCents)} [stage=${d.stage}]`).join("\n")}`
          : `  (no open deals)`,
        `  WON: ${b.wonDeals.count} deals worth ${usd(b.wonDeals.totalCents)}.`,
        `  LEADS AWAITING CONVERSION: ${b.leads.open}${b.leads.topScored.length ? ` — top: ${b.leads.topScored.map((l) => `${l.name} (score ${l.score})`).join(", ")}` : ""}.`,
        `  INVOICES: ${b.invoices.overdue} overdue (${usd(b.invoices.overdueCents)}); ${usd(b.invoices.outstandingCents)} outstanding overall.`,
        `  PROPOSALS: ${b.proposals.open} open. By status: ${Object.entries(b.proposals.byStatus).map(([s, n]) => `${s} ${n}`).join(", ") || "none"}.`,
      ]
    : [];

  return [
    ...businessLines,
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
