import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { nextHandoff, type HandoffEnvelope, type HandoffReceiverContext } from "@/lib/domain/handoff";
import type { DepartmentRow } from "@/lib/domain/department";
import { selectSpecialists, type DepartmentMemberRow } from "@/lib/domain/department-membership";
import { dispatchHandoff, type HandoffStore } from "@/lib/handoff";
import { getDepartment, listMembers } from "@/lib/departments/registry";
import { reserveBudget, settleReservationFromUsage, releaseBudget, type BudgetStore } from "@/lib/departments/budget";
import { createEscalation, type EscalationStore } from "@/lib/departments/escalation";
import type { EscalationReason, EscalationSeverity } from "@/lib/domain/escalation";
import {
  acceptInboundHandoff,
  authorizeMemberAction,
  enforceBudget,
  planDepartmentRoute,
  type MemberActionRequest,
  type MemberAuthorization,
  type BudgetDecision,
} from "@/lib/departments/enforcement";

/**
 * Department Orchestrator framework (Phase 3, Batch 4). A SHARED runner that drives any department
 * through the same lifecycle — accept a validated inbound handoff → run the department-specific POLICY
 * (which selects specialists, enforces tool/memory/budget grants, and dispatches child work through the
 * handoff runtime) → aggregate the department PRODUCT → route it to the declared downstream department(s)
 * as real handoffs → record cost/time/confidence/quality. Department behaviour lives in the versioned
 * policy; the framework enforces the invariants uniformly.
 */

/** The scoped API a department policy runs against — every capability is enforced against the registry. */
export interface DepartmentRuntimeApi {
  department: DepartmentRow;
  members: DepartmentMemberRow[];
  envelope: HandoffEnvelope;
  /** Pick active specialists matching a capability / input schema, by priority. */
  selectSpecialists(need?: { capability?: string; inputSchema?: string; memberType?: "agent" | "service" }): DepartmentMemberRow[];
  /** Authorize a member's tool/memory/approval action (dept ∩ membership). Throws on denial. */
  authorizeMember(member: DepartmentMemberRow, request: MemberActionRequest): MemberAuthorization;
  /** Budget guard for a projected/actual spend. */
  checkBudget(spend: { cents?: number; tokens?: number; provider?: { id: string; tokens: number } }): BudgetDecision;
  /** Record an escalation (also audited by the framework). */
  escalate(reason: string): void;
}

export interface DepartmentProduct<T> {
  product: T;
  /** The product's schema name — used to authorize routing to downstream departments. */
  productSchema: string;
  /** Outputs carried on the downstream envelope's previousAgentOutputs. */
  outputs?: Record<string, unknown>;
  telemetry?: { costEstimate?: number; latencyMs?: number; qualityScore?: number };
  confidence?: number;
  /** Downstream department slugs to deliver to. Defaults to the department's declared downstreamConsumers. */
  routeTo?: string[];
}

export type DepartmentPolicy<T> = (api: DepartmentRuntimeApi) => Promise<DepartmentProduct<T>>;

export interface DepartmentRouteResult {
  department: string;
  handoffId: string;
  deduped: boolean;
}

export interface DepartmentRunResult<T> {
  department: string;
  accepted: boolean;
  product: T | null;
  routedTo: DepartmentRouteResult[];
  escalations: string[];
  telemetry: { costEstimate: number | null; latencyMs: number | null; qualityScore: number | null; confidence: number | null };
}

export interface RunDepartmentDeps {
  loadDepartment?: (slug: string) => Promise<DepartmentRow | null>;
  loadMembers?: (slug: string) => Promise<DepartmentMemberRow[]>;
  handoffStore?: HandoffStore;
  /** When set together with input.budget, the run reserves→settles against the department budget. */
  budgetStore?: BudgetStore;
  /** Provider-usage store — the run settles against ACTUAL recorded usage for this unit of work. */
  usageStore?: import("@/lib/provider-usage").ProviderUsageStore;
  /** When set, blocked/escalated work raises a real escalation row (visible in the Command Centre). */
  escalationStore?: EscalationStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

export interface RunDepartmentInput<T> {
  departmentSlug: string;
  /** The inbound handoff addressed to this department + the receiver context to validate it against. */
  inbound: { envelope: HandoffEnvelope; receiverCtx: HandoffReceiverContext };
  policy: DepartmentPolicy<T>;
  /** Optional budget gate: reserve this estimate BEFORE the policy runs; exhausted → escalate + block. */
  budget?: { estimatedCents?: number; estimatedTokens?: number; provider?: string | null; overrideBy?: string };
}

/** Thrown when the department's budget is exhausted and the run is blocked before any expensive work. */
export class DepartmentBudgetExhaustedError extends Error {
  readonly blockedBy: string | null;
  constructor(department: string, blockedBy: string | null, reasons: string[]) {
    super(`department '${department}' budget exhausted (${blockedBy}): ${reasons.join("; ")}`);
    this.name = "DepartmentBudgetExhaustedError";
    this.blockedBy = blockedBy;
  }
}

/** Thrown when the department rejects the inbound handoff (unauthorized / mis-routed / mis-scoped). */
export class DepartmentRejectedError extends Error {
  readonly errors: string[];
  constructor(department: string, errors: string[]) {
    super(`department '${department}' rejected the inbound handoff: ${errors.join("; ")}`);
    this.name = "DepartmentRejectedError";
    this.errors = errors;
  }
}

async function audit(deps: RunDepartmentDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

/** Map a policy's free-text escalation string to a structured escalation reason category. */
function mapEscalationReason(raw: string): EscalationReason {
  const s = raw.toLowerCase();
  if (s.includes("budget")) return "budget_exhausted";
  if (s.includes("qa")) return "repeated_qa_failure";
  if (s.includes("approval")) return "missing_approval";
  if (s.includes("provider")) return "provider_unavailable";
  if (s.includes("retr")) return "exhausted_retries";
  if (s.includes("dead")) return "dead_lettered";
  if (s.includes("downstream")) return "downstream_rejection";
  if (s.includes("stale")) return "stale_intelligence";
  if (s.includes("conflict")) return "conflicting_conclusions";
  if (s.includes("permission") || s.includes("unauthorized")) return "permission_denied";
  if (s.includes("sla")) return "sla_breach";
  return "other";
}

export async function runDepartment<T>(input: RunDepartmentInput<T>, deps: RunDepartmentDeps = {}): Promise<DepartmentRunResult<T>> {
  const now = deps.now ?? new Date();
  const loadDepartment = deps.loadDepartment ?? ((slug: string) => getDepartment(slug));
  const loadMembers = deps.loadMembers ?? ((slug: string) => listMembers(slug));
  const { envelope, receiverCtx } = input.inbound;

  const department = await loadDepartment(input.departmentSlug);
  if (!department) throw new DepartmentRejectedError(input.departmentSlug, ["department not found"]);

  // 1. Accept (or reject) the inbound handoff — department policy gate + handoff runtime validation.
  const acceptance = acceptInboundHandoff(department, envelope, receiverCtx);
  if (!acceptance.ok) {
    await audit(deps, { eventType: "department.rejected", module: "departments", entityType: "department", entityId: department.slug, actor: envelope.actor, metadata: { workflowId: envelope.workflowId, correlationId: envelope.correlationId, errors: acceptance.errors } });
    throw new DepartmentRejectedError(department.slug, acceptance.errors);
  }
  await audit(deps, { eventType: "department.accepted", module: "departments", entityType: "department", entityId: department.slug, actor: envelope.actor, metadata: { workflowId: envelope.workflowId, correlationId: envelope.correlationId, objective: envelope.objective } });

  const members = await loadMembers(department.slug);
  const escalations: string[] = [];
  const escalateTo = department.governance.escalationRules[0]?.escalateTo ?? "founder_command_centre";

  // Raise a REAL escalation row (visible + resolvable in the Command Centre) when work is blocked, plus
  // the department.escalated audit. Idempotent per (department, workflow, task, reason).
  const raiseEscalation = async (reason: EscalationReason, severity: EscalationSeverity, requiredDecision: string, evidence: Record<string, unknown>): Promise<void> => {
    escalations.push(reason);
    await audit(deps, { eventType: "department.escalated", module: "departments", entityType: "department", entityId: department.slug, actor: envelope.actor, metadata: { workflowId: envelope.workflowId, reason, escalateTo } });
    if (deps.escalationStore) {
      await createEscalation(
        { departmentSlug: department.slug, workflowId: envelope.workflowId, taskId: envelope.taskId, clientWorkspaceId: envelope.clientWorkspaceId, sourceAgent: envelope.sourceAgent, reason, severity, requiredDecision, assignee: escalateTo, evidence, attemptedRecoveries: [] },
        { store: deps.escalationStore, recordAudit: deps.recordAudit, now },
      );
    }
  };

  const api: DepartmentRuntimeApi = {
    department,
    members,
    envelope,
    selectSpecialists: (need) => selectSpecialists(members, need),
    authorizeMember: (member, request) => {
      const decision = authorizeMemberAction(department.permissions, member, request);
      if (!decision.ok) throw new Error(`department '${department.slug}': member '${member.memberRef}' unauthorized — ${decision.errors.join("; ")}`);
      return decision;
    },
    checkBudget: (spend) => enforceBudget(department.budget, spend),
    escalate: (reason) => { escalations.push(reason); },
  };

  // 1b. Budget gate: reserve the estimated spend BEFORE any expensive work. Exhausted → escalate the
  //     budget exhaustion + block the run (no provider call). The reservation settles after the policy.
  let reservationId: string | null = null;
  if (input.budget && deps.budgetStore) {
    const res = await reserveBudget(
      { departmentSlug: department.slug, workflowId: envelope.workflowId, taskId: envelope.taskId, estimatedCents: input.budget.estimatedCents ?? 0, estimatedTokens: input.budget.estimatedTokens ?? 0, provider: input.budget.provider ?? null, reason: `run ${department.slug}`, overrideBy: input.budget.overrideBy },
      { department, budgetStore: deps.budgetStore, recordAudit: deps.recordAudit, now },
    );
    if (!res.ok) {
      await raiseEscalation("budget_exhausted", "high", `Department budget exhausted (${res.evaluation.blockedBy}). Founder decision: raise budget / override / hold / terminate.`, { blockedBy: res.evaluation.blockedBy, reasons: res.evaluation.reasons });
      throw new DepartmentBudgetExhaustedError(department.slug, res.evaluation.blockedBy, res.evaluation.reasons);
    }
    reservationId = res.deduped ? null : res.reservation?.id ?? null;
    if (res.degraded) escalations.push("budget_degraded");
  }

  // 2. Run the department-specific policy → the department product. Settle the reservation against the
  //    actual cost on success; release it if the policy fails (frees the hold for a retry).
  let result: DepartmentProduct<T>;
  try {
    result = await input.policy(api);
  } catch (err) {
    if (reservationId) await releaseBudget(reservationId, { budgetStore: deps.budgetStore, recordAudit: deps.recordAudit, now });
    throw err;
  }
  if (reservationId) {
    // Settle against the ACTUAL provider usage recorded for this unit of work (falls back to the policy's
    // estimate only when no usage was captured — provider_usage keeps estimated vs actual honest).
    await settleReservationFromUsage(
      reservationId,
      { departmentSlug: department.slug, workflowId: envelope.workflowId, taskId: envelope.taskId },
      Math.max(0, Math.round(result.telemetry?.costEstimate ?? 0)),
      { budgetStore: deps.budgetStore, usageStore: deps.usageStore, recordAudit: deps.recordAudit, now },
    );
  }

  // Turn each escalation the POLICY raised (api.escalate) into a real escalation row + audit. Iterate a
  // SNAPSHOT (createEscalation must not grow the array we're iterating). "budget_degraded" is a warning,
  // not a blocking escalation, so it is audited but not turned into a row.
  for (const reason of [...escalations]) {
    if (reason === "budget_exhausted") continue; // already handled before the throw
    if (reason === "budget_degraded") { await audit(deps, { eventType: "department.escalated", module: "departments", entityType: "department", entityId: department.slug, actor: envelope.actor, metadata: { workflowId: envelope.workflowId, reason, escalateTo, warning: true } }); continue; }
    const mapped = mapEscalationReason(reason);
    await audit(deps, { eventType: "department.escalated", module: "departments", entityType: "department", entityId: department.slug, actor: envelope.actor, metadata: { workflowId: envelope.workflowId, reason: mapped, raw: reason, escalateTo } });
    if (deps.escalationStore) {
      await createEscalation(
        { departmentSlug: department.slug, workflowId: envelope.workflowId, taskId: envelope.taskId, clientWorkspaceId: envelope.clientWorkspaceId, sourceAgent: envelope.sourceAgent, reason: mapped, severity: "medium", requiredDecision: `Policy escalation in ${department.slug}: ${reason}`, assignee: escalateTo, evidence: { raw: reason }, attemptedRecoveries: [] },
        { store: deps.escalationStore, recordAudit: deps.recordAudit, now },
      );
    }
  }

  // 3. Route the product to the declared downstream department(s) as real handoffs.
  const targets = result.routeTo ?? department.io.downstreamConsumers;
  const routedTo: DepartmentRouteResult[] = [];
  for (const targetSlug of targets) {
    const to = await loadDepartment(targetSlug);
    if (!to) { escalations.push(`downstream department '${targetSlug}' not found`); continue; }
    const routePlan = planDepartmentRoute(department, to, result.productSchema);
    if (!routePlan.ok) {
      await audit(deps, { eventType: "department.route_blocked", module: "departments", entityType: "department", entityId: department.slug, actor: envelope.actor, metadata: { to: targetSlug, errors: routePlan.errors } });
      continue;
    }
    // Address the routed envelope to the destination department, narrowing memory scope to the dest's
    // grant (routing can never widen authorization), and dispatch it through the durable handoff runtime.
    const destScopes = envelope.authorizedMemoryScopes.filter((s) => to.permissions.authorizedMemoryScopes.includes(s));
    const routed = nextHandoff(
      envelope,
      {
        sourceAgent: department.orchestratorAgentSlug ?? `${department.slug}_orchestrator`,
        destinationAgent: to.orchestratorAgentSlug ?? null,
        destinationCapability: to.io.inboundCapabilities[0] ?? null,
        objective: `Deliver ${result.productSchema} from ${department.slug} to ${to.slug}`,
        requestedAction: `consume ${result.productSchema}`,
        expectedOutputSchema: result.productSchema,
        addOutputs: result.outputs ?? {},
        confidence: result.confidence,
        idempotencyKey: `${envelope.workflowId}:route:${department.slug}->${to.slug}`,
      },
      { now },
    );
    const routedEnvelope: HandoffEnvelope = { ...routed, department: to.slug, authorizedMemoryScopes: destScopes };

    if (deps.handoffStore) {
      const { handoff, deduped } = await dispatchHandoff(
        routedEnvelope,
        { clientWorkspaceId: routedEnvelope.clientWorkspaceId, grantedMemoryScopes: to.permissions.authorizedMemoryScopes },
        { store: deps.handoffStore, recordAudit: deps.recordAudit, now },
      );
      routedTo.push({ department: to.slug, handoffId: handoff.id, deduped });
      await audit(deps, { eventType: "department.routed", module: "departments", entityType: "department", entityId: department.slug, actor: envelope.actor, metadata: { to: to.slug, handoffId: handoff.id, productSchema: result.productSchema, correlationId: routedEnvelope.correlationId, causationId: routedEnvelope.causationId } });
    } else {
      routedTo.push({ department: to.slug, handoffId: "(no-store)", deduped: false });
    }
  }

  // 4. Record the department run telemetry.
  const telemetry = {
    costEstimate: result.telemetry?.costEstimate ?? null,
    latencyMs: result.telemetry?.latencyMs ?? null,
    qualityScore: result.telemetry?.qualityScore ?? null,
    confidence: result.confidence ?? null,
  };
  await audit(deps, { eventType: "department.completed", module: "departments", entityType: "department", entityId: department.slug, actor: envelope.actor, metadata: { workflowId: envelope.workflowId, productSchema: result.productSchema, routedTo: routedTo.map((r) => r.department), ...telemetry } });

  return { department: department.slug, accepted: true, product: result.product, routedTo, escalations, telemetry };
}
