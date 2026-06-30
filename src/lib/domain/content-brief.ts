/**
 * Data-driven Content Brief assembler (pure, DB-free).
 *
 * This is the anti-hallucination, goal-aware core of content generation. The
 * content worker loads APPROVED data at runtime - the Content Knowledge Base
 * (how-to-write frameworks, hooks, angles, post types, voice), our own
 * performance stats (what is actually working), and competitor signals (what
 * they are posting) - and this function assembles them into a single grounded
 * brief.
 *
 * Four NON-NEGOTIABLE rules baked into the prompt + the result:
 *  1. Data-driven: write from the provided approved knowledge/stats/competitor
 *     data, not from generic priors.
 *  2. No hallucination: if a needed input is missing, SAY SO and do not fabricate
 *     stats, results, or competitor claims.
 *  3. Dynamic auto-pickup: callers pass whatever data exists right now; new
 *     knowledge/competitor/stats added later flow in automatically (no code
 *     change), because the worker queries the data layer each run.
 *  4. Goal-aware: every brief has an explicit goal (awareness / followers /
 *     leads / authority / engagement / sales) which drives the CTA intent.
 *
 * Mirrors Ask WOBBLE's buildAskContext, for content. Pure + testable.
 */

export type ContentGoal = "awareness" | "followers" | "leads" | "authority" | "engagement" | "sales";

export type KnowledgeKind = "framework" | "hook" | "angle" | "post_type" | "voice" | "swipe" | "do_not_say" | "offer";

export interface KnowledgeSnippet {
  id: string;
  kind: KnowledgeKind;
  content: string;
  tags?: string[];
  trustLevel?: string;
}

export interface PerformanceSignal {
  id: string;
  platform?: string;
  metric: string; // e.g. "saves", "reach", "reply_rate"
  value: number | string;
  note?: string; // what this implies, e.g. "teach-first carousels save 3x"
}

export interface CompetitorSignal {
  id: string;
  competitor: string;
  platform?: string;
  observation: string; // what they posted / what worked
  postType?: string;
  engagement?: number | string;
}

export interface ContentBriefInput {
  goal: ContentGoal;
  platform: string;
  format: string;
  audience: string;
  topic?: string;
  angle?: string;
  knowledge: KnowledgeSnippet[];
  performance?: PerformanceSignal[];
  competitors?: CompetitorSignal[];
  /** founder may force a CTA type; otherwise the brief suggests one */
  ctaPreference?: string;
}

export interface DataReadiness {
  hasKnowledge: boolean;
  hasPerformance: boolean;
  hasCompetitors: boolean;
  /** 0-100; how grounded this brief can be */
  score: number;
  missing: string[];
}

export interface ProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ContentBrief {
  goal: ContentGoal;
  suggestedCtaType: string;
  dataReadiness: DataReadiness;
  knowledgeUsed: string[];
  warnings: string[];
  systemPrompt: string;
  messages: ProviderMessage[];
}

/** Goal -> the kind of CTA that actually serves that goal. */
export function suggestCtaForGoal(goal: ContentGoal, preference?: string): string {
  if (preference && preference.trim()) return preference.trim();
  switch (goal) {
    case "leads":
    case "sales":
      return "direct-response CTA (book / reply with a keyword / DM) tied to the offer";
    case "followers":
      return "follow-for-more CTA that promises a clear ongoing benefit";
    case "engagement":
      return "a sharp question or take that invites a real reply (not 'thoughts?')";
    case "authority":
      return "a proof-led CTA (save this / steal this framework)";
    case "awareness":
    default:
      return "a soft share-worthy CTA (share this with someone who needs it)";
  }
}

export function assessDataReadiness(input: ContentBriefInput): DataReadiness {
  const hasKnowledge = input.knowledge.length > 0;
  const hasPerformance = (input.performance?.length ?? 0) > 0;
  const hasCompetitors = (input.competitors?.length ?? 0) > 0;
  const missing: string[] = [];
  if (!hasKnowledge) missing.push("content knowledge base (frameworks / hooks / angles)");
  if (!hasPerformance) missing.push("our own performance stats");
  if (!hasCompetitors) missing.push("competitor signals");

  // Knowledge is the backbone (50), performance (30), competitors (20).
  const score = (hasKnowledge ? 50 : 0) + (hasPerformance ? 30 : 0) + (hasCompetitors ? 20 : 0);
  return { hasKnowledge, hasPerformance, hasCompetitors, score, missing };
}

function block(title: string, items: string[]): string {
  return `${title}:\n${items.length ? items.map((i) => `- ${i}`).join("\n") : "(none provided - do not invent any)"}`;
}

export function buildContentBrief(input: ContentBriefInput): ContentBrief {
  const dataReadiness = assessDataReadiness(input);
  const suggestedCtaType = suggestCtaForGoal(input.goal, input.ctaPreference);
  const knowledgeUsed = input.knowledge.map((k) => k.id);

  const warnings: string[] = [];
  if (!dataReadiness.hasKnowledge) {
    warnings.push("No content knowledge base provided - output may be generic. Add/approve knowledge for stronger results.");
  }
  if (input.goal === "leads" || input.goal === "sales") {
    if (!dataReadiness.hasPerformance) warnings.push("Lead/sales goal with no performance data - claims must stay conservative.");
  }

  const knowledgeBlock = block(
    "WOBBLE content knowledge (write FROM this; these are approved how-to frameworks, hooks, angles, post types, voice)",
    input.knowledge.map((k) => `(${k.kind}) ${k.content}`),
  );
  const performanceBlock = block(
    "What is actually working for us (our approved stats - prefer these patterns)",
    (input.performance ?? []).map((p) => `${p.metric}=${p.value}${p.note ? ` (${p.note})` : ""}`),
  );
  const competitorBlock = block(
    "Competitor signals (what others are doing - learn, do not copy or claim as ours)",
    (input.competitors ?? []).map((c) => `${c.competitor}${c.platform ? ` [${c.platform}]` : ""}: ${c.observation}${c.engagement ? ` (eng ${c.engagement})` : ""}`),
  );

  const systemPrompt = [
    `You are WOBBLE's content engine. GOAL: ${input.goal}. Platform: ${input.platform}. Format: ${input.format}. Audience: ${input.audience}.${input.topic ? ` Topic: ${input.topic}.` : ""}${input.angle ? ` Angle: ${input.angle}.` : ""}`,
    `CTA intent for this goal: ${suggestedCtaType}.`,
    knowledgeBlock,
    performanceBlock,
    competitorBlock,
    "NON-NEGOTIABLE RULES: (1) Write from the approved knowledge, stats and signals above - not generic priors. (2) If a needed input is missing or empty, say so plainly and DO NOT fabricate stats, results, or competitor claims. (3) Make it specific and impactful (a real outcome, a number, a sharp angle) - never generic AI-agency filler. (4) Serve the GOAL with the CTA intent above.",
  ].join("\n\n");

  return {
    goal: input.goal,
    suggestedCtaType,
    dataReadiness,
    knowledgeUsed,
    warnings,
    systemPrompt,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Create a ${input.format} for ${input.platform} that achieves '${input.goal}'${input.topic ? ` about ${input.topic}` : ""}.`,
      },
    ],
  };
}
