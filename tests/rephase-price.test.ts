import { describe, expect, it } from "vitest";
import { rephasePrice } from "@/lib/domain/proposal-phasing";

/**
 * The real shape from the Bright Smile proposal on the live system: phases worked out at build time
 * from the audit's PKR 4.5M implementation guess, on a proposal the founder later priced at PKR 45,000.
 * The document went on showing PKR 4.5M in its phases, which is what a client reads.
 */
const REAL_PHASES = [
  { number: 1, name: "Phase 1, prove it works", priceCents: 89_456_000, valueShare: 0.198791 },
  { number: 2, name: "Phase 2, widen it", priceCents: 158_151_500, valueShare: 0.351448 },
  { number: 3, name: "Phase 3, compound it", priceCents: 202_392_500, valueShare: 0.449761 },
];

describe("re-splitting the phases across the price a founder decided", () => {
  it("makes the parts add back to the decided whole", () => {
    const out = rephasePrice(REAL_PHASES, 4_500_000);
    expect(out.reduce((n, p) => n + p.priceCents, 0)).toBe(4_500_000);
  });

  it("keeps phase one carrying the smallest share, as it did before", () => {
    const out = rephasePrice(REAL_PHASES, 4_500_000);
    expect(out[0].priceCents).toBeLessThan(out[1].priceCents);
    expect(out[1].priceCents).toBeLessThan(out[2].priceCents);
  });

  it("holds the shares steady rather than the amounts", () => {
    const out = rephasePrice(REAL_PHASES, 4_500_000);
    expect(out[0].priceCents / 4_500_000).toBeCloseTo(0.1988, 2);
  });

  it("recovers the shares from the amounts when a legacy row stored none", () => {
    const legacy = REAL_PHASES.map(({ valueShare: _ignored, ...rest }) => rest);
    const out = rephasePrice(legacy, 4_500_000);
    expect(out.reduce((n, p) => n + p.priceCents, 0)).toBe(4_500_000);
    expect(out[0].priceCents / 4_500_000).toBeCloseTo(0.1988, 2);
  });

  it("splits equally rather than to nothing when there is neither a share nor a price", () => {
    // A phase priced at zero reads to a client as free, which is worse than a rough split.
    const blank = [{ number: 1, priceCents: 0 }, { number: 2, priceCents: 0 }];
    const out = rephasePrice(blank, 1_000_000);
    expect(out.map((p) => p.priceCents)).toEqual([500_000, 500_000]);
  });

  it("prices every phase at zero when the decision is zero, without inventing money", () => {
    expect(rephasePrice(REAL_PHASES, 0).every((p) => p.priceCents === 0)).toBe(true);
  });

  it("survives a proposal with no phases at all", () => {
    expect(rephasePrice([], 4_500_000)).toEqual([]);
  });

  it("leaves the name, items and rationale untouched", () => {
    const out = rephasePrice(REAL_PHASES, 4_500_000);
    expect(out[0].name).toBe("Phase 1, prove it works");
  });
});
