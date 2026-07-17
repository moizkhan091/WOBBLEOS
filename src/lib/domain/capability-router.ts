/**
 * UNIVERSAL ASK WOBBLE — CAPABILITY ROUTER (deterministic core).
 *
 * Ask WOBBLE is the command surface OVER the departments, never a giant generic prompt and never a fan-out
 * to every department (binding correction #7). This module answers one question deterministically: given a
 * capability + context, WHICH single department should own it — with confidence, cost awareness, client
 * scope, founder awareness, and an auditable reason. The free-text → capability step (intent analysis) may
 * later be upgraded with a model, but the ROUTING itself is pure and reproducible, so a founder can trust
 * where their command went.
 */

export interface DepartmentCapabilityInput {
  slug: string;
  status: string;
  operatingModel?: string;
  inboundCapabilities: string[];
  permittedDataClassifications: string[];
}

export interface CapabilityOwner {
  department: string;
  status: string;
  operatingModel: string;
  permittedDataClassifications: string[];
}

export type CapabilityRegistry = Record<string, CapabilityOwner[]>;

/** Build capability → owning-departments from the department definitions. Pure. */
export function buildCapabilityRegistry(departments: DepartmentCapabilityInput[]): CapabilityRegistry {
  const reg: CapabilityRegistry = {};
  for (const d of departments) {
    for (const cap of d.inboundCapabilities) {
      (reg[cap] ??= []).push({
        department: d.slug,
        status: d.status,
        operatingModel: d.operatingModel ?? "agent_team",
        permittedDataClassifications: d.permittedDataClassifications,
      });
    }
  }
  return reg;
}

export type RouteConfidence = "high" | "medium" | "none";

export interface RouteContext {
  /** Data classification of the work (internal | client_confidential | restricted | public). Client scope. */
  dataClassification?: string;
  /** The AUTHENTICATED founder (from the session) — carried for attribution, never used to personalise
   *  another founder's routing (binding correction #9). */
  founder?: string;
  clientWorkspaceId?: string | null;
}

/** A relative cost hint so the router (and founder) can weigh a route. agent_team runs a model team;
 *  service_department is deterministic; human_control_plane needs a person. */
export function operatingModelCost(model: string): "low" | "medium" | "high" {
  if (model === "service_department") return "low";
  if (model === "human_control_plane") return "high";
  return "medium"; // agent_team
}

export interface CapabilityRoute {
  capability: string;
  /** The chosen department, or null if none can take it. NEVER a list to fan out to. */
  department: string | null;
  confidence: RouteConfidence;
  cost: "low" | "medium" | "high" | null;
  /** Human-readable, auditable reason for the decision. */
  reason: string;
  /** Set when the route is blocked (e.g. data-classification) rather than merely absent. */
  blocked?: "unknown_capability" | "no_active_owner" | "data_classification";
  /** Other departments that also own the capability but were NOT chosen (transparency, not a fan-out). */
  alternatives: string[];
  founder?: string;
  clientWorkspaceId?: string | null;
}

/**
 * Route ONE capability to ONE department. Deterministic:
 *  - unknown capability → none (blocked: unknown_capability)
 *  - no ACTIVE owner → none (a declared-but-draft department cannot receive work)
 *  - client scope: an owner that may not handle the data classification is filtered out; if that leaves
 *    nobody, the route is BLOCKED (never routed to a department that would leak/over-permit)
 *  - exactly one eligible owner → high confidence
 *  - several eligible owners → the first (stable order), medium confidence, the rest listed as alternatives
 *    — chosen ONE, never a fan-out.
 */
export function routeCapability(registry: CapabilityRegistry, capability: string, ctx: RouteContext = {}): CapabilityRoute {
  const base = { capability, alternatives: [] as string[], founder: ctx.founder, clientWorkspaceId: ctx.clientWorkspaceId ?? null };
  const owners = registry[capability];
  if (!owners || owners.length === 0) {
    return { ...base, department: null, confidence: "none", cost: null, reason: `no department declares capability '${capability}'`, blocked: "unknown_capability" };
  }
  const active = owners.filter((o) => o.status === "active");
  if (active.length === 0) {
    return { ...base, department: null, confidence: "none", cost: null, reason: `capability '${capability}' is owned only by non-active departments`, blocked: "no_active_owner", alternatives: owners.map((o) => o.department) };
  }
  const eligible = ctx.dataClassification
    ? active.filter((o) => o.permittedDataClassifications.includes(ctx.dataClassification!))
    : active;
  if (eligible.length === 0) {
    return { ...base, department: null, confidence: "none", cost: null, reason: `no active owner of '${capability}' may handle data classification '${ctx.dataClassification}'`, blocked: "data_classification", alternatives: active.map((o) => o.department) };
  }
  const chosen = eligible[0];
  const rest = eligible.slice(1).map((o) => o.department);
  return {
    ...base,
    department: chosen.department,
    confidence: eligible.length === 1 ? "high" : "medium",
    cost: operatingModelCost(chosen.operatingModel),
    reason:
      eligible.length === 1
        ? `exactly one active department owns '${capability}'${ctx.dataClassification ? ` for '${ctx.dataClassification}'` : ""}`
        : `${eligible.length} active departments own '${capability}'; routed to '${chosen.department}' (stable pick), others available`,
    alternatives: rest,
  };
}
