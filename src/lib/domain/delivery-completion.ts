import { newId } from "@/lib/ids";
import type { ProjectMilestone, ProjectDeliverable } from "@/lib/domain/project";

/**
 * Delivery Completion product — the versioned artifact the Delivery department emits when a project is
 * COMPLETED (pure, deterministic, NO IO). Where `delivery_health` (see verticals/delivery.ts) is the
 * running snapshot of a live project, this is the CLOSE-OUT record: what was approved vs delivered, the
 * real budget/cost/margin and payment picture, the reusable lessons, and the evidence that backs it.
 *
 * It is routed to authorized consumers, each with a real purpose (see delivery-completion/index.ts):
 *   - Finance  → DETERMINISTIC revenue recognition (recognized revenue, margin inputs, outstanding balance).
 *   - Research → de-identified reusable lessons + scope/quality signal (internal intelligence).
 *   - Founder  → the executive close-out summary.
 *
 * HARD RULE mirrored by the service: every financial figure here is computed by this pure code from the
 * REAL invoice/payment ledger — an LLM never fabricates or mutates a revenue/margin/balance number.
 */

export const DELIVERY_COMPLETION_MODULE = "delivery_completion";
export const DELIVERY_COMPLETION_SCHEMA = "delivery_completion";
export const DELIVERY_COMPLETION_VERSION = 1;

/** Invoice statuses that carry no billable/collectible value (reversed or voided). */
const VOID_INVOICE_STATUSES = new Set(["cancelled", "refunded", "written_off"]);
/** Invoice statuses that still owe an open balance (mirrors finance revenueSummary). */
const OUTSTANDING_INVOICE_STATUSES = new Set(["sent", "viewed", "partially_paid", "overdue"]);

export type DeliveryOutcomeStatus = "delivered_in_full" | "delivered_with_gaps";
export type DeliveryPaymentStateLabel = "paid" | "partially_paid" | "unpaid" | "overpaid";
export type DeliveryQualityStatus = "passed" | "passed_with_notes" | "failed" | "not_reviewed";

export interface DeliveredArtifact {
  title: string;
  kind?: string;
  ref?: string;
}
export interface CompletionTaskSummary {
  id: string;
  title: string;
  status: string;
  assignedTo: string | null;
}
export interface ClientFeedback {
  rating?: number | null;
  sentiment?: "positive" | "neutral" | "negative" | null;
  verbatim?: string | null;
}

export interface DeliveryScopeVariance {
  plannedMilestones: number;
  completedMilestones: number;
  plannedTasks: number;
  completedTasks: number;
  incompleteTasks: number;
  fullyDelivered: boolean;
  /** 0..1 (2dp) — share of planned tasks completed (1 when nothing was planned but delivery is full). */
  completionRatio: number;
}

/** The DETERMINISTIC inputs Finance recognizes revenue + margin from — every number computed from the ledger. */
export interface DeliveryMarginInputs {
  budgetCents: number;
  actualCostCents: number;
  /** revenue basis (recognized revenue, or the approved budget when nothing is invoiced) − actual cost. */
  grossMarginCents: number;
  grossMarginPct: number | null;
  invoicedCents: number;
  recognizedRevenueCents: number;
}

export interface DeliveryPaymentState {
  invoicedCents: number;
  collectedCents: number;
  outstandingCents: number;
  overdueCents: number;
  state: DeliveryPaymentStateLabel;
}

export interface DeliveryOutcome {
  status: DeliveryOutcomeStatus;
  onBudget: boolean;
  fullyPaid: boolean;
  summary: string;
}

export interface DeliveryCompletion {
  id: string;
  schema: typeof DELIVERY_COMPLETION_SCHEMA;
  version: number;
  // ---- identity ----
  projectId: string;
  projectName: string;
  companyId: string | null; // the client
  opportunityId: string | null;
  proposalId: string | null;
  owner: string | null;
  // ---- scope ----
  approvedScope: string | null;
  servicesIncluded: string[];
  milestones: ProjectMilestone[];
  completedTasks: CompletionTaskSummary[];
  incompleteTasks: CompletionTaskSummary[];
  deliveredArtifacts: DeliveredArtifact[];
  // ---- dates ----
  dates: { startDate: string | null; endDate: string | null; completedAt: string };
  // ---- finance (deterministic) ----
  budgetCents: number;
  actualCostCents: number;
  invoiceRefs: string[];
  paymentState: DeliveryPaymentState;
  marginInputs: DeliveryMarginInputs;
  // ---- intelligence ----
  risks: string[];
  scopeVariance: DeliveryScopeVariance;
  clientFeedback: ClientFeedback | null;
  outcome: DeliveryOutcome;
  reusableLessons: string[];
  evidence: string[];
  qualityStatus: DeliveryQualityStatus;
  completedBy: string | null;
  createdAt: string; // ISO
}

// ---------------------------------------------------------------- structural inputs

/** The completed project (structural subset of ProjectRow — the real row satisfies it). */
export interface ProjectForCompletion {
  id: string;
  name: string;
  status: string; // MUST be "completed"
  companyId: string | null;
  opportunityId: string | null;
  proposalId: string | null;
  owner: string | null;
  servicesIncluded: string[];
  milestones: ProjectMilestone[];
  deliverables?: ProjectDeliverable[];
  startDate: Date | string | null;
  endDate: Date | string | null;
  metadata?: Record<string, unknown>;
}
export interface TaskForCompletion {
  id: string;
  title: string;
  status: string;
  assignedTo: string | null;
}
export interface InvoiceForCompletion {
  id: string;
  invoiceNumber: string;
  status: string;
  totalCents: number;
  amountPaidCents: number;
  dueDate: Date | string | null;
}
export interface PaymentForCompletion {
  id: string;
  invoiceId: string;
  amountCents: number;
  paymentReference: string | null;
}

export interface BuildDeliveryCompletionInput {
  project: ProjectForCompletion;
  tasks?: TaskForCompletion[];
  invoices?: InvoiceForCompletion[];
  payments?: PaymentForCompletion[];
  /** The approved scope of work (from the proposal). */
  approvedScope?: string | null;
  /** Approved budget in cents (defaults to the total invoiced value — the contract basis). */
  budgetCents?: number;
  /** Real cost incurred delivering the work in cents (from cost tracking; defaults to 0 = untracked). */
  actualCostCents?: number;
  deliveredArtifacts?: DeliveredArtifact[];
  risks?: string[];
  clientFeedback?: ClientFeedback | null;
  /** Extra reusable lessons (deterministic lessons are auto-derived + merged). */
  reusableLessons?: string[];
  /** QA verdict on the deliverables (defaults truthfully to "not_reviewed"). */
  qualityStatus?: DeliveryQualityStatus;
  completedBy?: string | null;
}

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

function toMs(v: Date | string | null | undefined): number | null {
  const iso = toIso(v);
  return iso ? new Date(iso).getTime() : null;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/**
 * Deterministically build the DeliveryCompletion product from a COMPLETED project + its real tasks,
 * invoices and payments. Pure: no DB, no clock beyond `opts.now`, no LLM. Throws on a non-completed
 * project (the service guards first so the normal not-completed path never reaches here).
 */
export function buildDeliveryCompletion(input: BuildDeliveryCompletionInput, opts: { now?: Date; id?: string } = {}): DeliveryCompletion {
  const project = input.project;
  if (project.status !== "completed") {
    throw new Error(`buildDeliveryCompletion requires a completed project (got '${project.status}')`);
  }
  const now = opts.now ?? new Date();
  const completedAtMs = now.getTime();
  const tasks = input.tasks ?? [];
  const invoices = input.invoices ?? [];
  const payments = input.payments ?? [];

  // ---- scope: completed vs incomplete work (cancelled tasks are out of scope, neither bucket) ----
  const completedTasks: CompletionTaskSummary[] = tasks
    .filter((t) => t.status === "completed")
    .map((t) => ({ id: t.id, title: t.title, status: t.status, assignedTo: t.assignedTo }));
  const incompleteTasks: CompletionTaskSummary[] = tasks
    .filter((t) => t.status !== "completed" && t.status !== "cancelled")
    .map((t) => ({ id: t.id, title: t.title, status: t.status, assignedTo: t.assignedTo }));

  const milestones = project.milestones ?? [];
  const plannedMilestones = milestones.length;
  const completedMilestones = milestones.filter((m) => m.done).length;
  const plannedTasks = completedTasks.length + incompleteTasks.length;
  const milestonesFull = plannedMilestones === 0 || completedMilestones === plannedMilestones;
  const fullyDelivered = incompleteTasks.length === 0 && milestonesFull;
  const completionRatio = plannedTasks > 0 ? Math.round((completedTasks.length / plannedTasks) * 100) / 100 : fullyDelivered ? 1 : 0;

  const scopeVariance: DeliveryScopeVariance = {
    plannedMilestones,
    completedMilestones,
    plannedTasks,
    completedTasks: completedTasks.length,
    incompleteTasks: incompleteTasks.length,
    fullyDelivered,
    completionRatio,
  };

  // ---- finance: every figure computed from the REAL invoice/payment ledger (deterministic) ----
  const liveInvoices = invoices.filter((i) => !VOID_INVOICE_STATUSES.has(i.status));
  const invoicedCents = liveInvoices.reduce((s, i) => s + i.totalCents, 0);
  const collectedCents = liveInvoices.reduce((s, i) => s + i.amountPaidCents, 0);
  let outstandingCents = 0;
  let overdueCents = 0;
  for (const i of invoices) {
    if (!OUTSTANDING_INVOICE_STATUSES.has(i.status)) continue;
    const open = Math.max(0, i.totalCents - i.amountPaidCents);
    outstandingCents += open;
    const dueMs = toMs(i.dueDate);
    if (dueMs !== null && dueMs < completedAtMs) overdueCents += open;
  }

  const recognizedRevenueCents = invoicedCents; // delivery is complete → the billed value is earned
  const budgetCents = input.budgetCents ?? invoicedCents;
  const actualCostCents = input.actualCostCents ?? 0;
  const revenueBasisCents = recognizedRevenueCents > 0 ? recognizedRevenueCents : budgetCents;
  const grossMarginCents = revenueBasisCents - actualCostCents;
  const grossMarginPct = revenueBasisCents > 0 ? Math.round((grossMarginCents / revenueBasisCents) * 100) : null;

  const paymentStateLabel: DeliveryPaymentStateLabel =
    invoicedCents <= 0 || collectedCents <= 0
      ? "unpaid"
      : collectedCents > invoicedCents
        ? "overpaid"
        : collectedCents >= invoicedCents
          ? "paid"
          : "partially_paid";

  const paymentState: DeliveryPaymentState = { invoicedCents, collectedCents, outstandingCents, overdueCents, state: paymentStateLabel };
  const marginInputs: DeliveryMarginInputs = { budgetCents, actualCostCents, grossMarginCents, grossMarginPct, invoicedCents, recognizedRevenueCents };

  // ---- outcome (deterministic) ----
  const onBudget = budgetCents > 0 ? actualCostCents <= budgetCents : actualCostCents <= 0;
  const fullyPaid = paymentStateLabel === "paid" || paymentStateLabel === "overpaid";
  const outcomeStatus: DeliveryOutcomeStatus = fullyDelivered ? "delivered_in_full" : "delivered_with_gaps";
  const summaryParts = [
    `${project.name} ${fullyDelivered ? "delivered in full" : `delivered with ${incompleteTasks.length} open item(s)`}`,
    `${completedMilestones}/${plannedMilestones} milestones`,
    onBudget ? "on budget" : "over budget",
    fullyPaid ? "fully paid" : outstandingCents > 0 ? `${outstandingCents}¢ outstanding` : "unpaid",
  ];
  const outcome: DeliveryOutcome = { status: outcomeStatus, onBudget, fullyPaid, summary: summaryParts.join(" · ") };

  // ---- reusable lessons: qualitative + de-identified (safe for internal Research), input merged first ----
  const derivedLessons: string[] = [];
  if (!onBudget) derivedLessons.push("Engagement exceeded its approved budget — revisit scoping and estimation.");
  if (incompleteTasks.length > 0) derivedLessons.push("Delivery closed with unfinished tasks — tighten milestone planning and scope control.");
  if (outstandingCents > 0) derivedLessons.push("Payment still outstanding at completion — tie invoicing to delivery milestones.");
  if (qualityIsFail(input.qualityStatus)) derivedLessons.push("Quality review did not pass at close-out — strengthen the QA gate before delivery.");
  const reusableLessons = dedupe([...(input.reusableLessons ?? []), ...derivedLessons]);

  // ---- evidence: real provenance backing every claim above ----
  const evidence = dedupe([
    `project:${project.id}`,
    ...(project.opportunityId ? [`opportunity:${project.opportunityId}`] : []),
    ...(project.proposalId ? [`proposal:${project.proposalId}`] : []),
    ...liveInvoices.map((i) => `invoice:${i.id}`),
    ...completedTasks.map((t) => `task:${t.id}`),
    ...payments.map((p) => `payment:${p.paymentReference ?? p.id}`),
  ]);

  return {
    id: opts.id ?? newId("delcomp"),
    schema: DELIVERY_COMPLETION_SCHEMA,
    version: DELIVERY_COMPLETION_VERSION,
    projectId: project.id,
    projectName: project.name,
    companyId: project.companyId,
    opportunityId: project.opportunityId,
    proposalId: project.proposalId,
    owner: project.owner,
    approvedScope: input.approvedScope ?? null,
    servicesIncluded: project.servicesIncluded ?? [],
    milestones,
    completedTasks,
    incompleteTasks,
    deliveredArtifacts: input.deliveredArtifacts ?? [],
    dates: { startDate: toIso(project.startDate), endDate: toIso(project.endDate), completedAt: now.toISOString() },
    budgetCents,
    actualCostCents,
    invoiceRefs: liveInvoices.map((i) => i.id),
    paymentState,
    marginInputs,
    risks: input.risks ?? [],
    scopeVariance,
    clientFeedback: input.clientFeedback ?? null,
    outcome,
    reusableLessons,
    evidence,
    qualityStatus: input.qualityStatus ?? "not_reviewed",
    completedBy: input.completedBy ?? null,
    createdAt: now.toISOString(),
  };
}

function qualityIsFail(q: DeliveryQualityStatus | undefined): boolean {
  return q === "failed";
}

// ---------------------------------------------------------------- per-consumer projections (pure)

/**
 * Finance's DETERMINISTIC revenue-recognition payload — recognized revenue, margin inputs and the
 * outstanding balance, all lifted straight from the computed ledger figures (no LLM, no recompute drift).
 * Finance's consumer applies these to revenue-recognition state / margin / outstanding balance.
 */
export function financeRecognitionOutputs(c: DeliveryCompletion): Record<string, unknown> {
  return {
    completionId: c.id,
    schema: c.schema,
    version: c.version,
    projectId: c.projectId,
    opportunityId: c.opportunityId,
    proposalId: c.proposalId,
    companyId: c.companyId,
    outcome: c.outcome.status,
    budgetCents: c.budgetCents,
    actualCostCents: c.actualCostCents,
    invoicedCents: c.marginInputs.invoicedCents,
    recognizedRevenueCents: c.marginInputs.recognizedRevenueCents,
    grossMarginCents: c.marginInputs.grossMarginCents,
    grossMarginPct: c.marginInputs.grossMarginPct,
    collectedCents: c.paymentState.collectedCents,
    outstandingCents: c.paymentState.outstandingCents,
    overdueCents: c.paymentState.overdueCents,
    paymentState: c.paymentState.state,
    invoiceRefs: c.invoiceRefs,
  };
}

/**
 * Research's INTERNAL, de-identified lessons payload — reusable lessons + the scope/quality signal, with
 * NO client name and NO financial amounts (so it is safe under Research's internal-only classification).
 */
export function researchLessonsOutputs(c: DeliveryCompletion): Record<string, unknown> {
  return {
    completionId: c.id,
    schema: c.schema,
    version: c.version,
    outcome: c.outcome.status,
    onBudget: c.outcome.onBudget,
    fullyPaid: c.outcome.fullyPaid,
    qualityStatus: c.qualityStatus,
    servicesIncluded: c.servicesIncluded,
    reusableLessons: c.reusableLessons,
    scopeVariance: c.scopeVariance,
  };
}

/** Founder's executive close-out summary — the full picture for the command centre. */
export function founderSummaryOutputs(c: DeliveryCompletion): Record<string, unknown> {
  return {
    completionId: c.id,
    schema: c.schema,
    version: c.version,
    projectId: c.projectId,
    projectName: c.projectName,
    companyId: c.companyId,
    opportunityId: c.opportunityId,
    owner: c.owner,
    outcome: c.outcome.status,
    summary: c.outcome.summary,
    onBudget: c.outcome.onBudget,
    fullyPaid: c.outcome.fullyPaid,
    qualityStatus: c.qualityStatus,
    budgetCents: c.budgetCents,
    actualCostCents: c.actualCostCents,
    invoicedCents: c.paymentState.invoicedCents,
    collectedCents: c.paymentState.collectedCents,
    outstandingCents: c.paymentState.outstandingCents,
    completedMilestones: c.scopeVariance.completedMilestones,
    plannedMilestones: c.scopeVariance.plannedMilestones,
    incompleteTasks: c.scopeVariance.incompleteTasks,
    risks: c.risks,
    reusableLessons: c.reusableLessons,
    clientFeedback: c.clientFeedback,
    invoiceRefs: c.invoiceRefs,
  };
}
