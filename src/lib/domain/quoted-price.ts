/**
 * Prices hiding in prose.
 *
 * The pricing gate stops a document advancing until a founder has decided what to charge. It guards
 * the priced FIELD. It never looked at the sentences, and the sentences are where the failure actually
 * showed up.
 *
 * From a real approved proposal, verbatim:
 *
 *   pricing_cents = 4,500,000 (PKR 45,000)
 *   scope         = "With PKR 4.5M implementation investment, payback occurs in 2.5 months"
 *
 * Two different prices in one document, a hundred times apart, and the gate was satisfied because the
 * field it watches had a decision against it. The deal reviewer caught it and called it a blocker:
 * "Which number is real?" A client reading that document reads the sentence, not the field.
 *
 * So the same rule the gate enforces on the field is enforced on the words:
 *
 *   No document leaves this system quoting a price a founder did not choose.
 *
 * The hard part is telling OUR price from THEIR economics. A proposal is full of the client's own
 * money and should be: "hemorrhaging PKR 2.5M monthly", "PKR 8,000 for a check-up", "they spent PKR
 * 400,000 on the system they abandoned". Flagging those would make this useless inside a week, and a
 * safety net people switch off is worse than none.
 *
 * The distinction used here is engagement language: a figure counts as OUR price only when its own
 * sentence describes it as something being charged for the work. Everything else is left alone.
 */

/** Currency tokens we recognise, mapped to the code we store. */
const SYMBOL_TO_CODE: Record<string, string> = { "rs": "PKR", "rs.": "PKR", "₨": "PKR", "£": "GBP", "€": "EUR", "$": "USD" };

/**
 * The lookbehind and the trailing boundary are both scars. Without the first, "covers 60 hours" reads
 * as "Rs 60"; without the second, "PKR 8,000 monthly" reads as eight billion, because the m of monthly
 * is a perfectly good million suffix.
 */
const MONEY = /(?<![A-Za-z])(PKR|AED|SAR|GBP|EUR|INR|USD|Rs\.?|₨|£|€|\$)\s*([\d][\d,]*(?:\.\d+)?)(?:\s*(k|m|mn|million|bn|billion|lakh|crore)\b)?/gi;

/**
 * Words that make a figure a PRICE FOR THIS WORK rather than a number about the client.
 *
 * Deliberately narrow. "price" on its own is not here, because "PKR 8,000 check-up price" is the
 * client's price list and has every right to be in the document.
 */
const ENGAGEMENT = /(investment|invest\b|implementation cost|project cost|total cost|our fee|fees?\b|retainer|quoted?\b|priced at|price of|package|payback|we charge|charged at|contract value|deposit|upfront|instal?ment|per month to run|monthly fee)/i;

/**
 * Words that mark a figure as the client's own money: what they lose, earn, hold or already spent.
 * When one of these sits closer to the figure than any engagement word, the figure is theirs.
 */
const THEIRS = /(losing|loses|lose|lost|hemorrhag|haemorrhag|bleeding|leak|recaptur|recover|revenue|turnover|worth|earns?|earning|savings?|saves?|last year)/i;

/**
 * Phrases that settle it outright, regardless of how close an engagement word happens to sit.
 *
 * A per-unit figure and a figure they already spent can never be the price of this engagement, and
 * "a check-up is priced at PKR 8,000 per patient" puts "priced at" and "per patient" exactly the same
 * distance from the number. Nearest-word cannot break that tie; meaning can.
 */
const NEVER_OURS = /(per (?:patient|client|customer|visit|appointment|treatment|head|seat|user|month of theirs)|they (?:paid|spent|bought|invested)|already (?:paid|spent|invested)|previously|last (?:system|vendor|agency|purchase)|abandoned|lifetime value|\bltv\b|payroll|salaries|currently (?:pays?|spends?)|current spend)/i;

const MULTIPLIER: Record<string, number> = { k: 1_000, m: 1_000_000, mn: 1_000_000, million: 1_000_000, bn: 1_000_000_000, billion: 1_000_000_000, lakh: 100_000, crore: 10_000_000 };

export interface QuotedPrice {
  /** Exactly as it appears in the document, so a founder can find it. */
  text: string;
  amountCents: number;
  currency: string;
  /** The sentence it sits in. Shown, never summarised: a founder judges it rather than trusts us. */
  quote: string;
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?;])\s+|\n+/).filter((s) => s.trim().length > 0);
}

function amountOf(digits: string, suffix: string | undefined): number | null {
  const raw = Number(digits.replace(/,/g, ""));
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw * (suffix ? MULTIPLIER[suffix.toLowerCase()] ?? 1 : 1);
}

/**
 * Every figure in this text that is being presented as a price for the work.
 *
 * Nearest-word wins when a sentence carries both kinds of language, which the real failing sentence
 * does: "With PKR 4.5M implementation investment, payback occurs in 2.5 months through recaptured
 * appointment revenue alone" has "investment" next to the figure and "revenue" nine words away.
 */
export function quotedPricesIn(text: string | null | undefined): QuotedPrice[] {
  if (!text || !text.trim()) return [];
  const out: QuotedPrice[] = [];
  const seen = new Set<string>();

  for (const sentence of splitSentences(text)) {
    if (NEVER_OURS.test(sentence)) continue;
    const oursAt = nearestIndex(sentence, ENGAGEMENT);
    const theirsAt = nearestIndex(sentence, THEIRS);
    if (oursAt.length === 0) continue;

    for (const m of sentence.matchAll(MONEY)) {
      const amount = amountOf(m[2], m[3]);
      if (amount === null) continue;
      const token = (m[1] ?? "").toLowerCase();
      const currency = /^[a-z]{3}$/.test(token) ? token.toUpperCase() : SYMBOL_TO_CODE[token];
      if (!currency) continue;

      const at = m.index ?? 0;
      const ours = closest(oursAt, at);
      const theirs = closest(theirsAt, at);
      // A tie goes to flagging it. An extra line for a founder to glance at costs seconds; a price
      // nobody chose reaching a client costs the client relationship.
      if (theirs !== null && ours !== null && theirs < ours) continue;

      const key = `${currency}:${Math.round(amount * 100)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: m[0].trim(), amountCents: Math.round(amount * 100), currency, quote: sentence.trim() });
    }
  }
  return out;
}

function nearestIndex(sentence: string, re: RegExp): number[] {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return [...sentence.matchAll(g)].map((m) => m.index ?? 0);
}

function closest(positions: number[], at: number): number | null {
  if (!positions.length) return null;
  return Math.min(...positions.map((p) => Math.abs(p - at)));
}

// -------------------------------------------------------------------------- taking them back out

/**
 * Remove the sentences that quote a price for the work, and say which ones went.
 *
 * Used where a proposal is BUILT. The audit's executive summary is copied into the scope, and that
 * summary happily writes "With PKR 4.5M implementation investment, payback occurs in 2.5 months" from
 * a figure the model guessed. At build time nobody has decided a price, so any price in that text is
 * by definition not one, and it should not be sitting in the document waiting to be sent.
 *
 * The whole sentence goes, not just the number. Replacing PKR 4.5M with PKR 45,000 would leave
 * "payback occurs in 2.5 months" standing behind a figure that no longer supports it, which is a
 * quieter lie than the one being fixed.
 */
export function stripQuotedPrices(text: string | null | undefined): { text: string; removed: string[] } {
  if (!text || !text.trim()) return { text: text ?? "", removed: [] };
  const offending = new Set(quotedPricesIn(text).map((p) => p.quote));
  if (!offending.size) return { text, removed: [] };

  const kept: string[] = [];
  const removed: string[] = [];
  for (const sentence of splitSentences(text)) {
    if (offending.has(sentence.trim())) removed.push(sentence.trim());
    else kept.push(sentence.trim());
  }
  return { text: kept.join(" ").replace(/\s{2,}/g, " ").trim(), removed };
}

// -------------------------------------------------------------------------- agreement with the decision

export interface ProseVerdict {
  /** True when the words and the decision say the same thing, or the words name no price at all. */
  agrees: boolean;
  /** What to show a founder. Empty when it agrees. */
  because: string;
  /** The figures that caused it, so the container can point at them. */
  offenders: QuotedPrice[];
}

/**
 * Prose written as "PKR 4.5M" is rounded, and a decision of PKR 4,499,000 is the same number for a
 * reader. Anything beyond a twentieth apart is a different number, not a rounding.
 */
const TOLERANCE = 0.05;

function within(a: number, b: number): boolean {
  if (a === b) return true;
  const bigger = Math.max(a, b);
  return bigger > 0 && Math.abs(a - b) / bigger <= TOLERANCE;
}

/**
 * Do the words in this document agree with the price a founder actually chose?
 *
 * `allowedCents` carries the decision AND its legitimate parts: a phased quote says "phase one is PKR
 * 400,000" in the prose while the decision is the whole, and both are true.
 */
export function proseAgreesWithPrice(
  texts: Array<string | null | undefined>,
  decision: { oneOffCents: number; monthlyCents?: number; currency: string } | null,
  allowedCents: number[] = [],
): ProseVerdict {
  const found = texts.flatMap((t) => quotedPricesIn(t));
  if (found.length === 0) return { agrees: true, because: "", offenders: [] };

  if (!decision) {
    return {
      agrees: false,
      because: `This document already quotes a price in its own words (${found.map((f) => f.text).join(", ")}), and nobody has decided one. Either that number is the price, in which case record it, or it should not be in the document.`,
      offenders: found,
    };
  }

  const allowed = [decision.oneOffCents, decision.monthlyCents ?? 0, ...allowedCents].filter((c) => c > 0);
  const offenders = found.filter((f) => {
    if (f.currency !== decision.currency) return true;
    return !allowed.some((c) => within(c, f.amountCents));
  });
  if (offenders.length === 0) return { agrees: true, because: "", offenders: [] };

  const money = (c: number, cur: string) => `${cur} ${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const list = offenders.map((o) => `"${o.text}"`).join(", ");
  return {
    agrees: false,
    because: `You priced this at ${money(decision.oneOffCents, decision.currency)}, but the document says ${list}. A client reads the sentence, not the field. Fix the wording or change the price.`,
    offenders,
  };
}
