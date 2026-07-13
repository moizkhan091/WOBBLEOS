// Earned autonomy — pure domain (Phase 6).
//
// Autonomy is PER-ACTION and EARNED, never a global switch. Each action resolves to exactly one level on the
// ladder Observe → Inform → Recommend → Confirm → Autonomous, from the autonomy POLICIES that match its
// (category + scope + conditions). The baseline is `recommend` — the OS always at least informs + recommends,
// and NEVER acts autonomously without an explicit, condition-matched grant. Hard safety CAPS override any
// policy: an irreversible, high/critical-risk, money-moving, or not-yet-QA-passed action can never exceed
// `confirm`. This keeps a founder in the loop exactly where it matters and lets autonomy grow only where it
// has been explicitly, narrowly earned.

export const AUTONOMY_LEVELS = ["observe", "inform", "recommend", "confirm", "autonomous"] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

const LEVEL_RANK: Record<AutonomyLevel, number> = { observe: 0, inform: 1, recommend: 2, confirm: 3, autonomous: 4 };
const RISK_RANK: Record<RiskTier, number> = { low: 0, medium: 1, high: 2, critical: 3 };
export type RiskTier = "low" | "medium" | "high" | "critical";

/** The `confirm` ceiling that no policy can exceed for a sensitive action. */
const CONFIRM_CEILING: AutonomyLevel = "confirm";

/** The default, ungranted baseline: inform + recommend, but never act without an explicit grant. */
export const DEFAULT_AUTONOMY_LEVEL: AutonomyLevel = "recommend";

export interface AutonomyAction {
  /** Action category, e.g. "content.publish", "finance.invoice", "crm.stage_move". Policies match this exactly. */
  category: string;
  actor?: string | null;
  companyId?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  riskLevel?: RiskTier;
  classification?: string;
  /** Cents of money this action moves (>0 → financial → capped at confirm). */
  financialCents?: number;
  /** Can the action be undone? Irreversible → capped at confirm. */
  reversible?: boolean;
  /** Has an independent QA gate released it? Explicitly false → capped at confirm. */
  qaPassed?: boolean;
}

export interface AutonomyPolicy {
  id: string;
  /** The action category this policy grants for (exact match). */
  category: string;
  grantedLevel: AutonomyLevel;
  status: "active" | "revoked";
  // Narrowing conditions — a policy applies ONLY when every PRESENT condition matches the action.
  actor?: string | null;
  companyId?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  /** The policy voids for an action whose risk exceeds this tier. */
  maxRiskLevel?: RiskTier;
  /** The policy voids for an action moving more than this many cents. */
  maxFinancialCents?: number;
  /** The policy voids for an action that has not passed QA. */
  requiresQaPass?: boolean;
}

export interface AutonomyDecision {
  level: AutonomyLevel;
  /** The policy that granted the (pre-cap) level, or null when the baseline applied. */
  appliedPolicyId: string | null;
  /** True when a hard safety cap lowered the granted level. */
  capped: boolean;
  reason: string;
}

function condMatches(cond: string | null | undefined, actual: string | null | undefined): boolean {
  // A condition that is absent (undefined) does not narrow; a present condition must equal the action's value.
  return cond === undefined || cond === null || cond === actual;
}

/** Does this active policy apply to this action? Category + every present narrowing condition must match. */
export function policyApplies(policy: AutonomyPolicy, action: AutonomyAction): boolean {
  if (policy.status !== "active") return false;
  if (policy.category !== action.category) return false;
  if (!condMatches(policy.actor, action.actor)) return false;
  if (!condMatches(policy.companyId, action.companyId)) return false;
  if (!condMatches(policy.clientId, action.clientId)) return false;
  if (!condMatches(policy.projectId, action.projectId)) return false;
  if (policy.maxRiskLevel !== undefined && action.riskLevel !== undefined && RISK_RANK[action.riskLevel] > RISK_RANK[policy.maxRiskLevel]) return false;
  if (policy.maxFinancialCents !== undefined && (action.financialCents ?? 0) > policy.maxFinancialCents) return false;
  if (policy.requiresQaPass && action.qaPassed !== true) return false;
  return true;
}

/** The hard cap: a sensitive action can never exceed `confirm`, regardless of any policy. */
function sensitivityCap(action: AutonomyAction): { capped: boolean; reason: string } {
  if (action.reversible === false) return { capped: true, reason: "irreversible action — capped at confirm" };
  if (action.riskLevel === "high" || action.riskLevel === "critical") return { capped: true, reason: `${action.riskLevel}-risk action — capped at confirm` };
  if ((action.financialCents ?? 0) > 0) return { capped: true, reason: "financial action (moves money) — capped at confirm" };
  if (action.qaPassed === false) return { capped: true, reason: "action has not passed QA — capped at confirm" };
  return { capped: false, reason: "" };
}

/**
 * Resolve the effective autonomy level for a single action. Pure + deterministic. There is NO global switch:
 * each action is resolved independently from the policies that match its own category + scope + conditions.
 */
export function resolveAutonomyLevel(action: AutonomyAction, policies: AutonomyPolicy[]): AutonomyDecision {
  // The highest level granted by any matching active policy (baseline `recommend` when none match).
  let best: AutonomyLevel = DEFAULT_AUTONOMY_LEVEL;
  let appliedPolicyId: string | null = null;
  for (const p of policies) {
    if (!policyApplies(p, action)) continue;
    if (LEVEL_RANK[p.grantedLevel] > LEVEL_RANK[best]) {
      best = p.grantedLevel;
      appliedPolicyId = p.id;
    }
  }
  // Apply the hard sensitivity cap — no policy can push a sensitive action past confirm.
  const cap = sensitivityCap(action);
  if (cap.capped && LEVEL_RANK[best] > LEVEL_RANK[CONFIRM_CEILING]) {
    return { level: CONFIRM_CEILING, appliedPolicyId, capped: true, reason: cap.reason };
  }
  return { level: best, appliedPolicyId, capped: false, reason: appliedPolicyId ? "granted by an earned, condition-matched policy" : "no policy — baseline recommend (never silent autonomy)" };
}

/** Convenience: may this action run WITHOUT a founder in the loop (i.e. fully autonomous)? */
export function isAutonomous(action: AutonomyAction, policies: AutonomyPolicy[]): boolean {
  return resolveAutonomyLevel(action, policies).level === "autonomous";
}
