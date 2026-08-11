import { z } from "zod";
import type { IntakeSnapshot } from "@/lib/domain/intake";
import { HOUSE_STYLE_PROMPT } from "@/lib/domain/house-style";

/**
 * Pre-call question engine (pure, DB-free and provider-free).
 *
 * WHY THIS IS NOT A QUESTION BANK. The website form alone yields more than a hundred thousand
 * structured answer combinations ("where should we look first" is 231 on its own) before the two
 * free-text fields, which are unbounded. No fixed list survives that, and a recycled question is
 * instantly recognisable to a founder on a call. So every question is written fresh for one client,
 * once, from what they actually told us.
 *
 * What DOES persist is the COVERAGE SPINE below: the things WOBBLE must learn on a first call to be
 * able to scope and price an audit. The spine never supplies wording — it is a checklist the generator
 * must satisfy and the validator enforces, so the model can be creative about HOW it asks while never
 * forgetting WHAT we need.
 */

export const CALL_QUESTIONS_MODULE = "call_questions";

/** The things we must leave a readiness call knowing. Wording is never taken from here. */
export const COVERAGE_AREAS = [
  "how_they_get_customers",
  "the_bottleneck_in_numbers",
  "current_stack_and_data",
  "who_decides_and_how",
  "what_a_fix_is_worth",
  "constraints_and_past_attempts",
] as const;
export type CoverageArea = (typeof COVERAGE_AREAS)[number];

export const COVERAGE_INTENT: Record<CoverageArea, string> = {
  how_they_get_customers: "Where demand actually comes from today and what happens to it end to end.",
  the_bottleneck_in_numbers: "Turn the pain they described into countable reality, volumes, times, rates, frequency.",
  current_stack_and_data: "What they run on, where the data lives, and what is reachable for an audit.",
  who_decides_and_how: "Who signs, who blocks, and what their decision process looks like.",
  what_a_fix_is_worth: "The money on the table, deal value, cost of the failure, budget reality.",
  constraints_and_past_attempts: "What has already been tried, why it failed, and what would rule us out.",
};

export const QUESTION_TIERS = ["opener", "core", "probe"] as const;
export type QuestionTier = (typeof QUESTION_TIERS)[number];

/** The structured output the generator must return. Validated, never trusted raw. */
export const callQuestionSchema = z.object({
  question: z.string().trim().min(12).max(320),
  /** Why this is worth asking THIS client — shown to the founder, never read aloud. */
  why: z.string().trim().min(8).max(320),
  coverage: z.enum(COVERAGE_AREAS),
  tier: z.enum(QUESTION_TIERS),
  /** The specific thing they said that prompted it. Keeps the model anchored to their words. */
  basedOn: z.string().trim().max(320).optional(),
});
export type CallQuestion = z.infer<typeof callQuestionSchema>;

export const callQuestionSetSchema = z.object({
  /** One line the founder can open the call with. */
  opening: z.string().trim().min(12).max(400),
  questions: z.array(callQuestionSchema).min(6).max(18),
  /** What we already know and must NOT waste call time re-asking. */
  doNotAsk: z.array(z.string().trim().min(4).max(240)).max(12).default([]),
});
export type CallQuestionSet = z.infer<typeof callQuestionSetSchema>;

/** Which required areas a generated set failed to cover. */
export function missingCoverage(set: { questions: CallQuestion[] }): CoverageArea[] {
  const seen = new Set(set.questions.map((q) => q.coverage));
  return COVERAGE_AREAS.filter((a) => !seen.has(a));
}

/**
 * Things the form already answered. Asking these on the call is the fastest way to look like you did
 * not read their submission, so they are handed to the generator as an explicit ban list.
 */
export function alreadyKnown(snap: IntakeSnapshot | undefined): string[] {
  if (!snap) return [];
  const known: Array<string | null> = [
    snap.businessDescription ? `What the business does, they said: "${snap.businessDescription}"` : null,
    snap.focusAreas.length ? `Which area to look at first, they chose: ${snap.focusAreas.join(", ")}` : null,
    snap.painPoints ? `Their headline pain, they wrote: "${snap.painPoints}"` : null,
    snap.currentTools ? `Which tools they use, they listed: ${snap.currentTools}` : null,
    snap.aiWorkflowStage ? `How far along they are with AI, they said: ${snap.aiWorkflowStage}` : null,
    snap.urgency ? `How soon they want to move, they said: ${snap.urgency}` : null,
    snap.openToPaidAudit ? `Whether they are open to a paid audit, they said: ${snap.openToPaidAudit}` : null,
    snap.teamSize ? `Team size, ${snap.teamSize}` : null,
    snap.cityMarket ? `Which market they operate in, ${snap.cityMarket}` : null,
  ];
  return known.filter(Boolean) as string[];
}

export interface QuestionPromptInput {
  companyName: string;
  industry?: string | null;
  snapshot?: IntakeSnapshot;
  /** WOBBLE's live service menu — questions must open doors we can actually walk through. */
  services: string[];
  /** Anything already learned from earlier calls, so we build on it instead of repeating it. */
  approvedFacts?: string[];
  /** Company/competitor intel the OS holds for this market. */
  marketNotes?: string[];
}

/** The system prompt — what a good WOBBLE first call sounds like. */
/**
 * Which call this is.
 *
 * A second call is a different job from a first one. On the first, the job is to find out whether there
 * is a countable problem. On the second, the problem is already known and the job is to close the gaps
 * that stop us pricing the work, so a generated set that opens with "tell me about your business" wastes
 * the one thing the founder earned on call one.
 */
export type CallRound = "first" | "follow_up";

export function questionSystemPrompt(round: CallRound = "first"): string {
  const followUp = round === "follow_up";
  return [
    followUp
      ? "You prepare a FOLLOW-UP call for WOBBLE, an AI-OS consultancy. There has already been at least one call and its findings are below."
      : "You prepare the FIRST AI-readiness call for WOBBLE, an AI-OS consultancy.",
    "",
    followUp
      ? "WOBBLE already knows roughly what is wrong. The job on THIS call is to close the gaps that still stop us scoping and pricing the work, and to test whether anything has changed since."
      : "WOBBLE's job on this call is to find out whether there is a real, countable problem worth a paid audit, not to pitch.",
    "",
    ...(followUp
      ? [
          "Follow-up rules, on top of the general ones:",
          "- Every approved finding below is already known. Do not re-ask it: ask what it did NOT tell us.",
          "- Where a finding has a number, ask what that number is made of or what would change it. Where it has none, get one.",
          "- Ask what has moved since the last call. A quiet fortnight usually means something changed internally.",
          "- Ask at least one question that would surface an objection early, while it is still cheap to answer.",
          "- Ask who else has to agree, and what they would need to see.",
          "",
        ]
      : []),
    "Rules:",
    "- Write questions for THIS business only. Anything you could ask a random company is worthless here.",
    "- Never re-ask what the form already answered (see DO NOT ASK). Build on those answers instead.",
    "- Chase NUMBERS. 'Leads are slow' is not usable; 'how many enquiries a week and how long until someone replies' is.",
    "- Prefer how-it-actually-works-today over hypotheticals. Ask what happened with the last one, not what usually happens.",
    "- One question per question. No stacked or leading questions, no jargon a clinic owner would not use.",
    "- If they said a previous tool failed, find out WHY, that is the single biggest predictor of whether we can help.",
    `- Cover every one of these areas at least once: ${COVERAGE_AREAS.join(", ")}.`,
    "- Tier them: 'opener' to get them talking, 'core' for what we must leave knowing, 'probe' for the follow-up that gets the number.",
    "",
    HOUSE_STYLE_PROMPT,
    "",
    "Return STRICT JSON only, matching:",
    '{"opening":"…","questions":[{"question":"…","why":"…","coverage":"<area>","tier":"opener|core|probe","basedOn":"…"}],"doNotAsk":["…"]}',
  ].join("\n");
}

/** The user prompt — everything we know about this specific client. */
export function questionUserPrompt(input: QuestionPromptInput & { round?: CallRound }): string {
  const s = input.snapshot;
  const known = alreadyKnown(s);
  const block = (title: string, lines: Array<string | null | undefined>) => {
    const kept = lines.filter(Boolean) as string[];
    return kept.length ? `${title}\n${kept.map((l) => `- ${l}`).join("\n")}` : null;
  };

  return [
    `CLIENT: ${input.companyName}${input.industry ? ` (${input.industry})` : ""}`,
    block("WHAT THEY TOLD US ON THE FORM (their own words):", [
      s?.contactName ? `Filled in by: ${s.contactName}${s.role ? `, ${s.role}` : ""}` : null,
      s?.businessDescription ? `What they do: ${s.businessDescription}` : null,
      s?.teamSize ? `Team size: ${s.teamSize}` : null,
      s?.cityMarket ? `Market: ${s.cityMarket}` : null,
      s?.focusAreas.length ? `Where they asked us to look first: ${s.focusAreas.join(", ")}` : null,
      s?.painPoints ? `What is slow/manual/person-dependent: "${s.painPoints}"` : null,
      s?.currentTools ? `Tools they use now: ${s.currentTools}` : null,
      s?.aiWorkflowStage ? `Where they are with AI: ${s.aiWorkflowStage}` : null,
      s?.urgency ? `How soon: ${s.urgency}` : null,
      s?.openToPaidAudit ? `Open to a paid audit: ${s.openToPaidAudit}` : null,
      s?.canShareWorkflowContext ? `Can share workflow context: ${s.canShareWorkflowContext}` : null,
      s?.whatMakesCallUseful ? `What would make the call useful to them: "${s.whatMakesCallUseful}"` : null,
    ]),
    block("WHAT WOBBLE CAN ACTUALLY DELIVER (only open doors we can walk through):", input.services.slice(0, 25)),
    block("ALREADY LEARNED ON EARLIER CALLS (build on these, do not re-ask):", (input.approvedFacts ?? []).slice(0, 20)),
    block("MARKET / COMPETITOR CONTEXT WOBBLE HOLDS:", (input.marketNotes ?? []).slice(0, 10)),
    block("DO NOT ASK, the form already told us:", known),
    "",
    s?.painPoints
      ? `The most valuable thing you can do is turn their stated pain, "${s.painPoints}", into countable reality on this call.`
      : "They did not describe a specific pain, so the call must find one before anything else.",
    "",
    "Return STRICT JSON only.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** A repair instruction when the model missed required coverage. */
export function coverageRepairInstruction(missing: CoverageArea[]): string {
  return [
    `Your set does not cover: ${missing.join(", ")}.`,
    ...missing.map((m) => `- ${m}: ${COVERAGE_INTENT[m]}`),
    "Add or rewrite questions so every area is covered, keeping them specific to this client. Return the FULL corrected JSON.",
  ].join("\n");
}
