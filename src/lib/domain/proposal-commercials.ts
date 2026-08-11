import { z } from "zod";

/**
 * The commercial side of a proposal: what else you could have offered, what they pushed back on, and
 * what was actually negotiated.
 *
 * Three gaps this closes, all of them observed on real deals:
 *   - one proposal, one price. A client who wants a cheaper option has to be quoted again from scratch,
 *     and the founder has no anchor to negotiate against.
 *   - the objections the client already stated never reach the document. Someone says "we have been sold
 *     vapourware before" on the call and then reads a proposal that opens by describing a platform.
 *   - a price gets negotiated in WhatsApp and the OS never learns what was asked, countered or settled.
 *
 * Everything here is pure and deterministic. Deriving three tiers from a service list does not need a
 * model, and a founder who cannot predict what the cheap tier drops will not trust it.
 */

// -------------------------------------------------------------------------- variants

export const PROPOSAL_TIERS = ["essential", "recommended", "complete"] as const;
export type ProposalTier = (typeof PROPOSAL_TIERS)[number];

export const TIER_LABELS: Record<ProposalTier, string> = {
  essential: "Essential",
  recommended: "Recommended",
  complete: "Complete",
};

export const TIER_INTENT: Record<ProposalTier, string> = {
  essential: "The smallest thing that fixes the problem they actually described. For a client who needs a yes to be cheap.",
  recommended: "What the audit says the work is. This is the one to lead with.",
  complete: "Recommended plus the work that compounds once the first thing is running.",
};

export interface ProposalService {
  name: string;
  description?: string;
  priceCents?: number;
}

export interface ProposalVariant {
  tier: ProposalTier;
  label: string;
  intent: string;
  services: ProposalService[];
  totalCents: number;
  /** Named so a founder can defend the number: what this tier leaves out, and why. */
  tradeoff: string;
}

/**
 * Derive good/better/best from the services already on the proposal.
 *
 * Rules, chosen so the output is predictable rather than clever:
 *   - Essential keeps the single most expensive service, which in a WOBBLE proposal is the one carrying
 *     the actual build. A cheap tier made of the cheapest line items would be an offer to do nothing.
 *   - Recommended is exactly what was quoted. It is never re-priced, because the audit produced it.
 *   - Complete adds nothing invented. It is Recommended plus a named continuation at a stated rate, so
 *     the number is arguable rather than a markup.
 *
 * `continuationCents` is what a retainer or phase two would cost. Zero means Complete is not offered,
 * which is honest: two tiers beat a third one that is padding.
 */
export function buildVariants(services: ProposalService[], totalCents: number, continuationCents = 0): ProposalVariant[] {
  const priced = services.filter((s) => (s.priceCents ?? 0) > 0);
  const variants: ProposalVariant[] = [];

  if (priced.length > 1) {
    const anchor = [...priced].sort((a, b) => (b.priceCents ?? 0) - (a.priceCents ?? 0))[0];
    const dropped = priced.filter((s) => s.name !== anchor.name);
    variants.push({
      tier: "essential",
      label: TIER_LABELS.essential,
      intent: TIER_INTENT.essential,
      services: [anchor],
      totalCents: anchor.priceCents ?? 0,
      tradeoff: `Drops ${dropped.map((s) => s.name).join(", ")}. You get the build and none of the surrounding work, so anything those covered stays manual.`,
    });
  }

  variants.push({
    tier: "recommended",
    label: TIER_LABELS.recommended,
    intent: TIER_INTENT.recommended,
    services,
    totalCents,
    tradeoff: "Nothing dropped. This is what the audit found and what the price was built from.",
  });

  if (continuationCents > 0) {
    variants.push({
      tier: "complete",
      label: TIER_LABELS.complete,
      intent: TIER_INTENT.complete,
      services: [...services, { name: "Ongoing operation and iteration", description: "Running the system, watching what it does, and improving it monthly rather than handing it over and leaving.", priceCents: continuationCents }],
      totalCents: totalCents + continuationCents,
      tradeoff: "Costs more up front. Worth it only if you want the system improved rather than frozen at handover.",
    });
  }

  return variants;
}

/** A variant set is worth showing only when it genuinely offers a choice. */
export function variantsAreUseful(variants: ProposalVariant[]): boolean {
  return variants.length >= 2;
}

// -------------------------------------------------------------------------- objections in the document

export interface StatedObjection {
  /** Their words. */
  objection: string;
  /** Our answer. */
  answer: string;
}

/**
 * The paragraph a proposal should open with when the client has already told us what worries them.
 *
 * Deterministic assembly, not a generated paragraph: the objection and the answer were already written
 * (by the objection handler, or by a founder), and regenerating them here would let the document drift
 * away from what the founder approved.
 */
export function objectionOpening(clientName: string, objections: StatedObjection[]): string {
  const usable = objections.filter((o) => o.objection.trim() && o.answer.trim()).slice(0, 3);
  if (!usable.length) return "";
  const lines = [
    `Before anything else, the things ${clientName} already told us, answered.`,
    "",
    ...usable.flatMap((o) => [`You said: ${o.objection.trim()}`, o.answer.trim(), ""]),
  ];
  return lines.join("\n").trim();
}

// -------------------------------------------------------------------------- negotiation

export const negotiationEventSchema = z.object({
  /** What happened, from our side. */
  kind: z.enum(["asked", "countered", "conceded", "agreed", "walked_away"]),
  /** The number on the table after this event, in cents. */
  amountCents: z.number().int().min(0),
  currency: z.string().trim().min(1).max(8).default("USD"),
  /** Who moved: us or them. */
  by: z.enum(["wobble", "client"]),
  /** One line on why. This is the part worth reading in six months. */
  note: z.string().trim().min(3).max(600),
  at: z.string().datetime().optional(),
  actor: z.string().trim().max(120).optional(),
});
export type NegotiationEvent = z.infer<typeof negotiationEventSchema>;

export const negotiationSchema = z.object({
  /** The number below which we would rather not do the work. Set once, referenced every time. */
  walkAwayCents: z.number().int().min(0).optional(),
  events: z.array(negotiationEventSchema).default([]),
});
export type Negotiation = z.infer<typeof negotiationSchema>;

export interface NegotiationSummary {
  opened: number | null;
  current: number | null;
  /** How far the price has moved from where we opened, as a percentage. Negative means we came down. */
  movedPct: number | null;
  /** True when the number on the table is below the walk-away we set ourselves. */
  belowWalkAway: boolean;
  /** Plain-language line for the container. */
  headline: string;
}

export function summariseNegotiation(n: Negotiation): NegotiationSummary {
  const events = n.events ?? [];
  if (!events.length) {
    return { opened: null, current: null, movedPct: null, belowWalkAway: false, headline: "Nothing negotiated yet." };
  }
  const opened = events[0].amountCents;
  const current = events[events.length - 1].amountCents;
  const movedPct = opened > 0 ? Math.round(((current - opened) / opened) * 100) : null;
  const belowWalkAway = n.walkAwayCents !== undefined && current < n.walkAwayCents;

  const money = (c: number) => `${events[events.length - 1].currency} ${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const direction = movedPct === null || movedPct === 0 ? "unchanged" : movedPct < 0 ? `down ${Math.abs(movedPct)}%` : `up ${movedPct}%`;
  const headline = belowWalkAway
    ? `On the table at ${money(current)}, which is below the ${money(n.walkAwayCents ?? 0)} you said you would not go under.`
    : `Opened at ${money(opened)}, on the table at ${money(current)}, ${direction}.`;

  return { opened, current, movedPct, belowWalkAway, headline };
}

/** Append an event, stamping the time so history cannot be written out of order. */
export function appendNegotiation(current: Negotiation | undefined, event: NegotiationEvent, now: Date): Negotiation {
  const base: Negotiation = current ?? { events: [] };
  return { ...base, events: [...(base.events ?? []), { ...event, at: event.at ?? now.toISOString() }] };
}
