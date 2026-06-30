/**
 * Chunk 17: Content Excellence Gate (pure, DB-free).
 *
 * This is the OBJECTIVE quality brain for WOBBLE content. Where the content
 * worker's self-review is the model grading itself (gameable), this gate
 * analyzes the ACTUAL draft text deterministically: weak-hook detection,
 * anti-fluff / clarity, CTA strength, proof strength (claims vs evidence),
 * brand/voice fit, aggression control, plus hard do-not-say / banned-phrase and
 * generic-AI-agency blocks. It returns the six WOBBLE quality dimensions (so it
 * maps straight onto `quality_reviews`), a pass/fail, the qualityStatus, and
 * TARGETED rewrite instructions.
 *
 * Rules are DATA, not logic: every phrase list is config (DEFAULT_EXCELLENCE_RULES)
 * and overridable per call (from a content track's bannedPhrases, the do-not-say
 * Brain rule, or Settings later). Nothing strategy-specific is hardcoded in the
 * scoring itself.
 */

export interface ExcellenceRules {
  bannedPhrases: string[];
  weakWords: string[];
  genericAgencyPhrases: string[];
  weakHookOpeners: string[];
  vagueCtaPhrases: string[];
  strongCtaVerbs: string[];
  claimWords: string[];
  voiceKeywords: string[];
  rageWords: string[];
}

export const DEFAULT_EXCELLENCE_RULES: ExcellenceRules = {
  // Founder/track/Brain supply real banned phrases; default is empty so we never invent rules.
  bannedPhrases: [],
  weakWords: [
    "very", "really", "just", "actually", "basically", "literally", "stuff",
    "game-changer", "game changer", "revolutionary", "cutting-edge", "cutting edge",
    "world-class", "world class", "synergy", "seamless", "supercharge", "elevate",
    "at the end of the day", "needless to say", "in order to", "that being said",
  ],
  genericAgencyPhrases: [
    "we help businesses leverage", "unlock the power of ai", "take your business to the next level",
    "in today's fast-paced world", "in today's world", "passionate about helping", "one-stop shop",
    "best-in-class", "empower your business", "drive real results", "cutting-edge solutions",
    "leverage the power of",
  ],
  weakHookOpeners: [
    "in today's world", "in today's fast-paced", "as we all know", "in this post",
    "i wanted to share", "i'm excited to", "without further ado", "let's dive in",
    "in the world of", "have you ever wondered", "we are thrilled",
  ],
  vagueCtaPhrases: [
    "let me know your thoughts", "thoughts?", "stay tuned", "comment below",
    "what do you think", "drop a comment", "like and share", "follow for more", "link in bio",
  ],
  strongCtaVerbs: [
    "book", "start", "get", "download", "grab", "claim", "try", "join", "steal",
    "apply", "reply", "dm", "build", "watch", "read", "see", "save", "copy", "use",
  ],
  claimWords: [
    "best", "#1", "number one", "guaranteed", "proven", "scientifically", "studies show",
    "research shows", "always", "never", "everyone", "no one", "100%", "fastest", "cheapest",
    "leading", "the only",
  ],
  voiceKeywords: ["operator", "systems", "ship", "proof", "receipts", "leverage-free", "digital employee", "wobble"],
  rageWords: ["idiot", "stupid", "dumb", "trash", "garbage", "pathetic", "loser", "clown"],
};

export type Dimension =
  | "usefulness"
  | "originality"
  | "brandFit"
  | "clarity"
  | "aggressionControl"
  | "proofStrength";

export interface DimensionScores {
  usefulness: number;
  originality: number;
  brandFit: number;
  clarity: number;
  aggressionControl: number;
  proofStrength: number;
}

export interface ExcellenceIssue {
  dimension: Dimension;
  severity: "block" | "warn";
  code: string;
  message: string;
  rewrite: string;
}

export interface ContentDraft {
  hook: string;
  mainCopy?: string;
  caption?: string;
  cta?: string;
  slides?: string[];
  platform?: string;
  format?: string;
  claimRiskLevel?: "low" | "medium" | "high";
  proofRequired?: boolean;
  hasSources?: boolean;
  hasEvidence?: boolean;
}

export interface ExcellenceResult {
  scores: DimensionScores;
  postWorthiness: "pass" | "fail";
  passed: boolean;
  qualityStatus: "passed" | "failed";
  blocked: boolean;
  blockReasons: string[];
  issues: ExcellenceIssue[];
  rewriteInstructions: string[];
  summary: string;
}

const PASS_THRESHOLD = 7;
const AGGRESSION_PASS_THRESHOLD = 6;

function clamp(n: number): number {
  return Math.max(0, Math.min(10, Math.round(n * 10) / 10));
}

function lc(s: string | undefined): string {
  return (s ?? "").toLowerCase();
}

/** Find which of `phrases` appear in `text` (case-insensitive, substring). */
export function detectPhrases(text: string, phrases: string[]): string[] {
  const hay = lc(text);
  return phrases.filter((p) => p && hay.includes(p.toLowerCase()));
}

export function capsRatio(text: string): number {
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  if (letters === 0) return 0;
  const caps = (text.match(/[A-Z]/g) ?? []).length;
  return caps / letters;
}

function draftBody(draft: ContentDraft): string {
  return [draft.hook, draft.mainCopy, draft.caption, ...(draft.slides ?? [])].filter(Boolean).join("\n");
}

function needsProof(draft: ContentDraft, claimHits: string[]): boolean {
  return Boolean(draft.proofRequired) || draft.claimRiskLevel === "medium" || draft.claimRiskLevel === "high" || claimHits.length > 0;
}

/**
 * Grade a content draft. Pure and deterministic.
 */
export function gradeContentExcellence(draft: ContentDraft, rulesInput?: Partial<ExcellenceRules>): ExcellenceResult {
  const rules: ExcellenceRules = { ...DEFAULT_EXCELLENCE_RULES, ...rulesInput };
  const issues: ExcellenceIssue[] = [];
  const body = draftBody(draft);
  const hook = draft.hook ?? "";
  const cta = (draft.cta ?? "").trim();
  const isCarousel = (draft.slides?.length ?? 0) > 0 || draft.format === "carousel";

  // ---- HARD BLOCKS: banned phrases / do-not-say ----
  const bannedHits = detectPhrases(body, rules.bannedPhrases);
  for (const phrase of bannedHits) {
    issues.push({
      dimension: "brandFit",
      severity: "block",
      code: "banned_phrase",
      message: `Contains a banned / do-not-say phrase: "${phrase}".`,
      rewrite: `Remove "${phrase}" entirely and rephrase in WOBBLE's own direct voice.`,
    });
  }

  // ---- BRAND / VOICE FIT ----
  let brandFit = 9;
  const agencyHits = detectPhrases(body, rules.genericAgencyPhrases);
  for (const phrase of agencyHits) {
    brandFit -= 3;
    issues.push({
      dimension: "brandFit",
      severity: "warn",
      code: "generic_agency_language",
      message: `Generic AI-agency language: "${phrase}".`,
      rewrite: `Cut "${phrase}". Say the specific thing WOBBLE does and the concrete outcome, not generic hype.`,
    });
  }
  const voiceHits = detectPhrases(body, rules.voiceKeywords);
  if (voiceHits.length > 0) brandFit += 1;
  if (bannedHits.length > 0) brandFit = Math.min(brandFit, 2);

  // ---- CLARITY (anti-fluff) ----
  let clarity = 10;
  const weakHits = detectPhrases(body, rules.weakWords);
  if (weakHits.length > 0) {
    clarity -= Math.min(5, weakHits.length);
    issues.push({
      dimension: "clarity",
      severity: "warn",
      code: "fluff_words",
      message: `Filler / weak words reduce punch: ${weakHits.slice(0, 6).join(", ")}.`,
      rewrite: `Delete filler words (${weakHits.slice(0, 6).join(", ")}). Tighten every sentence to the concrete point.`,
    });
  }
  if (hook.length > 200) {
    clarity -= 1;
    issues.push({
      dimension: "clarity",
      severity: "warn",
      code: "hook_too_long",
      message: "Hook is too long to land fast.",
      rewrite: "Cut the hook to one sharp line a reader gets in under 2 seconds.",
    });
  }

  // ---- HOOK STRENGTH (-> usefulness + originality) ----
  let originality = 9;
  let usefulness = 8;
  const weakOpenerHits = detectPhrases(hook, rules.weakHookOpeners);
  if (weakOpenerHits.length > 0) {
    originality -= 2;
    usefulness -= 2;
    issues.push({
      dimension: "originality",
      severity: "warn",
      code: "weak_hook_opener",
      message: `Weak/cliché hook opener: "${weakOpenerHits[0]}".`,
      rewrite: `Replace the opener "${weakOpenerHits[0]}" with a specific, surprising, or contrarian first line (a number, a sharp claim, or a pattern interrupt).`,
    });
  }
  if (hook.trim().length < 20) {
    usefulness -= 2;
    issues.push({
      dimension: "usefulness",
      severity: "warn",
      code: "hook_too_thin",
      message: "Hook is too thin to earn attention.",
      rewrite: "Make the hook concrete: name the reader, the stakes, or a specific result.",
    });
  }
  const hasSpecificity = /\d/.test(body) || /\byou\b/i.test(body) || /\bhow\b/i.test(hook) || /\bwhy\b/i.test(hook);
  if (!hasSpecificity) {
    usefulness -= 2;
    issues.push({
      dimension: "usefulness",
      severity: "warn",
      code: "no_specificity",
      message: "No concrete specificity (number, 'you', or a clear how/why).",
      rewrite: "Add one concrete detail: a number, a named outcome, or speak directly to 'you'.",
    });
  }
  for (const phrase of agencyHits) originality -= 1;
  if (!isCarousel && (draft.mainCopy ?? "").trim().length < 120) {
    usefulness -= 2;
    issues.push({
      dimension: "usefulness",
      severity: "warn",
      code: "thin_body",
      message: "Body copy is too thin to deliver real value.",
      rewrite: "Expand the body with one concrete teaching point, example, or step the reader can act on.",
    });
  }

  // ---- CTA STRENGTH (-> usefulness) ----
  const vagueCtaHits = detectPhrases(cta, rules.vagueCtaPhrases);
  const hasStrongVerb = rules.strongCtaVerbs.some((v) => new RegExp(`\\b${v}\\b`, "i").test(cta));
  if (!cta) {
    usefulness -= 2;
    issues.push({
      dimension: "usefulness",
      severity: "warn",
      code: "missing_cta",
      message: "No call to action.",
      rewrite: "Add one specific CTA with an action verb (e.g. 'Steal this checklist', 'Reply 'OS' and I'll send it').",
    });
  } else if (vagueCtaHits.length > 0 || !hasStrongVerb) {
    usefulness -= 1;
    issues.push({
      dimension: "usefulness",
      severity: "warn",
      code: "weak_cta",
      message: `CTA is vague${vagueCtaHits.length ? `: "${vagueCtaHits[0]}"` : ""}.`,
      rewrite: "Rewrite the CTA with a single concrete action verb and a clear next step.",
    });
  }

  // ---- PROOF STRENGTH ----
  const claimHits = detectPhrases(body, rules.claimWords);
  const proofNeeded = needsProof(draft, claimHits);
  const hasProof = Boolean(draft.hasSources) && Boolean(draft.hasEvidence);
  let proofStrength: number;
  if (proofNeeded && !hasProof) {
    proofStrength = 2;
    issues.push({
      dimension: "proofStrength",
      severity: "block",
      code: "unproven_claim",
      message: `Makes a strong/risky claim${claimHits.length ? ` ("${claimHits[0]}")` : ""} without an approved source + evidence.`,
      rewrite: "Either attach an approved source + evidence summary, or soften the claim to something you can actually back.",
    });
  } else if (proofNeeded && hasProof) {
    proofStrength = 9;
  } else {
    proofStrength = 7;
  }

  // ---- AGGRESSION CONTROL ----
  let aggressionControl = 10;
  const ratio = capsRatio(body);
  if (ratio > 0.3) {
    aggressionControl -= 4;
    issues.push({
      dimension: "aggressionControl",
      severity: "warn",
      code: "shouting_caps",
      message: "Too much ALL-CAPS reads as shouting.",
      rewrite: "Drop the all-caps; let a sharp claim carry the intensity instead.",
    });
  }
  const exclamations = (body.match(/!/g) ?? []).length;
  if (exclamations > 3) {
    aggressionControl -= 2;
    issues.push({
      dimension: "aggressionControl",
      severity: "warn",
      code: "exclamation_spam",
      message: "Too many exclamation marks.",
      rewrite: "Keep at most one exclamation; conviction comes from the claim, not punctuation.",
    });
  }
  const rageHits = detectPhrases(body, rules.rageWords);
  if (rageHits.length > 0) {
    aggressionControl -= 3 * rageHits.length;
    issues.push({
      dimension: "aggressionControl",
      severity: "warn",
      code: "insulting_language",
      message: `Insulting/rage language: ${rageHits.join(", ")}.`,
      rewrite: "Be aggressive against the OLD WAY and bad systems, never insulting people. Reframe the attack on the problem.",
    });
  }

  const scores: DimensionScores = {
    usefulness: clamp(usefulness),
    originality: clamp(originality),
    brandFit: clamp(brandFit),
    clarity: clamp(clarity),
    aggressionControl: clamp(aggressionControl),
    proofStrength: clamp(proofStrength),
  };

  const blockIssues = issues.filter((i) => i.severity === "block");
  const blocked = blockIssues.length > 0;
  const blockReasons = blockIssues.map((i) => i.message);

  const coreOk =
    scores.usefulness >= PASS_THRESHOLD &&
    scores.originality >= PASS_THRESHOLD &&
    scores.brandFit >= PASS_THRESHOLD &&
    scores.clarity >= PASS_THRESHOLD &&
    scores.proofStrength >= PASS_THRESHOLD &&
    scores.aggressionControl >= AGGRESSION_PASS_THRESHOLD;

  const postWorthiness: "pass" | "fail" = !blocked && coreOk ? "pass" : "fail";
  const passed = postWorthiness === "pass";
  const qualityStatus: "passed" | "failed" = passed ? "passed" : "failed";

  // De-duplicate rewrite instructions, blocks first.
  const rewriteInstructions = Array.from(
    new Set([...blockIssues.map((i) => i.rewrite), ...issues.filter((i) => i.severity === "warn").map((i) => i.rewrite)]),
  );

  const summary = passed
    ? "Passed the Content Excellence Gate."
    : `Failed the Content Excellence Gate: ${blocked ? `${blockReasons.length} hard block(s); ` : ""}${rewriteInstructions.length} fix(es) needed.`;

  return { scores, postWorthiness, passed, qualityStatus, blocked, blockReasons, issues, rewriteInstructions, summary };
}
