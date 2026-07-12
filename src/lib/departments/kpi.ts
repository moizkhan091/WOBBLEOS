import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { handoffs as handoffsTable, escalations as escalationsTable, budgetReservations as budgetTable, approvals as approvalsTable } from "@/db/schema";
import { getDepartment, type DepartmentRegistryDeps } from "@/lib/departments/registry";
import type { DepartmentRow } from "@/lib/domain/department";

/**
 * Department KPIs (Phase 3). REAL metrics computed from runtime data (handoffs, escalations, budget
 * reservations, approvals) — not configured KPI names. Each value ships with its definition, calculation
 * period, source, current value, target (from the department config), trend, freshness and a confidence
 * that reflects the sample size. Where a metric has no data it is honestly `null` with confidence `none`.
 */

export type KpiTrend = "up" | "down" | "flat" | null;
export type KpiConfidence = "none" | "low" | "medium" | "high";

export interface DepartmentKpiValue {
  key: string;
  definition: string;
  period: string;
  source: string;
  value: number | null;
  unit: string;
  target: number | null;
  trend: KpiTrend;
  freshnessAt: Date | null;
  confidence: KpiConfidence;
}

/** A single handoff row projected to the fields KPIs need. */
export interface KpiHandoff {
  deliveryState: string;
  retryCount: number;
  latencyMs: number | null;
  costEstimate: number | null;
  qualityScore: number | null;
  createdAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
}

export interface KpiInputs {
  department: DepartmentRow;
  handoffs: KpiHandoff[];
  /** Settled budget reservations (for token use + settled cost). */
  settled: Array<{ actualCents: number | null; actualTokens: number | null }>;
  escalations: { open: number; stale: number };
  approvals: { approved: number; rejected: number };
  now: Date;
}

function confidenceFor(n: number): KpiConfidence {
  if (n === 0) return "none";
  if (n < 5) return "low";
  if (n < 25) return "medium";
  return "high";
}

/** Trend for a rate: compare the last half of the window to the prior half. */
function rateTrend(rows: KpiHandoff[], now: Date, predicate: (h: KpiHandoff) => boolean, windowMs = 30 * 24 * 60 * 60_000): KpiTrend {
  const mid = now.getTime() - windowMs / 2;
  const recent = rows.filter((h) => h.createdAt.getTime() >= mid);
  const prior = rows.filter((h) => h.createdAt.getTime() < mid);
  if (recent.length < 3 || prior.length < 3) return null;
  const rate = (rs: KpiHandoff[]) => rs.filter(predicate).length / rs.length;
  const diff = rate(recent) - rate(prior);
  return Math.abs(diff) < 0.05 ? "flat" : diff > 0 ? "up" : "down";
}

/**
 * Compute a department's KPIs from its runtime data. Pure — the caller supplies the fetched rows so this
 * is unit-testable. Targets come from the department's configured `kpis` (matched by key).
 */
export function computeDepartmentKpis(input: KpiInputs): DepartmentKpiValue[] {
  const { department, handoffs, settled, escalations, approvals, now } = input;
  const total = handoffs.length;
  const completed = handoffs.filter((h) => h.deliveryState === "completed");
  const failed = handoffs.filter((h) => h.deliveryState === "failed" || h.deliveryState === "dead_lettered");
  const deadLettered = handoffs.filter((h) => h.deliveryState === "dead_lettered");
  const withRetry = handoffs.filter((h) => h.retryCount > 0);
  const completedLatencies = completed.map((h) => h.latencyMs).filter((v): v is number => v !== null);
  const cycleTimes = completed.filter((h) => h.completedAt).map((h) => h.completedAt!.getTime() - h.createdAt.getTime());
  const settledCents = settled.reduce((s, r) => s + (r.actualCents ?? 0), 0);
  const settledTokens = settled.reduce((s, r) => s + (r.actualTokens ?? 0), 0);
  const qaScored = completed.filter((h) => h.qualityScore !== null);
  const qaPass = qaScored.filter((h) => (h.qualityScore ?? 0) >= 6);
  const freshnessAt = handoffs.length ? new Date(Math.max(...handoffs.map((h) => h.updatedAt.getTime()))) : null;

  const targetFor = (key: string): number | null => department.kpis.find((k) => k.key === key)?.target ?? null;
  const rate = (num: number, den: number): number | null => (den === 0 ? null : Math.round((num / den) * 1000) / 1000);
  const avg = (xs: number[]): number | null => (xs.length === 0 ? null : Math.round(xs.reduce((s, x) => s + x, 0) / xs.length));

  const conf = confidenceFor(total);
  const P = "last_30d";
  return [
    { key: "jobs_received", definition: "Handoffs addressed to the department", period: P, source: "handoffs", value: total, unit: "count", target: targetFor("jobs_received"), trend: null, freshnessAt, confidence: conf },
    { key: "products_completed", definition: "Handoffs that reached completed", period: P, source: "handoffs", value: completed.length, unit: "count", target: targetFor("products_completed"), trend: rateTrend(handoffs, now, (h) => h.deliveryState === "completed"), freshnessAt, confidence: conf },
    { key: "success_rate", definition: "completed / total", period: P, source: "handoffs", value: rate(completed.length, total), unit: "ratio", target: targetFor("success_rate"), trend: rateTrend(handoffs, now, (h) => h.deliveryState === "completed"), freshnessAt, confidence: conf },
    { key: "failure_rate", definition: "(failed + dead_lettered) / total", period: P, source: "handoffs", value: rate(failed.length, total), unit: "ratio", target: targetFor("failure_rate"), trend: rateTrend(handoffs, now, (h) => h.deliveryState === "failed" || h.deliveryState === "dead_lettered"), freshnessAt, confidence: conf },
    { key: "retry_rate", definition: "handoffs that retried / total", period: P, source: "handoffs", value: rate(withRetry.length, total), unit: "ratio", target: targetFor("retry_rate"), trend: null, freshnessAt, confidence: conf },
    { key: "dead_letter_rate", definition: "dead_lettered / total", period: P, source: "handoffs", value: rate(deadLettered.length, total), unit: "ratio", target: targetFor("dead_letter_rate"), trend: null, freshnessAt, confidence: conf },
    { key: "avg_completion_ms", definition: "Mean node latency of completed handoffs", period: P, source: "handoffs", value: avg(completedLatencies), unit: "ms", target: targetFor("avg_completion_ms"), trend: null, freshnessAt, confidence: confidenceFor(completedLatencies.length) },
    { key: "avg_cycle_ms", definition: "Mean created→completed time (queue + processing)", period: P, source: "handoffs", value: avg(cycleTimes), unit: "ms", target: targetFor("avg_cycle_ms"), trend: null, freshnessAt, confidence: confidenceFor(cycleTimes.length) },
    { key: "cost_per_product_cents", definition: "Settled spend / products completed", period: P, source: "budget_reservations", value: completed.length ? Math.round(settledCents / completed.length) : null, unit: "cents", target: targetFor("cost_per_product_cents"), trend: null, freshnessAt, confidence: confidenceFor(settled.length) },
    { key: "token_use", definition: "Settled tokens across the window", period: P, source: "budget_reservations", value: settled.length ? settledTokens : null, unit: "tokens", target: targetFor("token_use"), trend: null, freshnessAt, confidence: confidenceFor(settled.length) },
    { key: "qa_pass_rate", definition: "completed with quality≥6 / completed-with-quality (where QA exists)", period: P, source: "handoffs", value: rate(qaPass.length, qaScored.length), unit: "ratio", target: targetFor("qa_pass_rate"), trend: null, freshnessAt, confidence: confidenceFor(qaScored.length) },
    { key: "approval_rate", definition: "approved / (approved + rejected) for the dept's required approvals", period: P, source: "approvals", value: rate(approvals.approved, approvals.approved + approvals.rejected), unit: "ratio", target: targetFor("approval_rate"), trend: null, freshnessAt: null, confidence: confidenceFor(approvals.approved + approvals.rejected) },
    { key: "open_escalations", definition: "Open escalations blocking the department", period: "now", source: "escalations", value: escalations.open, unit: "count", target: targetFor("open_escalations"), trend: null, freshnessAt: null, confidence: escalations.open === 0 ? "high" : "high" },
    { key: "stale_work", definition: "Open stale_intelligence escalations", period: "now", source: "escalations", value: escalations.stale, unit: "count", target: targetFor("stale_work"), trend: null, freshnessAt: null, confidence: "high" },
  ];
}

export interface KpiDeps extends DepartmentRegistryDeps {
  now?: Date;
  windowMs?: number;
}

/** Fetch + compute a department's KPIs from live runtime data. */
export async function getDepartmentKpis(departmentSlug: string, deps: KpiDeps = {}, db: Db = getDb()): Promise<DepartmentKpiValue[] | null> {
  const department = await getDepartment(departmentSlug, deps);
  if (!department) return null;
  const now = deps.now ?? new Date();
  const since = new Date(now.getTime() - (deps.windowMs ?? 30 * 24 * 60 * 60_000));

  const [handoffRows, settledRows, escOpen, escStale, approvalRows] = await Promise.all([
    db.select({ deliveryState: handoffsTable.deliveryState, retryCount: handoffsTable.retryCount, latencyMs: handoffsTable.latencyMs, costEstimate: handoffsTable.costEstimate, qualityScore: handoffsTable.qualityScore, createdAt: handoffsTable.createdAt, completedAt: handoffsTable.completedAt, updatedAt: handoffsTable.updatedAt }).from(handoffsTable).where(and(eq(handoffsTable.department, departmentSlug), gte(handoffsTable.createdAt, since))),
    db.select({ actualCents: budgetTable.actualCents, actualTokens: budgetTable.actualTokens }).from(budgetTable).where(and(eq(budgetTable.departmentSlug, departmentSlug), eq(budgetTable.state, "settled"), gte(budgetTable.createdAt, since))),
    db.select({ n: sql<number>`count(*)::int` }).from(escalationsTable).where(and(eq(escalationsTable.departmentSlug, departmentSlug), eq(escalationsTable.status, "open"))),
    db.select({ n: sql<number>`count(*)::int` }).from(escalationsTable).where(and(eq(escalationsTable.departmentSlug, departmentSlug), eq(escalationsTable.status, "open"), eq(escalationsTable.reason, "stale_intelligence"))),
    department.governance.requiredApprovals.length
      ? db.select({ status: approvalsTable.status, n: sql<number>`count(*)::int` }).from(approvalsTable).where(and(inArray(approvalsTable.approvalType, department.governance.requiredApprovals), inArray(approvalsTable.status, ["approved", "rejected"]))).groupBy(approvalsTable.status)
      : Promise.resolve([] as { status: string; n: number }[]),
  ]);

  const handoffs: KpiHandoff[] = handoffRows.map((r) => ({ deliveryState: r.deliveryState, retryCount: Number(r.retryCount ?? 0), latencyMs: r.latencyMs ?? null, costEstimate: r.costEstimate === null ? null : Number(r.costEstimate), qualityScore: r.qualityScore === null ? null : Number(r.qualityScore), createdAt: r.createdAt, completedAt: r.completedAt ?? null, updatedAt: r.updatedAt }));
  const approvals = { approved: Number(approvalRows.find((a) => a.status === "approved")?.n ?? 0), rejected: Number(approvalRows.find((a) => a.status === "rejected")?.n ?? 0) };
  return computeDepartmentKpis({ department, handoffs, settled: settledRows.map((r) => ({ actualCents: r.actualCents ?? null, actualTokens: r.actualTokens ?? null })), escalations: { open: Number(escOpen[0]?.n ?? 0), stale: Number(escStale[0]?.n ?? 0) }, approvals, now });
}
