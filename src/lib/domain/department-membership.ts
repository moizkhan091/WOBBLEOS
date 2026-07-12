import { z } from "zod";
import { newId } from "@/lib/ids";
import type { DepartmentPermissions } from "@/lib/domain/department";

/**
 * Department membership (Phase 3). The EXPLICIT link between a department and one of its members (a
 * specialist agent or a deterministic service). Security and memory authorization are derived ONLY from
 * these records + the department policy — never from a display label. An agent belongs to more than one
 * department only through separate explicit memberships, each with its own scoped grants.
 *
 * A member's effective grants are always the INTERSECTION of what the department authorizes and what the
 * membership grants — a membership can never widen a department's tool/memory authorization.
 */

export const MEMBER_TYPES = ["agent", "service"] as const;
export type MemberType = (typeof MEMBER_TYPES)[number];

const slugField = z
  .string()
  .trim()
  .min(1, "slug is required")
  .regex(/^[a-z0-9_]+$/, "slug must be lowercase letters, numbers, or underscore");

const stringList = z.array(z.string().trim().min(1)).default([]);

export const memberBudgetSchema = z.object({
  operatingBudgetCents: z.number().int().nonnegative().nullable().default(null),
  tokenBudget: z.number().int().nonnegative().nullable().default(null),
});
export type MemberBudget = z.infer<typeof memberBudgetSchema>;

export interface DepartmentMemberRow {
  id: string;
  departmentSlug: string;
  memberType: MemberType;
  /** Agent slug (memberType=agent) or service identifier (memberType=service). */
  memberRef: string;
  role: string;
  responsibility: string;
  /** Who this member reports to within the department (the orchestrator/manager agent slug). */
  managerAgentSlug: string | null;
  active: boolean;
  /** Selection priority — lower runs/gets-picked first when multiple members match. */
  priority: number;
  capabilities: string[];
  /** Tools this membership grants (effective = department-allowed ∩ this). */
  toolGrants: string[];
  /** Memory scopes this membership grants (effective = department-authorized ∩ this). */
  memoryGrants: string[];
  /** Handoff `expectedOutputSchema` values this member accepts as input. */
  allowedInputSchemas: string[];
  /** Product/schema names this member is expected to produce. */
  expectedOutputs: string[];
  /** Approval types this member is authorized to grant/resolve (empty = none). */
  approvalAuthority: string[];
  escalationDestination: string | null;
  budgetLimits: MemberBudget;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export const departmentMemberInputSchema = z.object({
  departmentSlug: slugField,
  memberType: z.enum(MEMBER_TYPES).default("agent"),
  memberRef: z.string().trim().min(1),
  role: z.string().trim().min(1),
  responsibility: z.string().trim().min(1),
  managerAgentSlug: z.string().trim().min(1).nullable().default(null),
  active: z.boolean().default(true),
  priority: z.number().int().default(100),
  capabilities: stringList,
  toolGrants: stringList,
  memoryGrants: stringList,
  allowedInputSchemas: stringList,
  expectedOutputs: stringList,
  approvalAuthority: stringList,
  escalationDestination: z.string().trim().min(1).nullable().default(null),
  budgetLimits: memberBudgetSchema.default(() => memberBudgetSchema.parse({})),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type DepartmentMemberInput = z.input<typeof departmentMemberInputSchema>;

export function buildDepartmentMemberRow(input: DepartmentMemberInput, opts: { id?: string; now?: Date } = {}): DepartmentMemberRow {
  const parsed = departmentMemberInputSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("deptmember"),
    departmentSlug: parsed.departmentSlug,
    memberType: parsed.memberType,
    memberRef: parsed.memberRef,
    role: parsed.role,
    responsibility: parsed.responsibility,
    managerAgentSlug: parsed.managerAgentSlug,
    active: parsed.active,
    priority: parsed.priority,
    capabilities: parsed.capabilities,
    toolGrants: parsed.toolGrants,
    memoryGrants: parsed.memoryGrants,
    allowedInputSchemas: parsed.allowedInputSchemas,
    expectedOutputs: parsed.expectedOutputs,
    approvalAuthority: parsed.approvalAuthority,
    escalationDestination: parsed.escalationDestination,
    budgetLimits: parsed.budgetLimits,
    metadata: parsed.metadata,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Effective tools a member may use = department-allowed ∩ membership grant. A membership can NEVER widen
 * the department's authorization: a tool the department denies (or omits from a non-empty allow list) is
 * dropped even if the membership grants it.
 */
export function effectiveMemberTools(permissions: DepartmentPermissions, member: Pick<DepartmentMemberRow, "toolGrants">): string[] {
  const denied = new Set(permissions.deniedTools);
  const allowList = permissions.allowedTools;
  return member.toolGrants.filter((t) => !denied.has(t) && (allowList.length === 0 || allowList.includes(t)));
}

/** Effective memory scopes a member may read/write = department-authorized ∩ membership grant. */
export function effectiveMemberMemoryScopes(permissions: DepartmentPermissions, member: Pick<DepartmentMemberRow, "memoryGrants">): string[] {
  const authorized = new Set(permissions.authorizedMemoryScopes);
  return member.memoryGrants.filter((s) => authorized.has(s));
}

/** Is this member authorized to grant/resolve the given approval type? */
export function memberCanGrantApproval(member: Pick<DepartmentMemberRow, "approvalAuthority">, approvalType: string): boolean {
  return member.approvalAuthority.includes(approvalType);
}

/**
 * Pick the department specialists that can take on a task, most-preferred first. A candidate qualifies if
 * it is active AND (matches a required capability OR accepts the required input schema, when either is
 * specified; with neither specified, all active members qualify). Sorted by ascending priority.
 */
export function selectSpecialists(
  members: DepartmentMemberRow[],
  need: { capability?: string; inputSchema?: string; memberType?: MemberType } = {},
): DepartmentMemberRow[] {
  return members
    .filter((m) => m.active)
    .filter((m) => (need.memberType ? m.memberType === need.memberType : true))
    .filter((m) => {
      if (!need.capability && !need.inputSchema) return true;
      const capOk = need.capability ? m.capabilities.includes(need.capability) : false;
      const schemaOk = need.inputSchema ? m.allowedInputSchemas.includes(need.inputSchema) : false;
      return capOk || schemaOk;
    })
    .sort((a, b) => a.priority - b.priority || a.memberRef.localeCompare(b.memberRef));
}
