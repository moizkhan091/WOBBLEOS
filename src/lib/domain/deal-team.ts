import { z } from "zod";
import { HOUSE_STYLE_PROMPT } from "@/lib/domain/house-style";

/**
 * The deal team: the four teammates that sit between "we had a good call" and "they signed".
 *
 * Each one was declared in the agent registry months before it could run, and each stayed `paused`
 * because the registry-integrity guard refuses to let an agent claim `active` with nothing behind it.
 * This file is the pure half of what they actually do: the prompt, the shape of the answer, and the
 * rules that keep the answer honest. The service half loads the client's real context and runs them.
 *
 * All four are ADVISORY. None of them sends anything, changes a price, or moves a deal. A founder acts.
 */

export const DEAL_TEAM_MODULE = "deal_team";

export const OBJECTION_HANDLER_AGENT = "objection_handler";
export const FOLLOW_UP_WRITER_AGENT = "follow_up_writer";
export const DEAL_REVIEWER_AGENT = "deal_reviewer";
export const PRICING_ANALYST_AGENT = "pricing_analyst";

// -------------------------------------------------------------------------- objection handler

export const objectionSchema = z.object({
  /** The objection in the CLIENT's voice, not ours. */
  objection: z.string().trim().min(10).max(600),
  /** Where it comes from: which finding, price, or thing they said. */
  rootedIn: z.string().trim().min(5).max(300),
  /** How likely this one is, given what we know. */
  likelihood: normaliseLabel(["high", "medium", "low"] as const, { certain: "high", very_high: "high", likely: "high", moderate: "medium", possible: "medium", unlikely: "low", rare: "low" }, "medium"),
  /** The answer, in language they used, not ours. */
  answer: z.string().trim().min(20).max(1400),
  /** The one fact or number from their own context that settles it. */
  proof: z.string().trim().max(400).optional(),
});
export type Objection = z.infer<typeof objectionSchema>;

export const objectionBriefSchema = z.object({ objections: z.array(objectionSchema).min(1).max(8) });
export type ObjectionBrief = z.infer<typeof objectionBriefSchema>;

export function objectionSystemPrompt(): string {
  return [
    "You are WOBBLE's Objection Handler. WOBBLE builds AI operating systems for one business at a time.",
    "",
    "You are given ONE client: what they told us on the website form, what was approved from their calls,",
    "their qualification, and any proposal on the table. Write the objections THIS client will actually",
    "raise, and the answer to each.",
    "",
    "Rules that decide whether this is useful or noise:",
    "- Every objection must be traceable to something in the context. If they never mentioned budget, do",
    "  not invent a budget objection; if their team is four people, the objection is about capacity, not",
    "  about change management across departments.",
    "- Write the objection in THEIR register. A clinic manager says \"my front desk will never use it\",",
    "  not \"we anticipate adoption friction\".",
    "- The answer must use their own numbers where the context has them. An answer with no number in it",
    "  is an opinion, and they already have their own.",
    "- `proof` is a fact from the context, quoted or computed from what they said. Leave it out rather",
    "  than inventing one.",
    "- Rank by likelihood, most likely first. Six sharp ones beat eight padded ones.",
    "",
    'Return STRICT JSON only: {"objections":[{"objection","rootedIn","likelihood","answer","proof"}]}',
    "",
    HOUSE_STYLE_PROMPT,
  ].join("\n");
}

// -------------------------------------------------------------------------- follow-up writer

export const FOLLOW_UP_CHANNELS = ["whatsapp", "email", "linkedin"] as const;
export type FollowUpChannel = (typeof FOLLOW_UP_CHANNELS)[number];

export const followUpDraftSchema = z.object({
  channel: z.enum(FOLLOW_UP_CHANNELS),
  /** Empty for WhatsApp; a real subject line for email. */
  subject: z.string().trim().max(140).default(""),
  body: z.string().trim().min(30).max(2000),
  /** What this message is trying to get them to do. One thing. */
  asksFor: z.string().trim().min(5).max(200),
  /** Why this message, now: the fact from their context it leans on. */
  groundedIn: z.string().trim().min(5).max(400),
});
export type FollowUpDraft = z.infer<typeof followUpDraftSchema>;

export function followUpSystemPrompt(channel: FollowUpChannel, tone: string): string {
  const channelRules: Record<FollowUpChannel, string> = {
    whatsapp: "WhatsApp: under 90 words, no subject, no greeting block, no signature. Written the way one person texts another they have already spoken to.",
    email: "Email: a subject line that says the thing, under 160 words, one paragraph of substance, one ask. No 'I hope this email finds you well'.",
    linkedin: "LinkedIn DM: under 70 words, no subject, no pitch deck energy. One specific reference to their business, one ask.",
  };
  return [
    "You are WOBBLE's Follow-up Writer. You draft the next message to a client. You never send anything.",
    "",
    channelRules[channel],
    `Tone: ${tone}.`,
    "",
    "THE ONE RULE THAT MATTERS MOST:",
    "You have NO case studies. The context below contains this client's own words and nothing else. There",
    "is no list of past WOBBLE clients, no percentage any previous build achieved, and no named reference",
    "you may cite. If you write a sentence like \"we built this for a dental group in Karachi and cut",
    "no-shows by 64%\", you have invented a client, invented a number, and put a lie in a founder's",
    "outbox. A message grounded only in what THIS client told you is stronger anyway, because they",
    "cannot argue with their own numbers.",
    "",
    "Concretely, you may NOT write:",
    "- any past result, percentage, timeframe or outcome attributed to WOBBLE or to another client",
    "- any other client, named or described (\"a dental group in Lahore\" is still a claim)",
    "- any price, unless it appears in the context",
    "- any date or availability, unless it appears in the context",
    "",
    "Rules:",
    "- Reference something specific from THEIR context in the first sentence. If you cannot, the message",
    "  is generic and should not be sent, so say so in `groundedIn`.",
    "- Their own arithmetic is your strongest material. 70 slots a week is 3,640 a year, and that is a",
    "  fact they gave you, not a claim you made.",
    "- One ask. A message with two asks gets neither.",
    "- Do not write a subject line for WhatsApp or LinkedIn. Leave it empty.",
    "",
    'Return STRICT JSON only: {"channel","subject","body","asksFor","groundedIn"}',
    "",
    HOUSE_STYLE_PROMPT,
  ].join("\n");
}

// -------------------------------------------------------------------------- deal reviewer

/**
 * Normalising a label instead of rejecting the answer that carried it.
 *
 * The reviewer's first real run produced ten genuinely good findings and failed validation on letter
 * case and on synonyms ("critical" for a blocker), forcing a second paid call every single time. A
 * reviewer's findings must not be thrown away over the spelling of one field, so an unrecognised label
 * lands on the safe middle value rather than failing the parse. Losing a shade of precision on one
 * field beats losing the whole review.
 */
function normaliseLabel<T extends string>(allowed: readonly T[], synonyms: Record<string, T>, fallback: T) {
  return z.preprocess((v) => {
    // A MISSING field is a failed answer, not a misspelled one: pass it through so the enum rejects it
    // and the repair round asks for it. Only a string that is present but unrecognised falls back.
    if (typeof v !== "string") return v;
    const key = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if ((allowed as readonly string[]).includes(key)) return key;
    return synonyms[key] ?? fallback;
  }, z.enum(allowed as unknown as [T, ...T[]]));
}

const SEVERITIES = ["blocker", "serious", "minor"] as const;
const VERDICTS = ["would_sign", "would_hesitate", "would_refuse"] as const;

export const dealCritiqueItemSchema = z.object({
  /** What is wrong, stated as the client would state it. */
  // 900, not 400. A finding that does the arithmetic ("778x her signing authority, and the system they
  // abandoned cost PKR 400,000") is long, and it is the good kind of long.
  issue: z.string().trim().min(10).max(900),
  severity: normaliseLabel(SEVERITIES, { critical: "blocker", high: "blocker", severe: "blocker", major: "serious", medium: "serious", moderate: "serious", low: "minor", nit: "minor" }, "serious"),
  /** Which part of the proposal it lands on. */
  where: z.string().trim().min(3).max(300),
  /** What to change. Concrete enough to act on without a follow-up question. */
  fix: z.string().trim().min(10).max(1200),
});
export type DealCritiqueItem = z.infer<typeof dealCritiqueItemSchema>;

export const dealCritiqueSchema = z.object({
  /** Would this client sign this, as written? */
  verdict: normaliseLabel(VERDICTS, { refuse: "would_refuse", reject: "would_refuse", no: "would_refuse", hesitate: "would_hesitate", would_question: "would_hesitate", maybe: "would_hesitate", sign: "would_sign", accept: "would_sign", yes: "would_sign" }, "would_hesitate"),
  /** The single biggest reason for the verdict. */
  headline: z.string().trim().min(10).max(600),
  items: z.array(dealCritiqueItemSchema).max(12).default([]),
});
export type DealCritique = z.infer<typeof dealCritiqueSchema>;

export function dealReviewSystemPrompt(): string {
  return [
    "You are WOBBLE's Deal Reviewer. You argue the CLIENT's side of a proposal before it is sent.",
    "",
    "You are adversarial by design. You are not here to say it is strong. Assume the client is sceptical,",
    "busy, and has been sold to before. Read the proposal against what we actually know about them.",
    "",
    "Look for, in this order:",
    "1. Anything priced without a stated reason the client can check.",
    "2. Anything promised that the audit findings do not support.",
    "3. Anything scoped so vaguely that delivery could mean two different things.",
    "4. Anything that ignores a constraint the client told us about (team size, tools, timing, budget).",
    "5. Anything that would make THIS client, specifically, say no.",
    "",
    "A verdict of would_sign is allowed only when you genuinely cannot find a blocker or a serious issue.",
    "Never congratulate. Never soften. `fix` must be a change, not advice to 'consider' something.",
    "",
    'Return STRICT JSON only: {"verdict","headline","items":[{"issue","severity","where","fix"}]}',
    "",
    HOUSE_STYLE_PROMPT,
  ].join("\n");
}

// -------------------------------------------------------------------------- pricing analyst

export const pricingOpinionSchema = z.object({
  /** How this quote sits against what WOBBLE has quoted before. */
  verdict: normaliseLabel(["consistent", "low", "high", "not_enough_history"] as const, { underpriced: "low", too_low: "low", overpriced: "high", too_high: "high", unknown: "not_enough_history", insufficient_history: "not_enough_history", no_history: "not_enough_history" }, "not_enough_history"),
  /** The comparison in one sentence, with the numbers. */
  headline: z.string().trim().min(10).max(600),
  /** What the client's own economics say they can carry. */
  affordability: z.string().trim().max(1200).default(""),
  /** Specific, numbered suggestions. Advisory only. */
  notes: z.array(z.string().trim().min(5).max(600)).max(8).default([]),
});
export type PricingOpinion = z.infer<typeof pricingOpinionSchema>;

export function pricingSystemPrompt(): string {
  return [
    "You are WOBBLE's Pricing Analyst. You sanity-check a quote. You never set a price: a founder does.",
    "",
    "You are given the quote, WOBBLE's own history of what it has quoted other clients for comparable",
    "work, and what this client said about their economics on the form and on calls.",
    "",
    "Rules:",
    "- Compare like with like. A three-month build is not comparable to a one-workflow pilot; say so",
    "  rather than averaging them.",
    "- If there are fewer than two comparable past quotes, the verdict is not_enough_history. Say that",
    "  plainly instead of inventing a benchmark.",
    "- Affordability is arithmetic on THEIR numbers: what they said they lose, earn, or spend today.",
    "  Show the arithmetic. If they gave no numbers, say the quote cannot be checked against their economics.",
    "- Every note contains a number.",
    "",
    'Return STRICT JSON only: {"verdict","headline","affordability","notes":[]}',
    "",
    HOUSE_STYLE_PROMPT,
  ].join("\n");
}

// -------------------------------------------------------------------------- shared

/** Money as a founder writes it, for prompts. */
export function centsToMoney(cents: number, currency = "USD"): string {
  return `${currency} ${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/**
 * The context block every deal-team agent reads. One shape, so a founder can see exactly what the
 * agent knew, and so two agents can never disagree about the same client.
 */
export interface DealTeamContext {
  companyName: string;
  industry: string | null;
  intake: string;
  approvedFindings: string[];
  qualification: string | null;
  services: string[];
  proposal: {
    title: string;
    /** What the client is being charged. NULL when no founder has decided yet, which is not the same as zero. */
    totalCents: number | null;
    currency: string;
    scope: string | null;
    services: Array<{ name: string; priceCents?: number }>;
    terms: string | null;
    /** What the build costs WOBBLE. The analyst was judging prices with no cost basis at all. */
    costOneOffCents?: number | null;
    costMonthlyCents?: number | null;
    /**
     * The currency the COST is in, which is not always the currency of the quote.
     *
     * Delivery cost is computed from tool list prices in USD; the quote may be in rupees. Printing the
     * cost with the quote's symbol is the same units mistake that sent a client a bill 280 times too
     * large, so the two are labelled separately and never silently share a symbol.
     */
    costCurrency?: string | null;
    /** What one person at the client can approve alone, when we know it. */
    soloAuthorityCents?: number | null;
  } | null;
  /**
   * What WOBBLE has charged before, and WHY.
   *
   * The reasoning is the part that makes this a benchmark rather than a list of numbers: "three times
   * what they abandoned" tells the analyst how the price was reached, so it can say whether the same
   * logic holds for this client. A price with no reasoning is a data point nobody can argue with.
   */
  pastQuotes: Array<{ title: string; totalCents: number; currency: string; status: string; industry: string | null; reasoning?: string; costCents?: number }>;
  lastMessages: string[];
}

export function renderContext(ctx: DealTeamContext): string {
  const lines: string[] = [`CLIENT: ${ctx.companyName}${ctx.industry ? ` (${ctx.industry})` : ""}`];
  if (ctx.intake.trim()) lines.push("", "WHAT THEY TOLD US ON THE WEBSITE FORM:", ctx.intake.trim());
  if (ctx.approvedFindings.length) lines.push("", "APPROVED FINDINGS FROM THEIR CALLS:", ...ctx.approvedFindings.map((f) => `- ${f}`));
  if (ctx.qualification) lines.push("", `QUALIFICATION: ${ctx.qualification}`);
  if (ctx.services.length) lines.push("", "WOBBLE SERVICES IN PLAY:", ...ctx.services.map((s) => `- ${s}`));
  if (ctx.proposal) {
    // "Not priced yet" and "priced at zero" mean completely different things, and telling an agent the
    // second when the first is true makes every judgement it offers worthless.
    const priceLine = ctx.proposal.totalCents === null || ctx.proposal.totalCents <= 0
      ? "NO PRICE SET YET. A founder has not decided what to charge, so do not comment on the number, comment on the shape, the scope and whether the cost basis supports a sensible one."
      : centsToMoney(ctx.proposal.totalCents, ctx.proposal.currency);
    lines.push("", `PROPOSAL ON THE TABLE: ${ctx.proposal.title} — ${priceLine}`);
    if (ctx.proposal.costOneOffCents !== null && ctx.proposal.costOneOffCents !== undefined) {
      // The cost carries its OWN currency. It is usually USD (tool list prices) while the quote may be
      // in rupees, and printing one with the other's symbol is how a 280x error happens.
      const cc = ctx.proposal.costCurrency ?? "USD";
      const run = ctx.proposal.costMonthlyCents ? `, and ${centsToMoney(ctx.proposal.costMonthlyCents, cc)} a month to run` : "";
      const note = cc !== ctx.proposal.currency ? ` Note the cost is in ${cc} and the quote is in ${ctx.proposal.currency}, so convert before comparing them.` : "";
      lines.push(`WHAT IT COSTS WOBBLE TO DELIVER: ${centsToMoney(ctx.proposal.costOneOffCents, cc)} to build${run}. This is OUR cost, not a price, and it excludes our own time.${note}`);
    }
    if (ctx.proposal.soloAuthorityCents) {
      lines.push(`WHAT THE CONTACT CAN APPROVE ALONE: ${centsToMoney(ctx.proposal.soloAuthorityCents, ctx.proposal.currency)}. Anything above needs a joint decision nobody from WOBBLE will be in the room for.`);
    }
    if (ctx.proposal.scope) lines.push(`Scope: ${ctx.proposal.scope}`);
    if (ctx.proposal.services.length) lines.push("Line items:", ...ctx.proposal.services.map((s) => `- ${s.name}${s.priceCents ? ` — ${centsToMoney(s.priceCents, ctx.proposal!.currency)}` : ""}`));
    if (ctx.proposal.terms) lines.push(`Terms: ${ctx.proposal.terms}`);
  }
  if (ctx.pastQuotes.length) {
    lines.push("", "WHAT WOBBLE HAS CHARGED BEFORE, AND WHY:");
    for (const q of ctx.pastQuotes) {
      lines.push(`- ${q.title}${q.industry ? ` (${q.industry})` : ""}: ${centsToMoney(q.totalCents, q.currency)} [${q.status}]`);
      if (q.reasoning) lines.push(`  the founder's reason: ${q.reasoning}`);
      if (q.costCents) lines.push(`  it cost us ${centsToMoney(q.costCents, q.currency)} to build, so the margin was ${Math.round(((q.totalCents - q.costCents) / q.totalCents) * 100)}%`);
    }
  }
  if (ctx.lastMessages.length) lines.push("", "RECENT CONTACT:", ...ctx.lastMessages.map((m) => `- ${m}`));
  return lines.join("\n");
}

/** True when there is genuinely nothing to reason from, so the caller can refuse rather than hallucinate. */
export function contextIsEmpty(ctx: DealTeamContext): boolean {
  return !ctx.intake.trim() && !ctx.approvedFindings.length && !ctx.proposal && !ctx.qualification;
}


// -------------------------------------------------------------------------- unverifiable claims

/**
 * Claims a draft is not entitled to make.
 *
 * The prompt forbids inventing a case study, and on a live client it invented one anyway ("a dental
 * group in Karachi that cut no-shows by 64% in the first six weeks"). A founder skimming a draft before
 * pasting it into WhatsApp will not catch that, so this catches the shapes such a claim takes and the
 * UI shows them next to the draft. Any number in the draft that does not appear in the context is
 * suspect by definition, because the context is the only thing the writer was given.
 */
export function unverifiableClaims(body: string, context: string): string[] {
  const found: string[] = [];
  const haystack = context.toLowerCase();

  // A percentage that is nowhere in what we know about this client. The context is the only thing the
  // writer was given, so a number that is not in it did not come from anywhere.
  for (const m of body.matchAll(/(\d{1,3}(?:\.\d+)?)\s?%/g)) {
    if (!haystack.includes(`${m[1]}%`) && !haystack.includes(`${m[1]} percent`)) {
      found.push(`"${m[0]}" appears in the message but nowhere in what this client told us.`);
    }
  }

  // A claim that WOBBLE has done this before. There are no case studies in the context, ever.
  if (/\b(we|wobble)\s+(?:have\s+|has\s+|had\s+|already\s+)?(built|ran|run|delivered|shipped|helped|implemented|rolled out|set up|did)\b/i.test(body)) {
    found.push("The message claims WOBBLE has done this before. There are no case studies in the context, so whatever it describes was invented.");
  }

  // Another business, named or merely described. "A dental group in Karachi" is still a claim.
  const thirdParty = [
    /\b(another|other)\s+(client|clinic|business|company|group|practice|customer)/i,
    /\b(a|one)\s+(similar|comparable)\s+\w+/i,
    /\bone of our\b/i,
    /\bfor (a|an|another)\s+\w+(\s+\w+)?\s+(group|clinic|practice|chain|business|company|brand)\b/i,
    /\bother (clients|businesses|clinics|companies)\b/i,
  ];
  if (thirdParty.some((r) => r.test(body))) {
    found.push("The message refers to another client. Nothing in the context names one.");
  }

  return [...new Set(found)];
}
