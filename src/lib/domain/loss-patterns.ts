/**
 * Why we lose, said across deals instead of one at a time.
 *
 * A founder types a reason every time a deal dies. It is stored on the row, shown on that one client,
 * and read by the reactivation check. Nothing has ever said "you have lost four of the last seven, and
 * three of them said the same thing". That pattern only exists in somebody's head, and heads are where
 * expensive lessons go to be forgotten.
 *
 * This is deliberately NOT a model. Clustering free text with an LLM would produce a confident theme
 * from three sentences and cost money to be wrong. What a founder actually needs is much simpler: the
 * reasons grouped by the thing they are about, with the real sentences underneath, so they can read
 * them and draw their own conclusion. The grouping is a lens, the quotes are the evidence.
 *
 * Every theme here earned its place by appearing in a real lost deal or a real objection brief.
 */

export interface LostDeal {
  opportunityId: string;
  companyId: string | null;
  companyName: string;
  /** The founder's own words. Never paraphrased anywhere in this file. */
  reason: string;
  valueCents: number;
  currency: string;
  lostAt: Date | null;
  industry: string | null;
}

export type LossTheme = "price" | "timing" | "trust" | "authority" | "fit" | "competitor" | "silence" | "other";

export const THEME_LABELS: Record<LossTheme, string> = {
  price: "Too expensive",
  timing: "Wrong time",
  trust: "Did not believe it would work",
  authority: "The person we spoke to could not decide",
  fit: "We were not right for them",
  competitor: "Went elsewhere",
  silence: "They stopped replying",
  other: "Something else",
};

/**
 * What each theme means, so a founder reading the grouping knows what was matched and can disagree
 * with it. A grouping nobody can audit is a grouping nobody should trust.
 */
const THEME_PATTERNS: Array<{ theme: LossTheme; re: RegExp }> = [
  { theme: "price", re: /(too (?:expensive|much|pricey|costly)|price|pricing|cost|budget|afford|cheaper|expensive|money)/i },
  { theme: "timing", re: /(timing|not (?:now|yet|the right time)|later|next (?:year|quarter|month)|postpone|on hold|revisit|busy season|ramadan|holiday)/i },
  { theme: "authority", re: /(partner|husband|wife|co-?owner|board|boss|could not (?:sign|approve|decide)|needed (?:approval|sign-?off)|decision maker|not the decider)/i },
  { theme: "trust", re: /(did not (?:believe|trust)|sceptic|skeptic|not convinced|proof|burned|burnt|last (?:vendor|agency)|before and it (?:failed|did not work)|risk|unsure it would work)/i },
  { theme: "competitor", re: /(went with|chose|competitor|another (?:agency|vendor|company|provider)|someone else|in-?house)/i },
  { theme: "fit", re: /(not (?:a )?(?:good )?fit|too (?:small|early|big)|wrong (?:fit|kind)|not our|different needs|not what they needed)/i },
  { theme: "silence", re: /(ghost|stopped replying|no (?:reply|response)|went (?:quiet|dark)|never (?:heard|answered)|unreachable)/i },
];

/**
 * Which theme a reason is about.
 *
 * First match wins, and the order above is deliberate: "too expensive but also bad timing" is a price
 * loss with a polite ending, and treating it as timing is how a company convinces itself its pricing
 * is fine.
 */
export function themeOf(reason: string): LossTheme {
  const text = (reason ?? "").trim();
  if (!text) return "other";
  for (const { theme, re } of THEME_PATTERNS) {
    if (re.test(text)) return theme;
  }
  return "other";
}

export interface ThemeGroup {
  theme: LossTheme;
  label: string;
  count: number;
  /** What walked out of the door under this heading. */
  valueCents: number;
  currency: string;
  /** The founder's actual sentences, so the grouping can be checked rather than believed. */
  examples: Array<{ companyName: string; reason: string; valueCents: number; currency: string }>;
}

export interface LossPattern {
  totalLost: number;
  totalWon: number;
  /** Of the deals that actually closed either way. Null below the point where a rate means anything. */
  winRate: number | null;
  themes: ThemeGroup[];
  /** The one sentence worth putting in a brief. Empty when there is not enough to say. */
  headline: string;
  /** True when there is too little history for any of this to mean something. */
  thin: boolean;
}

/** Below this, a pattern is an anecdote wearing a percentage sign. */
export const MIN_LOSSES_FOR_PATTERN = 3;

function money(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/**
 * Group the losses and say the one thing worth saying.
 *
 * Deals whose currencies differ are counted separately in the money, never summed: adding rupees to
 * dollars to make a bigger number is the same units mistake that nearly sent a client a bill 280 times
 * too large.
 */
export function lossPattern(lost: LostDeal[], wonCount: number): LossPattern {
  const withReason = lost.filter((d) => d.reason && d.reason.trim().length > 2);
  const byTheme = new Map<LossTheme, LostDeal[]>();
  for (const d of withReason) {
    const t = themeOf(d.reason);
    byTheme.set(t, [...(byTheme.get(t) ?? []), d]);
  }

  const themes: ThemeGroup[] = [...byTheme.entries()]
    .map(([theme, deals]) => {
      // One currency per group, the one most of these deals were in. Mixed currencies are never added.
      const counts = new Map<string, number>();
      for (const d of deals) counts.set(d.currency, (counts.get(d.currency) ?? 0) + 1);
      const currency = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
      return {
        theme,
        label: THEME_LABELS[theme],
        count: deals.length,
        valueCents: deals.filter((d) => d.currency === currency).reduce((n, d) => n + Math.max(0, d.valueCents), 0),
        currency,
        examples: deals.slice(0, 4).map((d) => ({ companyName: d.companyName, reason: d.reason.trim(), valueCents: d.valueCents, currency: d.currency })),
      };
    })
    .sort((a, b) => b.count - a.count || b.valueCents - a.valueCents);

  const decided = lost.length + wonCount;
  const winRate = decided >= MIN_LOSSES_FOR_PATTERN ? wonCount / decided : null;
  const thin = withReason.length < MIN_LOSSES_FOR_PATTERN;

  let headline = "";
  if (thin) {
    headline = withReason.length === 0
      ? "No lost deal has a reason written on it yet, so there is nothing to learn from here."
      : `Only ${withReason.length} lost deal${withReason.length === 1 ? " has" : "s have"} a reason recorded. Too few to call it a pattern.`;
  } else {
    const top = themes[0];
    const share = Math.round((top.count / withReason.length) * 100);
    headline = `${top.count} of your last ${withReason.length} losses were "${top.label.toLowerCase()}", ${share} percent${top.valueCents > 0 ? `, worth ${money(top.valueCents, top.currency)}` : ""}.`;
  }

  return { totalLost: lost.length, totalWon: wonCount, winRate, themes, headline, thin };
}
