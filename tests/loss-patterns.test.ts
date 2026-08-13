import { describe, expect, it } from "vitest";
import { lossPattern, themeOf, type LostDeal } from "@/lib/domain/loss-patterns";

const deal = (over: Partial<LostDeal> & { opportunityId: string; reason: string }): LostDeal => ({
  companyId: over.opportunityId,
  companyName: "A Clinic",
  valueCents: 500_000,
  currency: "USD",
  lostAt: new Date("2026-07-01"),
  industry: "dental",
  ...over,
});

describe("what a loss was about", () => {
  it("reads the reasons a founder actually types", () => {
    expect(themeOf("Too expensive, they went with a cheaper freelancer")).toBe("price");
    expect(themeOf("Wants to revisit after Ramadan")).toBe("timing");
    expect(themeOf("Her husband is the other owner and would not sign")).toBe("authority");
    expect(themeOf("Burned by their last agency, did not believe it would work")).toBe("trust");
    expect(themeOf("They stopped replying")).toBe("silence");
  });

  it("calls a price loss a price loss even when it is dressed as timing", () => {
    // "Too expensive but maybe next year" is a pricing problem with a polite ending, and filing it
    // under timing is how a company convinces itself its pricing is fine.
    expect(themeOf("Too expensive right now, maybe next year")).toBe("price");
  });

  it("says other rather than guessing", () => {
    expect(themeOf("They closed the business")).toBe("other");
    expect(themeOf("")).toBe("other");
  });
});

describe("the pattern across losses", () => {
  const losses = [
    deal({ opportunityId: "o1", reason: "Too expensive for a clinic our size", companyName: "Clinic A" }),
    deal({ opportunityId: "o2", reason: "Price was way over their budget", companyName: "Clinic B" }),
    deal({ opportunityId: "o3", reason: "Could not afford it this quarter", companyName: "Clinic C" }),
    deal({ opportunityId: "o4", reason: "Her partner would not approve it", companyName: "Clinic D" }),
  ];

  it("says the one sentence worth putting in front of a founder", () => {
    const p = lossPattern(losses, 2);
    expect(p.headline).toContain("3 of your last 4");
    expect(p.headline.toLowerCase()).toContain("too expensive");
    expect(p.headline).toContain("75 percent");
  });

  it("ranks the themes by how often they killed a deal", () => {
    expect(lossPattern(losses, 2).themes[0].theme).toBe("price");
  });

  it("keeps the founder's own sentences as the evidence", () => {
    // The grouping is a lens. The quotes are what a founder actually reasons from.
    const p = lossPattern(losses, 2);
    expect(p.themes[0].examples.map((e) => e.reason)).toContain("Price was way over their budget");
  });

  it("adds up what walked out of the door", () => {
    expect(lossPattern(losses, 2).themes[0].valueCents).toBe(1_500_000);
  });

  it("never adds rupees to dollars", () => {
    // The same units mistake that nearly sent a client a bill 280 times too large.
    const mixed = [
      deal({ opportunityId: "o1", reason: "Too expensive", currency: "USD", valueCents: 100_000 }),
      deal({ opportunityId: "o2", reason: "Too expensive", currency: "USD", valueCents: 100_000 }),
      deal({ opportunityId: "o3", reason: "Too expensive", currency: "PKR", valueCents: 90_000_000 }),
    ];
    const group = lossPattern(mixed, 0).themes[0];
    expect(group.currency).toBe("USD");
    expect(group.valueCents).toBe(200_000);
  });

  it("refuses to call three sentences a pattern when they are fewer", () => {
    const thin = lossPattern([deal({ opportunityId: "o1", reason: "Too expensive" })], 5);
    expect(thin.thin).toBe(true);
    expect(thin.headline).toContain("Too few");
  });

  it("says plainly when nobody has written a reason down", () => {
    const blank = lossPattern([deal({ opportunityId: "o1", reason: "" }), deal({ opportunityId: "o2", reason: "  " })], 3);
    expect(blank.headline).toContain("No lost deal has a reason written on it");
  });

  it("computes a win rate only once it means something", () => {
    expect(lossPattern(losses, 4).winRate).toBeCloseTo(0.5, 2);
    expect(lossPattern([deal({ opportunityId: "o1", reason: "Too expensive" })], 1).winRate).toBeNull();
  });

  it("survives a company that has never lost anything", () => {
    const none = lossPattern([], 6);
    expect(none.themes).toEqual([]);
    expect(none.totalLost).toBe(0);
  });
});
