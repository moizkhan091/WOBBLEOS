import { describe, expect, it } from "vitest";
import { HOUSE_STYLE_PROMPT, containsBannedDash, sanitizeDeep, sanitizeHouseStyle, withHouseStyle } from "@/lib/domain/house-style";

describe("house style — the em dash is a brand problem, not a taste one", () => {
  it("replaces an em dash with the comma a human would have written", () => {
    expect(sanitizeHouseStyle("We map the business — then we price it.")).toBe("We map the business, then we price it.");
    expect(sanitizeHouseStyle("Front desk is slammed—nobody replies.")).toBe("Front desk is slammed, nobody replies.");
  });

  it("keeps a numeric range readable instead of turning it into two figures", () => {
    expect(sanitizeHouseStyle("worth 45,000–50,000 a year")).toBe("worth 45,000-50,000 a year");
  });

  it("treats a leading dash as the bullet it was meant to be", () => {
    expect(sanitizeHouseStyle("— first point\n— second point")).toBe("- first point\n- second point");
  });

  it("never leaves doubled punctuation behind", () => {
    expect(sanitizeHouseStyle("Three things: — speed, cost, trust.")).not.toMatch(/[,;:.]\s*,/);
  });

  it("leaves legitimate hyphens alone", () => {
    const s = "speed-to-lead and 45,000-50,000 and well-run";
    expect(sanitizeHouseStyle(s)).toBe(s);
  });

  it("detects a banned dash anywhere", () => {
    expect(containsBannedDash("clean text")).toBe(false);
    expect(containsBannedDash("dirty — text")).toBe(true);
    expect(containsBannedDash("en – dash")).toBe(true);
  });

  it("walks nested objects and arrays, not just the top-level string", () => {
    const cleaned = sanitizeDeep({
      executiveSummary: "Losing money — fast.",
      opportunities: [{ title: "No-show fix", description: "Reminders — automated." }],
      roi: { paybackMonths: 5 },
    });
    expect(cleaned.executiveSummary).toBe("Losing money, fast.");
    expect(cleaned.opportunities[0].description).toBe("Reminders, automated.");
    expect(cleaned.opportunities[0].title).toBe("No-show fix"); // hyphen preserved
    expect(cleaned.roi.paybackMonths).toBe(5); // non-strings untouched
  });

  it("withHouseStyle both appends the rule AND cleans the prompt itself", () => {
    // A model mirrors the punctuation it is shown, so a prompt full of em dashes produced reports
    // full of them regardless of the instruction.
    const wrapped = withHouseStyle("Map the business — do not be brief.");
    expect(containsBannedDash(wrapped)).toBe(false);
    expect(wrapped).toContain("Map the business, do not be brief.");
    expect(wrapped).toContain(HOUSE_STYLE_PROMPT);
  });

  it("the rule text itself contains no banned dash", () => {
    expect(containsBannedDash(HOUSE_STYLE_PROMPT)).toBe(false);
  });
});
