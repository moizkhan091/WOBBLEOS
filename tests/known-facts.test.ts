import { describe, expect, it } from "vitest";
import { knownFactsFrom, readPreviousSpend, readSigningAuthority } from "@/lib/domain/known-facts";

/**
 * Verbatim from the qualification council on a real client. The container then showed an empty box
 * asking what the contact can sign alone: the system knew, and made a person retype it.
 */
const REAL = "The prospect has a clear budgetary framework, with Sara having unilateral authority for expenditures up to PKR 500,000 and a willingness to invest in solutions that address significant pain points. Their previous investment of PKR 400,000 in a practice management system indicates a readiness to allocate funds for effective solutions.";

describe("reading a signing limit the council already wrote down", () => {
  it("finds the real one, in the real sentence", () => {
    const f = readSigningAuthority(REAL);
    expect(f?.value.amountCents).toBe(50_000_000); // PKR 500,000
    expect(f?.value.currency).toBe("PKR");
    expect(f?.confidence).toBe("clear");
  });

  it("quotes the sentence, so a founder can judge it rather than trust it", () => {
    expect(readSigningAuthority(REAL)?.quote).toContain("unilateral authority");
  });

  it("does NOT mistake what they once spent for what they can approve", () => {
    // The same rationale mentions a previous PKR 400,000 purchase. Confusing the two would put the
    // wrong ceiling on every future quote.
    expect(readSigningAuthority(REAL)?.value.amountCents).not.toBe(40_000_000);
  });

  it("needs both a number and authority language in the SAME sentence", () => {
    expect(readSigningAuthority("They have a budget. Sara signs things off.")).toBeNull();
    expect(readSigningAuthority("They spent PKR 400,000 last year on a system that failed.")).toBeNull();
  });

  it("reads the other currencies and shorthands we actually meet", () => {
    expect(readSigningAuthority("Ali can approve up to AED 25,000 alone.")?.value).toEqual({ amountCents: 2_500_000, currency: "AED" });
    expect(readSigningAuthority("She has sole discretion up to £15,000.")?.value).toEqual({ amountCents: 1_500_000, currency: "GBP" });
    expect(readSigningAuthority("Sign-off authority sits at Rs 250,000.")?.value.currency).toBe("PKR");
  });

  it("understands the scale words a rationale uses", () => {
    expect(readSigningAuthority("Unilateral authority up to PKR 1,500 k.")?.value.amountCents).toBe(150_000_000);
    expect(readSigningAuthority("He can approve alone up to USD 2,000 million.")?.value.amountCents).toBe(200_000_000_000);
  });

  it("refuses a bare number with no currency, rather than guessing one", () => {
    expect(readSigningAuthority("Sara has unilateral authority up to 500,000.")).toBeNull();
  });

  it("marks a weaker read as probable rather than clear", () => {
    const f = readSigningAuthority("Their budget appears to be around PKR 300,000 for this.");
    expect(f?.confidence).toBe("probable");
  });
});

describe("reading what they last paid for something like this", () => {
  it("finds the abandoned system's price, which is the founder's best anchor", () => {
    const f = readPreviousSpend(REAL);
    expect(f?.value.amountCents).toBe(40_000_000); // PKR 400,000
    expect(f?.confidence).toBe("clear");
  });

  it("says nothing when nothing was spent before", () => {
    expect(readPreviousSpend("They have never bought software of this kind.")).toBeNull();
  });
});

describe("what the OS can offer instead of asking", () => {
  it("pulls both facts out of the council's rationales, naming which check said it", () => {
    const facts = knownFactsFrom([
      { role: "operational_complexity", rationale: "Three clinics, all manual." },
      { role: "real_budget", rationale: REAL },
    ]);
    expect(facts.signingAuthority?.value.amountCents).toBe(50_000_000);
    expect(facts.previousSpend?.value.amountCents).toBe(40_000_000);
    expect(facts.signingAuthority?.source).toContain("real budget");
  });

  it("returns nothing rather than something wrong when the prose does not support it", () => {
    const facts = knownFactsFrom([{ role: "real_problem", rationale: "The front desk is overwhelmed and reporting is manual." }]);
    expect(facts.signingAuthority).toBeNull();
    expect(facts.previousSpend).toBeNull();
  });

  it("survives an empty council", () => {
    expect(knownFactsFrom([])).toEqual({ signingAuthority: null, previousSpend: null });
  });
});
