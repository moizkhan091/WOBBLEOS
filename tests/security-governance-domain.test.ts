import { describe, expect, it } from "vitest";
import {
  reviewAccess,
  reviewPolicies,
  isKilled,
  assembleGovernanceRun,
  worstSeverity,
  requiresFounderAttention,
  securityFindingDraftSchema,
  type AccessReviewState,
  type PolicyReviewState,
} from "@/lib/domain/security-governance";

/**
 * WOB-UAT-024 — the deterministic governance rules.
 *
 * Every rule is a pure function over real state, so the same inputs always produce the same finding and
 * a founder or auditor can reproduce it without a model call. These tests exist to try to BREAK that:
 * to catch a rule that fires when it should not (a false alarm trains founders to ignore security), or
 * stays silent when it should fire (the control is decorative).
 */

const now = new Date("2026-07-16T12:00:00.000Z");

function founder(over: Partial<AccessReviewState["founders"][number]> = {}) {
  return {
    id: "founder_moiz",
    displayName: "Moiz",
    email: "moiz@wobble.local",
    status: "active",
    isSuperAdmin: true,
    passwordSet: true,
    lastLoginAt: now,
    passwordChangedAt: now,
    ...over,
  };
}

function session(over: Partial<AccessReviewState["sessions"][number]> = {}) {
  return { id: "sess_1", founderId: "founder_moiz", status: "active", expiresAt: new Date("2026-08-16T12:00:00.000Z"), lastSeenAt: now, ...over };
}

describe("reviewAccess — deterministic access governance", () => {
  it("a healthy org produces NO findings (no false alarms)", () => {
    const state: AccessReviewState = { founders: [founder(), founder({ id: "founder_ali", displayName: "Ali", isSuperAdmin: false })], sessions: [session()], now };
    expect(reviewAccess(state)).toEqual([]);
  });

  /**
   * The single most important rule here. Disabling an account IS the containment action; a surviving
   * live session means containment silently failed. This is the same class as WOB-UAT-029 (revocation
   * that only stopped writes) — a control that appears to work and does not.
   */
  it("CRITICAL: a live session on a disabled account", () => {
    const state: AccessReviewState = {
      founders: [founder({ id: "founder_ali", displayName: "Ali", status: "disabled", isSuperAdmin: false }), founder()],
      sessions: [session({ id: "sess_ali", founderId: "founder_ali" })],
      now,
    };
    const f = reviewAccess(state);
    const hit = f.find((x) => x.dedupeKey === "access:live_session_on_disabled:sess_ali");
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("critical");
    expect(hit!.detectionMethod).toBe("deterministic");
    expect(hit!.evidence).toMatchObject({ sessionId: "sess_ali", accountStatus: "disabled" });
    expect(hit!.reproduction).toMatch(/auth_sessions/); // reproducible by hand, not a bare assertion
    expect(hit!.remediation).toMatch(/revoke_sessions/i);
  });

  it("does NOT flag an EXPIRED session on a disabled account — it is already dead", () => {
    // A rule that fires on a session that cannot be used is a false alarm, and false alarms are what
    // teach founders to ignore the security screen.
    const state: AccessReviewState = {
      founders: [founder({ id: "founder_ali", displayName: "Ali", status: "disabled", isSuperAdmin: false }), founder()],
      sessions: [session({ id: "sess_old", founderId: "founder_ali", expiresAt: new Date("2026-01-01T00:00:00.000Z") })],
      now,
    };
    expect(reviewAccess(state).filter((f) => f.kind === "access" && f.dedupeKey.startsWith("access:live_session_on_disabled"))).toEqual([]);
  });

  it("does NOT flag a revoked session on a disabled account", () => {
    const state: AccessReviewState = {
      founders: [founder({ id: "founder_ali", displayName: "Ali", status: "disabled", isSuperAdmin: false }), founder()],
      sessions: [session({ id: "sess_revoked", founderId: "founder_ali", status: "revoked" })],
      now,
    };
    expect(reviewAccess(state).filter((f) => f.dedupeKey.startsWith("access:live_session_on_disabled"))).toEqual([]);
  });

  it("HIGH: an orphan session whose founder row does not exist (actions are unattributable)", () => {
    const state: AccessReviewState = { founders: [founder()], sessions: [session({ id: "sess_ghost", founderId: "founder_deleted" })], now };
    const hit = reviewAccess(state).find((f) => f.dedupeKey === "access:orphan_session:sess_ghost");
    expect(hit?.severity).toBe("high");
  });

  it("MEDIUM: an active account with no password is ambiguous — neither working nor closed", () => {
    const state: AccessReviewState = { founders: [founder(), founder({ id: "founder_haad", displayName: "Haad", isSuperAdmin: false, passwordSet: false })], sessions: [], now };
    const hit = reviewAccess(state).find((f) => f.dedupeKey === "access:active_without_password:founder_haad");
    expect(hit?.severity).toBe("medium");
  });

  it("does NOT flag a DISABLED account without a password — that is coherent", () => {
    const state: AccessReviewState = { founders: [founder(), founder({ id: "founder_x", displayName: "X", isSuperAdmin: false, passwordSet: false, status: "disabled" })], sessions: [], now };
    expect(reviewAccess(state).filter((f) => f.dedupeKey.startsWith("access:active_without_password"))).toEqual([]);
  });

  it("MEDIUM: more than one active super-admin (privilege concentration should be deliberate)", () => {
    const state: AccessReviewState = { founders: [founder(), founder({ id: "founder_ali", displayName: "Ali", isSuperAdmin: true })], sessions: [], now };
    const hit = reviewAccess(state).find((f) => f.dedupeKey.startsWith("access:multiple_super_admins"));
    expect(hit?.severity).toBe("medium");
    expect(hit!.title).toMatch(/2 active super-admins/);
  });

  it("HIGH: zero active super-admins — nobody can govern the OS in an incident", () => {
    const state: AccessReviewState = { founders: [founder({ isSuperAdmin: false })], sessions: [], now };
    const hit = reviewAccess(state).find((f) => f.dedupeKey === "access:no_super_admin");
    expect(hit?.severity).toBe("high");
  });

  it("does NOT report 'no super admin' for an EMPTY org (nothing to govern yet)", () => {
    expect(reviewAccess({ founders: [], sessions: [], now })).toEqual([]);
  });

  it("a DISABLED super-admin does not count as active cover", () => {
    const state: AccessReviewState = { founders: [founder({ status: "disabled" }), founder({ id: "founder_ali", displayName: "Ali", isSuperAdmin: false })], sessions: [], now };
    expect(reviewAccess(state).some((f) => f.dedupeKey === "access:no_super_admin")).toBe(true);
  });

  it("every finding it emits is a valid draft (schema-clean, so the IO layer cannot reject it)", () => {
    const state: AccessReviewState = {
      founders: [founder({ id: "founder_ali", displayName: "Ali", status: "disabled", isSuperAdmin: false }), founder({ isSuperAdmin: false })],
      sessions: [session({ id: "sess_ali", founderId: "founder_ali" }), session({ id: "sess_ghost", founderId: "nope" })],
      now,
    };
    const findings = reviewAccess(state);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(() => securityFindingDraftSchema.parse(f)).not.toThrow();
  });
});

describe("reviewPolicies — deterministic policy governance", () => {
  const clean: PolicyReviewState = {
    budgetCaps: [{ id: "cap_1", category: "content", period: "monthly", amount: 10000, enabled: true }],
    autonomyPolicies: [{ id: "pol_1", category: "content.publish", grantedLevel: "confirm", status: "active", maxRiskLevel: "medium", maxFinancialCents: 0, approvedBy: "Moiz" }],
    departments: [{ slug: "content", status: "active", permittedDataClassifications: ["internal", "client_confidential"] }],
    now,
  };

  it("a coherent configuration produces NO findings", () => {
    expect(reviewPolicies(clean)).toEqual([]);
  });

  /** The decorative-control class the whole campaign exists to eliminate. */
  it("HIGH: a spend cap that exists but is DISABLED enforces nothing", () => {
    const hit = reviewPolicies({ ...clean, budgetCaps: [{ id: "cap_x", category: "media", period: "monthly", amount: 5000, enabled: false }] })
      .find((f) => f.dedupeKey === "policy:disabled_budget_cap:cap_x");
    expect(hit?.severity).toBe("high");
    expect(hit!.detail).toMatch(/false confidence/);
  });

  /**
   * The policy record and the runtime disagreeing. `sensitivityCap` caps high/critical work at `confirm`
   * no matter what a grant says, so such a grant misinforms the founder reading it.
   */
  it("MEDIUM: an autonomous grant above what sensitivityCap will honour", () => {
    const hit = reviewPolicies({
      ...clean,
      autonomyPolicies: [{ id: "pol_bad", category: "content.publish", grantedLevel: "autonomous", status: "active", maxRiskLevel: "high", maxFinancialCents: 0, approvedBy: "Moiz" }],
    }).find((f) => f.dedupeKey === "policy:autonomy_exceeds_sensitivity_cap:pol_bad");
    expect(hit?.severity).toBe("medium");
    expect(hit!.evidence).toMatchObject({ runtimeCap: "confirm", grantedLevel: "autonomous" });
  });

  it("does NOT flag an autonomous grant capped at MEDIUM risk — that one the engine WILL honour", () => {
    expect(reviewPolicies({
      ...clean,
      autonomyPolicies: [{ id: "pol_ok", category: "content.publish", grantedLevel: "autonomous", status: "active", maxRiskLevel: "medium", maxFinancialCents: 0, approvedBy: "Moiz" }],
    }).filter((f) => f.kind === "policy" && f.dedupeKey.includes("autonomy_exceeds"))).toEqual([]);
  });

  it("does NOT flag a REVOKED autonomy grant", () => {
    expect(reviewPolicies({
      ...clean,
      autonomyPolicies: [{ id: "pol_dead", category: "x", grantedLevel: "autonomous", status: "revoked", maxRiskLevel: "critical", maxFinancialCents: 0, approvedBy: "Moiz" }],
    })).toEqual([]);
  });

  it("LOW: an active department granted RESTRICTED data widens real blast radius", () => {
    const hit = reviewPolicies({ ...clean, departments: [{ slug: "security_governance", status: "active", permittedDataClassifications: ["internal", "restricted"] }] })
      .find((f) => f.dedupeKey === "policy:restricted_grant:security_governance");
    expect(hit?.severity).toBe("low");
  });

  it("does NOT flag a DRAFT department with a restricted grant — it cannot run", () => {
    expect(reviewPolicies({ ...clean, departments: [{ slug: "x", status: "draft", permittedDataClassifications: ["restricted"] }] })).toEqual([]);
  });
});

describe("isKilled — targeted kill switches", () => {
  const switches = [{ targetType: "agent", targetRef: "content_worker", state: "disabled", reason: "suspected loop" }];

  it("reports a killed target with its reason", () => {
    expect(isKilled(switches, "agent", "content_worker")).toEqual({ killed: true, reason: "suspected loop" });
  });

  it("does not kill a DIFFERENT target of the same type", () => {
    expect(isKilled(switches, "agent", "ask_wobble").killed).toBe(false);
  });

  /** A switch that over-matches is as dangerous as one that under-matches: an operator must be able to
   *  predict exactly what it turns off. `agent:content_worker` must never disable `agent:content_worker_2`. */
  it("matches EXACTLY — never by prefix", () => {
    expect(isKilled(switches, "agent", "content_worker_2").killed).toBe(false);
    expect(isKilled([{ targetType: "agent", targetRef: "x", state: "disabled", reason: "r" }], "agent", "xy").killed).toBe(false);
  });

  it("does not cross target TYPES", () => {
    expect(isKilled(switches, "workflow", "content_worker").killed).toBe(false);
  });

  it("a REACTIVATED switch does not kill", () => {
    expect(isKilled([{ targetType: "agent", targetRef: "content_worker", state: "active", reason: "r" }], "agent", "content_worker").killed).toBe(false);
  });
});

describe("governance run assembly — an unrun check is NOT a clean result", () => {
  const accessState: AccessReviewState = { founders: [founder({ isSuperAdmin: false })], sessions: [], now };

  it("reports findings and which checks ran", () => {
    const run = assembleGovernanceRun({ runId: "govrun_1", startedAt: now, access: { state: accessState } });
    expect(run.findings.length).toBe(1); // no super-admin
    expect(run.checks).toEqual([{ check: "access_review", ran: true, findings: 1 }]);
    expect(run.skipped).toEqual([]);
  });

  /**
   * The failure mode this exists to prevent: a review that could not read sessions reporting "0 findings"
   * is indistinguishable from a clean bill of health. That is exactly how a security control becomes
   * decorative, so a skipped check is a first-class output and forces founder attention.
   */
  it("a SKIPPED check is recorded, not silently dropped", () => {
    const run = assembleGovernanceRun({ runId: "govrun_2", startedAt: now, access: { skipped: "database unavailable" } });
    expect(run.findings).toEqual([]);
    expect(run.skipped).toEqual([{ check: "access_review", reason: "database unavailable" }]);
    expect(run.checks[0]).toMatchObject({ check: "access_review", ran: false });
  });

  it("a run with a skipped check ALWAYS requires founder attention, even with zero findings", () => {
    const run = assembleGovernanceRun({ runId: "govrun_3", startedAt: now, access: { skipped: "db down" } });
    expect(run.findings).toEqual([]);
    expect(requiresFounderAttention(run)).toBe(true); // "I could not check" is not "all clear"
  });

  it("a genuinely clean run does NOT demand attention", () => {
    const healthy: AccessReviewState = { founders: [founder()], sessions: [session()], now };
    const run = assembleGovernanceRun({ runId: "govrun_4", startedAt: now, access: { state: healthy } });
    expect(run.findings).toEqual([]);
    expect(requiresFounderAttention(run)).toBe(false);
  });

  it("critical/high findings demand attention; low/medium alone do not", () => {
    const mk = (severity: "low" | "medium" | "high" | "critical") => ({ runId: "r", startedAt: now, checks: [], skipped: [], findings: [{ severity }] }) as never;
    expect(requiresFounderAttention(mk("critical"))).toBe(true);
    expect(requiresFounderAttention(mk("high"))).toBe(true);
    expect(requiresFounderAttention(mk("medium"))).toBe(false);
    expect(requiresFounderAttention(mk("low"))).toBe(false);
  });

  it("worstSeverity picks the worst, not the first", () => {
    expect(worstSeverity([{ severity: "low" }, { severity: "critical" }, { severity: "medium" }])).toBe("critical");
    expect(worstSeverity([])).toBeNull();
  });
});
