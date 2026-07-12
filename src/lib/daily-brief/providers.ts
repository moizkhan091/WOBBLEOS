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

/** The default wired providers. Un-wired categories are honestly absent (not degraded). */
export function defaultBriefProviders() {
  return {
    escalations: escalationsProvider,
    approvalsDue: approvalsDueProvider,
    deliveryRisks: deliveryRisksProvider,
    financeAlerts: financeAlertsProvider,
  };
}
