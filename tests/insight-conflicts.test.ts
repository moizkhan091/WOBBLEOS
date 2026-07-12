import { describe, expect, it } from "vitest";
import { detectInsightConflicts } from "@/lib/domain/intelligence";

/** Contradiction + dedup (Phase 5 mandate E) — same topic + same rec = duplicate; different rec = contradiction. */
describe("detectInsightConflicts", () => {
  it("flags a DUPLICATE (same type + topic + recommendation)", () => {
    const c = detectInsightConflicts([
      { id: "a", insightType: "content_pattern", title: "Observation-led hooks win", recommendation: "Use observation-led hooks" },
      { id: "b", insightType: "content_pattern", title: "observation-led hooks WIN", recommendation: "use observation-led hooks" },
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe("duplicate");
  });

  it("flags a CONTRADICTION (same type + topic, DIFFERENT recommendation) — never silently overwrites", () => {
    const c = detectInsightConflicts([
      { id: "a", insightType: "offer_opportunity", title: "Pricing strategy", recommendation: "Raise prices 20%" },
      { id: "b", insightType: "offer_opportunity", title: "Pricing strategy", recommendation: "Cut prices 20%" },
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe("contradiction");
    expect(c[0].aId).toBe("a");
    expect(c[0].bId).toBe("b");
  });

  it("does NOT conflate different topics or different insight types", () => {
    expect(detectInsightConflicts([
      { id: "a", insightType: "content_pattern", title: "Hooks", recommendation: "x" },
      { id: "b", insightType: "content_pattern", title: "Cadence", recommendation: "x" },
      { id: "c", insightType: "market_shift", title: "Hooks", recommendation: "x" },
    ])).toHaveLength(0);
  });
});
