import { z } from "zod";
import { newId } from "@/lib/ids";

/**
 * Security & Governance domain (WOB-UAT-024).
 *
 * DOCTRINE: security decisions are DETERMINISTIC wherever the rule is decidable.
 *
 * This is not a shortcut, it is the point. A governance verdict that can disagree with the enforcement
 * it describes is worthless — the same argument that made `security_tenant_isolation` score
 * `validateHandoff`'s real output rather than an LLM's opinion of it. So every rule here is a pure
 * function over real state: same inputs, same finding, every time, and reproducible by a founder or an
 * auditor without a model call.
 *
 * An agent may ADD interpretation on top of a finding (context, priority, a suggested remediation). It
 * may never overturn one. `detectionMethod` records which kind of statement a finding is, because
 * "computed fact" and "opinion" carry very different weight and a founder must be able to tell them
 * apart at a glance.
 *
 * Pure + injectable: no DB, no clock, no env. The IO layer lives in `src/lib/security-governance/`.
 */

export const FINDING_KINDS = ["access", "policy", "isolation", "config", "provider", "backup", "version"] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export const FINDING_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const FINDING_STATUSES = ["open", "acknowledged", "remediating", "retest", "resolved", "accepted_risk", "false_positive"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

/** How a finding was reached. A founder must be able to tell a computed fact from an opinion. */
export const DETECTION_METHODS = ["deterministic", "evidence", "agent_judgment"] as const;
export type DetectionMethod = (typeof DETECTION_METHODS)[number];

export const INCIDENT_STATUSES = ["detected", "contained", "remediating", "recovered", "resolved", "closed"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const RISK_LIKELIHOODS = ["rare", "unlikely", "possible", "likely", "almost_certain"] as const;
export type RiskLikelihood = (typeof RISK_LIKELIHOODS)[number];

export const RISK_STATUSES = ["open", "mitigating", "accepted", "closed"] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

export const KILL_SWITCH_TARGETS = ["agent", "workflow", "provider", "department"] as const;
export type KillSwitchTarget = (typeof KILL_SWITCH_TARGETS)[number];

// ---- finding construction -----------------------------------------------------------------------

export interface SecurityFindingDraft {
  kind: FindingKind;
  severity: FindingSeverity;
  title: string;
  detail: string;
  affectedAssetType: string;
  affectedAssetId?: string | null;
  clientWorkspaceId?: string | null;
  detectedBy: string;
  detectionMethod?: DetectionMethod;
  evidence?: Record<string, unknown>;
  reproduction?: string | null;
  remediation?: string | null;
  remediationOwner?: string | null;
  /** Stable identity of the PROBLEM (not the occurrence) — one open finding per real problem. */
  dedupeKey: string;
}

export const securityFindingDraftSchema = z.object({
  kind: z.enum(FINDING_KINDS),
  severity: z.enum(FINDING_SEVERITIES),
  title: z.string().trim().min(1),
  detail: z.string().trim().min(1),
  affectedAssetType: z.string().trim().min(1),
  affectedAssetId: z.string().trim().min(1).nullable().default(null),
  clientWorkspaceId: z.string().trim().min(1).nullable().default(null),
  detectedBy: z.string().trim().min(1),
  detectionMethod: z.enum(DETECTION_METHODS).default("deterministic"),
  evidence: z.record(z.string(), z.unknown()).default({}),
  reproduction: z.string().trim().min(1).nullable().default(null),
  remediation: z.string().trim().min(1).nullable().default(null),
  remediationOwner: z.string().trim().min(1).nullable().default(null),
  dedupeKey: z.string().trim().min(1).max(200),
});

// ---- the deterministic rules ---------------------------------------------------------------------

/** Real state the access review reads. Supplied by the IO layer; never fetched here. */
export interface AccessReviewState {
  founders: {
    id: string;
    displayName: string;
    email: string | null;
    status: string; // active | disabled
    isSuperAdmin: boolean;
    passwordSet: boolean;
    lastLoginAt: Date | null;
    passwordChangedAt: Date | null;
  }[];
  /** LIVE sessions (status active, not expired) with their owning founder. */
  sessions: { id: string; founderId: string | null; status: string; expiresAt: Date | null; lastSeenAt: Date | null }[];
  now: Date;
}

/** A disabled account whose password still works, a live session on a disabled account, etc. */
export const STALE_SESSION_DAYS = 30;
export const DORMANT_ACCOUNT_DAYS = 90;

/**
 * ACCESS GOVERNANCE — deterministic.
 *
 * Every rule here is a real, decidable question about real rows. Notably it does NOT flag "no MFA" or
 * other things it cannot actually observe: a finding must be reproducible from the evidence it carries,
 * and a governance system that reports unverifiable concerns trains founders to ignore it.
 */
export function reviewAccess(state: AccessReviewState): SecurityFindingDraft[] {
  const findings: SecurityFindingDraft[] = [];
  const byId = new Map(state.founders.map((f) => [f.id, f]));

  // 1. A LIVE session belonging to a DISABLED account. This is the one that matters most: disabling an
  //    account is the containment action, and a surviving session means containment silently failed.
  for (const s of state.sessions) {
    if (s.status !== "active") continue;
    if (s.expiresAt && s.expiresAt.getTime() <= state.now.getTime()) continue; // expired = already dead
    const owner = s.founderId ? byId.get(s.founderId) : undefined;
    if (owner && owner.status === "disabled") {
      findings.push({
        kind: "access",
        severity: "critical",
        title: `Live session on disabled account '${owner.displayName}'`,
        detail: `Account '${owner.displayName}' (${owner.id}) is disabled, but session ${s.id} is still active${s.expiresAt ? ` until ${s.expiresAt.toISOString()}` : ""}. Disabling an account is a containment action; a surviving session means containment did not take effect.`,
        affectedAssetType: "auth_session",
        affectedAssetId: s.id,
        detectedBy: "access_policy_agent",
        detectionMethod: "deterministic",
        evidence: { sessionId: s.id, founderId: owner.id, accountStatus: owner.status, sessionStatus: s.status, expiresAt: s.expiresAt?.toISOString() ?? null },
        reproduction: `SELECT s.id, f.status FROM auth_sessions s JOIN founder_profiles f ON f.id = s.founder_id WHERE s.status='active' AND f.status='disabled';`,
        remediation: `Revoke session ${s.id} (POST /api/auth/accounts/${owner.id}/action {"action":"revoke_sessions"}).`,
        dedupeKey: `access:live_session_on_disabled:${s.id}`,
      });
    }
    // 2. An ORPHAN session — no owning account row at all. Attribution is impossible for it.
    if (s.founderId && !owner) {
      findings.push({
        kind: "access",
        severity: "high",
        title: `Session ${s.id} references a founder that does not exist`,
        detail: `Session ${s.id} carries founder_id '${s.founderId}' with no matching founder_profiles row. Actions taken by this session cannot be attributed to a real account.`,
        affectedAssetType: "auth_session",
        affectedAssetId: s.id,
        detectedBy: "access_policy_agent",
        detectionMethod: "deterministic",
        evidence: { sessionId: s.id, danglingFounderId: s.founderId },
        remediation: `Revoke the orphan session and investigate how it was issued.`,
        dedupeKey: `access:orphan_session:${s.id}`,
      });
    }
  }

  // 3. An ACTIVE account with no password set — it cannot be used, but it also cannot be audited as
  //    "closed". This is a config gap, not an attack, hence medium.
  for (const f of state.founders) {
    if (f.status === "active" && !f.passwordSet) {
      findings.push({
        kind: "access",
        severity: "medium",
        title: `Active account '${f.displayName}' has no password set`,
        detail: `Account '${f.displayName}' (${f.id}) is active but has no password hash, so it can never authenticate. An active-but-unusable account is ambiguous: it is neither working nor deliberately closed.`,
        affectedAssetType: "founder_account",
        affectedAssetId: f.id,
        detectedBy: "access_policy_agent",
        detectionMethod: "deterministic",
        evidence: { founderId: f.id, status: f.status, passwordSet: false },
        remediation: `Bootstrap a password (npm run auth:bootstrap) or disable the account so its state is unambiguous.`,
        dedupeKey: `access:active_without_password:${f.id}`,
      });
    }
  }

  // 4. MORE THAN ONE super-admin. Not automatically wrong, but it is a privilege concentration a founder
  //    should have decided deliberately rather than drifted into.
  const supers = state.founders.filter((f) => f.isSuperAdmin && f.status === "active");
  if (supers.length > 1) {
    findings.push({
      kind: "access",
      severity: "medium",
      title: `${supers.length} active super-admins`,
      detail: `Super-admin can disable accounts and revoke any founder's sessions. ${supers.length} accounts currently hold it: ${supers.map((s) => s.displayName).join(", ")}. Confirm this is deliberate.`,
      affectedAssetType: "founder_account",
      affectedAssetId: null,
      detectedBy: "access_policy_agent",
      detectionMethod: "deterministic",
      evidence: { superAdmins: supers.map((s) => ({ id: s.id, name: s.displayName })) },
      remediation: `Remove super-admin from any account that does not require it.`,
      dedupeKey: `access:multiple_super_admins:${supers.map((s) => s.id).sort().join(",")}`,
    });
  }

  // 5. ZERO active super-admins — nobody can perform account administration, so the OS cannot be governed.
  if (supers.length === 0 && state.founders.length > 0) {
    findings.push({
      kind: "access",
      severity: "high",
      title: "No active super-admin",
      detail: "No active account holds super-admin, so no one can disable a compromised account or revoke its sessions. The OS cannot be governed in an incident.",
      affectedAssetType: "founder_account",
      affectedAssetId: null,
      detectedBy: "access_policy_agent",
      detectionMethod: "deterministic",
      evidence: { activeFounders: state.founders.filter((f) => f.status === "active").length, superAdmins: 0 },
      remediation: `Grant super-admin to exactly one accountable founder.`,
      dedupeKey: "access:no_super_admin",
    });
  }

  return findings;
}

/** Real policy/config state the policy review reads. */
export interface PolicyReviewState {
  /** Spend caps as configured (budget_caps). */
  budgetCaps: { id: string; category: string; period: string; amount: number; enabled: boolean }[];
  /** Autonomy grants currently in force. */
  autonomyPolicies: { id: string; category: string; grantedLevel: string; status: string; maxRiskLevel: string | null; maxFinancialCents: number | null; approvedBy: string }[];
  /** Departments and whether each is permitted to handle client_confidential / restricted data. */
  departments: { slug: string; status: string; permittedDataClassifications: string[] }[];
  now: Date;
}

/**
 * POLICY GOVERNANCE — deterministic.
 *
 * The rules encode the actual doctrine already written into the codebase, so policy review and runtime
 * enforcement cannot drift apart:
 *  - `sensitivityCap` (domain/autonomy.ts) hard-caps risky work at `confirm`, so an `autonomous` grant
 *    for a high-risk category is a real contradiction worth surfacing.
 *  - a disabled spend cap means nothing enforces the limit it appears to state.
 */
export function reviewPolicies(state: PolicyReviewState): SecurityFindingDraft[] {
  const findings: SecurityFindingDraft[] = [];

  // 1. A spend cap that exists but is DISABLED — it reads as a control while enforcing nothing. This is
  //    exactly the "decorative control" class the campaign exists to eliminate.
  for (const cap of state.budgetCaps.filter((c) => !c.enabled)) {
    findings.push({
      kind: "policy",
      severity: "high",
      title: `Spend cap '${cap.category}' (${cap.period}) is DISABLED`,
      detail: `A budget cap of ${cap.amount} exists for '${cap.category}' per ${cap.period} but is disabled, so nothing enforces it. A control that appears to exist and enforces nothing is worse than no control: it produces false confidence.`,
      affectedAssetType: "budget_cap",
      affectedAssetId: cap.id,
      detectedBy: "risk_compliance_agent",
      detectionMethod: "deterministic",
      evidence: { capId: cap.id, category: cap.category, period: cap.period, amount: cap.amount, enabled: false },
      remediation: `Enable the cap, or delete it so the absence of a limit is explicit.`,
      dedupeKey: `policy:disabled_budget_cap:${cap.id}`,
    });
  }

  // 2. An `autonomous` grant for a HIGH/CRITICAL risk category. `sensitivityCap` caps such work at
  //    `confirm` at runtime, so the grant claims an authority the engine will refuse to honour — the
  //    policy record and the runtime disagree, and a founder reading the policy is misinformed.
  for (const p of state.autonomyPolicies.filter((p) => p.status === "active" && p.grantedLevel === "autonomous")) {
    if (p.maxRiskLevel === "high" || p.maxRiskLevel === "critical") {
      findings.push({
        kind: "policy",
        severity: "medium",
        title: `Autonomy grant '${p.category}' claims autonomous up to ${p.maxRiskLevel} risk`,
        detail: `Policy ${p.id} grants 'autonomous' for '${p.category}' with maxRiskLevel '${p.maxRiskLevel}', but sensitivityCap() hard-caps high/critical work at 'confirm' regardless. The grant therefore claims an authority the engine will not honour, so the written policy and the runtime disagree.`,
        affectedAssetType: "autonomy_policy",
        affectedAssetId: p.id,
        detectedBy: "risk_compliance_agent",
        detectionMethod: "deterministic",
        evidence: { policyId: p.id, category: p.category, grantedLevel: p.grantedLevel, maxRiskLevel: p.maxRiskLevel, runtimeCap: "confirm", approvedBy: p.approvedBy },
        remediation: `Lower maxRiskLevel to medium, or lower grantedLevel to 'confirm' so the record matches enforcement.`,
        dedupeKey: `policy:autonomy_exceeds_sensitivity_cap:${p.id}`,
      });
    }
  }

  // 3. An ACTIVE department permitted to handle `restricted` data. Not wrong, but it is the highest
  //    classification and should be a deliberate, reviewed grant rather than a default.
  for (const d of state.departments.filter((d) => d.status === "active" && d.permittedDataClassifications.includes("restricted"))) {
    findings.push({
      kind: "policy",
      severity: "low",
      title: `Department '${d.slug}' may handle RESTRICTED data`,
      detail: `'${d.slug}' is active and permitted the highest data classification. Confirm this is required — the classification gate is enforced at dispatch, so a needless grant widens real blast radius.`,
      affectedAssetType: "department",
      affectedAssetId: d.slug,
      detectedBy: "risk_compliance_agent",
      detectionMethod: "deterministic",
      evidence: { department: d.slug, permittedDataClassifications: d.permittedDataClassifications },
      remediation: `Remove 'restricted' from the department's permittedDataClassifications if it is not genuinely needed.`,
      dedupeKey: `policy:restricted_grant:${d.slug}`,
    });
  }

  return findings;
}

// ---- kill switches -------------------------------------------------------------------------------

export interface KillSwitchRow {
  targetType: string;
  targetRef: string;
  state: string;
  reason: string;
}

/**
 * Is a target killed? Pure, so the enforcement point never needs a DB round-trip decision.
 *
 * Fails CLOSED on an exact match only: a switch on `agent:x` does not disable `agent:xy`. A kill switch
 * that over-matches is as dangerous as one that under-matches — an operator must be able to predict
 * exactly what a switch turns off.
 */
export function isKilled(switches: KillSwitchRow[], targetType: KillSwitchTarget, targetRef: string): { killed: boolean; reason: string | null } {
  const hit = switches.find((s) => s.state === "disabled" && s.targetType === targetType && s.targetRef === targetRef);
  return hit ? { killed: true, reason: hit.reason } : { killed: false, reason: null };
}

// ---- governance run ------------------------------------------------------------------------------

/** One governance review pass: what ran, what it found, and — crucially — what it could NOT check. */
export interface GovernanceRunResult {
  runId: string;
  startedAt: Date;
  checks: { check: string; ran: boolean; findings: number; note?: string }[];
  findings: SecurityFindingDraft[];
  /** Checks that could not run. NEVER silently dropped — an unrun check is not a clean result. */
  skipped: { check: string; reason: string }[];
}

export function newGovernanceRunId(): string {
  return newId("govrun");
}

/**
 * Merge the deterministic reviews into one run.
 *
 * `skipped` is a first-class output, not an afterthought. A governance review that could not read
 * sessions and reports "0 findings" is indistinguishable from a clean bill of health unless it says so
 * — and that is precisely how a security control becomes decorative.
 */
export function assembleGovernanceRun(input: {
  runId: string;
  startedAt: Date;
  access?: { state: AccessReviewState } | { skipped: string };
  policy?: { state: PolicyReviewState } | { skipped: string };
}): GovernanceRunResult {
  const checks: GovernanceRunResult["checks"] = [];
  const skipped: GovernanceRunResult["skipped"] = [];
  const findings: SecurityFindingDraft[] = [];

  if (input.access && "state" in input.access) {
    const f = reviewAccess(input.access.state);
    findings.push(...f);
    checks.push({ check: "access_review", ran: true, findings: f.length });
  } else if (input.access && "skipped" in input.access) {
    skipped.push({ check: "access_review", reason: input.access.skipped });
    checks.push({ check: "access_review", ran: false, findings: 0, note: input.access.skipped });
  }

  if (input.policy && "state" in input.policy) {
    const f = reviewPolicies(input.policy.state);
    findings.push(...f);
    checks.push({ check: "policy_review", ran: true, findings: f.length });
  } else if (input.policy && "skipped" in input.policy) {
    skipped.push({ check: "policy_review", reason: input.policy.skipped });
    checks.push({ check: "policy_review", ran: false, findings: 0, note: input.policy.skipped });
  }

  return { runId: input.runId, startedAt: input.startedAt, checks, findings, skipped };
}

/** The worst severity present — what the founder should react to first. */
export function worstSeverity(findings: { severity: FindingSeverity }[]): FindingSeverity | null {
  const order: FindingSeverity[] = ["critical", "high", "medium", "low"];
  for (const s of order) if (findings.some((f) => f.severity === s)) return s;
  return null;
}

/**
 * Does this run require founder attention? A clean run must be provably clean: if ANY check could not
 * run, the answer is yes regardless of the finding count.
 */
export function requiresFounderAttention(run: GovernanceRunResult): boolean {
  if (run.skipped.length > 0) return true;
  const worst = worstSeverity(run.findings);
  return worst === "critical" || worst === "high";
}
