import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import type { HandoffEnvelope } from "@/lib/domain/handoff";
import {
  claimNextDepartmentHandoff,
  acknowledgeHandoff,
  completeHandoff,
  failHandoff,
  defaultStore as defaultHandoffStore,
  type HandoffStore,
} from "@/lib/handoff";
import { listDepartments } from "@/lib/departments/registry";
import type { DepartmentRow } from "@/lib/domain/department";
import type { RunDepartmentDeps, DepartmentRunResult } from "@/lib/departments/orchestrator";
import { runProposalDepartment, type RunProposalDepartmentDeps } from "@/lib/departments/verticals/proposal";
import { openProposalRevision } from "@/lib/proposals/revision";
import { runSalesCrmDepartment, type RunSalesCrmDepartmentDeps } from "@/lib/departments/verticals/sales-crm";
import { runSecurityGovernanceDepartment } from "@/lib/departments/verticals/security-governance";
import { runFinanceDepartment, type RunFinanceDepartmentDeps } from "@/lib/departments/verticals/finance";
import { runDeliveryDepartment, type RunDeliveryDepartmentDeps } from "@/lib/departments/verticals/delivery";

/**
 * DEPARTMENT CONSUMER LOOP (Phase 3 — closes the "routed handoff is never claimed" gap).
 *
 * The department verticals ROUTE their product to a downstream department as a durable handoff, but until
 * now nothing in the live runtime CLAIMED those handoffs — the inter-department chain only ran inside proof
 * scripts that hand-claimed each hop. This loop is the missing consumer: on each scheduler tick, for every
 * ACTIVE department that has a registered consumer, it claims the next handoff addressed to that department
 * and runs the department's policy off the claimed envelope, then acknowledges + completes it (or fails it
 * so the retry/dead-letter machinery + escalation sweep take over). This is what makes the chain autonomous
 * — and what makes a RESUMED (redriven → delivered) handoff actually re-execute instead of only changing a
 * record. Concurrency-safe: `claimNextDepartmentHandoff` leases one row atomically (SKIP LOCKED), so two
 * ticks/workers never double-process.
 *
 * A consumer is registered ONLY for a department that has a REAL upstream producer routing to it — we do
 * not wire decorative consumers for departments nothing produces for yet.
 */

/** Reconstructs a department's input from a claimed inbound handoff envelope and runs its vertical. */
export type DepartmentConsumer = (envelope: HandoffEnvelope, deps: DepartmentConsumerDeps) => Promise<DepartmentRunResult<unknown>>;

export interface DepartmentConsumerDeps extends RunDepartmentDeps {
  handoffStore?: HandoffStore;
  /** Extra deps forwarded to each vertical (synthesize / crmStore / financeStore …) — injectable in proofs. */
  proposal?: Partial<RunProposalDepartmentDeps>;
  salesCrm?: Partial<RunSalesCrmDepartmentDeps>;
  finance?: Partial<RunFinanceDepartmentDeps>;
  delivery?: Partial<RunDeliveryDepartmentDeps>;
  /** Only run consumers for these department slugs (defaults to every active department with a consumer). */
  onlyDepartments?: string[];
  /** Load the departments to sweep (defaults to the active departments from the registry). */
  loadDepartments?: () => Promise<DepartmentRow[]>;
  /** Enable the independent QA gate(s) inside each consumed vertical (production). When on, the Proposal
   *  consumer runs the technical + commercial QA boards and HARD-BLOCKS a non-pass proposal (escalates).
   *  Off by default so proofs/tests are unaffected; the worker enables it alongside runDepartmentConsumers. */
  enableQaGates?: boolean;
}

const out = (env: HandoffEnvelope): Record<string, unknown> => (env.previousAgentOutputs as Record<string, unknown> | undefined) ?? {};
const str = (v: unknown, fallback = ""): string => (v == null ? fallback : String(v));

/** A minimal completed run result for a lightweight (non-department-graph) consumer handler. */
function simpleResult(department: string, product: unknown): DepartmentRunResult<unknown> {
  return { department, accepted: true, product, routedTo: [], escalations: [], telemetry: { costEstimate: 0, latencyMs: null, qualityScore: null, confidence: null } };
}

/**
 * Finance consumer of a DELIVERY COMPLETION handoff: DETERMINISTIC revenue recognition — it applies the
 * carried recognized-revenue / margin / outstanding figures (computed by deterministic code in
 * completeDelivery) to a durable recognition audit. It NEVER runs the invoice-draft path (that would
 * fabricate a second invoice + wrongly escalate). The LLM never touches this financial path.
 */
async function runFinanceRecognition(env: HandoffEnvelope, deps: DepartmentConsumerDeps): Promise<DepartmentRunResult<unknown>> {
  const o = out(env);
  const recordAudit = deps.recordAudit ?? (async (i: AuditEventInput) => { await writeAuditEvent(i); });
  await recordAudit({ eventType: "finance.revenue_recognized", module: "departments", entityType: "delivery_completion", entityId: str(o.projectId, env.workflowId), actor: "finance_orchestrator", metadata: { workflowId: env.workflowId, opportunityId: o.opportunityId ?? null, recognizedRevenueCents: o.recognizedRevenueCents ?? 0, grossMarginCents: o.grossMarginCents ?? null, outstandingCents: o.outstandingCents ?? null, paymentState: o.paymentState ?? null, invoiceRefs: o.invoiceRefs ?? [] } });
  return simpleResult("finance", { recognizedRevenueCents: Number(o.recognizedRevenueCents ?? 0), paymentState: o.paymentState ?? null });
}

/** Research consumer of a DELIVERY COMPLETION handoff: ingest the de-identified reusable lessons + scope
 *  variance as an internal process-improvement signal (deterministic; approval-gated propagation is Phase 5). */
async function runResearchLessonsIngest(env: HandoffEnvelope, deps: DepartmentConsumerDeps): Promise<DepartmentRunResult<unknown>> {
  const o = out(env);
  const recordAudit = deps.recordAudit ?? (async (i: AuditEventInput) => { await writeAuditEvent(i); });
  await recordAudit({ eventType: "research.delivery_lessons_ingested", module: "departments", entityType: "delivery_completion", entityId: str(o.projectId, env.workflowId), actor: "research_intelligence_orchestrator", metadata: { workflowId: env.workflowId, reusableLessons: o.reusableLessons ?? [], scopeVariance: o.scopeVariance ?? null, qualityStatus: o.qualityStatus ?? null } });
  return simpleResult("research_intelligence", { lessons: (o.reusableLessons as unknown[] | undefined)?.length ?? 0 });
}

/**
 * The consumer registry — one entry per department that has a REAL upstream producer:
 *   paid_audit → (business_audit) → proposal
 *   proposal accept → (proposal_artifact) → sales_crm
 *   sales_crm → (won_deal) → finance + delivery
 * Each consumer reconstructs its vertical's input from the claimed handoff's carried outputs.
 */
export const DEPARTMENT_CONSUMERS: Record<string, DepartmentConsumer> = {
  // WOB-UAT-024. Registered because there IS a real upstream producer: the `governance.review` job
  // dispatches this handoff (and any department may route an isolation review here). It branches on the
  // envelope's schema, exactly as `finance` does — a governance_request runs the deterministic access +
  // policy review; a handoff_envelope is judged by the isolation evaluator.
  security_governance: (env, deps) =>
    runSecurityGovernanceDepartment(
      {
        capability: env.expectedOutputSchema === "handoff_envelope" ? "review_isolation" : "run_governance_review",
        requestedBy: env.actor ?? "scheduler",
        workflowId: env.workflowId,
        clientWorkspaceId: env.clientWorkspaceId ?? null,
        isolation:
          env.expectedOutputSchema === "handoff_envelope"
            ? {
                // The envelope UNDER REVIEW rides in previousAgentOutputs — it is the artifact, not the
                // carrier. Reviewing the carrier itself would be self-referential and always pass.
                envelope: out(env).envelope,
                receiver: (out(env).receiver as Record<string, unknown>) ?? {},
                authorAgentSlug: env.sourceAgent ?? "unknown",
                sourceDepartment: str(out(env).sourceDepartment, env.department),
              }
            : undefined,
      },
      { ...deps, handoffStore: deps.handoffStore, inboundEnvelope: env },
    ),
  proposal: (env, deps) =>
    runProposalDepartment(
      {
        auditId: str(out(env).auditId),
        businessName: str(out(env).businessName, env.companyId ?? "client"),
        companyId: env.companyId ?? null,
        requestedBy: env.sourceAgent ?? "paid_audit_orchestrator",
        workflowId: env.workflowId,
      },
      {
        ...deps, ...deps.proposal, handoffStore: deps.handoffStore, inboundEnvelope: env,
        qa: deps.proposal?.qa ?? (deps.enableQaGates ? { deps: {}, onQaRevise: openProposalRevision } : undefined),
        // Context OS: ground the proposal synthesis in the CLIENT's approved trusted context (else WOBBLE company).
        // Best-effort: a retrieval failure must NOT fail the proposal — grounding is additive, so fall open to null.
        retrieveTrustedContext: deps.proposal?.retrieveTrustedContext ?? (async () => {
          try {
            const { retrieveTrustedContextBlock } = await import("@/lib/context-os");
            const scope = env.companyId ? ({ type: "client", id: env.companyId } as const) : ({ type: "company", id: "wobble" } as const);
            return await retrieveTrustedContextBlock(scope, "proposal_synthesis", { agentSlug: "proposal_solution_architect", label: env.companyId ? "APPROVED CLIENT CONTEXT" : "APPROVED WOBBLE CONTEXT", correlationId: env.workflowId });
          } catch { return null; }
        }),
      },
    ),
  sales_crm: (env, deps) =>
    runSalesCrmDepartment(
      {
        opportunityId: str(out(env).opportunityId),
        proposalId: (out(env).proposalId as string | null) ?? null,
        businessName: str(out(env).businessName, env.companyId ?? "client"),
        companyId: env.companyId ?? null,
        requestedBy: env.sourceAgent ?? "proposal_orchestrator",
        workflowId: env.workflowId,
      },
      { ...deps, ...deps.salesCrm, handoffStore: deps.handoffStore, inboundEnvelope: env },
    ),
  finance: (env, deps) =>
    // Branch on the product schema: a delivery_completion → deterministic revenue recognition (no invoice);
    // a won_deal → the invoice-draft department run.
    env.expectedOutputSchema === "delivery_completion"
      ? runFinanceRecognition(env, deps)
      : runFinanceDepartment(
          {
            opportunityId: (out(env).opportunityId as string | null) ?? null,
            companyId: env.companyId ?? null,
            proposalId: (out(env).proposalId as string | null) ?? null,
            businessName: str(out(env).businessName, env.companyId ?? "client"),
            amountCents: Number(out(env).valueCents ?? 0),
            requestedBy: env.sourceAgent ?? "sales_crm_orchestrator",
            workflowId: env.workflowId,
          },
          { ...deps, ...deps.finance, handoffStore: deps.handoffStore, inboundEnvelope: env },
        ),
  research_intelligence: (env, deps) => runResearchLessonsIngest(env, deps),
  delivery: (env, deps) =>
    runDeliveryDepartment(
      {
        opportunityId: (out(env).opportunityId as string | null) ?? null,
        companyId: env.companyId ?? null,
        proposalId: (out(env).proposalId as string | null) ?? null,
        projectName: str(out(env).businessName, str(out(env).serviceInterest, "Engagement")),
        servicesIncluded: out(env).serviceInterest ? [str(out(env).serviceInterest)] : undefined,
        owner: (out(env).assignedOwner as string | null) ?? null,
        requestedBy: env.sourceAgent ?? "sales_crm_orchestrator",
        workflowId: env.workflowId,
      },
      { ...deps, ...deps.delivery, handoffStore: deps.handoffStore, inboundEnvelope: env },
    ),
};

export interface DepartmentConsumerTickResult {
  claimed: number;
  completed: number;
  failed: number;
  byDepartment: Record<string, { completed: number; failed: number }>;
  errors: string[];
}

/**
 * Run one consumer sweep. Claims AT MOST ONE handoff per department per tick (natural rate-limiting by the
 * tick cadence), runs the department, and completes/fails the handoff. Never throws — each department is
 * guarded independently so one failure never stops the others.
 */
export async function runDepartmentConsumerTick(deps: DepartmentConsumerDeps = {}): Promise<DepartmentConsumerTickResult> {
  const now = deps.now ?? new Date();
  const store = deps.handoffStore ?? defaultHandoffStore();
  const recordAudit = deps.recordAudit ?? (async (i: AuditEventInput) => { await writeAuditEvent(i); });
  const result: DepartmentConsumerTickResult = { claimed: 0, completed: 0, failed: 0, byDepartment: {}, errors: [] };

  let departments: DepartmentRow[];
  try {
    departments = await (deps.loadDepartments ?? (() => listDepartments({ status: "active" })))();
  } catch (e) {
    result.errors.push(`load-departments: ${e instanceof Error ? e.message : e}`);
    return result;
  }

  for (const dept of departments) {
    if (dept.status !== "active") continue;
    const consumer = DEPARTMENT_CONSUMERS[dept.slug];
    if (!consumer) continue;
    if (deps.onlyDepartments && !deps.onlyDepartments.includes(dept.slug)) continue;
    result.byDepartment[dept.slug] ??= { completed: 0, failed: 0 };

    let row;
    try {
      row = await claimNextDepartmentHandoff(dept.slug, `${dept.slug}_consumer`, { store, recordAudit, now });
    } catch (e) {
      result.errors.push(`${dept.slug} claim: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    if (!row) continue;
    result.claimed++;

    try {
      // Run the department off the CLAIMED envelope. The vertical accepts + validates the inbound handoff
      // (tenant + memory-scope + accepted-schema) via runDepartment; a mis-routed row throws → we fail it.
      await consumer(row.envelope, { ...deps, handoffStore: store, recordAudit, now });
      await acknowledgeHandoff(row.id, { store, recordAudit, now });
      await completeHandoff(row.id, {}, { store, recordAudit, now });
      result.completed++;
      result.byDepartment[dept.slug].completed++;
      await recordAudit({ eventType: "department.consumed", module: "departments", entityType: "handoff", entityId: row.id, actor: `${dept.slug}_consumer`, metadata: { departmentSlug: dept.slug, workflowId: row.workflowId } }).catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Fail the claimed handoff → the delivery state machine retries (backoff) or dead-letters, and the
      // scheduler's dead-letter sweep raises a founder escalation. Never swallow silently.
      await failHandoff(row.id, msg, { store, recordAudit, now }).catch(() => {});
      result.failed++;
      result.byDepartment[dept.slug].failed++;
      result.errors.push(`${dept.slug} run: ${msg}`);
    }
  }

  return result;
}
