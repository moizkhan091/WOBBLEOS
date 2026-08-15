import { z } from "zod";
import type { CostInputsView, DeliveryCost } from "@/lib/domain/delivery-cost";
import { proseAgreesWithPrice } from "@/lib/domain/quoted-price";

/**
 * No document leaves this system carrying a price a human did not choose.
 *
 * This is a safety net, and it exists because the alternative already happened. A model guessed an
 * implementation figure, the proposal builder turned that guess into a quote, the units were wrong,
 * and a Karachi dental group was about to receive a bill 280 times too large. Nobody chose that number.
 * It simply flowed downhill from a field in a report.
 *
 * The rule, stated once and enforced everywhere a price can reach a client:
 *
 *   The OS may compute COST. Only a founder may set PRICE.
 *
 * A priced artifact starts `awaiting_decision`. It can be drafted, reviewed, argued with and revised in
 * that state. It cannot be approved and it cannot be sent. The founder is shown what delivery costs,
 * types a number, and that decision is recorded with their name against it.
 *
 * Deliberately NOT here: any suggestion of what to charge. Showing a founder a recommended price is
 * the same failure wearing a different hat, because the recommendation becomes the decision.
 */

export const PRICING_STATUSES = ["awaiting_decision", "decided"] as const;
export type PricingStatus = (typeof PRICING_STATUSES)[number];

/** What kinds of artifact carry a price and therefore go through this gate. */
export const PRICED_ARTIFACTS = ["proposal", "invoice", "pitch", "offer_sheet"] as const;
export type PricedArtifact = (typeof PRICED_ARTIFACTS)[number];

export const pricingDecisionSchema = z.object({
  /** What the client will be charged, once, to get it live. */
  oneOffCents: z.number().int().min(0),
  /** What they will be charged every month it runs. Zero for a pure one-off. */
  monthlyCents: z.number().int().min(0).default(0),
  currency: z.string().trim().min(1).max(8),
  /**
   * Why this number. Required, and not for bureaucracy: a price with no stated reason cannot be
   * defended on a call, cannot be repeated for the next client like this one, and cannot be argued
   * with by the pricing analyst.
   */
  reasoning: z.string().trim().min(10).max(1000),
  /** The founder who chose it. Their name goes on it. */
  decidedBy: z.string().trim().min(1).max(120),
  decidedAt: z.string().datetime().optional(),
});
export type PricingDecision = z.infer<typeof pricingDecisionSchema>;

export interface PricingState {
  status: PricingStatus;
  /** What it costs us. Computed, never a price. */
  cost: DeliveryCost | null;
  decision: PricingDecision | null;
  /** The audit's own implementation guess, kept for reference and never used as a price. */
  auditEstimateCents?: number | null;
  /**
   * The inputs the cost was computed from, and where each came from.
   *
   * Kept so a founder can correct a guess and have the cost recomputed, without re-reading the audit
   * and without losing their correction the next time anything touches the proposal.
   */
  inputs?: CostInputsView | null;
}

/** A fresh artifact: costed if we can, priced by nobody. */
export function awaitingPricing(cost: DeliveryCost | null, auditEstimateCents?: number | null, inputs?: CostInputsView | null): PricingState {
  return { status: "awaiting_decision", cost, decision: null, auditEstimateCents: auditEstimateCents ?? null, inputs: inputs ?? null };
}

export function decidePricing(state: PricingState, decision: PricingDecision, now: Date): PricingState {
  return { ...state, status: "decided", decision: { ...decision, decidedAt: decision.decidedAt ?? now.toISOString() } };
}

/** Statuses that put a document in front of a client, or commit us to a number. */
const OUTWARD_STATUSES = new Set(["approved", "sent", "viewed", "accepted"]);

export interface GateVerdict {
  allowed: boolean;
  /** Why not, in words a founder can act on. Empty when allowed. */
  because: string;
}

/**
 * May this artifact move to that status?
 *
 * Drafting, reviewing and revising are all fine while a price is undecided: that is exactly when the
 * deal reviewer and the pricing analyst should be arguing with it. The gate closes at the moment the
 * document would become real.
 */
export function canAdvance(state: PricingState | null | undefined, toStatus: string, document?: PricedDocument): GateVerdict {
  if (!OUTWARD_STATUSES.has(toStatus)) return { allowed: true, because: "" };
  if (!state) {
    return { allowed: false, because: "This document has no pricing record at all, so nobody has decided what to charge. Set a price before it goes anywhere near a client." };
  }
  if (state.status !== "decided" || !state.decision) {
    return { allowed: false, because: "Nobody has decided what to charge for this yet. The OS worked out what it costs us; the price is yours to set." };
  }
  if (state.decision.oneOffCents <= 0 && state.decision.monthlyCents <= 0) {
    return { allowed: false, because: "The recorded price is zero. If this is genuinely free, say so in the reasoning and set a token amount; a zero on a proposal reads as a mistake." };
  }
  // The field is decided. Now the words. A real approved proposal carried PKR 45,000 in the field and
  // "PKR 4.5M implementation investment" in its scope, and passed this gate, because until now the
  // gate only ever looked at the number.
  if (document) {
    const prose = proseAgreesWithPrice(document.texts, state.decision, document.allowedCents ?? []);
    if (!prose.agrees) return { allowed: false, because: prose.because };
  }
  return { allowed: true, because: "" };
}

/**
 * The words of the document, and any price a founder legitimately declared inside it.
 *
 * `allowedCents` exists because a phased quote genuinely says two numbers: "phase one is PKR 400,000"
 * in the prose and the whole engagement in the decision. Both are true and neither is a contradiction.
 */
export interface PricedDocument {
  texts: Array<string | null | undefined>;
  allowedCents?: number[];
}

/**
 * The line the container shows while a price is outstanding.
 *
 * Names the cost so the founder has the one number the decision needs, and says plainly that the
 * decision is theirs. Never suggests an amount.
 */
export function pricingPrompt(state: PricingState, currency: string): string {
  const money = (c: number, cur: string) => `${cur} ${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (state.status === "decided" && state.decision) {
    const d = state.decision;
    return `Priced by ${d.decidedBy} at ${money(d.oneOffCents, currency)}${d.monthlyCents > 0 ? ` plus ${money(d.monthlyCents, currency)} a month` : ""}. ${d.reasoning}`;
  }
  if (!state.cost) {
    return "This needs a price before it can be approved or sent, and there is not enough detail yet to work out what it costs us. Fill in what it connects to and how much volume it handles.";
  }
  // The cost carries its OWN currency and the quote carries the founder's. Tool list prices are
  // published in dollars; a Karachi client's proposal is in rupees. Printing "PKR 70 a month" for a
  // USD 70 cost is how a founder reads a real cost as a rounding error, and it is the same units
  // mistake that nearly sent a client a bill 280 times too large.
  const cur = state.cost.currency || "USD";
  const { oneOffCents, monthlyCents, effortOneOffCents } = state.cost;
  const parts = oneOffCents > 0 ? [`Costs us ${money(oneOffCents, cur)} to build`] : ["Nothing is paid out to start this build"];
  if (monthlyCents > 0) parts.push(`${money(monthlyCents, cur)} a month to run`);
  const effort = effortOneOffCents > 0 ? ` About ${money(effortOneOffCents, cur)} of our own build time sits behind it, which is not a cash cost.` : "";
  const note = cur !== currency ? ` That cost is in ${cur}; your price is in ${currency}.` : "";
  return `${parts.join(" and ")}.${effort}${note} What you charge is your decision, and nothing goes out until you make it.`;
}

/** Anything a founder should see before typing a number. */
export function pricingChecklist(cost: DeliveryCost | null): string[] {
  const items = [
    "What this is worth to THEM, in their own numbers, not what it costs us.",
    "What they last paid for something like this, and whether it worked.",
    "Whether the person you are talking to can approve it alone.",
  ];
  if (cost?.unknowns.length) items.push(...cost.unknowns.map((u) => `Still unknown: ${u}`));
  if (cost && cost.monthlyCents > 0) items.push("Whether there is a recurring price, or you are carrying the running cost yourself.");
  return items;
}
