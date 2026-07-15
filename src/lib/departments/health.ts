import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { handoffs as handoffsTable, departmentMembers as departmentMembersTable, agents as agentsTable, approvals as approvalsTable } from "@/db/schema";
import type { DepartmentRow, DepartmentStatus, DepartmentHealthStatus, DepartmentOperatingModel } from "@/lib/domain/department";
import { enforceBudget } from "@/lib/departments/enforcement";
import { resolveServiceBindings } from "@/lib/departments/service-bindings";
import { getDepartment, listDepartments, setDepartmentHealth, type DepartmentRegistryDeps } from "@/lib/departments/registry";

/**
 * Department health (Phase 3, Batch 6). Health is TRUTHFUL — never "healthy because the record exists".
 * It is computed from real operational signals (orchestrator + team availability, handoff backlog /
 * dead-letters / failures / latency, budget state, blocked approvals, downstream delivery failures, and —
 * where wired — provider health / QA failure rate / stale knowledge / missing credentials) and mapped to
 * an honest status. The classifier is pure; the gatherer collects the signals from the live DB.
 */

export interface DepartmentHealthSignals {
  orchestratorRegistered: boolean;
  orchestratorActive: boolean;
  totalAgents: number;
  activeAgents: number;
  /** delivered + processing + acknowledged handoffs addressed to this department. */
  backlog: number;
  deadLettered: number;
  failed: number;
  avgLatencyMs: number | null;
  spendCents: number | null;
  overBudget: boolean;
  blockedApprovals: number;
  downstreamDeliveryFailures: number;
  // Optional signals — wired as the owning subsystems expose them; neutral when absent.
  providerHealthy?: boolean;
  qaFailureRate?: number | null;
  staleKnowledgeDays?: number | null;
  missingCredentials?: string[];
  /**
   * For a `service_department` (WOB-UAT-025): the real state of each declared backing service. This is
   * where a service department's health comes from — NOT `department_members`, which it legitimately
   * has none of. `unknown` is never treated as fine: if we cannot see a worker's heartbeat we have
   * learned nothing about it, and refusing to guess is the whole point of the version-parity precedent.
   */
  serviceBindings?: { kind: string; ref: string; required: boolean; state: "alive" | "missing" | "blocked" | "unknown"; detail?: string }[];
}

export interface HealthThresholds {
  backlogDegraded: number;
  backlogBlocked: number;
  qaFailureDegraded: number;
  staleKnowledgeDays: number;
}

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = { backlogDegraded: 10, backlogBlocked: 50, qaFailureDegraded: 0.3, staleKnowledgeDays: 30 };

export interface HealthResult {
  status: DepartmentHealthStatus;
  reasons: string[];
}

/**
 * Map real signals → a truthful health status (worst-cause wins). A non-active department is not
 * operational, so its health reflects that (archived → unavailable; draft/inactive → unknown).
 *
 * `operatingModel` decides which staffing signals even apply. For a `human_control_plane` the founders
 * ARE the team: no orchestrator and no agent members is the CORRECT configuration, so the staffing
 * checks below are skipped rather than reported as a misconfiguration. Every other signal (blocked
 * approvals, backlog, dead-letters, budget) still applies — a control plane can absolutely be blocked
 * or degraded, and that must still be told truthfully.
 */
export function computeDepartmentHealth(
  status: DepartmentStatus,
  signals: DepartmentHealthSignals,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
  operatingModel: DepartmentOperatingModel = "agent_team",
): HealthResult {
  const reasons: string[] = [];
  if (status !== "active") {
    return { status: status === "archived" ? "unavailable" : "unknown", reasons: [`department status is ${status} (not operational)`] };
  }

  const isAgentTeam = operatingModel === "agent_team";
  const isService = operatingModel === "service_department";
  const bindings = signals.serviceBindings ?? [];

  // misconfigured — the department can't function as declared.
  if (isAgentTeam && !signals.orchestratorRegistered) reasons.push("no orchestrator registered");
  if (isAgentTeam && signals.totalAgents === 0) reasons.push("no specialist team (0 members)");
  // A service department that names NO backing service is misconfigured, not healthy. "My capability is
  // real code" with no code named is exactly the unverifiable claim this operating model replaces —
  // without this, `service_department` would become a way to silence the staffing check and report
  // green forever, which is the WOB-UAT-022 mistake with a new label.
  if (isService && bindings.length === 0) reasons.push("service department declares no backing services");
  if (signals.missingCredentials?.length) reasons.push(`missing credentials: ${signals.missingCredentials.join(", ")}`);
  if (reasons.length) return { status: "misconfigured", reasons };

  // unavailable — declared correctly but nothing can run right now.
  if (signals.orchestratorRegistered && !signals.orchestratorActive) reasons.push("orchestrator agent is inactive");
  if (signals.totalAgents > 0 && signals.activeAgents === 0) reasons.push("all specialist agents are inactive");
  if (signals.providerHealthy === false) reasons.push("model provider is unhealthy");
  // A REQUIRED backing service that is gone (worker not heartbeating, job type unregistered) means the
  // capability cannot run at all — e.g. stop `worker-video` and Media Production is genuinely down.
  for (const b of bindings.filter((b) => b.required && b.state === "missing")) {
    reasons.push(`required ${b.kind} '${b.ref}' is not available${b.detail ? ` (${b.detail})` : ""}`);
  }
  if (reasons.length) return { status: "unavailable", reasons };

  // blocked — the capability is built and running, but an external dependency is truthfully absent.
  // Distinct from `unavailable` on purpose: "no FAL_KEY" is a credential the founder can add, not a
  // broken system, and Media Production already models exactly this at the job level.
  for (const b of bindings.filter((b) => b.required && b.state === "blocked")) {
    reasons.push(`${b.kind} '${b.ref}' is blocked${b.detail ? `: ${b.detail}` : ""}`);
  }
  if (reasons.length) return { status: "blocked", reasons };

  // over_budget — spend has exceeded a configured cap.
  if (signals.overBudget) return { status: "over_budget", reasons: ["spend exceeds the department budget"] };

  // failed — work is dying (dead-letters / downstream delivery failures).
  if (signals.deadLettered > 0) reasons.push(`${signals.deadLettered} dead-lettered handoff(s)`);
  if (signals.downstreamDeliveryFailures > 0) reasons.push(`${signals.downstreamDeliveryFailures} downstream delivery failure(s)`);
  if (reasons.length) return { status: "failed", reasons };

  // blocked — work can't proceed (blocked approvals / large backlog).
  if (signals.blockedApprovals > 0) reasons.push(`${signals.blockedApprovals} blocked approval(s)`);
  if (signals.backlog >= thresholds.backlogBlocked) reasons.push(`backlog ${signals.backlog} at/over block threshold ${thresholds.backlogBlocked}`);
  if (reasons.length) return { status: "blocked", reasons };

  // stale — the department's knowledge is old.
  if (signals.staleKnowledgeDays != null && signals.staleKnowledgeDays > thresholds.staleKnowledgeDays) {
    return { status: "stale", reasons: [`knowledge is ${signals.staleKnowledgeDays}d old (> ${thresholds.staleKnowledgeDays}d)`] };
  }

  // degraded — working but impaired.
  if (signals.failed > 0) reasons.push(`${signals.failed} failed handoff(s) retrying`);
  if (signals.qaFailureRate != null && signals.qaFailureRate > thresholds.qaFailureDegraded) reasons.push(`QA failure rate ${(signals.qaFailureRate * 100).toFixed(0)}%`);
  if (signals.backlog >= thresholds.backlogDegraded) reasons.push(`backlog ${signals.backlog} at/over degrade threshold ${thresholds.backlogDegraded}`);
  // An OPTIONAL binding that is gone impairs the department without stopping it.
  for (const b of bindings.filter((b) => !b.required && (b.state === "missing" || b.state === "blocked"))) {
    reasons.push(`optional ${b.kind} '${b.ref}' is ${b.state}`);
  }
  if (reasons.length) return { status: "degraded", reasons };

  // A binding we cannot SEE proves nothing about it, so we refuse to report health we have not earned.
  // Same rule the version-parity gate uses for a stale heartbeat: `unknown` is never silently "fine".
  // This is last so a real, nameable problem above always wins over "I couldn't check".
  const unknown = bindings.filter((b) => b.required && b.state === "unknown");
  if (unknown.length) return { status: "unknown", reasons: unknown.map((b) => `cannot verify ${b.kind} '${b.ref}' — no recent signal`) };

  return { status: "healthy", reasons: [] };
}

export interface DepartmentHealthDeps extends DepartmentRegistryDeps {
  /** Gather live signals for a department (DB default; injectable for tests). */
  loadSignals?: (department: DepartmentRow) => Promise<DepartmentHealthSignals>;
  thresholds?: HealthThresholds;
}

/** Compute + persist the truthful health for one department. Returns the result (persisted if changed). */
export async function refreshDepartmentHealth(slug: string, deps: DepartmentHealthDeps = {}): Promise<HealthResult | null> {
  const department = await getDepartment(slug, deps);
  if (!department) return null;
  const loadSignals = deps.loadSignals ?? ((d: DepartmentRow) => gatherSignals(d));
  const signals = await loadSignals(department);
  const result = computeDepartmentHealth(department.status, signals, deps.thresholds ?? DEFAULT_HEALTH_THRESHOLDS, department.operatingModel);
  await setDepartmentHealth(slug, result.status, deps);
  return result;
}

/** Refresh health for every registered department (the scheduler calls this). */
export async function refreshAllDepartmentHealth(deps: DepartmentHealthDeps = {}): Promise<Record<string, DepartmentHealthStatus>> {
  const departments = await listDepartments({}, deps);
  const out: Record<string, DepartmentHealthStatus> = {};
  for (const d of departments) {
    const r = await refreshDepartmentHealth(d.slug, deps);
    if (r) out[d.slug] = r.status;
  }
  return out;
}

/** DB signal gatherer: derive real health inputs from handoffs + members + agents + approvals + budget. */
export async function gatherSignals(department: DepartmentRow, db: Db = getDb()): Promise<DepartmentHealthSignals> {
  const [stateRows, memberRows, orchestratorRows, approvalRows] = await Promise.all([
    db
      .select({
        state: handoffsTable.deliveryState,
        n: sql<number>`count(*)::int`,
        latency: sql<number | null>`avg(${handoffsTable.latencyMs})`,
        cost: sql<number>`coalesce(sum(${handoffsTable.costEstimate}), 0)::float`,
      })
      .from(handoffsTable)
      .where(eq(handoffsTable.department, department.slug))
      .groupBy(handoffsTable.deliveryState),
    db
      .select({ total: sql<number>`count(*)::int`, active: sql<number>`count(*) filter (where ${departmentMembersTable.active} = true)::int` })
      .from(departmentMembersTable)
      .where(eq(departmentMembersTable.departmentSlug, department.slug)),
    department.orchestratorAgentSlug
      ? db.select({ status: agentsTable.status }).from(agentsTable).where(eq(agentsTable.slug, department.orchestratorAgentSlug)).limit(1)
      : Promise.resolve([] as { status: string }[]),
    department.governance.requiredApprovals.length
      ? db.select({ n: sql<number>`count(*)::int` }).from(approvalsTable).where(and(eq(approvalsTable.status, "pending"), inArray(approvalsTable.approvalType, department.governance.requiredApprovals)))
      : Promise.resolve([{ n: 0 }] as { n: number }[]),
  ]);

  const byState = new Map(stateRows.map((r) => [r.state as string, r]));
  const count = (s: string) => Number(byState.get(s)?.n ?? 0);
  const backlog = count("delivered") + count("processing") + count("acknowledged");
  const completedLatency = byState.get("completed")?.latency;
  const spendCents = stateRows.reduce((sum, r) => sum + Number(r.cost ?? 0), 0) * 100;

  const totalAgents = Number(memberRows[0]?.total ?? 0);
  const activeAgents = Number(memberRows[0]?.active ?? 0);
  const orchestratorActive = department.orchestratorAgentSlug ? orchestratorRows[0]?.status === "active" : false;

  const budgetDecision = enforceBudget(department.budget, { cents: spendCents });

  // Only resolved for a service department — for an agent team or a control plane the bindings list is
  // empty by design, and resolving it would just be work that proves nothing.
  const serviceBindings =
    department.operatingModel === "service_department" ? await resolveServiceBindings(department.serviceBindings) : undefined;

  return {
    orchestratorRegistered: !!department.orchestratorAgentSlug,
    orchestratorActive,
    totalAgents,
    activeAgents,
    backlog,
    deadLettered: count("dead_lettered"),
    failed: count("failed"),
    avgLatencyMs: completedLatency != null ? Number(completedLatency) : null,
    spendCents,
    overBudget: budgetDecision.overBudget,
    blockedApprovals: Number(approvalRows[0]?.n ?? 0),
    downstreamDeliveryFailures: count("dead_lettered"),
    serviceBindings,
  };
}
