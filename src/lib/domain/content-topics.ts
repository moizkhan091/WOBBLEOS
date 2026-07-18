import { z } from "zod";
import { newId } from "@/lib/ids";
import { CONTENT_FORMATS, CONTENT_PLATFORMS, type ContentFormat, type ContentPlatform } from "@/lib/domain/content-command";

/**
 * Topic Bank — the pure core. The intelligence run proposes a BANK of content topics; each carries real
 * decision-support STATISTICS (search demand, trend velocity, competitor gap, founder-job value, novelty,
 * proof, freshness) so a founder makes a data-driven pick — never blind. Every topic lands `pending_review`;
 * only an approved topic is promoted to production. Scoring is deliberately ANTI-POPULARITY: founder-job value
 * and novelty dominate; raw demand is a minority input. Provider-free + unit-tested.
 */

// The 7 WOBBLE content pillars (blueprint §13). Each topic belongs to exactly one.
export const CONTENT_TOPIC_PILLARS = [
  "buildable_automations", // flagship: a complete workflow a founder can build/test
  "tool_stack_decisions", // honest comparison for one real job
  "skills_prompts_repos", // a verified resource ranked by founder job
  "copy_paste_assets", // prompt packs, checklists, templates
  "agency_teardowns", // reveal the real layers behind agency pricing
  "ai_for_operators", // a current AI release → one operator decision
  "build_proof_lessons", // a real WOBBLE artifact/test/failure with a measured result
] as const;
export type ContentTopicPillar = (typeof CONTENT_TOPIC_PILLARS)[number];

// Funnel intent — balance the FUNNEL, not just topic spread (blueprint §18.2).
export const CONTENT_TOPIC_FUNNEL_STAGES = ["awareness", "trust", "lead_gen"] as const;
export type ContentTopicFunnelStage = (typeof CONTENT_TOPIC_FUNNEL_STAGES)[number];

// How current the topic is — drives the freshness stat + score.
export const CONTENT_TOPIC_FRESHNESS = ["breaking", "fresh", "evergreen", "stale"] as const;
export type ContentTopicFreshness = (typeof CONTENT_TOPIC_FRESHNESS)[number];

export const CONTENT_TOPIC_STATUSES = ["pending_review", "approved", "rejected", "promoted"] as const;
export type ContentTopicStatus = (typeof CONTENT_TOPIC_STATUSES)[number];

/** Score weights (sum = 1). Founder-job value + novelty dominate; raw demand is a minority input. */
export const TOPIC_SCORE_WEIGHTS = {
  founderJobValue: 0.3,
  noveltyScore: 0.2,
  competitorGap: 0.15,
  demand: 0.15,
  trendVelocity: 0.1,
  proofAvailable: 0.05,
  freshness: 0.05,
} as const;

const FRESHNESS_SCORE: Record<ContentTopicFreshness, number> = { breaking: 100, fresh: 75, evergreen: 50, stale: 10 };

/** Real decision-support statistics attached to a topic. LLM proposes the qualitative 0-100 signals; the
 *  orchestrator overwrites demandVolume/trendVelocity with HARD numbers from DataForSEO before scoring. */
export interface TopicStats {
  demandKeyword: string | null;
  demandVolume: number | null; // monthly searches (DataForSEO) — null until enriched
  trendVelocity: number | null; // fractional momentum (Google Trends) — null until enriched
  competitorGap: number; // 0-100, higher = more white-space (fewer teaching it well)
  founderJobValue: number; // 0-100, how much it advances a REAL founder job
  noveltyScore: number; // 0-100, distinct from recent posts (novelty enforcement)
  proofAvailable: boolean; // we have evidence to back the teaching
  freshness: ContentTopicFreshness;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** Log-normalise unbounded search volume to 0-100 (≈100k searches ≈ 100). */
export function normalizeDemand(volume: number | null): number {
  if (!volume || volume <= 0) return 0;
  return clamp((Math.log10(volume + 1) / Math.log10(100000)) * 100);
}

/** Map fractional trend velocity to 0-100 (flat = 50, doubled = 100, halved = 0). */
export function normalizeVelocity(velocity: number | null): number {
  if (velocity == null) return 50; // unknown = neutral, never a bonus or penalty
  return clamp(50 + velocity * 50);
}

export interface TopicScoreBreakdown {
  founderJobValue: number;
  noveltyScore: number;
  competitorGap: number;
  demand: number;
  trendVelocity: number;
  proofAvailable: number;
  freshness: number;
}

/** Deterministic, defensible composite (0-100). Same spirit as the qualification blend: a topic's score
 *  survives an LLM outage because the arithmetic is explicit and the inputs are recorded. */
export function computeTopicScore(stats: TopicStats): { overall: number; breakdown: TopicScoreBreakdown } {
  const breakdown: TopicScoreBreakdown = {
    founderJobValue: clamp(stats.founderJobValue),
    noveltyScore: clamp(stats.noveltyScore),
    competitorGap: clamp(stats.competitorGap),
    demand: normalizeDemand(stats.demandVolume),
    trendVelocity: normalizeVelocity(stats.trendVelocity),
    proofAvailable: stats.proofAvailable ? 100 : 0,
    freshness: FRESHNESS_SCORE[stats.freshness] ?? 50,
  };
  const overall =
    breakdown.founderJobValue * TOPIC_SCORE_WEIGHTS.founderJobValue +
    breakdown.noveltyScore * TOPIC_SCORE_WEIGHTS.noveltyScore +
    breakdown.competitorGap * TOPIC_SCORE_WEIGHTS.competitorGap +
    breakdown.demand * TOPIC_SCORE_WEIGHTS.demand +
    breakdown.trendVelocity * TOPIC_SCORE_WEIGHTS.trendVelocity +
    breakdown.proofAvailable * TOPIC_SCORE_WEIGHTS.proofAvailable +
    breakdown.freshness * TOPIC_SCORE_WEIGHTS.freshness;
  return { overall: Math.round(clamp(overall)), breakdown };
}

// ── Strategist proposal parsing ───────────────────────────────────────────────────────────────────────

const proposalSchema = z.object({
  pillar: z.enum(CONTENT_TOPIC_PILLARS),
  title: z.string().trim().min(1),
  angle: z.string().trim().min(1),
  teachingJob: z.string().trim().min(1), // the real MECHANISM it teaches — anti-filler
  targetAudience: z.string().trim().min(1),
  rationale: z.string().trim().min(1),
  funnelStage: z.enum(CONTENT_TOPIC_FUNNEL_STAGES),
  suggestedPlatform: z.enum(CONTENT_PLATFORMS).default("instagram"),
  suggestedFormat: z.enum(CONTENT_FORMATS).default("carousel"),
  freshness: z.enum(CONTENT_TOPIC_FRESHNESS).default("evergreen"),
  demandKeyword: z.string().trim().min(1),
  founderJobValue: z.coerce.number().min(0).max(100),
  noveltyScore: z.coerce.number().min(0).max(100),
  competitorGap: z.coerce.number().min(0).max(100),
  proofAvailable: z.coerce.boolean().default(false),
});
export type TopicProposal = z.infer<typeof proposalSchema>;

const proposalsEnvelopeSchema = z.object({ topics: z.array(proposalSchema) });

/** Parse + validate the strategist's JSON topic list. Tolerates prose/fences; drops malformed topics, never invents. */
export function parseTopicProposals(raw: string): TopicProposal[] {
  let json: unknown;
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fenced ? fenced[1] : raw;
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    json = JSON.parse(start !== -1 && end > start ? body.slice(start, end + 1) : body);
  } catch {
    throw new Error("topic proposal returned unparseable output");
  }
  const parsed = proposalsEnvelopeSchema.safeParse(json);
  if (parsed.success) return parsed.data.topics;
  const topics = (json as { topics?: unknown }).topics;
  if (!Array.isArray(topics)) throw new Error("topic proposal missing a topics[] array");
  return topics.map((t) => proposalSchema.safeParse(t)).filter((r) => r.success).map((r) => r.data);
}

// ── Strategist prompt (topic-bank variant) ───────────────────────────────────────────────────────────

export interface TopicBankPromptInput {
  objective: string;
  personaName: string;
  count: number;
  knowledgeTopics: string[];
  brain: Array<{ title: string; content: string }>;
  recentTopicTitles: string[]; // for novelty grounding — don't rehash these
  bannedPhrases?: string[];
}

/** The Content STRATEGIST prompt that proposes a topic BANK with decision-support signals. Mechanism-first,
 *  anti-filler: every topic must teach a real mechanism, not "3 steps: list, spot, automate" agency filler. */
export function buildTopicBankPrompt(input: TopicBankPromptInput): { system: string; user: string } {
  const banned = input.bannedPhrases?.length ? ` NEVER use these empty phrases: ${input.bannedPhrases.join(", ")}.` : "";
  const system = `You are the Content STRATEGIST (creative director) for ${input.personaName}. Propose a BANK of ${input.count} distinct content topics a founder will choose from — you do NOT decide what gets posted, you give the founder DATA to decide. WOBBLE actually TEACHES the real mechanism (never empty agency filler like "3 steps: list, spot, automate").${banned}

Each topic MUST belong to exactly one pillar ∈ ${JSON.stringify(CONTENT_TOPIC_PILLARS)} and carry HONEST self-assessed signals (0-100):
- founderJobValue: how much building/knowing this advances a REAL founder's job (the north star — weight it above popularity).
- noveltyScore: how distinct it is from the RECENT topics listed below (penalise anything close to a rehash).
- competitorGap: how poorly competitors currently teach this (higher = more white-space to own).
- proofAvailable: true only if we can back the teaching with real evidence/proof.
- freshness ∈ ["breaking","fresh","evergreen","stale"]; funnelStage ∈ ${JSON.stringify(CONTENT_TOPIC_FUNNEL_STAGES)}.
- demandKeyword: the single real search phrase a buyer would type for this topic (used to measure live demand).
- teachingJob: the concrete MECHANISM this teaches (tool, nodes, inputs/outputs, decisions, failure routes) — not a vague benefit.

Respond with STRICT JSON only:
{"topics":[{"pillar":"...","title":"...","angle":"...","teachingJob":"...","targetAudience":"...","rationale":"...","funnelStage":"awareness|trust|lead_gen","suggestedPlatform":"instagram|linkedin|x|youtube|multi","suggestedFormat":"static|carousel|text|thread|reel_script|youtube_script","freshness":"breaking|fresh|evergreen|stale","demandKeyword":"...","founderJobValue":0,"noveltyScore":0,"competitorGap":0,"proofAvailable":false}]}`;
  const user = [
    `OBJECTIVE: ${input.objective}`,
    input.knowledgeTopics.length ? `KNOWLEDGE WE HAVE (topics): ${input.knowledgeTopics.slice(0, 40).join(", ")}` : null,
    input.brain.length ? `BRAND BRAIN:\n${input.brain.slice(0, 8).map((b) => `- ${b.title}: ${b.content}`).join("\n")}` : null,
    input.recentTopicTitles.length ? `RECENT TOPICS (do NOT rehash — score novelty against these):\n${input.recentTopicTitles.slice(0, 30).map((t) => `- ${t}`).join("\n")}` : `RECENT TOPICS: (none yet)`,
    `Propose ${input.count} topics. Return STRICT JSON only.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { system, user };
}

// ── Row builder ───────────────────────────────────────────────────────────────────────────────────────

export interface ContentTopicRow {
  id: string;
  pillar: ContentTopicPillar;
  title: string;
  angle: string;
  teachingJob: string;
  targetAudience: string;
  rationale: string;
  funnelStage: ContentTopicFunnelStage;
  suggestedPlatform: ContentPlatform;
  suggestedFormat: ContentFormat;
  freshness: ContentTopicFreshness;
  demandKeyword: string | null;
  demandVolume: number | null;
  trendVelocity: number | null;
  competitorGap: number;
  founderJobValue: number;
  noveltyScore: number;
  proofAvailable: boolean;
  overallScore: number;
  scoreBreakdown: TopicScoreBreakdown;
  sourceRefs: string[];
  status: ContentTopicStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  intelligenceRunId: string | null;
  promotedGraphRunId: string | null;
  promotedPacketId: string | null;
  createdByAgent: string | null;
  model: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface BuildContentTopicInput {
  proposal: TopicProposal;
  stats: TopicStats; // proposal signals + DataForSEO-enriched demand/velocity
  sourceRefs?: string[];
  intelligenceRunId?: string | null;
  createdByAgent?: string;
  model?: string;
}

export function buildContentTopicRow(input: BuildContentTopicInput, opts: { id?: string; now?: Date } = {}): ContentTopicRow {
  const now = opts.now ?? new Date();
  const { overall, breakdown } = computeTopicScore(input.stats);
  return {
    id: opts.id ?? newId("topic"),
    pillar: input.proposal.pillar,
    title: input.proposal.title,
    angle: input.proposal.angle,
    teachingJob: input.proposal.teachingJob,
    targetAudience: input.proposal.targetAudience,
    rationale: input.proposal.rationale,
    funnelStage: input.proposal.funnelStage,
    suggestedPlatform: input.proposal.suggestedPlatform,
    suggestedFormat: input.proposal.suggestedFormat,
    freshness: input.stats.freshness,
    demandKeyword: input.stats.demandKeyword,
    demandVolume: input.stats.demandVolume,
    trendVelocity: input.stats.trendVelocity,
    competitorGap: clamp(input.stats.competitorGap),
    founderJobValue: clamp(input.stats.founderJobValue),
    noveltyScore: clamp(input.stats.noveltyScore),
    proofAvailable: input.stats.proofAvailable,
    overallScore: overall,
    scoreBreakdown: breakdown,
    sourceRefs: input.sourceRefs ?? [],
    status: "pending_review",
    reviewedBy: null,
    reviewedAt: null,
    reviewNotes: null,
    intelligenceRunId: input.intelligenceRunId ?? null,
    promotedGraphRunId: null,
    promotedPacketId: null,
    createdByAgent: input.createdByAgent ?? null,
    model: input.model ?? null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}
