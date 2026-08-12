import { describe, expect, it } from "vitest";
import { currencyFromMarket, currencyFromText, resolveReportCurrency, reportTextOf } from "@/lib/domain/report-currency";

/**
 * A real near-miss. A paid audit for a Karachi dental group reasoned entirely in rupees ("losing PKR
 * 1.5M monthly", "PKR 400k previous system") while its numeric fields carried no unit. The proposal
 * builder read one and defaulted to USD, quoting USD 1,400,000 for work priced at PKR 1,400,000.
 */
describe("reading the currency out of an audit's own words", () => {
  it("finds rupees in the prose that surrounds the bare numbers", () => {
    expect(currencyFromText("Losing PKR 1,504,000 monthly to no-shows").currency).toBe("PKR");
    expect(currencyFromText("The previous system cost Rs 400,000").currency).toBe("PKR");
  });

  it("finds the other currencies we actually quote in", () => {
    expect(currencyFromText("AED 45,000 per month").currency).toBe("AED");
    expect(currencyFromText("£12,000 a quarter").currency).toBe("GBP");
    expect(currencyFromText("USD 4,500 to build").currency).toBe("USD");
  });

  it("treats a rupee figure with a dollar equivalent as rupees, not a conflict", () => {
    // Quotes in PKR routinely gloss the USD figure in brackets. The numbers are in rupees.
    const r = currencyFromText("PKR 392,000,000 (roughly USD 1,400,000)");
    expect(r.currency).toBe("PKR");
    expect(r.conflicting).toBe(false);
  });

  it("refuses when two real currencies are mixed", () => {
    const r = currencyFromText("AED 45,000 and £12,000");
    expect(r.currency).toBeNull();
    expect(r.conflicting).toBe(true);
  });

  it("says nothing when the text has no currency at all", () => {
    expect(currencyFromText("estimatedImplementationCents: 140000000").currency).toBeNull();
  });
});

describe("falling back to where the client actually is", () => {
  it("maps the markets WOBBLE sells into", () => {
    expect(currencyFromMarket("Pakistan").currency).toBe("PKR");
    expect(currencyFromMarket("Lahore").currency).toBe("PKR");
    expect(currencyFromMarket("Dubai").currency).toBe("AED");
    expect(currencyFromMarket("UK-facing").currency).toBe("GBP");
  });

  it("returns nothing for a place it does not know", () => {
    expect(currencyFromMarket("Atlantis").currency).toBeNull();
    expect(currencyFromMarket(null, undefined).currency).toBeNull();
  });
});

describe("the verdict", () => {
  it("prefers the audit's own words over the client's address", () => {
    const v = resolveReportCurrency({ reportText: "AED 45,000 monthly", country: "Pakistan" });
    expect(v.currency).toBe("AED");
    expect(v.evidence).toBe("report_text");
  });

  it("uses the client's country when the report is silent", () => {
    const v = resolveReportCurrency({ reportText: "estimatedImplementationCents 140000000", country: "Pakistan" });
    expect(v.currency).toBe("PKR");
    expect(v.evidence).toBe("client_country");
    expect(v.because).toContain("Pakistan");
  });

  it("REFUSES rather than defaulting to dollars, which is what caused the 280x quote", () => {
    const v = resolveReportCurrency({ reportText: "estimatedImplementationCents 140000000" });
    expect(v.currency).toBeNull();
    expect(v.evidence).toBe("none");
    expect(v.because).toContain("280 times");
  });

  it("refuses a report that mixes currencies, and says which two", () => {
    const v = resolveReportCurrency({ reportText: "AED 45,000 and £12,000", country: "Pakistan" });
    expect(v.currency).toBeNull();
    expect(v.conflicting).toBe(true);
    expect(v.because).toContain("AED");
    expect(v.because).toContain("GBP");
  });

  it("reads a whole stored report, not just its summary", () => {
    const report = { executiveSummary: "Operations are manual", roi: { estimatedImplementationCents: 140000000 }, risks: [{ risk: "Cost", mitigation: "Phase it, PKR 400,000 up front" }] };
    expect(resolveReportCurrency({ reportText: reportTextOf(report) }).currency).toBe("PKR");
  });

  it("survives a report it cannot serialise", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(reportTextOf(circular)).toBe("");
    expect(reportTextOf(null)).toBe("");
  });
});
