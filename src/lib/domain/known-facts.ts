/**
 * Things the OS already knows and was asking a founder to type in anyway.
 *
 * The qualification council writes "Sara having unilateral authority for expenditures up to PKR
 * 500,000" in its own rationale, and the client container then presented an empty box asking what the
 * contact can sign alone. The system knew, and made a person repeat it.
 *
 * That is the shape of most remaining friction in Revenue: a fact stated in one module's prose, needed
 * as a number in another, and a human bridging the gap by hand.
 *
 * The rule for everything in this file: SUGGEST, never apply. These readings come from model-written
 * prose, and prose extraction has already been wrong twice in this codebase (a volume figure read as 75
 * instead of 1,720, and a currency assumed to be dollars when it was rupees). A suggestion a founder
 * confirms in one click is fast and safe. A value written in silently is neither.
 */

export interface SuggestedFact<T> {
  value: T;
  /** The sentence it was read from, so a founder can judge it rather than trust it. */
  quote: string;
  /** Which module said it. */
  source: string;
  /** How sure, in words. */
  confidence: "clear" | "probable";
}

/** Currency codes and symbols, mapped to the code we store. */
const MONEY = String.raw`(?:(PKR|AED|SAR|GBP|EUR|INR|USD|Rs\.?|₨|£|€|\$)\s*)([\d][\d,]{2,12})(?:\s*(k|m|million|lakh|crore))?`;

const SYMBOL_TO_CODE: Record<string, string> = { "rs": "PKR", "rs.": "PKR", "₨": "PKR", "£": "GBP", "€": "EUR", "$": "USD" };

/** Words that mean "this person can approve this much without asking anyone". */
const AUTHORITY_CONTEXT = /(unilateral|sole|solely|alone|without|discretion|sign(?:ing)?[- ]?off|authority|approve|authorise|authorize|budget)/i;

function multiplierFor(suffix: string | undefined): number {
  const s = (suffix ?? "").toLowerCase();
  if (s === "k") return 1_000;
  if (s === "m" || s === "million") return 1_000_000;
  if (s === "lakh") return 100_000;
  if (s === "crore") return 10_000_000;
  return 1;
}

/**
 * Read a solo signing limit out of the qualification council's own rationale.
 *
 * Requires BOTH a money figure and authority language in the same sentence: a rationale mentioning a
 * previous PKR 400,000 purchase is talking about what they once spent, not what this person may
 * approve, and confusing the two would set the wrong ceiling on every future quote.
 */
export function readSigningAuthority(rationale: string, sourceLabel = "the qualification council"): SuggestedFact<{ amountCents: number; currency: string }> | null {
  const sentences = rationale.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    if (!AUTHORITY_CONTEXT.test(sentence)) continue;
    // "up to X", "authority for expenditures up to X", "can approve X": the amount that follows the
    // authority language is the ceiling. Take the FIRST money figure in such a sentence.
    const m = new RegExp(MONEY, "i").exec(sentence);
    if (!m) continue;
    const raw = Number(m[2].replace(/,/g, ""));
    if (!Number.isFinite(raw) || raw <= 0) continue;
    const amount = raw * multiplierFor(m[3]);
    const token = (m[1] ?? "").toLowerCase();
    const currency = /^[a-z]{3}$/.test(token) ? token.toUpperCase() : SYMBOL_TO_CODE[token] ?? "";
    if (!currency) continue;
    return {
      value: { amountCents: Math.round(amount * 100), currency },
      quote: sentence.trim(),
      source: sourceLabel,
      // "unilateral" or "alone" is explicit; a bare "budget" mention is a weaker read.
      confidence: /(unilateral|sole|solely|alone|without asking|discretion|sign(?:ing)?[- ]?off)/i.test(sentence) ? "clear" : "probable",
    };
  }
  return null;
}

/**
 * Read how much the client last spent on something like this.
 *
 * The single most useful anchor a founder has when pricing: WOBBLE's own reviewer used it twice
 * ("980 times what they paid for the last system they abandoned"). It lives in prose and nowhere else.
 */
export function readPreviousSpend(rationale: string, sourceLabel = "the qualification council"): SuggestedFact<{ amountCents: number; currency: string }> | null {
  const sentences = rationale.split(/(?<=[.!?])\s+/);
  const PAST_SPEND = /(previous|previously|already (?:spent|paid|invested)|last (?:system|purchase|vendor|agency)|abandoned|invested|spent|paid)/i;
  for (const sentence of sentences) {
    if (!PAST_SPEND.test(sentence)) continue;
    const m = new RegExp(MONEY, "i").exec(sentence);
    if (!m) continue;
    const raw = Number(m[2].replace(/,/g, ""));
    if (!Number.isFinite(raw) || raw <= 0) continue;
    const token = (m[1] ?? "").toLowerCase();
    const currency = /^[a-z]{3}$/.test(token) ? token.toUpperCase() : SYMBOL_TO_CODE[token] ?? "";
    if (!currency) continue;
    return {
      value: { amountCents: Math.round(raw * multiplierFor(m[3]) * 100), currency },
      quote: sentence.trim(),
      source: sourceLabel,
      confidence: /(previous|abandoned|last system)/i.test(sentence) ? "clear" : "probable",
    };
  }
  return null;
}

/**
 * Everything worth offering a founder rather than asking for, from one client's stored prose.
 *
 * Returns only what it actually found. An empty result is the correct answer when the material does not
 * support one, and is far better than a confidently wrong number sitting in a field nobody checked.
 */
export interface KnownFacts {
  signingAuthority: SuggestedFact<{ amountCents: number; currency: string }> | null;
  previousSpend: SuggestedFact<{ amountCents: number; currency: string }> | null;
}

export function knownFactsFrom(rationales: Array<{ role: string; rationale: string }>): KnownFacts {
  let signingAuthority: KnownFacts["signingAuthority"] = null;
  let previousSpend: KnownFacts["previousSpend"] = null;
  for (const r of rationales) {
    const label = `the qualification council's ${r.role.replace(/_/g, " ")} check`;
    if (!signingAuthority) signingAuthority = readSigningAuthority(r.rationale, label);
    if (!previousSpend) previousSpend = readPreviousSpend(r.rationale, label);
    if (signingAuthority && previousSpend) break;
  }
  return { signingAuthority, previousSpend };
}
