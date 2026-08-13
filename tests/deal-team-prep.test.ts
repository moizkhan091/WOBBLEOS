import { describe, expect, it } from "vitest";
import { planDealTeamPrep, type PrepCandidate } from "@/lib/domain/deal-team-prep";

const cand = (over: Partial<PrepCandidate> & { companyId: string; name: string }): PrepCandidate => ({
  nextKind: "book_call",
  urgency: 78,
  approvedFindingCount: 5,
  latestFindingAt: new Date("2026-08-10T00:00:00Z"),
  briefGeneratedAt: null,
  ...over,
});

describe("who the deal team prepares for tonight", () => {
  it("prepares for a client with findings and a conversation coming", () => {
    const plan = planDealTeamPrep([cand({ companyId: "c1", name: "Bright Smile" })]);
    expect(plan.run.map((r) => r.companyId)).toEqual(["c1"]);
  });

  it("refuses to prepare from nothing", () => {
    // An objection brief with no approved findings is the agent inventing, which is worse than none.
    const plan = planDealTeamPrep([cand({ companyId: "c1", name: "X", approvedFindingCount: 0 })]);
    expect(plan.run).toEqual([]);
    expect(plan.skipped[0].because).toContain("would be invented");
  });

  it("skips a client nobody is about to speak to", () => {
    const plan = planDealTeamPrep([cand({ companyId: "c1", name: "X", nextKind: "none" })]);
    expect(plan.run).toEqual([]);
    expect(plan.skipped[0].because).toContain("not a conversation");
  });

  it("does not pay to regenerate a brief that is already current", () => {
    const plan = planDealTeamPrep([
      cand({ companyId: "c1", name: "X", latestFindingAt: new Date("2026-08-01"), briefGeneratedAt: new Date("2026-08-05") }),
    ]);
    expect(plan.run).toEqual([]);
    expect(plan.skipped[0].because).toContain("change nothing");
  });

  it("regenerates when new findings landed after the brief was written", () => {
    const plan = planDealTeamPrep([
      cand({ companyId: "c1", name: "X", latestFindingAt: new Date("2026-08-10"), briefGeneratedAt: new Date("2026-08-05") }),
    ]);
    expect(plan.run).toHaveLength(1);
    expect(plan.run[0].because).toContain("New findings were approved");
  });

  it("takes the most urgent first when more qualify than the cap allows", () => {
    const plan = planDealTeamPrep(
      [
        cand({ companyId: "low", name: "Low", urgency: 55, nextKind: "contact" }),
        cand({ companyId: "high", name: "High", urgency: 100, nextKind: "contact" }),
        cand({ companyId: "mid", name: "Mid", urgency: 78 }),
      ],
      2,
    );
    expect(plan.run.map((r) => r.companyId)).toEqual(["high", "mid"]);
  });

  it("names what it deferred instead of dropping it quietly", () => {
    const plan = planDealTeamPrep([cand({ companyId: "a", name: "A", urgency: 90 }), cand({ companyId: "b", name: "B", urgency: 80 })], 1);
    expect(plan.deferred.map((d) => d.companyId)).toEqual(["b"]);
  });

  it("spends nothing on a quiet night", () => {
    const plan = planDealTeamPrep([cand({ companyId: "c1", name: "X", nextKind: "none" }), cand({ companyId: "c2", name: "Y", approvedFindingCount: 0 })]);
    expect(plan.run).toEqual([]);
    expect(plan.deferred).toEqual([]);
  });

  it("spends nothing when there are no clients at all", () => {
    expect(planDealTeamPrep([])).toEqual({ run: [], deferred: [], skipped: [] });
  });

  it("treats a cap of zero as run nothing, not run everything", () => {
    const plan = planDealTeamPrep([cand({ companyId: "c1", name: "X" })], 0);
    expect(plan.run).toEqual([]);
    expect(plan.deferred).toHaveLength(1);
  });
});
