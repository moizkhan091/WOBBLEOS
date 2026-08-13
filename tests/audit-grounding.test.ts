import { describe, expect, it } from "vitest";
import { keepGroundedOpportunities, buildOpportunityPrompt } from "@/lib/domain/paid-audit-graph";

const opp = (title: string, groundedIn: string) => ({
  title, area: "acquisition", service: "", description: "d", howItWorks: "h", expectedOutcome: "e",
  impact: "high" as const, difficulty: "medium" as const, kpis: ["k"], groundedIn,
});

/**
 * WOBBLE's own deal reviewer, on a real proposal: three line items "appear nowhere in the audit
 * findings". The audit was told to produce a COMPREHENSIVE set covering every system, so it invented
 * complaint tracking for a business that had never mentioned a complaint, and the proposal inherited it.
 */
describe("an opportunity must name where it came from", () => {
  it("keeps the ones traceable to something the client said", () => {
    const r = keepGroundedOpportunities({ opportunities: [
      opp("No-show reduction", "Bottleneck: 70 slots a week lost to no-shows."),
      opp("Complaint tracking", ""),
    ] });
    expect(r.kept).toHaveLength(1);
    expect(r.kept[0].title).toBe("No-show reduction");
  });

  it("names what it dropped, so an audit never quietly shrinks", () => {
    const r = keepGroundedOpportunities({ opportunities: [
      opp("No-show reduction", "Bottleneck: 70 slots a week lost."),
      opp("Complaint tracking", ""),
      opp("Seasonal campaigns", "  "),
    ] });
    expect(r.dropped).toEqual(["Complaint tracking", "Seasonal campaigns"]);
  });

  it("treats a token grounding as no grounding", () => {
    expect(keepGroundedOpportunities({ opportunities: [opp("Padding", "n/a")] }).kept[0].groundedIn).toBe("n/a");
  });

  it("keeps everything when NOTHING is grounded, since the model ignored the field", () => {
    // Throwing away a whole audit because one field was skipped is worse than keeping it.
    const r = keepGroundedOpportunities({ opportunities: [opp("A", ""), opp("B", "")] });
    expect(r.kept).toHaveLength(2);
    expect(r.dropped).toEqual([]);
  });

  it("handles an empty set without throwing", () => {
    expect(keepGroundedOpportunities({ opportunities: [] }).kept).toEqual([]);
  });
});

describe("the prompt asks for grounding rather than coverage", () => {
  const prompt = buildOpportunityPrompt(
    { businessName: "Zamzam Dental", industry: "healthcare", intakeNotes: "n", brain: [] },
    { situation: "s", acquisition: [], delivery: [], support: [], bottlenecks: [], keyMetrics: [] },
  );
  const system = prompt[0].content;

  it("no longer demands a comprehensive set covering every system", () => {
    expect(system).not.toContain("COMPREHENSIVE set");
    expect(system).not.toContain("aim for 10 to 14");
  });

  it("makes grounding the rule that matters", () => {
    expect(system).toContain("EVERY opportunity must trace to a bottleneck");
    expect(system).toContain("do not write the opportunity");
  });

  it("says plainly why, with the real example", () => {
    expect(system).toContain("never mentioned");
    expect(system).toContain("Five grounded opportunities beat fourteen");
  });

  it("stops asking the user message for a fixed count", () => {
    expect(prompt[1].content).not.toMatch(/12-20|full opportunity set/);
    expect(prompt[1].content).toContain("only the opportunities this material supports");
  });
});
