import { z } from "zod";
import { newId } from "@/lib/ids";

/**
 * Department domain model (Phase 3 — real departments).
 *
 * A department is an INDEPENDENT OPERATING UNIT, not a free-text `team` label. It has a stable identity,
 * a versioned policy record, a manager/orchestrator, registered specialist agents (via memberships), the
 * deterministic services it owns, hard tool/memory/data-classification permissions, the events it reacts
 * to, the handoff schemas it accepts, the products it emits, the departments it delivers to, the approvals
 * and escalation rules it enforces, its KPIs, and its budget/concurrency/timeout/retry limits.
 *
 * Authorization is NEVER inferred from a display label — it comes from this record + explicit memberships
 * (see department-membership.ts). One DB row = one department at a given version.
 */

export const DEPARTMENT_STATUSES = ["draft", "active", "inactive", "archived"] as const;
export type DepartmentStatus = (typeof DEPARTMENT_STATUSES)[number];

/** Truthful operational health — computed from real signals, never assumed from record existence. */
export const DEPARTMENT_HEALTH_STATUSES = [
  "healthy",
  "degraded",
  "blocked",
  "unavailable",
  "misconfigured",
  "over_budget",
  "stale",
  "failed",
  "unknown",
] as const;
export type DepartmentHealthStatus = (typeof DEPARTMENT_HEALTH_STATUSES)[number];

/** Data classifications a department may be permitted to process (mirrors the handoff envelope's). */
export const DATA_CLASSIFICATIONS = ["public", "internal", "client_confidential", "restricted"] as const;
export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

const slugField = z
  .string()
  .trim()
  .min(1, "slug is required")
  .regex(/^[a-z0-9_]+$/, "department slug must be lowercase letters, numbers, or underscore");

const stringList = z.array(z.string().trim().min(1)).default([]);

// ---- structured policy sub-objects (stored as jsonb) --------------------------------------------

export const departmentPermissionsSchema = z.object({
  allowedTools: stringList,
  deniedTools: stringList,
  authorizedMemoryScopes: stringList,
  permittedDataClassifications: z.array(z.enum(DATA_CLASSIFICATIONS)).default(["internal"]),
});
export type DepartmentPermissions = z.infer<typeof departmentPermissionsSchema>;

export const departmentIoSchema = z.object({
  /** Capability names external triggers / other departments can invoke on this department. */
  inboundCapabilities: stringList,
  /** `expectedOutputSchema` values this department will accept on an inbound handoff. */
  acceptedHandoffSchemas: stringList,
  /** The named products this department produces (see DEPARTMENT_PRODUCTS docs). */
  outboundProducts: stringList,
  /** Department slugs this department delivers its products to. */
  downstreamConsumers: stringList,
});
export type DepartmentIo = z.infer<typeof departmentIoSchema>;

export const departmentEventsSchema = z.object({
  subscribedEvents: stringList,
  scheduledResponsibilities: z
    .array(z.object({ cadence: z.string().trim().min(1), action: z.string().trim().min(1) }))
    .default([]),
});
export type DepartmentEvents = z.infer<typeof departmentEventsSchema>;

export const departmentGovernanceSchema = z.object({
  /** Approval types that must be satisfied for this department's products (e.g. "content_packet"). */
  requiredApprovals: stringList,
  escalationRules: z
    .array(z.object({ condition: z.string().trim().min(1), escalateTo: z.string().trim().min(1) }))
    .default([]),
});
export type DepartmentGovernance = z.infer<typeof departmentGovernanceSchema>;

export const departmentKpiSchema = z.object({
  key: z.string().trim().min(1),
  target: z.number().nullable().default(null),
  unit: z.string().trim().nullable().default(null),
});
export type DepartmentKpi = z.infer<typeof departmentKpiSchema>;

export const departmentBudgetSchema = z.object({
  /** Operating budget in cents (null = unbounded / not tracked). Overall lifetime cap. */
  operatingBudgetCents: z.number().int().nonnegative().nullable().default(null),
  /** Max tokens this department may spend overall (null = unbounded). */
  tokenBudget: z.number().int().nonnegative().nullable().default(null),
  /** Per-provider token/spend caps, keyed by provider id. */
  providerBudgets: z.record(z.string(), z.number()).default({}),
  // Windowed operational caps (all null = unbounded for that window). Enforced by the budget runtime
  // via reservation → settlement, not just stored.
  perRunCents: z.number().int().nonnegative().nullable().default(null),
  dailyCents: z.number().int().nonnegative().nullable().default(null),
  monthlyCents: z.number().int().nonnegative().nullable().default(null),
  perRunTokens: z.number().int().nonnegative().nullable().default(null),
  dailyTokens: z.number().int().nonnegative().nullable().default(null),
  monthlyTokens: z.number().int().nonnegative().nullable().default(null),
});
export type DepartmentBudget = z.infer<typeof departmentBudgetSchema>;

export const departmentLimitsSchema = z.object({
  concurrencyLimit: z.number().int().positive().default(4),
  timeoutMs: z.number().int().positive().default(10 * 60_000),
  retryPolicy: z
    .object({ maxRetries: z.number().int().nonnegative().default(3), backoffMs: z.number().int().nonnegative().default(2000) })
    .default({ maxRetries: 3, backoffMs: 2000 }),
});
export type DepartmentLimits = z.infer<typeof departmentLimitsSchema>;

// ---- the department row ------------------------------------------------------------------------

export interface DepartmentRow {
  id: string;
  slug: string;
  name: string;
  purpose: string;
  status: DepartmentStatus;
  version: number;
  /** The manager/orchestrator agent slug that receives handoffs and runs the department. */
  orchestratorAgentSlug: string | null;
  /** Deterministic (non-LLM) services this department owns, by identifier. */
  deterministicServices: string[];
  permissions: DepartmentPermissions;
  io: DepartmentIo;
  events: DepartmentEvents;
  governance: DepartmentGovernance;
  kpis: DepartmentKpi[];
  budget: DepartmentBudget;
  limits: DepartmentLimits;
  /** What the department does when degraded (e.g. "queue only; alert founder; no new client work"). */
  degradedBehaviour: string | null;
  healthStatus: DepartmentHealthStatus;
  owner: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export const departmentInputSchema = z.object({
  slug: slugField,
  name: z.string().trim().min(1),
  purpose: z.string().trim().min(1),
  status: z.enum(DEPARTMENT_STATUSES).default("draft"),
  version: z.number().int().positive().default(1),
  orchestratorAgentSlug: z.string().trim().min(1).nullable().default(null),
  deterministicServices: stringList,
  permissions: departmentPermissionsSchema.default(() => departmentPermissionsSchema.parse({})),
  io: departmentIoSchema.default(() => departmentIoSchema.parse({})),
  events: departmentEventsSchema.default(() => departmentEventsSchema.parse({})),
  governance: departmentGovernanceSchema.default(() => departmentGovernanceSchema.parse({})),
  kpis: z.array(departmentKpiSchema).default([]),
  budget: departmentBudgetSchema.default(() => departmentBudgetSchema.parse({})),
  limits: departmentLimitsSchema.default(() => departmentLimitsSchema.parse({})),
  degradedBehaviour: z.string().trim().min(1).nullable().default(null),
  healthStatus: z.enum(DEPARTMENT_HEALTH_STATUSES).default("unknown"),
  owner: z.string().trim().min(1).nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type DepartmentInput = z.input<typeof departmentInputSchema>;

/** Build a validated department row. Throws (zod) on an invalid slug / missing required fields. */
export function buildDepartmentRow(input: DepartmentInput, opts: { id?: string; now?: Date } = {}): DepartmentRow {
  const parsed = departmentInputSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("dept"),
    slug: parsed.slug,
    name: parsed.name,
    purpose: parsed.purpose,
    status: parsed.status,
    version: parsed.version,
    orchestratorAgentSlug: parsed.orchestratorAgentSlug,
    deterministicServices: parsed.deterministicServices,
    permissions: parsed.permissions,
    io: parsed.io,
    events: parsed.events,
    governance: parsed.governance,
    kpis: parsed.kpis,
    budget: parsed.budget,
    limits: parsed.limits,
    degradedBehaviour: parsed.degradedBehaviour,
    healthStatus: parsed.healthStatus,
    owner: parsed.owner,
    metadata: parsed.metadata,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Can `department` accept this inbound handoff? Enforces (real authorization, not a label):
 *  - department is active,
 *  - the handoff's expectedOutputSchema is in acceptedHandoffSchemas (if the department declares any),
 *  - the handoff's dataClassification is permitted,
 *  - every memory scope the handoff authorizes is within the department's authorizedMemoryScopes.
 * Returns { ok, errors }. Pure — no DB.
 */
export function departmentCanAccept(
  department: Pick<DepartmentRow, "status" | "io" | "permissions">,
  handoff: { expectedOutputSchema?: string | null; dataClassification?: string | null; authorizedMemoryScopes?: string[] },
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (department.status !== "active") errors.push(`department is ${department.status}, not active`);

  const accepted = department.io.acceptedHandoffSchemas;
  if (accepted.length && handoff.expectedOutputSchema && !accepted.includes(handoff.expectedOutputSchema)) {
    errors.push(`handoff schema '${handoff.expectedOutputSchema}' is not accepted by this department`);
  }

  const cls = handoff.dataClassification;
  if (cls && !department.permissions.permittedDataClassifications.includes(cls as DataClassification)) {
    errors.push(`data classification '${cls}' is not permitted for this department`);
  }

  const granted = new Set(department.permissions.authorizedMemoryScopes);
  for (const scope of handoff.authorizedMemoryScopes ?? []) {
    if (!granted.has(scope)) errors.push(`memory scope '${scope}' exceeds the department's authorized scopes`);
  }

  return { ok: errors.length === 0, errors };
}

/** Is a tool permitted for this department? Deny list wins; an allow list (if non-empty) is exhaustive. */
export function departmentAllowsTool(permissions: DepartmentPermissions, tool: string): boolean {
  if (permissions.deniedTools.includes(tool)) return false;
  if (permissions.allowedTools.length === 0) return true; // no allow-list = allow anything not denied
  return permissions.allowedTools.includes(tool);
}
