import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { buildHandoffEnvelope, type DataClassification } from "@/lib/domain/handoff";
import { planDepartmentRoute } from "@/lib/departments/enforcement";
import type { DepartmentRow } from "@/lib/domain/department";
import { getDepartment } from "@/lib/departments/registry";
import { dispatchHandoff, type HandoffStore } from "@/lib/handoff";
import { listInvoices, type FinanceDeps } from "@/lib/finance";
import { listTasks, type TaskDeps } from "@/lib/tasks";
import type { InvoiceRow } from "@/lib/domain/finance";
import type { TaskRow } from "@/lib/domain/task";
import {
  buildDeliveryCompletion,
  financeRecognitionOutputs,
  researchLessonsOutputs,
  founderSummaryOutputs,
  DELIVERY_COMPLETION_MODULE,
  DELIVERY_COMPLETION_SCHEMA,
  type DeliveryCompletion,
  type ProjectForCompletion,
  type TaskForCompletion,
  type InvoiceForCompletion,
  type PaymentForCompletion,
  type DeliveredArtifact,
  type ClientFeedback,
  type DeliveryQualityStatus,
} from "@/lib/domain/delivery-completion";

/**
 * Delivery Completion SERVICE (IO). Triggered when a project reaches COMPLETED: it builds the versioned
 * DeliveryCompletion product (see domain/delivery-completion.ts) from the real project + tasks + invoices +
 * payments, then ROUTES it as durable handoffs to the department's declared, authorized consumers — each
 * with a REAL, distinct purpose:
 *
 *   - finance                → DETERMINISTIC revenue recognition. Carries recognized revenue, margin inputs
 *                              and the outstanding balance computed by pure code from the ledger. An LLM
 *                              NEVER computes or mutates a financial number on this path.
 *   - research_intelligence  → de-identified reusable lessons + scope/quality signal (INTERNAL intelligence
 *                              — no client name, no cents — so it passes Research's internal-only clearance).
 *   - founder_command_centre → the executive close-out summary.
 *
 * Routing is REAL authorization, not decorative: each hop is gated by `planDepartmentRoute` (delivery must
 * DECLARE the destination as a downstream consumer AND the destination must accept `delivery_completion` and
 * be cleared for the classification) and dispatched through the durable handoff runtime (re-validated,
 * idempotent). A non-COMPLETED project produces NOTHING. Every dependency (store, department loader, task /
 * invoice / payment loaders) is injectable, so the whole service is DB-free testable.
 */

const DELIVERY_SLUG = "delivery";
const DELIVERY_ORCHESTRATOR = "delivery_orchestrator";

/** The declared consumers of a delivery_completion, each with its own payload projection + classification. */
export const DELIVERY_COMPLETION_CONSUMERS = ["finance", "research_intelligence", "founder_command_centre"] as const;
export type DeliveryCompletionConsumer = (typeof DELIVERY_COMPLETION_CONSUMERS)[number];

export interface CompleteDeliveryInput {
  /** The completed project (the authoritative source — status MUST be "completed"). */
  project: ProjectForCompletion;
  /** The project's tasks (defaults to `deps.loadTasks`). */
  tasks?: TaskForCompletion[];
  /** The engagement's invoices (defaults to `deps.loadInvoices`). */
  invoices?: InvoiceForCompletion[];
  /** The payment ledger for those invoices (defaults to `deps.loadPayments`; used for evidence). */
  payments?: PaymentForCompletion[];
  approvedScope?: string | null;
  budgetCents?: number;
  actualCostCents?: number;
  deliveredArtifacts?: DeliveredArtifact[];
  risks?: string[];
  clientFeedback?: ClientFeedback | null;
  reusableLessons?: string[];
  qualityStatus?: DeliveryQualityStatus;
  requestedBy: string;
  workflowId?: string;
}

export interface CompleteDeliveryDeps {
  /** Durable handoff store (required to actually persist the routed handoffs). */
  handoffStore?: HandoffStore;
  /** Department loader (defaults to the registry's getDepartment). */
  loadDepartment?: (slug: string) => Promise<DepartmentRow | null>;
  /** Task loader (defaults to the tasks service, scoped by opportunity). */
  loadTasks?: (q: { opportunityId: string | null; companyId: string | null; projectId: string }) => Promise<TaskForCompletion[]>;
  /** Invoice loader (defaults to the finance service, scoped by opportunity). */
  loadInvoices?: (q: { opportunityId: string | null; companyId: string | null }) => Promise<InvoiceForCompletion[]>;
  /** Payment loader (defaults to none — payment state is derived from the invoice ledger). */
  loadPayments?: (invoiceIds: string[]) => Promise<PaymentForCompletion[]>;
  /** Deterministic service deps forwarded to the default loaders. */
  financeDeps?: FinanceDeps;
  taskDeps?: TaskDeps;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

export interface DeliveryCompletionRoute {
  department: string;
  ok: boolean;
  handoffId: string | null;
  deduped: boolean;
  dataClassification: DataClassification;
  errors: string[];
}

export interface CompleteDeliveryResult {
  produced: boolean;
  completion: DeliveryCompletion | null;
  routedTo: DeliveryCompletionRoute[];
  reason?: string;
}

async function audit(deps: CompleteDeliveryDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

/** Intersection of two memory-scope grants (routing can only ever NARROW authorization). */
function narrowScopes(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return a.filter((s) => set.has(s));
}

function financeInvoiceToCompletion(i: InvoiceRow): InvoiceForCompletion {
  return { id: i.id, invoiceNumber: i.invoiceNumber, status: i.status, totalCents: i.totalCents, amountPaidCents: i.amountPaidCents, dueDate: i.dueDate };
}
function taskToCompletion(t: TaskRow): TaskForCompletion {
  return { id: t.id, title: t.title, status: t.status, assignedTo: t.assignedTo };
}

/**
 * Complete a delivery: build the DeliveryCompletion product and route it to the declared consumers. A
 * non-COMPLETED project short-circuits with `produced:false` and routes nothing.
 */
export async function completeDelivery(input: CompleteDeliveryInput, deps: CompleteDeliveryDeps = {}): Promise<CompleteDeliveryResult> {
  const now = deps.now ?? new Date();
  const project = input.project;
  const workflowId = input.workflowId ?? `delcomp_${project.id}`;

  // GUARD: only a COMPLETED project produces a completion — nothing is built or routed otherwise.
  if (project.status !== "completed") {
    return { produced: false, completion: null, routedTo: [], reason: `project '${project.id}' is '${project.status}', not completed` };
  }

  // Gather the real close-out inputs (injectable; DB-free testable).
  const tasks = input.tasks ?? (await loadTasks(deps, project));
  const invoices = input.invoices ?? (await loadInvoices(deps, project));
  const payments = input.payments ?? (deps.loadPayments ? await deps.loadPayments(invoices.map((i) => i.id)) : []);

  // Build the versioned product — every financial figure computed by pure, deterministic code.
  const completion = buildDeliveryCompletion(
    {
      project,
      tasks,
      invoices,
      payments,
      approvedScope: input.approvedScope,
      budgetCents: input.budgetCents,
      actualCostCents: input.actualCostCents,
      deliveredArtifacts: input.deliveredArtifacts,
      risks: input.risks,
      clientFeedback: input.clientFeedback,
      reusableLessons: input.reusableLessons,
      qualityStatus: input.qualityStatus,
      completedBy: input.requestedBy,
    },
    { now },
  );

  await audit(deps, {
    eventType: "delivery.completion_built",
    module: DELIVERY_COMPLETION_MODULE,
    entityType: "delivery_completion",
    entityId: completion.id,
    actor: input.requestedBy,
    metadata: { projectId: project.id, opportunityId: project.opportunityId, outcome: completion.outcome.status, recognizedRevenueCents: completion.marginInputs.recognizedRevenueCents, outstandingCents: completion.paymentState.outstandingCents },
  });

  const routedTo = await routeCompletion(completion, { workflowId, actor: input.requestedBy, companyId: project.companyId, projectId: project.id }, deps, now);
  return { produced: true, completion, routedTo };
}

// ---------------------------------------------------------------- routing

const loadDept = (deps: CompleteDeliveryDeps, slug: string): Promise<DepartmentRow | null> =>
  (deps.loadDepartment ?? ((s: string) => getDepartment(s)))(slug);

async function loadTasks(deps: CompleteDeliveryDeps, project: ProjectForCompletion): Promise<TaskForCompletion[]> {
  if (deps.loadTasks) return deps.loadTasks({ opportunityId: project.opportunityId, companyId: project.companyId, projectId: project.id });
  if (!project.opportunityId) return [];
  const rows = await listTasks({ opportunityId: project.opportunityId, limit: 1000 }, deps.taskDeps ?? {});
  return rows.map(taskToCompletion);
}

async function loadInvoices(deps: CompleteDeliveryDeps, project: ProjectForCompletion): Promise<InvoiceForCompletion[]> {
  if (deps.loadInvoices) return deps.loadInvoices({ opportunityId: project.opportunityId, companyId: project.companyId });
  if (!project.opportunityId) return [];
  const rows = await listInvoices({ limit: 5000 }, deps.financeDeps ?? {});
  return rows.filter((i) => i.opportunityId === project.opportunityId).map(financeInvoiceToCompletion);
}

interface RouteContext {
  workflowId: string;
  actor: string;
  companyId: string | null;
  projectId: string;
}

/** The per-consumer routing plan: which payload projection + which data classification each hop carries. */
function consumerPlan(consumer: DeliveryCompletionConsumer, completion: DeliveryCompletion, baseClassification: DataClassification): { outputs: Record<string, unknown>; classification: DataClassification } {
  switch (consumer) {
    case "finance":
      return { outputs: financeRecognitionOutputs(completion), classification: baseClassification };
    case "research_intelligence":
      // De-identified internal intelligence — no client name, no cents — so it clears Research's internal-only grant.
      return { outputs: researchLessonsOutputs(completion), classification: "internal" };
    case "founder_command_centre":
      return { outputs: founderSummaryOutputs(completion), classification: baseClassification };
  }
}

async function routeCompletion(completion: DeliveryCompletion, ctx: RouteContext, deps: CompleteDeliveryDeps, now: Date): Promise<DeliveryCompletionRoute[]> {
  const source = await loadDept(deps, DELIVERY_SLUG);
  if (!source) {
    return DELIVERY_COMPLETION_CONSUMERS.map((department) => ({ department, ok: false, handoffId: null, deduped: false, dataClassification: "internal" as DataClassification, errors: ["source department 'delivery' not found"] }));
  }
  // Client engagements are client_confidential; internal engagements are internal.
  const baseClassification: DataClassification = ctx.companyId ? "client_confidential" : "internal";

  const routes: DeliveryCompletionRoute[] = [];
  for (const consumer of DELIVERY_COMPLETION_CONSUMERS) {
    const { outputs, classification } = consumerPlan(consumer, completion, baseClassification);
    routes.push(await routeOne(source, consumer, { completion, ctx, outputs, classification }, deps, now));
  }
  return routes;
}

async function routeOne(
  source: DepartmentRow,
  consumerSlug: DeliveryCompletionConsumer,
  args: { completion: DeliveryCompletion; ctx: RouteContext; outputs: Record<string, unknown>; classification: DataClassification },
  deps: CompleteDeliveryDeps,
  now: Date,
): Promise<DeliveryCompletionRoute> {
  const { ctx, outputs, classification } = args;
  const dest = await loadDept(deps, consumerSlug);
  if (!dest) return { department: consumerSlug, ok: false, handoffId: null, deduped: false, dataClassification: classification, errors: [`destination department '${consumerSlug}' not found`] };

  // REAL authorization gate: source must DECLARE this consumer + dest must accept the schema + classification.
  const plan = planDepartmentRoute(source, dest, DELIVERY_COMPLETION_SCHEMA, classification);
  if (!plan.ok) {
    await audit(deps, { eventType: "delivery.completion_route_blocked", module: DELIVERY_COMPLETION_MODULE, entityType: "delivery_completion", entityId: args.completion.id, actor: ctx.actor, metadata: { to: consumerSlug, errors: plan.errors } });
    return { department: consumerSlug, ok: false, handoffId: null, deduped: false, dataClassification: classification, errors: plan.errors };
  }

  // Narrow memory scopes to the destination's grant — routing can never widen authorization.
  const scopes = narrowScopes(source.permissions.authorizedMemoryScopes, dest.permissions.authorizedMemoryScopes);
  const envelope = buildHandoffEnvelope(
    {
      workflowId: ctx.workflowId,
      correlationId: ctx.workflowId,
      department: dest.slug,
      sourceAgent: source.orchestratorAgentSlug ?? DELIVERY_ORCHESTRATOR,
      destinationAgent: dest.orchestratorAgentSlug ?? null,
      destinationCapability: dest.io.inboundCapabilities[0] ?? null,
      objective: `Deliver ${DELIVERY_COMPLETION_SCHEMA} from ${source.slug} to ${dest.slug}`,
      requestedAction: `consume ${DELIVERY_COMPLETION_SCHEMA}`,
      expectedOutputSchema: DELIVERY_COMPLETION_SCHEMA,
      companyId: ctx.companyId,
      clientWorkspaceId: ctx.companyId,
      projectId: ctx.projectId,
      actor: ctx.actor,
      dataClassification: classification,
      authorizedMemoryScopes: scopes,
      previousAgentOutputs: outputs,
      confidence: 0.9,
      idempotencyKey: `${ctx.workflowId}:${DELIVERY_COMPLETION_SCHEMA}:${dest.slug}`,
    },
    { now },
  );

  if (!deps.handoffStore) {
    // No store → nothing durable to persist; report the route as planned-but-undispatched (no false "ok").
    return { department: consumerSlug, ok: false, handoffId: null, deduped: false, dataClassification: classification, errors: ["no handoff store provided"] };
  }

  const receiverCtx = { clientWorkspaceId: ctx.companyId, grantedMemoryScopes: dest.permissions.authorizedMemoryScopes, permittedDataClassifications: dest.permissions.permittedDataClassifications };
  const { handoff, deduped } = await dispatchHandoff(envelope, receiverCtx, { store: deps.handoffStore, recordAudit: deps.recordAudit, now });
  await audit(deps, { eventType: "delivery.completion_routed", module: DELIVERY_COMPLETION_MODULE, entityType: "delivery_completion", entityId: args.completion.id, actor: ctx.actor, metadata: { to: dest.slug, handoffId: handoff.id, deduped, dataClassification: classification } });
  return { department: consumerSlug, ok: true, handoffId: handoff.id, deduped, dataClassification: classification, errors: [] };
}
