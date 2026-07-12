import { validateHandoff, type HandoffEnvelope, type HandoffReceiverContext } from "@/lib/domain/handoff";
import { departmentCanAccept, type DepartmentRow, type DepartmentBudget, type DepartmentPermissions } from "@/lib/domain/department";
import {
  effectiveMemberTools,
  effectiveMemberMemoryScopes,
  memberCanGrantApproval,
  type DepartmentMemberRow,
} from "@/lib/domain/department-membership";

/**
 * Department enforcement primitives (Phase 3, Batch 4). Pure, DB-free guards the orchestrator applies at
 * every boundary — a node runs, a tool fires, memory is read, or work routes to another department ONLY
 * when these pass. Authorization is derived from the department policy + explicit memberships, never a
 * label. These mirror (and compose with) the handoff runtime's own validation for defence-in-depth.
 */

export interface Decision {
  ok: boolean;
  errors: string[];
}

/**
 * Can this department accept this INBOUND handoff? Combines the department policy gate (active + accepted
 * schema + permitted classification + memory-scope within grant) with the handoff runtime's receiver
 * validation (tenant/workspace isolation + memory-scope authorization + schema/version). Both must pass.
 */
export function acceptInboundHandoff(
  department: Pick<DepartmentRow, "status" | "io" | "permissions">,
  envelope: HandoffEnvelope,
  receiverCtx: HandoffReceiverContext,
): Decision {
  const errors: string[] = [];

  const deptGate = departmentCanAccept(department, { expectedOutputSchema: envelope.expectedOutputSchema, dataClassification: envelope.dataClassification, authorizedMemoryScopes: envelope.authorizedMemoryScopes });
  errors.push(...deptGate.errors);

  const runtimeGate = validateHandoff(envelope, receiverCtx);
  if (!runtimeGate.ok) errors.push(...runtimeGate.errors);

  return { ok: errors.length === 0, errors };
}

export interface MemberActionRequest {
  tools?: string[];
  memoryScopes?: string[];
  approvalType?: string;
}

export interface MemberAuthorization extends Decision {
  grantedTools: string[];
  grantedMemoryScopes: string[];
  deniedTools: string[];
  deniedMemoryScopes: string[];
  canGrantApproval: boolean;
}

/**
 * Authorize a specialist's action within its department. Effective grants are the INTERSECTION of the
 * department policy and the membership grant (a membership can never widen department authorization). Any
 * requested tool/scope that isn't in the effective grant is a denial; the whole request fails.
 */
export function authorizeMemberAction(
  permissions: DepartmentPermissions,
  member: Pick<DepartmentMemberRow, "toolGrants" | "memoryGrants" | "approvalAuthority">,
  request: MemberActionRequest,
): MemberAuthorization {
  const grantedTools = effectiveMemberTools(permissions, member);
  const grantedMemoryScopes = effectiveMemberMemoryScopes(permissions, member);
  const grantedToolSet = new Set(grantedTools);
  const grantedScopeSet = new Set(grantedMemoryScopes);

  const deniedTools = (request.tools ?? []).filter((t) => !grantedToolSet.has(t));
  const deniedMemoryScopes = (request.memoryScopes ?? []).filter((s) => !grantedScopeSet.has(s));
  const canGrantApproval = request.approvalType ? memberCanGrantApproval(member, request.approvalType) : true;

  const errors: string[] = [];
  for (const t of deniedTools) errors.push(`tool '${t}' is not granted to this member in the department`);
  for (const s of deniedMemoryScopes) errors.push(`memory scope '${s}' is not granted to this member in the department`);
  if (request.approvalType && !canGrantApproval) errors.push(`member is not authorized to grant approval '${request.approvalType}'`);

  return { ok: errors.length === 0, errors, grantedTools, grantedMemoryScopes, deniedTools, deniedMemoryScopes, canGrantApproval };
}

export interface BudgetDecision extends Decision {
  overBudget: boolean;
}

/**
 * Enforce the department budget against a projected/actual spend. Over the operating (cents), token, or a
 * named provider budget → over budget (blocked). A null limit means unbounded for that dimension.
 */
export function enforceBudget(budget: Pick<DepartmentBudget, "operatingBudgetCents" | "tokenBudget" | "providerBudgets">, spend: { cents?: number; tokens?: number; provider?: { id: string; tokens: number } } = {}): BudgetDecision {
  const errors: string[] = [];
  if (budget.operatingBudgetCents !== null && spend.cents !== undefined && spend.cents > budget.operatingBudgetCents) {
    errors.push(`operating spend ${spend.cents}¢ exceeds budget ${budget.operatingBudgetCents}¢`);
  }
  if (budget.tokenBudget !== null && spend.tokens !== undefined && spend.tokens > budget.tokenBudget) {
    errors.push(`token spend ${spend.tokens} exceeds budget ${budget.tokenBudget}`);
  }
  if (spend.provider) {
    const cap = budget.providerBudgets[spend.provider.id];
    if (cap !== undefined && spend.provider.tokens > cap) errors.push(`provider '${spend.provider.id}' spend ${spend.provider.tokens} exceeds cap ${cap}`);
  }
  return { ok: errors.length === 0, overBudget: errors.length > 0, errors };
}

/**
 * Can `from` route a product to `to`? Enforces source authorization (from is active AND declares `to` as
 * a downstream consumer) and destination capability (to accepts the product schema, if it declares an
 * accepted-schema allow list). Tenant/memory/classification isolation is enforced separately by
 * acceptInboundHandoff when the routed handoff is delivered.
 */
export function planDepartmentRoute(
  from: Pick<DepartmentRow, "slug" | "status" | "io">,
  to: Pick<DepartmentRow, "slug" | "status" | "io">,
  productSchema: string,
): Decision {
  const errors: string[] = [];
  if (from.status !== "active") errors.push(`source department '${from.slug}' is ${from.status}, not active`);
  if (!from.io.downstreamConsumers.includes(to.slug)) errors.push(`'${to.slug}' is not a declared downstream consumer of '${from.slug}'`);
  if (to.status === "archived") errors.push(`destination department '${to.slug}' is archived`);
  const accepted = to.io.acceptedHandoffSchemas;
  if (accepted.length && !accepted.includes(productSchema)) errors.push(`destination '${to.slug}' does not accept product schema '${productSchema}'`);
  return { ok: errors.length === 0, errors };
}
