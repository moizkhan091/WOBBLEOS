import { describe, expect, it } from "vitest";
import { lossPattern, type LostDeal } from "@/lib/domain/loss-patterns";
import { nextSalesLesson } from "@/lib/domain/sales-lessons";

/**
 * The loss pattern says what happened. This says what to do differently, which is the part a founder
 * asked for: "so the system can improve, analyse why deals must have been lost".
 *
 * Deliberately not a model call. A model asked what to change about a sales approach always produces
 * something confident, cannot tell a real pattern from three sentences that rhyme, and a founder
 * reading fluent advice about their own business will tend to believe it.
 */
const deal = (over: Partial<LostDeal> & { opportunityId: string; reason: string }): LostDeal => ({
  companyId: over.opportunityId,
  companyName: "A Clinic",
  valueCents: 500_000,
  currency: "USD",
  lostAt: new Date("2026-07-01"),
  industry: "dental",
  ...over,
});

const priceLosses = [
  deal({ opportunityId: "o1", reason: "Too expensive for a clinic our size", companyName: "Clinic A" }),
  deal({ opportunityId: "o2", reason: "Price was way over their budget", companyName: "Clinic B" }),
  deal({ opportunityId: "o3", reason: "Could not afford it this quarter", companyName: "Clinic C" }),
];

describe("proposing one change to how we sell", () => {
  it("names a move WOBBLE can actually make", () => {
    const l = nextSalesLesson({ pattern: lossPattern(priceLosses, 2), alreadyProposed: [] });
    expect(l?.theme).toBe("price");
    expect(l?.change).toContain("phase one");
  });

  it("argues from the count, not from a feeling", () => {
    expect(nextSalesLesson({ pattern: lossPattern(priceLosses, 2), alreadyProposed: [] })?.because).toContain("3 of your last 3");
  });

  it("quotes the founders' own sentences as the evidence", () => {
    const l = nextSalesLesson({ pattern: lossPattern(priceLosses, 2), alreadyProposed: [] });
    expect(l?.evidence.map((e) => e.reason)).toContain("Price was way over their budget");
  });

  it("says what would tell us it worked", () => {
    // Otherwise this is advice, and advice cannot be judged later.
    expect(nextSalesLesson({ pattern: lossPattern(priceLosses, 2), alreadyProposed: [] })?.measure.length).toBeGreaterThan(20);
  });

  it("proposes nothing from an anecdote", () => {
    const thin = lossPattern([deal({ opportunityId: "o1", reason: "Too expensive" })], 4);
    expect(nextSalesLesson({ pattern: thin, alreadyProposed: [] })).toBeNull();
  });

  it("never proposes the same lesson twice", () => {
    const pattern = lossPattern(priceLosses, 2);
    const first = nextSalesLesson({ pattern, alreadyProposed: [] })!;
    expect(nextSalesLesson({ pattern, alreadyProposed: [first.key] })).toBeNull();
  });

  it("raises it again only when the evidence has actually grown", () => {
    const pattern = lossPattern(priceLosses, 2);
    const first = nextSalesLesson({ pattern, alreadyProposed: [] })!;
    const bigger = lossPattern([...priceLosses, deal({ opportunityId: "o4", reason: "Too pricey", companyName: "Clinic D" })], 2);
    const again = nextSalesLesson({ pattern: bigger, alreadyProposed: [first.key] });
    expect(again?.losses).toBe(4);
  });

  it("moves to the next theme once the first has been put in front of a founder", () => {
    const mixed = lossPattern(
      [
        ...priceLosses,
        deal({ opportunityId: "o5", reason: "Her partner would not approve it", companyName: "Clinic E" }),
        deal({ opportunityId: "o6", reason: "Her husband is the other owner and would not sign", companyName: "Clinic F" }),
        deal({ opportunityId: "o7", reason: "Could not approve it without the board", companyName: "Clinic G" }),
      ],
      2,
    );
    const first = nextSalesLesson({ pattern: mixed, alreadyProposed: [] })!;
    const second = nextSalesLesson({ pattern: mixed, alreadyProposed: [first.key] });
    expect(second?.theme).toBe("authority");
    expect(second?.change).toContain("who else has to agree");
  });

  it("says nothing rather than inventing a move for a loss it cannot categorise", () => {
    const odd = lossPattern(
      [
        deal({ opportunityId: "o1", reason: "They closed the business" }),
        deal({ opportunityId: "o2", reason: "The owner emigrated" }),
        deal({ opportunityId: "o3", reason: "Their landlord evicted them" }),
      ],
      2,
    );
    expect(nextSalesLesson({ pattern: odd, alreadyProposed: [] })).toBeNull();
  });

  it("survives a company that has never lost a deal", () => {
    expect(nextSalesLesson({ pattern: lossPattern([], 0), alreadyProposed: [] })).toBeNull();
  });
});
