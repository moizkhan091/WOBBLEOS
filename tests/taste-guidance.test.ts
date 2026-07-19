import { describe, expect, it } from "vitest";
import { formatTasteGuidance } from "@/lib/domain/taste";

/**
 * The READ-BACK half of the taste loop: learned founder taste (preferenceWeights + hardConstraints) must turn
 * into a generation-prompt block and reach the content prompt. Without this, taste is captured + displayed but
 * never shapes output (the module's whole purpose). Proves the formatter + that the block lands in the prompt.
 */
describe("formatTasteGuidance", () => {
  it("turns weights into FAVOUR/AVOID + lists hard constraints", () => {
    const g = formatTasteGuidance({
      preferenceWeights: { "teach-first hooks": 0.8, "specific numbers": 0.5, "generic hype": -0.7, "weak CTAs": -0.4, tiny: 0.05 },
      hardConstraints: ["never use emojis in headlines"],
    });
    expect(g).toMatch(/FAVOUR:.*teach-first hooks/);
    expect(g).toMatch(/AVOID:.*generic hype/);
    expect(g).toMatch(/CONSTRAINT: never use emojis/);
    expect(g).not.toMatch(/tiny/); // weak weight (<0.15) is dropped as noise
  });

  it("returns empty for an untrained/empty profile (no noise injected)", () => {
    expect(formatTasteGuidance(null)).toBe("");
    expect(formatTasteGuidance({ preferenceWeights: {}, hardConstraints: [] })).toBe("");
    expect(formatTasteGuidance({ preferenceWeights: { x: 0.05 }, hardConstraints: [] })).toBe("");
  });

  it("produces a block that starts with the LEARNED FOUNDER TASTE header (what the content prompt injects verbatim)", () => {
    const g = formatTasteGuidance({ preferenceWeights: { "teach-first hooks": 0.9 }, hardConstraints: ["no clickbait"] });
    expect(g).toMatch(/^LEARNED FOUNDER TASTE/);
    expect(g).toMatch(/CONSTRAINT: no clickbait/);
  });
});
