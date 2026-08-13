/**
 * What WOBBLE has actually charged, and why.
 *
 * The pricing analyst's verdict on every real proposal so far has been `not_enough_history`, and it was
 * right: there was no history. Every price lived on one proposal row with no reasoning attached, so
 * there was nothing to compare a new quote against and nothing to stop two similar clients getting
 * wildly different numbers.
 *
 * Now that a price is a recorded DECISION with a stated reason and a name on it, those decisions become
 * the benchmark. This is the pure half: given past decisions and the shape of the work in front of you,
 * what did we charge for something like this, and what margin did it leave.
 *
 * The honesty rule carried over from the pricing gate: this REPORTS what happened. It does not
 * recommend. Two comparable deals is a data point, not a rate card, and saying "we usually charge X"
 * where X is one deal is how a rate card gets invented by accident.
 */

export interface PastPrice {
  proposalId: string;
  companyId: string | null;
  clientName: string;
  industry: string | null;
  /** What the client was charged. */
  oneOffCents: number;
  monthlyCents: number;
  currency: string;
  /** What it cost us, where we recorded it. */
  costOneOffCents: number | null;
  costMonthlyCents: number | null;
  /** Why that number, in the founder's own words. */
  reasoning: string;
  decidedBy: string;
  decidedAt: string;
  /** How many systems were in the quote, as a rough proxy for size. */
  itemCount: number;
  /** Did they say yes? The only outcome that matters. */
  outcome: "accepted" | "rejected" | "expired" | "open";
}

export interface ComparableQuery {
  industry: string | null;
  itemCount: number;
  currency: string;
}

export interface PricingHistory {
  /** Deals close enough to compare, most similar first. */
  comparables: PastPrice[];
  /** Everything, for when there is nothing comparable. */
  total: number;
  /** Plain sentence for the founder and for the analyst's prompt. */
  headline: string;
  /** Median one-off among comparables, or null when there are too few to mean anything. */
  medianOneOffCents: number | null;
  /** Share of comparable quotes that were accepted, or null when too few. */
  winRate: number | null;
}

/** Two is the floor for saying anything at all. One past deal is an anecdote. */
export const MIN_COMPARABLES = 2;

/**
 * How close a past deal is to the one in front of you.
 *
 * Same industry counts for most: what a dental group pays has little to do with what a law firm pays.
 * Similar size next. Currency must match, because comparing a rupee quote to a dollar one is the exact
 * mistake that started all of this.
 */
export function similarity(past: PastPrice, query: ComparableQuery): number {
  if (past.currency !== query.currency) return 0;
  let score = 1;
  if (query.industry && past.industry) {
    score += past.industry.toLowerCase() === query.industry.toLowerCase() ? 3 : 0;
  }
  const sizeGap = Math.abs(past.itemCount - query.itemCount);
  score += sizeGap <= 2 ? 2 : sizeGap <= 5 ? 1 : 0;
  // A deal that closed tells you more about a workable price than one that never did.
  if (past.outcome === "accepted") score += 1;
  return score;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * What we have charged for work like this.
 *
 * Returns nothing rather than something thin: below MIN_COMPARABLES it says so plainly, which is what
 * the analyst should then report instead of inventing a benchmark.
 */
export function pricingHistory(past: PastPrice[], query: ComparableQuery): PricingHistory {
  const scored = past
    .map((p) => ({ p, score: similarity(p, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const comparables = scored.map((x) => x.p);

  if (comparables.length < MIN_COMPARABLES) {
    return {
      comparables,
      total: past.length,
      headline:
        past.length === 0
          ? "Nothing has been priced through the OS yet, so there is no history to compare against. This one becomes the first data point."
          : `Only ${comparables.length} comparable quote${comparables.length === 1 ? "" : "s"} in ${query.currency}, which is not enough to say what we usually charge. ${past.length} priced deal${past.length === 1 ? "" : "s"} in total.`,
      medianOneOffCents: null,
      winRate: null,
    };
  }

  const medianOneOffCents = median(comparables.map((c) => c.oneOffCents));
  const decided = comparables.filter((c) => c.outcome === "accepted" || c.outcome === "rejected");
  const winRate = decided.length >= MIN_COMPARABLES ? decided.filter((c) => c.outcome === "accepted").length / decided.length : null;
  const money = (c: number) => `${query.currency} ${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  const parts = [`${comparables.length} comparable quotes, median ${money(medianOneOffCents ?? 0)}`];
  if (winRate !== null) parts.push(`${Math.round(winRate * 100)}% of the decided ones were accepted`);
  return { comparables, total: past.length, headline: `${parts.join(", ")}.`, medianOneOffCents, winRate };
}

/**
 * The block handed to the pricing analyst.
 *
 * Includes the REASONING on each past price, because that is the part that makes a comparison usable:
 * "PKR 450,000, three times what they had abandoned" tells you something a bare number does not.
 */
export function renderHistoryForAnalyst(history: PricingHistory): string {
  if (!history.comparables.length) return `WOBBLE PRICING HISTORY: ${history.headline}`;
  const lines = [`WOBBLE PRICING HISTORY: ${history.headline}`, ""];
  for (const c of history.comparables.slice(0, 8)) {
    const cost = c.costOneOffCents !== null ? `, cost us ${c.currency} ${(c.costOneOffCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "";
    lines.push(`- ${c.clientName}${c.industry ? ` (${c.industry})` : ""}: ${c.currency} ${(c.oneOffCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}${c.monthlyCents > 0 ? ` plus ${(c.monthlyCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}/mo` : ""}${cost}, ${c.itemCount} systems, ${c.outcome}. Reason given: ${c.reasoning}`);
  }
  return lines.join("\n");
}

/**
 * Whether a proposed price is out of line with what we have charged before.
 *
 * Reports the multiple and lets a founder judge it. Deliberately does not say "too high" below a
 * threshold, because a genuinely bigger job SHOULD cost more and this cannot tell the difference.
 */
export function comparedToHistory(oneOffCents: number, history: PricingHistory): string {
  if (history.medianOneOffCents === null || history.medianOneOffCents <= 0) return history.headline;
  const multiple = oneOffCents / history.medianOneOffCents;
  const money = (c: number) => `${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (multiple >= 2) return `This is ${multiple.toFixed(1)} times the median of ${money(history.medianOneOffCents)} you have charged for comparable work. Fine if the job is genuinely bigger, worth a second look if it is not.`;
  if (multiple <= 0.5) return `This is ${multiple.toFixed(1)} times the median of ${money(history.medianOneOffCents)} you have charged for comparable work. Check you are not underselling out of habit.`;
  return `In line with the ${money(history.medianOneOffCents)} median of your comparable work.`;
}
