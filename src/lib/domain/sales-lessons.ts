/**
 * Turning "we keep losing for the same reason" into one change to how we sell.
 *
 * The loss pattern is descriptive: "three of your last four were price". That tells a founder what
 * happened. It does not tell them what to do differently, and the gap between those two is where the
 * lesson actually lives.
 *
 * Deliberately NOT a model call, and this is the important design decision in the file.
 *
 * A model asked "what should WOBBLE change about its sales approach" will always produce something
 * confident. It has no way to know which levers WOBBLE can actually pull, it cannot tell a real
 * pattern from three sentences that happen to rhyme, and a founder reading fluent advice about their
 * own business will tend to believe it. The failure mode is not a wrong sentence, it is a plausible
 * one that quietly changes how a team sells.
 *
 * So the LEVER is derived from the theme, deterministically, from a fixed set of moves WOBBLE can
 * genuinely make, and the EVIDENCE is the founders' own sentences quoted underneath. The system
 * proposes; a founder approves. Nothing here changes anything on its own.
 */

import type { LossPattern, LossTheme } from "@/lib/domain/loss-patterns";

export interface SalesLesson {
  /** Stable across runs for the same theme, so the same lesson is never proposed twice. */
  key: string;
  theme: LossTheme;
  /** What to change, in one imperative sentence a founder can act on this week. */
  change: string;
  /** Why this specific change follows from these specific losses. */
  because: string;
  /** The founders' own words, quoted. The grouping is a lens; these are the facts. */
  evidence: Array<{ clientName: string; reason: string }>;
  /** How many losses sit behind it. */
  losses: number;
  /** What would tell us it worked, so this can be judged later rather than merely believed. */
  measure: string;
}

/**
 * One move per theme, and only moves WOBBLE can actually make.
 *
 * Every one of these is something already built or already possible in the OS: phasing a quote,
 * getting the other decider into the room, leading with a pilot, shortening the first commitment.
 * A lever that WOBBLE cannot pull is advice, and advice is what this file exists to avoid producing.
 */
const LEVERS: Record<LossTheme, { change: string; because: string; measure: string } | null> = {
  price: {
    change: "Lead with phase one alone, priced under what your contact can sign by themselves, and keep the full roadmap as what phase one earns.",
    because: "These deals did not die because the work was not worth it. They died at the size of the first commitment, and phase one already exists on every proposal.",
    measure: "The share of proposals where phase one sits inside the contact's own signing authority, and whether those close more often.",
  },
  authority: {
    change: "Before the pricing call, ask who else has to agree and get them into the room. Do not send a number to someone who has to carry it for you.",
    because: "The person you convinced was not the person who decides, so your argument had to survive a retelling you were not present for.",
    measure: "The share of deals where every decider named in the call findings is a contact in the OS before a price is sent.",
  },
  trust: {
    change: "Open with the smallest thing you can put live in a fortnight, and let it run before asking for the rest.",
    because: "These clients had been sold to before and had been let down. Proof beats argument with someone who has already paid for a promise.",
    measure: "Whether deals that start with a small live build convert to the fuller scope more often than deals quoted whole.",
  },
  timing: {
    change: "Ask what has to be true for this to be worth doing now, and if the honest answer is nothing, book the conversation for when it is instead of discounting.",
    because: "A timing loss chased with a lower price becomes a price loss, and you end up cheaper AND still waiting.",
    measure: "How many timing losses are re-opened on the date agreed, rather than drifting.",
  },
  competitor: {
    change: "Ask on the first call who else they are speaking to, and write down what those people are promising.",
    because: "You cannot argue against an offer you have not heard. These were lost to something you learned about afterwards.",
    measure: "The share of deals where a competitor is named in the call findings before a proposal goes out.",
  },
  fit: {
    change: "Trust the qualification council's weakest filter and say no earlier. A B grade with a 40 on one filter is a deal to decline, not to discount.",
    because: "These were not lost, they were never winnable. The council flagged the weak filter and the deal went ahead anyway.",
    measure: "Whether deals below the grade threshold are declined earlier, and what that frees up.",
  },
  silence: {
    change: "Agree the next specific step and its date before ending every call, and put it in the OS so it goes overdue loudly rather than quietly.",
    because: "Nobody ghosts a commitment they made out loud with a date on it. The overdue next action already ranks top of the worklist when it exists.",
    measure: "The share of active deals carrying a next action with a date, and how many go quiet anyway.",
  },
  // No honest lever. Saying nothing is the correct output rather than inventing a move.
  other: null,
};

export interface LessonInput {
  pattern: LossPattern;
  /** Lesson keys already proposed, whatever a founder decided about them. Never propose twice. */
  alreadyProposed: string[];
}

/**
 * The one lesson worth proposing right now, or nothing.
 *
 * ONE at a time, on purpose. A list of five changes to how a team sells is a list nobody actions, and
 * proposing several at once makes it impossible to tell afterwards which one moved anything.
 */
export function nextSalesLesson(input: LessonInput): SalesLesson | null {
  const { pattern, alreadyProposed } = input;
  // Below the evidence floor the pattern is an anecdote, and a change of approach argued from an
  // anecdote is worse than no change.
  if (pattern.thin) return null;

  const seen = new Set(alreadyProposed);
  for (const theme of pattern.themes) {
    const lever = LEVERS[theme.theme];
    if (!lever) continue;
    const key = `loss_lesson.${theme.theme}.${theme.count}`;
    // Keyed on the count too, so a theme that claims MORE deals is worth raising again once the
    // evidence has genuinely grown, and never merely because a day has passed.
    if (seen.has(key)) continue;
    if ([...seen].some((k) => k.startsWith(`loss_lesson.${theme.theme}.`) && Number(k.split(".")[2] ?? 0) >= theme.count)) continue;

    return {
      key,
      theme: theme.theme,
      change: lever.change,
      because: `${theme.count} of your last ${pattern.themes.reduce((n, t) => n + t.count, 0)} losses came down to this. ${lever.because}`,
      evidence: theme.examples.map((e) => ({ clientName: e.companyName, reason: e.reason })),
      losses: theme.count,
      measure: lever.measure,
    };
  }
  return null;
}
