import { describe, expect, it } from "vitest";
import {
  awaitingPricing,
  canAdvance,
  decidePricing,
  pricingChecklist,
  pricingDecisionSchema,
  pricingPrompt,
} from "@/lib/domain/pricing-gate";
import { computeDeliveryCost, extractMonthlyVolume, marginAt, TOOL_COSTS, INTEGRATION_COSTS } from "@/lib/domain/delivery-cost";

const NOW = new Date("2026-08-12T10:00:00.000Z");
const cost = computeDeliveryCost({ categories: ["speed_to_lead", "booking"], integrations: ["paper", "spreadsheets"], monthlyVolume: 1720, currency: "USD" });

/**
 * The safety net. A model guessed an implementation figure, the builder turned it into a quote, the
 * units were wrong, and a Karachi dental group was about to be sent a bill 280 times too large. Nobody
 * chose that number; it flowed downhill from a field in a report.
 */
describe("no document leaves carrying a price a human did not choose", () => {
  it("blocks approving and sending while nobody has decided", () => {
    const state = awaitingPricing(cost, 140_000_000);
    for (const status of ["approved", "sent", "viewed", "accepted"]) {
      const v = canAdvance(state, status);
      expect(v.allowed, status).toBe(false);
      expect(v.because).toContain("the price is yours to set");
    }
  });

  it("leaves drafting and reviewing open, because that is when the reviewer should argue with it", () => {
    const state = awaitingPricing(cost, null);
    for (const status of ["draft", "needs_review", "rejected", "archived"]) {
      expect(canAdvance(state, status).allowed, status).toBe(true);
    }
  });

  it("allows it once a founder has decided, with their name on it", () => {
    const decided = decidePricing(awaitingPricing(cost, null), {
      oneOffCents: 4_500_000,
      monthlyCents: 500_000,
      currency: "USD",
      reasoning: "Three times what they abandoned, and inside what Sara can sign alone.",
      decidedBy: "moiz",
    }, NOW);
    expect(canAdvance(decided, "sent").allowed).toBe(true);
    expect(decided.decision?.decidedAt).toBe(NOW.toISOString());
  });

  it("refuses an artifact with no pricing record at all, rather than assuming it is fine", () => {
    expect(canAdvance(null, "sent").allowed).toBe(false);
    expect(canAdvance(undefined, "sent").because).toContain("nobody has decided");
  });

  it("refuses a price of zero, since a zero on a proposal reads as a mistake", () => {
    const zero = decidePricing(awaitingPricing(cost, null), { oneOffCents: 0, monthlyCents: 0, currency: "USD", reasoning: "Doing this one for free as a favour.", decidedBy: "moiz" }, NOW);
    expect(canAdvance(zero, "sent").allowed).toBe(false);
  });

  it("demands a reason, because a price with none cannot be defended on a call", () => {
    expect(pricingDecisionSchema.safeParse({ oneOffCents: 100, currency: "USD", reasoning: "because", decidedBy: "moiz" }).success).toBe(false);
    expect(pricingDecisionSchema.safeParse({ oneOffCents: 100, currency: "USD", reasoning: "Three times what they abandoned.", decidedBy: "moiz" }).success).toBe(true);
  });
});

describe("what the founder is shown while it is outstanding", () => {
  it("names the cost, and says the decision is theirs", () => {
    const p = pricingPrompt(awaitingPricing(cost, null), "USD");
    // Most builds have no cash setup cost once our own time is excluded, so it says that plainly
    // rather than printing "costs us USD 0", which reads as free.
    expect(p).toContain("Nothing is paid out to start");
    expect(p).toContain("a month to run");
    expect(p).toContain("your decision");
  });

  it("prints the cost in ITS currency, not the currency of the quote", () => {
    // Found on the live system with a real client: a USD 70 monthly cost rendered as "PKR 70 a month",
    // which a founder reads as a rounding error. Same units mistake as the 280x quote.
    const p = pricingPrompt(awaitingPricing(cost, null), "PKR");
    expect(p).toContain("USD");
    expect(p).not.toMatch(/PKR \d/);
    expect(p).toContain("That cost is in USD; your price is in PKR");
  });

  it("says our build time is behind it without adding it to the cost", () => {
    expect(pricingPrompt(awaitingPricing(cost, null), "USD")).toContain("not a cash cost");
  });

  it("never suggests an amount, since a suggestion becomes the decision", () => {
    const p = pricingPrompt(awaitingPricing(cost, 140_000_000), "USD");
    expect(p).not.toMatch(/we recommend|suggested price|you should charge/i);
  });

  it("reads back who priced it and why, once decided", () => {
    const decided = decidePricing(awaitingPricing(cost, null), { oneOffCents: 4_500_000, monthlyCents: 0, currency: "USD", reasoning: "Inside what Sara can sign alone.", decidedBy: "moiz" }, NOW);
    const p = pricingPrompt(decided, "USD");
    expect(p).toContain("moiz");
    expect(p).toContain("Sara");
  });

  it("puts what it is worth to THEM at the top of the checklist, not what it costs us", () => {
    expect(pricingChecklist(cost)[0]).toContain("worth to THEM");
  });

  it("carries the unknowns into the checklist rather than hiding them", () => {
    const thin = computeDeliveryCost({ categories: [], integrations: [], monthlyVolume: 0, currency: "USD" });
    expect(pricingChecklist(thin).some((c) => c.startsWith("Still unknown"))).toBe(true);
  });
});

describe("what a build actually costs us", () => {
  it("costs the tools each kind of system needs", () => {
    expect(cost.lines.some((l) => l.label.includes("WhatsApp"))).toBe(true);
    expect(cost.lines.some((l) => l.label.includes("Calendar"))).toBe(true);
    // Cash one-off is legitimately ZERO on most builds: no vendor charges us to start. The real
    // running cost and our own build time are both non-zero, and are reported separately.
    expect(cost.monthlyCents).toBeGreaterThan(0);
    expect(cost.effortOneOffCents).toBeGreaterThan(0);
  });

  it("charges paper records more than a documented API, because they are more work", () => {
    const paper = INTEGRATION_COSTS.find((i) => i.key === "paper")!;
    const api = INTEGRATION_COSTS.find((i) => i.key === "documented_api")!;
    expect(paper.setupUsdCents).toBeGreaterThan(api.setupUsdCents);
  });

  it("scales usage lines with the client's volume", () => {
    const quiet = computeDeliveryCost({ categories: ["speed_to_lead"], integrations: [], monthlyVolume: 500, currency: "USD" });
    const busy = computeDeliveryCost({ categories: ["speed_to_lead"], integrations: [], monthlyVolume: 50_000, currency: "USD" });
    expect(busy.monthlyCents).toBeGreaterThan(quiet.monthlyCents * 5);
  });

  it("converts into the client's currency rather than reporting dollars at a rupee client", () => {
    const pkr = computeDeliveryCost({ categories: ["speed_to_lead"], integrations: ["paper"], monthlyVolume: 1720, currency: "PKR", usdRate: 280 });
    const usd = computeDeliveryCost({ categories: ["speed_to_lead"], integrations: ["paper"], monthlyVolume: 1720, currency: "USD" });
    expect(pkr.oneOffCents).toBe(usd.oneOffCents * 280);
    expect(pkr.currency).toBe("PKR");
  });

  it("never returns a system that looks free", () => {
    const unknown = computeDeliveryCost({ categories: ["something_new"], integrations: [], monthlyVolume: 1000, currency: "USD" });
    expect(unknown.monthlyCents).toBeGreaterThan(0);
  });

  it("names what it could not cost instead of quietly omitting it", () => {
    const thin = computeDeliveryCost({ categories: ["booking"], integrations: [], monthlyVolume: 0, currency: "USD" });
    expect(thin.unknowns.length).toBeGreaterThanOrEqual(2);
  });

  it("every tool says who it is paid to and why", () => {
    for (const t of TOOL_COSTS) {
      expect(t.note.length, t.key).toBeGreaterThan(20);
      expect(t.label.length, t.key).toBeGreaterThan(3);
    }
  });
});

describe("the margin at a price the founder types", () => {
  it("says nothing until a price exists", () => {
    expect(marginAt({ oneOffCents: 0 }, cost).verdict).toContain("No price set");
  });

  it("shouts when the price is below what the build costs in cash", () => {
    // Needs a build that actually has a cash setup line, since most do not once our time is excluded.
    const withSetup = computeDeliveryCost({ categories: ["ads"], integrations: [], monthlyVolume: 1000, currency: "USD" });
    expect(withSetup.oneOffCents).toBeGreaterThan(0);
    const m = marginAt({ oneOffCents: 100 }, withSetup);
    expect(m.setupMargin).toBeLessThan(0);
    expect(m.verdict).toContain("BELOW what the build costs");
  });

  it("does not claim a 100 percent margin when nothing is paid out to start", () => {
    // Arithmetically true, and useless. What a founder needs is how long the one-off actually lasts.
    const m = marginAt({ oneOffCents: 50_000_000 }, cost);
    expect(m.verdict).toContain("Nothing is paid out to start");
    expect(m.verdict).toMatch(/covers \d+ months?/);
  });

  it("names our build time in that verdict without adding it to the cost", () => {
    expect(marginAt({ oneOffCents: 50_000_000 }, cost).verdict).toContain("not a cash cost");
  });

  it("warns when the monthly price does not cover the monthly cost", () => {
    const m = marginAt({ oneOffCents: 50_000_000, monthlyCents: 1 }, cost);
    expect(m.verdict).toContain("loses money the longer it runs");
  });

  it("says how many months a one-off covers when there is no recurring price", () => {
    const m = marginAt({ oneOffCents: 50_000_000 }, cost);
    expect(m.runwayMonths).toBeGreaterThan(0);
    expect(m.verdict).toContain("month");
  });

  it("never suggests a different number", () => {
    expect(marginAt({ oneOffCents: 100 }, cost).verdict).not.toMatch(/should charge|recommend/i);
  });
});

describe("a cost that is silently too small is worse than no cost", () => {
  it("floors usage at a thousand a month, not at one", () => {
    // `Math.max(1, volume)` made every usage line a thousandth of its real size when volume was
    // unknown, so a build running on model calls and WhatsApp conversations looked like pennies.
    const unknownVolume = computeDeliveryCost({ categories: ["speed_to_lead"], integrations: [], monthlyVolume: 0, currency: "USD" });
    const oneThousand = computeDeliveryCost({ categories: ["speed_to_lead"], integrations: [], monthlyVolume: 1000, currency: "USD" });
    expect(unknownVolume.monthlyCents).toBe(oneThousand.monthlyCents);
    // WhatsApp alone is 800 cents per thousand conversations, so the usage lines must be real money.
    const whatsapp = unknownVolume.lines.find((l) => l.label.includes("WhatsApp") && l.usageBased);
    expect(whatsapp?.amountCents).toBe(800);
  });

  it("still says the volume is unknown, since a floor is an assumption not a fact", () => {
    const unknownVolume = computeDeliveryCost({ categories: ["speed_to_lead"], integrations: [], monthlyVolume: 0, currency: "USD" });
    expect(unknownVolume.unknowns.some((u) => u.includes("volume"))).toBe(true);
  });
});

describe("reading volume out of an audit's own words", () => {
  it("finds the figure the audit plainly states", () => {
    expect(extractMonthlyVolume("managing 400 weekly WhatsApp enquiries")).toBe(1720);
    expect(extractMonthlyVolume("240 appointments a week across three clinics")).toBe(1032);
    expect(extractMonthlyVolume("3,000 messages per month")).toBe(3000);
  });

  it("does NOT match a number that is not a volume", () => {
    // The first attempt allowed any three words between the number and the period, and on a real
    // report that matched an unrelated 75 instead of the stated 400 weekly, understating running cost
    // roughly fourfold.
    expect(extractMonthlyVolume("PKR 8,000 per appointment, reviewed weekly")).toBe(0);
    expect(extractMonthlyVolume("a 30% no-show rate, monthly reporting")).toBe(0);
  });

  it("takes the LARGEST stated figure, since the system carries the busiest", () => {
    expect(extractMonthlyVolume("120 calls a week, and 400 enquiries a week")).toBe(1720);
  });

  it("prefers whichever period gives the bigger monthly number", () => {
    expect(extractMonthlyVolume("100 leads a week and 200 leads a month")).toBe(430);
  });

  it("returns zero when the audit never says, rather than inventing one", () => {
    expect(extractMonthlyVolume("the front desk is busy and reporting is manual")).toBe(0);
    expect(extractMonthlyVolume("")).toBe(0);
  });
});

describe("volume, whichever way round the audit writes it", () => {
  it("reads number, period, unit", () => {
    // The form a real audit used: "managing 400 weekly WhatsApp enquiries".
    expect(extractMonthlyVolume("managing 400 weekly WhatsApp enquiries")).toBe(1720);
    expect(extractMonthlyVolume("handles 500 monthly support tickets")).toBe(500);
  });

  it("reads number, unit, period", () => {
    expect(extractMonthlyVolume("240 appointments a week")).toBe(1032);
    expect(extractMonthlyVolume("3,000 messages per month")).toBe(3000);
  });

  it("still refuses a number that is not a volume", () => {
    expect(extractMonthlyVolume("PKR 8,000 per appointment, reviewed weekly")).toBe(0);
    expect(extractMonthlyVolume("a 30% no-show rate, monthly reporting")).toBe(0);
  });
})

describe("cash out of the door, kept apart from our own build time", () => {
  const input = { categories: ["booking"], integrations: ["no_api" as const], monthlyVolume: 4000, currency: "USD" };

  it("keeps integration work out of the cash cost", () => {
    // The founder was explicit: cost means tools, not dev cost. Nobody invoices us for connecting to
    // a tool with no API; it costs time.
    const cost = computeDeliveryCost(input);
    const integrationLine = cost.lines.find((l) => l.label.startsWith("Integration:"));
    expect(integrationLine?.kind).toBe("effort");
    expect(cost.lines.filter((l) => (l.kind ?? "cash") === "cash" && l.cadence === "one_off").reduce((n, l) => n + l.amountCents, 0)).toBe(cost.oneOffCents);
  });

  it("reports the build effort separately rather than hiding it", () => {
    const cost = computeDeliveryCost(input);
    expect(cost.effortOneOffCents).toBeGreaterThan(0);
  });

  it("never adds effort into the cash totals", () => {
    const cost = computeDeliveryCost(input);
    const everyOneOff = cost.lines.filter((l) => l.cadence === "one_off").reduce((n, l) => n + l.amountCents, 0);
    expect(cost.oneOffCents).toBeLessThan(everyOneOff);
    expect(cost.oneOffCents + cost.effortOneOffCents).toBe(everyOneOff);
  });

  it("marks every vendor line as cash", () => {
    const cost = computeDeliveryCost(input);
    for (const l of cost.lines.filter((x) => x.vendor)) expect(l.kind).toBe("cash");
  });

  it("reports no effort at all when nothing needs integrating", () => {
    expect(computeDeliveryCost({ ...input, integrations: [] }).effortOneOffCents).toBe(0);
  });

  it("still charges monthly running cost as cash", () => {
    expect(computeDeliveryCost(input).monthlyCents).toBeGreaterThan(0);
  });
});
