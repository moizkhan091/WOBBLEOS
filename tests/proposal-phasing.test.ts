import { describe, expect, it } from "vitest";
import {
  excludedFromQuote,
  opportunityWeight,
  phaseOneWithinAuthority,
  phaseOpportunities,
  splitPrice,
  type PhasingOpportunity,
} from "@/lib/domain/proposal-phasing";

/**
 * WOBBLE's own deal reviewer refused a real proposal for this: eighteen line items quoted as one
 * number, to a dental group that had already abandoned a system after a single all-or-nothing purchase.
 * "A client burned by a PKR 400k all-or-nothing purchase will want the ability to start small and
 * expand, but this structure forces another all-in bet."
 */
const opp = (over: Partial<PhasingOpportunity> & { title: string }): PhasingOpportunity => ({
  impact: "medium", difficulty: "medium", ...over,
});

const eighteen: PhasingOpportunity[] = [
  opp({ title: "No-show reduction", impact: "high", difficulty: "low", estimatedMonthlyValueCents: 270_000_000 }),
  opp({ title: "Booking agent", impact: "high", difficulty: "medium", estimatedMonthlyValueCents: 72_000_000 }),
  opp({ title: "Owner dashboard", impact: "high", difficulty: "low", estimatedMonthlyValueCents: 60_000_000 }),
  opp({ title: "WhatsApp receptionist", impact: "high", difficulty: "medium", estimatedMonthlyValueCents: 54_000_000 }),
  opp({ title: "Central CRM", impact: "high", difficulty: "medium", estimatedMonthlyValueCents: 30_000_000 }),
  opp({ title: "Intake automation", impact: "medium", difficulty: "low", estimatedMonthlyValueCents: 24_000_000 }),
  ...Array.from({ length: 12 }, (_, i) => opp({ title: `Nice to have ${i + 1}`, impact: "low", difficulty: "high", estimatedMonthlyValueCents: 1_000_000 })),
];

describe("what earns a place in the quote", () => {
  it("ranks a big, quick win above a small, slow one", () => {
    const quick = opp({ title: "quick", impact: "high", difficulty: "low", estimatedMonthlyValueCents: 270_000_000 });
    const slow = opp({ title: "slow", impact: "low", difficulty: "high", estimatedMonthlyValueCents: 1_000_000 });
    expect(opportunityWeight(quick)).toBeGreaterThan(opportunityWeight(slow));
  });

  it("prefers the easier of two equally valuable items, since proof delayed is proof disbelieved", () => {
    const easy = opp({ title: "easy", impact: "high", difficulty: "low", estimatedMonthlyValueCents: 50_000_000 });
    const hard = opp({ title: "hard", impact: "high", difficulty: "high", estimatedMonthlyValueCents: 50_000_000 });
    expect(opportunityWeight(easy)).toBeGreaterThan(opportunityWeight(hard));
  });

  it("still ranks something the audit never costed, using its impact", () => {
    expect(opportunityWeight(opp({ title: "uncosted", impact: "high", difficulty: "low" }))).toBeGreaterThan(
      opportunityWeight(opp({ title: "uncosted low", impact: "low", difficulty: "high" })),
    );
  });
});

describe("phasing eighteen opportunities", () => {
  const phases = phaseOpportunities(eighteen);

  it("makes phase one small, not comprehensive", () => {
    expect(phases[0].items).toHaveLength(4);
    expect(phases[0].name).toContain("Phase 1");
  });

  it("puts the highest value-per-effort work in phase one", () => {
    const names = phases[0].items.map((i) => i.title);
    expect(names).toContain("No-show reduction");
    expect(names).toContain("Owner dashboard");
    expect(names.some((n) => n.startsWith("Nice to have"))).toBe(false);
  });

  it("drops the tail out of the quote instead of padding it with line items nobody asked for", () => {
    const quoted = phases.flatMap((p) => p.items);
    expect(quoted.length).toBe(12);
    expect(excludedFromQuote(eighteen)).toHaveLength(6);
  });

  it("names what it excluded, so nothing is dropped silently", () => {
    expect(excludedFromQuote(eighteen).every((o) => o.title.startsWith("Nice to have"))).toBe(true);
  });

  it("gives every phase a reason a client would accept", () => {
    for (const p of phases) expect(p.rationale.length).toBeGreaterThan(40);
  });

  it("handles an audit with almost nothing in it", () => {
    const one = phaseOpportunities([opp({ title: "Only thing" })]);
    expect(one).toHaveLength(1);
    expect(one[0].items).toHaveLength(1);
    expect(phaseOpportunities([])).toEqual([]);
  });
});

describe("splitting one quoted price across the phases", () => {
  const phases = phaseOpportunities(eighteen);

  it("the parts always add back to the whole", () => {
    const split = splitPrice(140_000_000, phases);
    expect(split.reduce((n, x) => n + x.priceCents, 0)).toBe(140_000_000);
  });

  it("the phase carrying most of the return carries most of the cost", () => {
    const split = splitPrice(140_000_000, phases);
    expect(split[0].priceCents).toBeGreaterThan(split[split.length - 1].priceCents);
  });

  it("survives an audit that never priced the build", () => {
    expect(splitPrice(0, phases).every((x) => x.priceCents === 0)).toBe(true);
  });
});

describe("can one person sign phase one?", () => {
  it("says yes when it fits inside their authority", () => {
    expect(phaseOneWithinAuthority(400_000_00, 500_000_00).ok).toBe(true);
  });

  it("says by how much when it does not, since that is the number that decides the deal", () => {
    const r = phaseOneWithinAuthority(140_000_000, 500_000_00);
    expect(r.ok).toBe(false);
    expect(r.because).toContain("2.8 times");
    expect(r.because).toContain("joint decision");
  });

  it("does not pretend to know when no authority is recorded", () => {
    const r = phaseOneWithinAuthority(140_000_000, null);
    expect(r.ok).toBe(true);
    expect(r.because).toContain("cannot be checked");
  });
});
