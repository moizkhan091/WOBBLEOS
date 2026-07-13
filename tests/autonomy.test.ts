import { describe, expect, it } from "vitest";
import { resolveAutonomyLevel, isAutonomous, type AutonomyPolicy, type AutonomyAction } from "@/lib/domain/autonomy";

/** Earned autonomy (Phase 6): per-action, never a global switch; hard caps keep the founder in the loop. */
const pol = (over: Partial<AutonomyPolicy>): AutonomyPolicy => ({ id: "p1", category: "content.publish", grantedLevel: "autonomous", status: "active", ...over });

describe("resolveAutonomyLevel", () => {
  it("defaults to RECOMMEND with no policy — never silent autonomy", () => {
    const d = resolveAutonomyLevel({ category: "content.publish", reversible: true }, []);
    expect(d.level).toBe("recommend");
    expect(d.appliedPolicyId).toBeNull();
  });

  it("an earned, condition-matched policy raises a SAFE action to autonomous", () => {
    const action: AutonomyAction = { category: "content.publish", clientId: "A", reversible: true, riskLevel: "low", financialCents: 0, qaPassed: true };
    const d = resolveAutonomyLevel(action, [pol({ clientId: "A" })]);
    expect(d.level).toBe("autonomous");
    expect(isAutonomous(action, [pol({ clientId: "A" })])).toBe(true);
  });

  it("a policy scoped to client A does NOT apply to client B (per-scope, no leakage)", () => {
    const d = resolveAutonomyLevel({ category: "content.publish", clientId: "B", reversible: true, riskLevel: "low", qaPassed: true }, [pol({ clientId: "A" })]);
    expect(d.level).toBe("recommend");
  });

  it("CAPS an irreversible action at confirm — even with an autonomous grant", () => {
    const d = resolveAutonomyLevel({ category: "content.publish", reversible: false, qaPassed: true }, [pol({})]);
    expect(d.level).toBe("confirm");
    expect(d.capped).toBe(true);
  });

  it("CAPS a high/critical-risk action at confirm", () => {
    expect(resolveAutonomyLevel({ category: "content.publish", riskLevel: "high", reversible: true }, [pol({})]).level).toBe("confirm");
    expect(resolveAutonomyLevel({ category: "content.publish", riskLevel: "critical", reversible: true }, [pol({})]).level).toBe("confirm");
  });

  it("CAPS a money-moving action at confirm (no autonomous financial writes)", () => {
    const d = resolveAutonomyLevel({ category: "finance.invoice", financialCents: 500000, reversible: true }, [pol({ category: "finance.invoice" })]);
    expect(d.level).toBe("confirm");
    expect(d.capped).toBe(true);
  });

  it("CAPS an action that has not passed QA at confirm", () => {
    expect(resolveAutonomyLevel({ category: "content.publish", qaPassed: false, reversible: true }, [pol({})]).level).toBe("confirm");
  });

  it("a policy voids above its maxFinancialCents / maxRiskLevel", () => {
    // within the policy's financial cap → grant applies (safe action) → autonomous.
    expect(resolveAutonomyLevel({ category: "finance.invoice", financialCents: 0, reversible: true, qaPassed: true }, [pol({ category: "finance.invoice", maxFinancialCents: 10000 })]).level).toBe("autonomous");
    // risk ABOVE the policy's maxRiskLevel → the policy voids → falls to the conservative baseline `recommend`
    // (the `confirm` ceiling only LOWERS an over-granted level, it never raises the baseline).
    expect(resolveAutonomyLevel({ category: "content.publish", riskLevel: "high", reversible: true }, [pol({ maxRiskLevel: "low" })]).level).toBe("recommend");
  });

  it("a REVOKED policy grants nothing", () => {
    expect(resolveAutonomyLevel({ category: "content.publish", reversible: true, qaPassed: true }, [pol({ status: "revoked" })]).level).toBe("recommend");
  });

  it("resolves each action INDEPENDENTLY — no global autonomous switch", () => {
    const policies = [pol({ id: "px", category: "content.publish", clientId: "A" })];
    // The same policy set yields autonomous for its exact action, but only recommend for a different category.
    expect(resolveAutonomyLevel({ category: "content.publish", clientId: "A", reversible: true, qaPassed: true }, policies).level).toBe("autonomous");
    expect(resolveAutonomyLevel({ category: "finance.invoice", clientId: "A", reversible: true, qaPassed: true }, policies).level).toBe("recommend");
  });
});
