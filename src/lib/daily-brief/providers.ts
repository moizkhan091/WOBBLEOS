// Daily Founder Brief — REAL signal providers (Doctrine 8).
//
// Each provider reads an EXISTING WOBBLE store and normalizes current founder-relevant state into evidence-
// linked signal drafts. Providers never fabricate: every draft carries a real source id as its evidence link.
// A provider is scope-aware (company vs a specific department/client) and returns [] when it has nothing.
//
// Four providers are wired here (escalations, approvals-due, delivery-risks, finance-alerts) — the highest-
// priority founder signals with clear stores. The remaining categories (provider_health, kpi, crm_movement,
// intelligence) are honest coverage gaps until wired: the brief simply omits them (it degrades a category
// ONLY when its provider throws, never for an un-wired one).
import { listEscalations } from "@/lib/departments/escalation";
import { listApprovals } from "@/lib/approvals";
import { listProjects } from "@/lib/projects";
import { listInvoices } from "@/lib/finance";
import { getWorkersOverview } from "@/lib/workers/view";
import { listTasks } from "@/lib/tasks";
import { isOverdue } from "@/lib/domain/task";
import { listOpportunities } from "@/lib/crm";
import { listIntelligenceItems } from "@/lib/intelligence";
import type { BriefScope, BriefSignalDraft, ConfidenceLabel, SignalSeverity } from "@/lib/domain/daily-brief";
import type { SignalFetcher } from "@/lib/daily-brief";

const conf = (label: ConfidenceLabel, score: number) => ({ label, score });

/** Only the department/company distinction matters for these state stores; client/project scope → company-wide. */
function departmentFilter(scope: BriefScope): string | null {
  return scope.type === "department" ? scope.id ?? null : null;
}

/** Open escalations — the highest-priority founder signal (a real decision is blocked). */
export const escalationsProvider: SignalFetcher = async (scope) => {
  const dept = departmentFilter(scope);
  const rows = await listEscalations({ status: "open", limit: 100 });
  return rows
    .filter((e) => !dept || e.departmentSlug === dept)
    .map((e): BriefSignalDraft => ({
      category: "escalation",
      title: `Escalation: ${e.reason}`,
      summary: `${e.departmentSlug} is blocked and needs a decision: ${e.requiredDecision}`,
      severity: (["low", "medium", "high", "critical"].includes(e.severity) ? e.severity : "medium") as SignalSeverity,
      confidence: conf("high", 0.9),
      freshnessAt: e.createdAt,
      evidence: [{ kind: "escalation", ref: e.id, label: e.reason, href: `/command-centre?escalation=${e.id}` }],
      scope: { type: scope.type, id: scope.id ?? null, label: scope.label, cadence: scope.cadence },
      actionRequired: true,
      metadata: { departmentSlug: e.departmentSlug, workflowId: e.workflowId },
    }));
};

/** Approvals awaiting a founder decision — action-required by definition. */
export const approvalsDueProvider: SignalFetcher = async (scope) => {
  const rows = await listApprovals({ status: "pending", limit: 100 });
  return rows.map((a): BriefSignalDraft => ({
    category: "approval_due",
    title: `Approval due: ${a.approvalType}`,
    summary: `A ${a.riskLevel}-risk ${a.approvalType} on ${a.entityType} is awaiting your approval.`,
    severity: (a.riskLevel === "high" ? "high" : a.riskLevel === "low" ? "low" : "medium") as SignalSeverity,
    confidence: conf("high", 0.9),
    freshnessAt: a.createdAt,
    evidence: [{ kind: "approval", ref: a.id, label: `${a.approvalType} (${a.entityType})`, href: `/approvals?id=${a.id}` }],
    scope: { type: scope.type, id: scope.id ?? null, label: scope.label, cadence: scope.cadence },
    actionRequired: true,
    metadata: { entityType: a.entityType, entityId: a.entityId, riskLevel: a.riskLevel },
  }));
};

/** Delivery risks — projects that are off-track (status or a low computed health score). */
export const deliveryRisksProvider: SignalFetcher = async (scope) => {
  const companyId = scope.type === "client" ? scope.id ?? undefined : undefined;
  const rows = await listProjects({ companyId, limit: 300 });
  const AT_RISK_STATUSES = new Set(["at_risk", "paused", "cancelled", "waiting_on_client"]);
  return rows
    .filter((p) => AT_RISK_STATUSES.has(p.status) || p.healthScore < 50)
    .map((p): BriefSignalDraft => {
      const severity: SignalSeverity = p.status === "cancelled" || p.healthScore < 30 ? "high" : "medium";
      return {
        category: "delivery_risk",
        title: `Delivery at risk: ${p.name}`,
        summary: `Project "${p.name}" is ${p.status} with health ${p.healthScore}/100.`,
        severity,
        confidence: conf("high", 0.85),
        freshnessAt: p.updatedAt,
        evidence: [{ kind: "project", ref: p.id, label: p.name, href: `/projects?id=${p.id}` }],
        scope: { type: scope.type, id: scope.id ?? null, label: scope.label, cadence: scope.cadence },
        actionRequired: p.status === "at_risk",
        metadata: { status: p.status, healthScore: p.healthScore, companyId: p.companyId },
      };
    });
};

const UNPAID_INVOICE_STATUSES = new Set(["sent", "partial", "overdue", "approved"]);

/** Finance alerts — overdue invoices (unpaid past their due date). */
export const financeAlertsProvider: SignalFetcher = async (scope, ctx) => {
  const rows = await listInvoices({ limit: 300 });
  const now = ctx.now;
  return rows
    .filter((inv) => UNPAID_INVOICE_STATUSES.has(inv.status) && inv.dueDate !== null && inv.dueDate.getTime() < now.getTime() && inv.totalCents > inv.amountPaidCents)
    .filter((inv) => scope.type !== "client" || inv.companyId === scope.id)
    .map((inv): BriefSignalDraft => {
      const outstanding = inv.totalCents - inv.amountPaidCents;
      const daysOverdue = Math.floor((now.getTime() - inv.dueDate!.getTime()) / 86_400_000);
      return {
        category: "finance_alert",
        title: `Overdue invoice ${inv.invoiceNumber}`,
        summary: `${(outstanding / 100).toFixed(2)} ${inv.currency} outstanding, ${daysOverdue} day(s) past due.`,
        severity: (daysOverdue > 30 ? "high" : "medium") as SignalSeverity,
        confidence: conf("high", 0.95),
        freshnessAt: inv.dueDate,
        evidence: [{ kind: "invoice", ref: inv.id, label: inv.invoiceNumber, href: `/finance?invoice=${inv.id}` }],
        scope: { type: scope.type, id: scope.id ?? null, label: scope.label, cadence: scope.cadence },
        actionRequired: true,
        metadata: { outstandingCents: outstanding, daysOverdue, companyId: inv.companyId },
      };
    });
};

/** Provider health — worker heartbeats that have gone STALE (a background worker stopped reporting). Company-wide
 *  (workers aren't client/department-scoped), so scoped briefs skip it. Evidence: the stale worker heartbeat. */
export const providerHealthProvider: SignalFetcher = async (scope, ctx) => {
  if (scope.type === "client" || scope.type === "project" || scope.type === "department") return [];
  const overview = await getWorkersOverview({ now: ctx.now });
  return overview.workers
    .filter((w) => !w.live)
    .map((w): BriefSignalDraft => ({
      category: "provider_health",
      title: `Worker offline: ${w.workerName}`,
      summary: `The ${w.workerType} worker "${w.workerName}" has not reported in ${w.lastSeenSecondsAgo}s — background processing may be stalled.`,
      severity: (w.lastSeenSecondsAgo > 300 ? "high" : "medium") as SignalSeverity,
      confidence: conf("high", 0.9),
      freshnessAt: w.heartbeatAt,
      evidence: [{ kind: "worker", ref: w.id, label: w.workerName, href: `/workers?id=${w.id}` }],
      scope: { type: scope.type, id: scope.id ?? null, label: scope.label, cadence: scope.cadence },
      actionRequired: true,
      metadata: { workerType: w.workerType, lastSeenSecondsAgo: w.lastSeenSecondsAgo },
    }));
};

/** KPI — overdue tasks (work slipping past its due date). One aggregate signal with the overdue tasks as evidence. */
export const kpiProvider: SignalFetcher = async (scope, ctx) => {
  const companyId = scope.type === "client" ? scope.id ?? undefined : undefined;
  const rows = await listTasks({ companyId, limit: 500 });
  const overdue = rows.filter((t) => isOverdue(t, ctx.now));
  if (!overdue.length) return [];
  return [{
    category: "kpi",
    title: `${overdue.length} task${overdue.length === 1 ? "" : "s"} overdue`,
    summary: `${overdue.length} task${overdue.length === 1 ? " is" : "s are"} past due — work is slipping. Top: ${overdue.slice(0, 3).map((t) => t.title).join("; ")}`,
    severity: (overdue.length >= 5 ? "high" : "medium") as SignalSeverity,
    confidence: conf("high", 0.9),
    freshnessAt: ctx.now,
    evidence: overdue.slice(0, 8).map((t) => ({ kind: "task", ref: t.id, label: t.title, href: `/tasks?id=${t.id}` })),
    scope: { type: scope.type, id: scope.id ?? null, label: scope.label, cadence: scope.cadence },
    actionRequired: true,
    metadata: { overdueCount: overdue.length },
  }];
};

/** CRM movement — open opportunities whose next action is OVERDUE (a deal stalling). Evidence: the opportunity. */
export const crmMovementProvider: SignalFetcher = async (scope, ctx) => {
  const rows = await listOpportunities({ status: "open", limit: 500 });
  return rows
    .filter((o) => o.nextActionAt !== null && o.nextActionAt.getTime() < ctx.now.getTime())
    .filter((o) => scope.type !== "client" || o.companyId === scope.id)
    .map((o): BriefSignalDraft => {
      const daysStalled = Math.floor((ctx.now.getTime() - o.nextActionAt!.getTime()) / 86_400_000);
      return {
        category: "crm_movement",
        title: `Deal stalling: ${o.name}`,
        summary: `"${o.name}" (${o.stage}, ${(o.valueCents / 100).toFixed(0)} ${o.currency}) has an overdue next action — ${daysStalled} day(s) stalled.`,
        severity: (daysStalled > 7 ? "high" : "medium") as SignalSeverity,
        confidence: conf("high", 0.85),
        freshnessAt: o.nextActionAt,
        evidence: [{ kind: "opportunity", ref: o.id, label: o.name, href: `/crm?opportunity=${o.id}` }],
        scope: { type: scope.type, id: scope.id ?? null, label: scope.label, cadence: scope.cadence },
        actionRequired: true,
        metadata: { stage: o.stage, valueCents: o.valueCents, daysStalled, companyId: o.companyId },
      };
    });
};

/** Intelligence — validated findings awaiting the founder's review (pending approval). One aggregate signal. */
export const intelligenceProvider: SignalFetcher = async (scope) => {
  const clientId = scope.type === "client" ? scope.id ?? undefined : undefined;
  const rows = await listIntelligenceItems({ approvalStatus: "pending", clientId, limit: 100 });
  if (!rows.length) return [];
  return [{
    category: "intelligence",
    title: `${rows.length} intelligence item${rows.length === 1 ? "" : "s"} awaiting review`,
    summary: `${rows.length} validated finding${rows.length === 1 ? " is" : "s are"} pending your review before they influence memory. Top: ${rows.slice(0, 3).map((r) => r.title).join("; ")}`,
    severity: "medium" as SignalSeverity,
    confidence: conf("high", 0.85),
    freshnessAt: rows[0].collectedAt,
    evidence: rows.slice(0, 8).map((r) => ({ kind: "intelligence", ref: r.id, label: r.title, href: `/intelligence?id=${r.id}` })),
    scope: { type: scope.type, id: scope.id ?? null, label: scope.label, cadence: scope.cadence },
    actionRequired: true,
    metadata: { pendingCount: rows.length },
  }];
};

/** ALL brief providers — the four remaining categories are now wired to real stores (no more honest gaps). */
export function defaultBriefProviders() {
  return {
    escalations: escalationsProvider,
    approvalsDue: approvalsDueProvider,
    deliveryRisks: deliveryRisksProvider,
    financeAlerts: financeAlertsProvider,
    providerHealth: providerHealthProvider,
    kpis: kpiProvider,
    crmMovement: crmMovementProvider,
    intelligence: intelligenceProvider,
  };
}
