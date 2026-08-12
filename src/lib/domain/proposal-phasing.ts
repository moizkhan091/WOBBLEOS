/**
 * Turning an audit's opportunities into a proposal a client can actually say yes to.
 *
 * The builder used to map every opportunity in the audit into a line item. On a real proposal that was
 * eighteen of them, quoted as one number, to a dental group that had already abandoned one system after
 * a single all-or-nothing purchase. WOBBLE's own deal reviewer refused it, and the reason it gave is the
 * whole point of this file:
 *
 *   "A client burned by a PKR 400k all-or-nothing purchase will want the ability to start small and
 *    expand, but this structure forces another all-in bet."
 *
 * It also found three line items that appeared nowhere in the audit's findings, because everything the
 * audit produced was shipped whether or not it was grounded in something the client had said.
 *
 * So: rank by what the audit itself says is worth most and easiest, phase it, and make phase one small
 * enough to be approved by one person. A deal that starts is worth more than a deal that is admired.
 */

export interface PhasingOpportunity {
  title: string;
  description?: string;
  service?: string;
  impact?: string;
  difficulty?: string;
  estimatedMonthlyValueCents?: number;
  monthlyHoursSaved?: number;
}

export interface ProposalPhase {
  /** 1, 2, 3. Phase 1 is the one a founder should try to get signed on its own. */
  number: number;
  name: string;
  /** Why these, in a sentence the client would accept. */
  rationale: string;
  items: PhasingOpportunity[];
  /** Share of the total value this phase carries, 0-1. Used to split a single quoted price. */
  valueShare: number;
}

const IMPACT_SCORE: Record<string, number> = { high: 3, medium: 2, low: 1 };
// Easy work first: the point of phase one is proof, and proof delayed is proof disbelieved.
const EASE_SCORE: Record<string, number> = { low: 3, medium: 2, high: 1 };

/**
 * How much this opportunity earns its place: what the audit says it is worth, weighted by how quickly
 * it can be delivered. Money the client can see in week three beats money promised in month six.
 */
export function opportunityWeight(o: PhasingOpportunity): number {
  const impact = IMPACT_SCORE[(o.impact ?? "medium").toLowerCase()] ?? 2;
  const ease = EASE_SCORE[(o.difficulty ?? "medium").toLowerCase()] ?? 2;
  // Value is the anchor when the audit costed it; impact stands in when it did not.
  const value = o.estimatedMonthlyValueCents && o.estimatedMonthlyValueCents > 0 ? Math.log10(o.estimatedMonthlyValueCents / 100 + 10) : impact;
  return value * (impact + ease);
}

export interface PhasingOptions {
  /** How many line items phase one may carry. Small on purpose. */
  phaseOneSize?: number;
  phaseTwoSize?: number;
  /** Anything beyond this many opportunities is an optional add-on, not part of the quote. */
  maxInQuote?: number;
}

/**
 * Split an audit's opportunities into phases.
 *
 * Phase 1 is deliberately the smallest thing that proves the system works, drawn from the highest
 * value-per-effort items. Phase 3 is everything else, and anything past `maxInQuote` is dropped from
 * the quote entirely: a line item nobody asked for makes a proposal look padded, and the reviewer
 * flagged exactly that.
 */
export function phaseOpportunities(opportunities: PhasingOpportunity[], opts: PhasingOptions = {}): ProposalPhase[] {
  const phaseOneSize = opts.phaseOneSize ?? 4;
  const phaseTwoSize = opts.phaseTwoSize ?? 4;
  const maxInQuote = opts.maxInQuote ?? 12;

  const ranked = [...opportunities].sort((a, b) => opportunityWeight(b) - opportunityWeight(a)).slice(0, maxInQuote);
  if (!ranked.length) return [];

  const totalWeight = ranked.reduce((n, o) => n + opportunityWeight(o), 0) || 1;
  const share = (items: PhasingOpportunity[]) => items.reduce((n, o) => n + opportunityWeight(o), 0) / totalWeight;

  const one = ranked.slice(0, phaseOneSize);
  const two = ranked.slice(phaseOneSize, phaseOneSize + phaseTwoSize);
  const three = ranked.slice(phaseOneSize + phaseTwoSize);

  const phases: ProposalPhase[] = [
    {
      number: 1,
      name: "Phase 1, prove it works",
      rationale: "The smallest set that puts money back on the table, chosen for the highest value against the least build time. Priced to be approved on its own, so nothing rests on a single large decision.",
      items: one,
      valueShare: share(one),
    },
  ];
  if (two.length) {
    phases.push({
      number: 2,
      name: "Phase 2, widen it",
      rationale: "Starts once phase one is running and measured. Everything here builds on what is already live rather than opening a second front.",
      items: two,
      valueShare: share(two),
    });
  }
  if (three.length) {
    phases.push({
      number: 3,
      name: "Phase 3, compound it",
      rationale: "Worth doing once the basics are working and the team trusts the system. Quoted so it can be deferred without unpicking anything.",
      items: three,
      valueShare: share(three),
    });
  }
  return phases;
}

/**
 * What was left out of the quote, so a founder can see it rather than discover it in a review.
 */
export function excludedFromQuote(opportunities: PhasingOpportunity[], opts: PhasingOptions = {}): PhasingOpportunity[] {
  const maxInQuote = opts.maxInQuote ?? 12;
  return [...opportunities].sort((a, b) => opportunityWeight(b) - opportunityWeight(a)).slice(maxInQuote);
}

/**
 * Split a single quoted total across the phases by the value each carries.
 *
 * The audit gives one implementation number, and phasing it by value rather than by item count keeps
 * phase one both small and honest: the phase carrying most of the return carries most of the cost.
 * Rounded to whole currency units, with any rounding difference landing on the last phase so the parts
 * always add back to the whole.
 */
export function splitPrice(totalCents: number, phases: ProposalPhase[]): Array<{ number: number; priceCents: number }> {
  if (!phases.length || totalCents <= 0) return phases.map((p) => ({ number: p.number, priceCents: 0 }));
  const out = phases.map((p) => ({ number: p.number, priceCents: Math.round((totalCents * p.valueShare) / 100) * 100 }));
  const drift = totalCents - out.reduce((n, x) => n + x.priceCents, 0);
  out[out.length - 1].priceCents += drift;
  return out;
}

/**
 * Is phase one small enough for one person to approve?
 *
 * The reviewer's sharpest point was that a quote 778 times the contact's solo signing authority forces
 * a joint decision the founder has no way to influence. Where the OS knows that authority, it can say
 * so before the proposal goes out.
 */
export function phaseOneWithinAuthority(phaseOneCents: number, soloAuthorityCents: number | null): { ok: boolean; because: string } {
  if (!soloAuthorityCents || soloAuthorityCents <= 0) {
    return { ok: true, because: "No signing authority recorded for this client, so this cannot be checked." };
  }
  if (phaseOneCents <= soloAuthorityCents) {
    return { ok: true, because: "Phase one sits inside what your contact can approve alone." };
  }
  const multiple = Math.round((phaseOneCents / soloAuthorityCents) * 10) / 10;
  return {
    ok: false,
    because: `Phase one is ${multiple} times what your contact can sign off alone, so it needs a joint decision you will not be in the room for. Consider trimming it.`,
  };
}
