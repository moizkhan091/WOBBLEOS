import { describe, expect, it } from "vitest";
import { scoreProposal, rankProposals, historicalTestPasses, canApprove, canActivate, shouldRollback, transitionProposal, type ImprovementProposal } from "@/lib/domain/optimizer";

/** Controlled Dream/Optimizer (Phase 8): governed lifecycle, never silently rewrites production. */
const p = (over: Partial<ImprovementProposal> = {}): ImprovementProposal => ({ id: "o1", pattern: "repeated manual step", evidence: ["e1"], hypothesis: "automate it", estimatedValue: 80, estimatedCostCents: 0, riskLevel: "low", historicalTest: { baselineMetric: 50, candidateMetric: 70, sampleSize: 30 }, status: "proposed", version: 1, ...over });

describe("optimizer scoring + ranking", () => {
  it("favors high value, low cost, low risk", () => {
    const hi = scoreProposal({ estimatedValue: 90, estimatedCostCents: 0, riskLevel: "low" });
    const lo = scoreProposal({ estimatedValue: 90, estimatedCostCents: 0, riskLevel: "critical" });
    expect(hi).toBeGreaterThan(lo); // same value, higher risk → lower score
    const ranked = rankProposals([{ id: "b", estimatedValue: 40, estimatedCostCents: 0, riskLevel: "low" }, { id: "a", estimatedValue: 90, estimatedCostCents: 0, riskLevel: "low" }]);
    expect(ranked[0].id).toBe("a");
  });
});

describe("optimizer governance (never silently rewrites)", () => {
  it("a proposal with a PASSING historical test can be approved; a failing/untested one cannot", () => {
    expect(canApprove(p())).toBe(true);
    expect(canApprove(p({ historicalTest: { baselineMetric: 70, candidateMetric: 50, sampleSize: 30 } }))).toBe(false); // candidate worse
    expect(canApprove(p({ historicalTest: null }))).toBe(false); // untested
    expect(historicalTestPasses(p())).toBe(true);
  });

  it("the ONLY path to active is proposed → approved → activate (no auto-activation)", () => {
    expect(canActivate(p({ status: "proposed" }))).toBe(false); // cannot skip approval
    expect(canActivate(p({ status: "approved" }))).toBe(true);
    expect(transitionProposal(p(), "approve")).toBe("approved");
    expect(transitionProposal(p({ status: "approved" }), "activate")).toBe("active");
    expect(() => transitionProposal(p({ status: "proposed" }), "activate")).toThrow(); // never skip approval
  });

  it("rolls back an active improvement that DEGRADES below baseline; refuses to roll back a healthy one", () => {
    expect(shouldRollback({ activeMetric: 40, baselineMetric: 50 })).toBe(true);
    expect(shouldRollback({ activeMetric: 60, baselineMetric: 50 })).toBe(false);
    expect(transitionProposal(p({ status: "active" }), "rollback", { activeMetric: 40, baselineMetric: 50 })).toBe("rolled_back");
    expect(() => transitionProposal(p({ status: "active" }), "rollback", { activeMetric: 60, baselineMetric: 50 })).toThrow();
  });

  it("cannot approve/activate a rejected proposal", () => {
    expect(() => transitionProposal(p({ status: "rejected" }), "approve")).toThrow();
    expect(() => transitionProposal(p({ status: "rejected" }), "activate")).toThrow();
  });
});
