import { z } from "zod";

/**
 * The three things a single-business container could not express: who sent this client to us, which
 * sites the business actually has, and whether a dead client is worth waking up.
 *
 * All three live on the company's metadata rather than in new tables. They are attributes of one
 * container, they are always read with it, and a referral that could point at a company row that no
 * longer exists is worse than one that carries the name it was given.
 */

// -------------------------------------------------------------------------- referrals

export const referralSchema = z.object({
  /** The container that sent them, when the referrer is also a client. */
  referredByCompanyId: z.string().trim().min(1).optional(),
  /** Their name, always. A referrer who is not a client still deserves the credit. */
  referredByName: z.string().trim().min(1).max(200),
  /** What was actually said, so a thank-you can quote it. */
  note: z.string().trim().max(600).optional(),
  at: z.string().datetime().optional(),
});
export type Referral = z.infer<typeof referralSchema>;

// -------------------------------------------------------------------------- locations

export const locationSchema = z.object({
  name: z.string().trim().min(1).max(160),
  city: z.string().trim().max(120).optional(),
  /** What is different here. A branch with its own booking system is a different problem. */
  note: z.string().trim().max(600).optional(),
  /** Rough size, so a rollout can be sequenced by where the pain is worst. */
  headcount: z.number().int().min(0).optional(),
});
export type ClientLocation = z.infer<typeof locationSchema>;

export const locationsSchema = z.array(locationSchema).max(50);

/**
 * A one-line summary of the shape of the business, for the prompts that build audits and proposals.
 * Three clinics with one shared front desk is a different job from three independent branches.
 */
export function describeLocations(locations: ClientLocation[]): string {
  if (!locations.length) return "";
  if (locations.length === 1) return `Operates from one site: ${locations[0].name}${locations[0].city ? `, ${locations[0].city}` : ""}.`;
  const named = locations.slice(0, 8).map((l) => `${l.name}${l.city ? ` (${l.city})` : ""}${l.note ? `: ${l.note}` : ""}`);
  return [`Operates ${locations.length} sites:`, ...named.map((n) => `- ${n}`)].join("\n");
}

// -------------------------------------------------------------------------- reactivation

export type ReactivationVerdict = "worth_waking" | "not_yet" | "leave_it";

export interface ReactivationInput {
  /** Days since anything at all happened with this client. */
  daysSinceTouch: number | null;
  /** Deal status, when there is one. */
  dealStatus: string | null;
  /** Why we lost, if we did. */
  lostReason: string | null;
  /** How much we already know: an expensive container is expensive to rebuild. */
  approvedFindingCount: number;
  hadAudit: boolean;
  hadProposal: boolean;
}

export interface Reactivation {
  verdict: ReactivationVerdict;
  /** Why, in a sentence, so a founder can disagree. */
  because: string;
  /** The angle to open with. Empty when there is no case for reopening. */
  angle: string;
}

/** Reasons a loss is about timing rather than fit, which is the only kind worth reopening. */
const TIMING_LOSS = /(budget|timing|later|next (year|quarter)|not now|too early|postpon|delay|paused|hiring|cash)/i;
const HARD_LOSS = /(competitor|went with|chose|bad fit|not interested|no need|built (it )?in.?house)/i;

/**
 * Should we go back to this client?
 *
 * Deterministic on purpose. The decision turns on facts the OS holds (how long, why we lost, how much
 * we already learned), and a founder deciding whether to spend an afternoon on an old client should be
 * able to see the reasoning rather than a confident sentence from a model.
 */
export function assessReactivation(input: ReactivationInput): Reactivation {
  const days = input.daysSinceTouch;
  const depth = input.approvedFindingCount + (input.hadAudit ? 10 : 0) + (input.hadProposal ? 5 : 0);

  if (days === null || days < 45) {
    return { verdict: "not_yet", because: "Too recent to count as dormant. Chasing now reads as pestering.", angle: "" };
  }

  if (input.dealStatus === "lost") {
    const reason = input.lostReason ?? "";
    if (HARD_LOSS.test(reason) && !TIMING_LOSS.test(reason)) {
      return { verdict: "leave_it", because: `Lost on fit, not timing: "${reason}". Nothing has changed that.`, angle: "" };
    }
    if (TIMING_LOSS.test(reason)) {
      return {
        verdict: "worth_waking",
        because: `Lost on timing, not fit: "${reason}". It has been ${days} days, so the reason may have expired.`,
        angle: `Go back to the specific thing they said blocked it and ask whether it still does. Do not re-pitch, and do not re-run discovery, we already hold ${input.approvedFindingCount} approved findings on them.`,
      };
    }
    if (!reason) {
      return {
        verdict: "worth_waking",
        because: `Lost ${days} days ago with no reason recorded, so there is nothing saying it cannot be reopened.`,
        angle: "Ask what actually decided it. Even a no is worth having on the record for the next one like them.",
      };
    }
    return { verdict: "not_yet", because: `Lost for a reason that is neither clearly timing nor clearly fit: "${reason}".`, angle: "" };
  }

  if (input.dealStatus === "won") {
    return days >= 120
      ? { verdict: "worth_waking", because: `Delivered and quiet for ${days} days. A past client who liked the work is the cheapest next deal there is.`, angle: "Ask what changed since the system went in, and what is still manual. Expansion, not a pitch." }
      : { verdict: "not_yet", because: "Recently delivered. Let the work speak first.", angle: "" };
  }

  if (days >= 90 && depth >= 10) {
    return {
      verdict: "worth_waking",
      because: `Never closed, silent for ${days} days, and we already hold ${depth} points of context on them. Rebuilding that would cost more than the call.`,
      angle: "Open with the number they gave us themselves. It is the one thing they cannot argue with, and it proves we listened.",
    };
  }

  if (days >= 90) {
    return { verdict: "worth_waking", because: `Silent for ${days} days with an open deal. Either it is dead or nobody asked.`, angle: "One direct message asking whether to close the file. A clean no is worth more than a maybe." };
  }

  return { verdict: "not_yet", because: `Quiet for ${days} days, which is not yet dormant.`, angle: "" };
}
