/**
 * What currency an audit's money figures are actually in.
 *
 * This exists because of a real near-miss. A paid audit for a three-clinic dental group in Karachi
 * reasoned entirely in rupees, writing "losing PKR 1.5M monthly" and "PKR 400k previous system", but
 * its numeric fields (`estimatedImplementationCents`, `estimatedMonthlyUpsideCents`) carried no unit at
 * all. The proposal builder read one of those numbers and defaulted the proposal to USD, producing a
 * quote of USD 1,400,000 for work the audit had priced at PKR 1,400,000, roughly 280 times too much.
 *
 * The pricing analyst caught it, which is exactly its job, but a number that wrong should never reach
 * an agent's desk in the first place.
 *
 * The rule here: money without a currency is not money. Where the currency cannot be established from
 * evidence, this REFUSES to guess rather than defaulting to USD, because a silent default is what
 * caused the problem.
 */

export const SUPPORTED_CURRENCIES = ["PKR", "USD", "AED", "GBP", "EUR", "SAR", "INR"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Where a currency conclusion came from, so a founder can judge it. */
export type CurrencyEvidence = "report_text" | "client_country" | "client_market" | "none";

export interface CurrencyVerdict {
  currency: SupportedCurrency | null;
  evidence: CurrencyEvidence;
  /** Plain sentence for the UI. Always populated, including when nothing was found. */
  because: string;
  /** True when two different currencies appear, which is worse than none. */
  conflicting: boolean;
}

/** Country and city hints, lowercased, mapped to the currency a quote there would be written in. */
const MARKET_CURRENCY: Array<{ match: RegExp; currency: SupportedCurrency; label: string }> = [
  { match: /\b(pakistan|lahore|karachi|islamabad|rawalpindi|faisalabad|multan|peshawar|quetta|sialkot)\b/i, currency: "PKR", label: "Pakistan" },
  { match: /\b(uae|u\.a\.e|dubai|abu dhabi|sharjah|ajman|emirates)\b/i, currency: "AED", label: "the UAE" },
  { match: /\b(saudi|riyadh|jeddah|dammam|ksa)\b/i, currency: "SAR", label: "Saudi Arabia" },
  { match: /\b(united kingdom|uk-facing|\buk\b|london|manchester|birmingham|england|scotland)\b/i, currency: "GBP", label: "the UK" },
  { match: /\b(india|mumbai|delhi|bangalore|bengaluru|hyderabad|chennai|pune)\b/i, currency: "INR", label: "India" },
  { match: /\b(germany|france|spain|italy|netherlands|ireland|eurozone|berlin|paris|madrid|amsterdam)\b/i, currency: "EUR", label: "the eurozone" },
  { match: /\b(united states|us-facing|\busa\b|\bus\b|new york|california|texas|florida)\b/i, currency: "USD", label: "the US" },
];

/** Currency codes and symbols as they appear in a report's prose. */
const CODE_PATTERNS: Array<{ match: RegExp; currency: SupportedCurrency }> = [
  { match: /\bPKR\b|\bRs\.?\s?\d|\brupees?\b/i, currency: "PKR" },
  { match: /\bAED\b|\bdirhams?\b/i, currency: "AED" },
  { match: /\bSAR\b|\briyals?\b/i, currency: "SAR" },
  { match: /\bGBP\b|£\s?\d/, currency: "GBP" },
  { match: /\bEUR\b|€\s?\d/, currency: "EUR" },
  { match: /\bINR\b/, currency: "INR" },
  { match: /\bUSD\b|\$\s?\d/, currency: "USD" },
];

/**
 * Read the currency out of a report's own prose.
 *
 * The prose is the reliable signal precisely because the numbers are not: a model writing about a
 * Karachi clinic says "PKR 1.5M" in every sentence while leaving the numeric fields bare.
 *
 * Two different codes appearing is reported as a conflict rather than resolved by counting, because a
 * report that mixes currencies has a deeper problem than which one to pick.
 */
export function currencyFromText(text: string): { currency: SupportedCurrency | null; conflicting: boolean; found: SupportedCurrency[] } {
  const found = [...new Set(CODE_PATTERNS.filter((p) => p.match.test(text)).map((p) => p.currency))];
  // A quote written in rupees very often mentions a dollar equivalent in brackets. Rupees is the one
  // the numbers are in, so a PKR+USD pair is not a conflict, it is a conversion.
  if (found.length === 2 && found.includes("USD")) {
    const other = found.find((c) => c !== "USD")!;
    return { currency: other, conflicting: false, found };
  }
  if (found.length > 1) return { currency: null, conflicting: true, found };
  return { currency: found[0] ?? null, conflicting: false, found };
}

export function currencyFromMarket(...hints: Array<string | null | undefined>): { currency: SupportedCurrency | null; label: string } {
  const haystack = hints.filter(Boolean).join(" ");
  if (!haystack.trim()) return { currency: null, label: "" };
  for (const entry of MARKET_CURRENCY) {
    if (entry.match.test(haystack)) return { currency: entry.currency, label: entry.label };
  }
  return { currency: null, label: "" };
}

export interface CurrencyInput {
  /** Everything the report says, concatenated. Its prose is the strongest signal. */
  reportText: string;
  country?: string | null;
  city?: string | null;
  /** Whatever the client wrote about their market on the form. */
  market?: string | null;
}

/**
 * Decide what currency an audit's numbers are in.
 *
 * Order: the report's own words, then where the client is. Never a default, because the default is
 * what put a 280x quote in front of a client.
 */
export function resolveReportCurrency(input: CurrencyInput): CurrencyVerdict {
  const fromText = currencyFromText(input.reportText);
  if (fromText.conflicting) {
    return {
      currency: null,
      evidence: "none",
      conflicting: true,
      because: `The audit mixes ${fromText.found.join(" and ")} in its own text, so which one its numbers are in cannot be established. Set the currency by hand before quoting.`,
    };
  }
  if (fromText.currency) {
    return { currency: fromText.currency, evidence: "report_text", conflicting: false, because: `The audit writes its figures in ${fromText.currency}.` };
  }

  const fromCountry = currencyFromMarket(input.country);
  if (fromCountry.currency) {
    return { currency: fromCountry.currency, evidence: "client_country", conflicting: false, because: `The client is in ${fromCountry.label}, so the figures are read as ${fromCountry.currency}.` };
  }
  const fromMarket = currencyFromMarket(input.city, input.market);
  if (fromMarket.currency) {
    return { currency: fromMarket.currency, evidence: "client_market", conflicting: false, because: `The client operates in ${fromMarket.label}, so the figures are read as ${fromMarket.currency}.` };
  }

  return {
    currency: null,
    evidence: "none",
    conflicting: false,
    because: "Nothing in the audit or the client record says what currency these figures are in. Set it before quoting: assuming dollars once turned a rupee price into a quote roughly 280 times too high.",
  };
}

/** Flatten a stored report into the text this reads. Cheap, and avoids missing a nested mention. */
export function reportTextOf(report: Record<string, unknown> | null | undefined): string {
  if (!report) return "";
  try {
    return JSON.stringify(report);
  } catch {
    return "";
  }
}
