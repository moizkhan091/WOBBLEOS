import { describe, expect, it } from "vitest";
import { hasEnoughToScore, planQualification, type QualifyCandidate } from "@/lib/domain/qualification-triage";

/**
 * A founder added a client, the container said "not qualified", and there was nothing to click.
 * Scoring is the one thing that should always happen, because everything downstream reads it: the
 * worklist ranks by it, the deal team quotes it, the next action depends on it.
 *
 * The council is EIGHT model calls, so the triage is what keeps this from emptying the account.
 */
const cand = (over: Partial<QualifyCandidate> & { companyId: string; name: string }): QualifyCandidate => ({
  assessmentCount: 0,
  hasIntake: true,
  approvedFindingCount: 0,
  hasIndustry: false,
  hasWebsite: false,
  createdAt: new Date("2026-08-13T10:00:00Z"),
  ...over,
});

describe("whether there is enough to score a client from", () => {
  it("scores from their own words on the form", () => {
    expect(hasEnoughToScore(cand({ companyId: "c", name: "n", hasIntake: true }))).toBe(true);
  });

  it("scores from findings approved off a call", () => {
    expect(hasEnoughToScore(cand({ companyId: "c", name: "n", hasIntake: false, approvedFindingCount: 4 }))).toBe(true);
  });

  it("scores a hand-typed client only when industry and website are both known", () => {
    const bare = { companyId: "c", name: "n", hasIntake: false } as const;
    expect(hasEnoughToScore(cand({ ...bare, hasIndustry: true, hasWebsite: true }))).toBe(true);
    expect(hasEnoughToScore(cand({ ...bare, hasIndustry: true }))).toBe(false);
    expect(hasEnoughToScore(cand({ ...bare, hasWebsite: true }))).toBe(false);
  });

  it("refuses a client that is only a name", () => {
    // Eight filters answered from a company name is a confident grade with nothing under it, and a
    // founder would make a real decision on it.
    expect(hasEnoughToScore(cand({ companyId: "c", name: "n", hasIntake: false }))).toBe(false);
  });
});

describe("who gets scored on this pass", () => {
  it("scores a new client who filled the form", () => {
    const plan = planQualification([cand({ companyId: "c1", name: "Quillon" })]);
    expect(plan.run.map((r) => r.companyId)).toEqual(["c1"]);
    expect(plan.run[0].because).toContain("readiness form");
  });

  it("never scores the same client twice", () => {
    const plan = planQualification([cand({ companyId: "c1", name: "X", assessmentCount: 1 })]);
    expect(plan.run).toEqual([]);
    expect(plan.skipped[0].because).toContain("Already scored");
  });

  it("says plainly why a thin client was skipped", () => {
    const plan = planQualification([cand({ companyId: "c1", name: "X", hasIntake: false })]);
    expect(plan.skipped[0].because).toContain("invents a grade");
  });

  it("takes the newest client first, because that is the one being looked at", () => {
    const plan = planQualification(
      [
        cand({ companyId: "old", name: "Old", createdAt: new Date("2026-08-01") }),
        cand({ companyId: "new", name: "New", createdAt: new Date("2026-08-13") }),
      ],
      1,
    );
    expect(plan.run.map((r) => r.companyId)).toEqual(["new"]);
    expect(plan.deferred.map((r) => r.companyId)).toEqual(["old"]);
  });

  it("caps the pass so a bulk import drains instead of emptying the account", () => {
    const many = Array.from({ length: 20 }, (_, i) => cand({ companyId: `c${i}`, name: `C${i}` }));
    expect(planQualification(many).run).toHaveLength(3);
    expect(planQualification(many).deferred).toHaveLength(17);
  });

  it("spends nothing when every client is already scored", () => {
    const plan = planQualification([cand({ companyId: "c1", name: "X", assessmentCount: 2 })]);
    expect(plan.run).toEqual([]);
    expect(plan.deferred).toEqual([]);
  });

  it("survives an empty database", () => {
    expect(planQualification([])).toEqual({ run: [], deferred: [], skipped: [] });
  });
});
