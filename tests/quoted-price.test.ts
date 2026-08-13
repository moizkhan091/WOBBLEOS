import { describe, expect, it } from "vitest";
import { proseAgreesWithPrice, quotedPricesIn } from "@/lib/domain/quoted-price";

/**
 * Verbatim from the approved Bright Smile Dental proposal on the live VPS. The priced field said PKR
 * 45,000. This sentence said PKR 4.5M. Both were in the same document, and the gate passed it.
 */
const REAL_SCOPE =
  "Bright Smile Dental is hemorrhaging approximately PKR 2.5M monthly due to 30% no-shows and after-hours inquiry abandonment across three Karachi locations, while front desk staff drown in repetitive WhatsApp queries. " +
  "An AI-first transformation can recapture PKR 1.8M+ monthly within 90 days while eliminating 60+ staff hours of manual work weekly. " +
  "With PKR 4.5M implementation investment, payback occurs in 2.5 months through recaptured appointment revenue alone, excluding staff productivity gains.";

describe("finding the price a document quotes in its own words", () => {
  const found = quotedPricesIn(REAL_SCOPE);

  it("finds the implementation investment", () => {
    expect(found.map((f) => f.amountCents)).toContain(450_000_000);
  });

  it("leaves the client's own money alone", () => {
    // What they are losing and what we would recapture are theirs, and belong in the document.
    const amounts = found.map((f) => f.amountCents);
    expect(amounts).not.toContain(250_000_000);
    expect(amounts).not.toContain(180_000_000);
  });

  it("quotes the sentence so a founder can judge it", () => {
    expect(found[0].quote).toContain("implementation investment");
  });

  it("reads the multiplier, not just the digits", () => {
    expect(quotedPricesIn("Our fee is PKR 4.5M.")[0].amountCents).toBe(450_000_000);
    expect(quotedPricesIn("Our fee is PKR 450k.")[0].amountCents).toBe(45_000_000);
    expect(quotedPricesIn("Our fee is USD 16,071.")[0].amountCents).toBe(1_607_100);
  });

  it("says nothing about a document with no prices in it", () => {
    expect(quotedPricesIn("We will connect WhatsApp to the booking diary across all three clinics.")).toEqual([]);
    expect(quotedPricesIn("")).toEqual([]);
    expect(quotedPricesIn(null)).toEqual([]);
  });

  it("ignores a figure with no currency on it", () => {
    // "30% no-shows" and "60+ staff hours" are not money and must never read as money.
    expect(quotedPricesIn("Our fee covers 60 hours and cuts 30% of no-shows.")).toEqual([]);
  });

  it("does not flag the client's price list", () => {
    expect(quotedPricesIn("A check-up and clean is priced at PKR 8,000 per patient today.")).toEqual([]);
  });

  it("does not flag what they spent on the vendor before us", () => {
    expect(quotedPricesIn("They already paid PKR 400,000 for a package that was abandoned in a month.")).toEqual([]);
  });
});

describe("whether the words agree with the price a founder chose", () => {
  const decision = { oneOffCents: 4_500_000, monthlyCents: 0, currency: "PKR" };

  it("catches the hundred-fold contradiction that got through", () => {
    const v = proseAgreesWithPrice([REAL_SCOPE], decision);
    expect(v.agrees).toBe(false);
    expect(v.because).toContain("PKR 4.5M");
    expect(v.because).toContain("45,000");
  });

  it("passes when the document says the same number as the decision", () => {
    expect(proseAgreesWithPrice(["The total investment is PKR 45,000."], decision).agrees).toBe(true);
  });

  it("treats prose rounding as agreement", () => {
    // "roughly PKR 45,000" against a decision of PKR 44,800 is the same number to a reader.
    expect(proseAgreesWithPrice(["Total investment of roughly PKR 45,000."], { oneOffCents: 4_480_000, monthlyCents: 0, currency: "PKR" }).agrees).toBe(true);
  });

  it("allows a phase price the founder declared alongside the whole", () => {
    const v = proseAgreesWithPrice(["Phase one is quoted at PKR 400,000, of a total investment of PKR 45,000."], decision, [40_000_000]);
    expect(v.agrees).toBe(true);
  });

  it("flags a price in the wrong currency even when the digits match", () => {
    // The 280x failure: the figure was right, the currency was not.
    const v = proseAgreesWithPrice(["Total investment is USD 45,000."], decision);
    expect(v.agrees).toBe(false);
  });

  it("refuses a document that quotes a price when nobody has decided one", () => {
    const v = proseAgreesWithPrice([REAL_SCOPE], null);
    expect(v.agrees).toBe(false);
    expect(v.because).toContain("nobody has decided");
  });

  it("is silent about an undecided document that names no price", () => {
    expect(proseAgreesWithPrice(["We will connect WhatsApp to the diary."], null).agrees).toBe(true);
  });

  it("reads every field it is given, not just the first", () => {
    const v = proseAgreesWithPrice(["Clean scope with no numbers.", "Our fee is PKR 900,000."], decision);
    expect(v.agrees).toBe(false);
    expect(v.offenders).toHaveLength(1);
  });
});
