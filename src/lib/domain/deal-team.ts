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
  objection: z.string().trim().min(10).max(400),
  /** Where it comes from: which finding, price, or thing they said. */
  rootedIn: z.string().trim().min(5).max(300),
  /** How likely this one is, given what we know. */
  likelihood: z.enum(["high", "medium", "low"]),
  /** The answer, in language they used, not ours. */
  answer: z.string().trim().min(20).max(900),
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

export const dealCritiqueItemSchema = z.object({
  /** What is wrong, stated as the client would state it. */
  issue: z.string().trim().min(10).max(400),
  severity: z.enum(["blocker", "serious", "minor"]),
  /** Which part of the proposal it lands on. */
  where: z.string().trim().min(3).max(200),
  /** What to change. Concrete enough to act on without a follow-up question. */
  fix: z.string().trim().min(10).max(600),
});
export type DealCritiqueItem = z.infer<typeof dealCritiqueItemSchema>;

export const dealCritiqueSchema = z.object({
  /** Would this client sign this, as written? */
  verdict: z.enum(["would_sign", "would_hesitate", "would_refuse"]),
  /** The single biggest reason for the verdict. */
  headline: z.string().trim().min(10).max(400),
  items: z.array(dealCritiqueItemSchema).max(10).default([]),
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
  verdict: z.enum(["consistent", "low", "high", "not_enough_history"]),
  /** The comparison in one sentence, with the numbers. */
  headline: z.string().trim().min(10).max(400),
  /** What the client's own economics say they can carry. */
  affordability: z.string().trim().max(600).default(""),
  /** Specific, numbered suggestions. Advisory only. */
  notes: z.array(z.string().trim().min(5).max(400)).max(6).default([]),
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
  proposal: { title: string; totalCents: number; currency: string; scope: string | null; services: Array<{ name: string; priceCents?: number }>; terms: string | null } | null;
  pastQuotes: Array<{ title: string; totalCents: number; currency: string; status: string; industry: string | null }>;
  lastMessages: string[];
}

export function renderContext(ctx: DealTeamContext): string {
  const lines: string[] = [`CLIENT: ${ctx.companyName}${ctx.industry ? ` (${ctx.industry})` : ""}`];
  if (ctx.intake.trim()) lines.push("", "WHAT THEY TOLD US ON THE WEBSITE FORM:", ctx.intake.trim());
  if (ctx.approvedFindings.length) lines.push("", "APPROVED FINDINGS FROM THEIR CALLS:", ...ctx.approvedFindings.map((f) => `- ${f}`));
  if (ctx.qualification) lines.push("", `QUALIFICATION: ${ctx.qualification}`);
  if (ctx.services.length) lines.push("", "WOBBLE SERVICES IN PLAY:", ...ctx.services.map((s) => `- ${s}`));
  if (ctx.proposal) {
    lines.push("", `PROPOSAL ON THE TABLE: ${ctx.proposal.title} — ${centsToMoney(ctx.proposal.totalCents, ctx.proposal.currency)}`);
    if (ctx.proposal.scope) lines.push(`Scope: ${ctx.proposal.scope}`);
    if (ctx.proposal.services.length) lines.push("Line items:", ...ctx.proposal.services.map((s) => `- ${s.name}${s.priceCents ? ` — ${centsToMoney(s.priceCents, ctx.proposal!.currency)}` : ""}`));
    if (ctx.proposal.terms) lines.push(`Terms: ${ctx.proposal.terms}`);
  }
  if (ctx.pastQuotes.length) {
    lines.push("", "WHAT WOBBLE HAS QUOTED OTHER CLIENTS:");
    for (const q of ctx.pastQuotes) lines.push(`- ${q.title}${q.industry ? ` (${q.industry})` : ""}: ${centsToMoney(q.totalCents, q.currency)} [${q.status}]`);
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
