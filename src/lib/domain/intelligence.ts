import { z } from "zod";
import { newId } from "@/lib/ids";

export const INTELLIGENCE_SCOPES = ["global", "wobble", "founder", "client", "market", "system"] as const;
export type IntelligenceScope = (typeof INTELLIGENCE_SCOPES)[number];

export const INTELLIGENCE_APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "needs_review",
  "archived",
  "superseded",
] as const;
export type IntelligenceApprovalStatus = (typeof INTELLIGENCE_APPROVAL_STATUSES)[number];

export const INTELLIGENCE_RECORD_STATUSES = ["active", "paused", "archived", "superseded"] as const;
export type IntelligenceRecordStatus = (typeof INTELLIGENCE_RECORD_STATUSES)[number];

export const FRESHNESS_STATUSES = ["fresh", "current", "aging", "stale", "expired", "unknown"] as const;
export type FreshnessStatus = (typeof FRESHNESS_STATUSES)[number];

export const RESEARCH_TARGET_TYPES = [
  "competitor_account",
  "creator_account",
  "keyword_set",
  "platform_account",
  "review_source",
  "trend_topic",
  "website",
  "blog",
  "ad_library",
  "client_account",
  "analytics_connector",
] as const;
export type ResearchTargetType = (typeof RESEARCH_TARGET_TYPES)[number];

export const RESEARCH_CADENCES = ["manual", "hourly", "daily", "weekly", "monthly", "on_trigger"] as const;
export type ResearchCadence = (typeof RESEARCH_CADENCES)[number];

export const INTELLIGENCE_ITEM_TYPES = [
  "competitor_account",
  "competitor_post",
  "competitor_reel",
  "competitor_blog",
  "competitor_landing_page",
  "competitor_ad",
  "competitor_offer",
  "competitor_pricing",
  "competitor_funnel",
  "market_trend",
  "industry_news",
  "platform_trend",
  "social_performance",
  "client_social_performance",
  "website_traffic",
  "blog_traffic",
  "seo_ranking",
  "search_keyword",
  "audience_comment",
  "lead_quality",
  "campaign_result",
  "offer_performance",
  "client_note",
  "sales_objection",
  "winning_hook",
  "failed_hook",
  "winning_format",
  "failed_format",
  "brand_rule",
  "voice_rule",
  "approved_example",
  "rejected_example",
  "research_source",
  "internal_decision",
  "strategy_recommendation",
  "future_opportunity",
  "dreamer_idea",
  "experiment_plan",
  "experiment_result",
] as const;
export type IntelligenceItemType = (typeof INTELLIGENCE_ITEM_TYPES)[number];

export const INTELLIGENCE_INSIGHT_TYPES = [
  "content_pattern",
  "competitor_pattern",
  "performance_learning",
  "market_shift",
  "platform_shift",
  "seo_opportunity",
  "website_opportunity",
  "offer_opportunity",
  "voice_of_customer",
  "risk",
  "opportunity",
  "strategy_recommendation",
  "stale_knowledge",
  "source_quality",
] as const;
export type IntelligenceInsightType = (typeof INTELLIGENCE_INSIGHT_TYPES)[number];

export const INTELLIGENCE_SUGGESTION_TYPES = [
  "content_idea",
  "content_experiment",
  "campaign_idea",
  "blog_idea",
  "seo_action",
  "offer_change",
  "landing_page_change",
  "client_strategy",
  "automation_idea",
  "product_idea",
  "prompt_skill_update",
  "memory_update",
] as const;
export type IntelligenceSuggestionType = (typeof INTELLIGENCE_SUGGESTION_TYPES)[number];

export const INTELLIGENCE_TASKS = [
  "ask",
  "social_content",
  "blog_seo",
  "strategy",
  "decision",
  "offer",
  "media",
  "client_work",
] as const;
export type IntelligenceTask = (typeof INTELLIGENCE_TASKS)[number];

export const SUGGESTION_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type SuggestionPriority = (typeof SUGGESTION_PRIORITIES)[number];

export const SUGGESTION_STATUSES = ["pending", "approved", "rejected", "converted", "archived"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const EXPERIMENT_STATUSES = ["planned", "running", "completed", "cancelled", "archived"] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export interface IntelligenceAgentDefinition {
  slug: string;
  label: string;
  purpose: string;
  cadence: ResearchCadence | "nightly";
  reads: string[];
  writes: string[];
  approvalRequiredFor: string[];
}

export const INTELLIGENCE_AGENT_REGISTRY: IntelligenceAgentDefinition[] = [
  {
    slug: "intelligence_orchestrator",
    label: "Intelligence Orchestrator",
    purpose: "Routes research work to the right agents and prevents duplicate/stale jobs.",
    cadence: "hourly",
    reads: ["research_targets", "stale alerts", "user requests"],
    writes: ["jobs", "audit_logs"],
    approvalRequiredFor: ["knowledge promotion"],
  },
  {
    slug: "competitor_scout",
    label: "Competitor Scout",
    purpose: "Tracks competitor accounts, content, offers, pricing, funnels, ads, and market moves.",
    cadence: "daily",
    reads: ["research_targets", "n8n competitor payloads", "sources"],
    writes: ["intelligence_items", "intelligence_insights"],
    approvalRequiredFor: ["new competitor targets", "recurring patterns", "offer/pricing conclusions"],
  },
  {
    slug: "social_content_analyst",
    label: "Social Content Analyst",
    purpose: "Studies hooks, captions, CTAs, formats, engagement, comments, and platform behavior.",
    cadence: "daily",
    reads: ["social performance", "competitor content", "audience comments"],
    writes: ["content insights", "performance learning"],
    approvalRequiredFor: ["winning pattern promotion", "failed pattern promotion"],
  },
  {
    slug: "transcript_analyst",
    label: "Transcript Analyst",
    purpose: "Extracts patterns, hooks, objections, and strategy from transcripts.",
    cadence: "on_trigger",
    reads: ["source_chunks", "transcripts"],
    writes: ["intelligence_items", "intelligence_insights"],
    approvalRequiredFor: ["content knowledge updates", "memory updates"],
  },
  {
    slug: "trend_radar",
    label: "Trend Radar",
    purpose: "Tracks platform trends, industry shifts, audience behavior, and emerging formats.",
    cadence: "daily",
    reads: ["news", "RSS", "platform sources", "market sources"],
    writes: ["trend items", "opportunity insights"],
    approvalRequiredFor: ["strategy changes"],
  },
  {
    slug: "market_researcher",
    label: "Market Researcher",
    purpose: "Studies industries, buyer pain, positioning, competitors, and category opportunities.",
    cadence: "weekly",
    reads: ["sources", "client context", "competitor intelligence"],
    writes: ["market insights", "positioning recommendations"],
    approvalRequiredFor: ["ICP, positioning, offer, or client strategy changes"],
  },
  {
    slug: "seo_blog_intelligence",
    label: "SEO/Blog Intelligence Agent",
    purpose: "Tracks keyword, SERP, blog, backlink, internal-link, and AEO opportunities.",
    cadence: "weekly",
    reads: ["Search Console", "website analytics", "competitor articles"],
    writes: ["seo items", "blog opportunities", "keyword insights"],
    approvalRequiredFor: ["publish actions", "strategy changes", "backlink outreach"],
  },
  {
    slug: "website_analytics_agent",
    label: "Website Analytics Agent",
    purpose: "Finds weak pages, traffic shifts, conversion risks, and content impact.",
    cadence: "daily",
    reads: ["website analytics", "Search Console", "forms/CRM"],
    writes: ["performance items", "website insights"],
    approvalRequiredFor: ["website strategy recommendations"],
  },
  {
    slug: "offer_intelligence",
    label: "Offer Intelligence Agent",
    purpose: "Studies offers, pricing, bundles, guarantees, objections, and conversion angles.",
    cadence: "weekly",
    reads: ["sales notes", "competitor offers", "campaign results"],
    writes: ["offer insights", "experiments"],
    approvalRequiredFor: ["offer, pricing, guarantee, or funnel changes"],
  },
  {
    slug: "brand_voice_guardian",
    label: "Brand Voice Guardian",
    purpose: "Protects approved WOBBLE voice, positioning, examples, and do-not-say rules.",
    cadence: "on_trigger",
    reads: ["Brain", "content tracks", "quality failures"],
    writes: ["voice proposals", "quality notes"],
    approvalRequiredFor: ["brand rules", "do-not-say rules"],
  },
  {
    slug: "memory_curator",
    label: "Memory Curator",
    purpose: "Decides what belongs in long-term memory and what should remain episodic.",
    cadence: "weekly",
    reads: ["insights", "sources", "old memory", "approvals"],
    writes: ["memory_update_proposals"],
    approvalRequiredFor: ["all memory changes"],
  },
  {
    slug: "performance_learning",
    label: "Performance Learning Agent",
    purpose: "Compares old vs new results and detects rising, declining, stale, or proven patterns.",
    cadence: "daily",
    reads: ["social stats", "blog stats", "website stats", "experiments"],
    writes: ["performance insights", "stale alerts"],
    approvalRequiredFor: ["proven/deprecated status changes"],
  },
  {
    slug: "dreamer",
    label: "Dreamer / Opportunity Agent",
    purpose: "Proactively suggests content, campaign, offer, automation, product, and strategy moves.",
    cadence: "nightly",
    reads: ["all approved intelligence", "gaps", "stale data", "performance shifts"],
    writes: ["intelligence_suggestions", "experiment proposals"],
    approvalRequiredFor: ["all suggestions"],
  },
  {
    slug: "experiment_planner",
    label: "Experiment Planner",
    purpose: "Turns approved suggestions into testable experiments with metrics and review dates.",
    cadence: "on_trigger",
    reads: ["approved suggestions", "goals", "metrics"],
    writes: ["experiments"],
    approvalRequiredFor: ["public or client-facing experiments"],
  },
  {
    slug: "source_quality_fact_checker",
    label: "Source Quality / Fact Checker",
    purpose: "Flags duplicate, weak, stale, conflicting, or unreliable sources.",
    cadence: "weekly",
    reads: ["sources", "source chunks", "insights"],
    writes: ["source quality insights", "needs_review flags"],
    approvalRequiredFor: ["blocking sources", "trust-level changes"],
  },
  {
    slug: "approval_manager",
    label: "Approval Manager",
    purpose: "Packages AI updates into human-reviewable approvals with evidence.",
    cadence: "on_trigger",
    reads: ["proposals", "suggestions", "insights"],
    writes: ["approvals", "audit_logs"],
    approvalRequiredFor: ["none; it creates approvals, never approves them"],
  },
];

const metadataSchema = z.record(z.string(), z.unknown()).default({});
const stringArraySchema = z.array(z.string().trim().min(1)).default([]);
const optionalDateSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  return value;
}, z.date().optional());
const confidenceSchema = z.coerce.number().min(0).max(1).default(0.6);

function numericString(value: number | string | undefined, fallback = 0.6): string {
  const n = value === undefined ? fallback : Number(value);
  return String(Math.max(0, Math.min(1, Number.isFinite(n) ? n : fallback)));
}

function dateOrNull(value: Date | undefined): Date | null {
  return value ?? null;
}

export const researchTargetInputSchema = z.object({
  targetType: z.enum(RESEARCH_TARGET_TYPES),
  name: z.string().trim().min(1),
  platform: z.string().trim().min(1).optional(),
  handleOrUrl: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1).optional(),
  scope: z.enum(INTELLIGENCE_SCOPES).default("wobble"),
  clientId: z.string().trim().min(1).optional(),
  trustLevel: z.string().trim().min(1).default("tier_4_experimental"),
  cadence: z.enum(RESEARCH_CADENCES).default("manual"),
  tags: stringArraySchema,
  addedBy: z.string().trim().min(1).optional(),
  metadata: metadataSchema,
});
export type ResearchTargetInput = z.input<typeof researchTargetInputSchema>;

export interface ResearchTargetRow {
  id: string;
  targetType: ResearchTargetType;
  name: string;
  platform: string | null;
  handleOrUrl: string | null;
  query: string | null;
  scope: IntelligenceScope;
  clientId: string | null;
  status: IntelligenceRecordStatus;
  approvalStatus: IntelligenceApprovalStatus;
  trustLevel: string;
  cadence: ResearchCadence;
  tags: string[];
  addedBy: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  lastCheckedAt: Date | null;
  nextRunAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export function buildResearchTargetRow(input: ResearchTargetInput, opts: { id?: string; now?: Date } = {}): ResearchTargetRow {
  const parsed = researchTargetInputSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("target"),
    targetType: parsed.targetType,
    name: parsed.name,
    platform: parsed.platform ?? null,
    handleOrUrl: parsed.handleOrUrl ?? null,
    query: parsed.query ?? null,
    scope: parsed.scope,
    clientId: parsed.clientId ?? null,
    status: "active",
    approvalStatus: "pending",
    trustLevel: parsed.trustLevel,
    cadence: parsed.cadence,
    tags: parsed.tags,
    addedBy: parsed.addedBy ?? null,
    approvedBy: null,
    approvedAt: null,
    lastCheckedAt: null,
    nextRunAt: null,
    metadata: parsed.metadata,
    createdAt: now,
    updatedAt: now,
  };
}

export const intelligenceItemInputSchema = z.object({
  itemType: z.enum(INTELLIGENCE_ITEM_TYPES),
  scope: z.enum(INTELLIGENCE_SCOPES).default("wobble"),
  clientId: z.string().trim().min(1).optional(),
  targetId: z.string().trim().min(1).optional(),
  sourceId: z.string().trim().min(1).optional(),
  sourceUrl: z.string().trim().min(1).optional(),
  platform: z.string().trim().min(1).optional(),
  actorName: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  rawText: z.string().optional(),
  trustLevel: z.string().trim().min(1).default("tier_4_experimental"),
  approvalStatus: z.enum(INTELLIGENCE_APPROVAL_STATUSES).default("pending"),
  confidence: confidenceSchema,
  observedAt: optionalDateSchema,
  collectedAt: optionalDateSchema,
  lastCheckedAt: optionalDateSchema,
  staleAfterDays: z.coerce.number().int().positive().optional(),
  tags: stringArraySchema,
  metrics: metadataSchema,
  extracted: metadataSchema,
  relations: metadataSchema,
  metadata: metadataSchema,
  createdByAgent: z.string().trim().min(1).optional(),
});
export type IntelligenceItemInput = z.input<typeof intelligenceItemInputSchema>;

export interface IntelligenceItemRow {
  id: string;
  itemType: IntelligenceItemType;
  scope: IntelligenceScope;
  clientId: string | null;
  targetId: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  platform: string | null;
  actorName: string | null;
  title: string;
  summary: string;
  rawText: string | null;
  trustLevel: string;
  approvalStatus: IntelligenceApprovalStatus;
  freshnessStatus: FreshnessStatus;
  confidence: string;
  observedAt: Date | null;
  collectedAt: Date;
  lastCheckedAt: Date | null;
  tags: string[];
  metrics: Record<string, unknown>;
  extracted: Record<string, unknown>;
  relations: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdByAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const fastMovingItemTypes = new Set<IntelligenceItemType>([
  "competitor_post",
  "competitor_reel",
  "market_trend",
  "industry_news",
  "platform_trend",
  "social_performance",
  "client_social_performance",
  "website_traffic",
  "blog_traffic",
  "seo_ranking",
  "search_keyword",
]);

export function staleAfterDaysForItemType(type: IntelligenceItemType): number {
  if (fastMovingItemTypes.has(type)) return 30;
  if (type === "brand_rule" || type === "voice_rule" || type === "approved_example" || type === "rejected_example") return 365;
  return 90;
}

export function calculateFreshnessStatus(input: {
  observedAt?: Date | null;
  collectedAt?: Date | null;
  now?: Date;
  staleAfterDays?: number;
}): FreshnessStatus {
  const now = input.now ?? new Date();
  const date = input.observedAt ?? input.collectedAt ?? null;
  if (!date) return "unknown";
  const ageDays = Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
  const staleAfterDays = input.staleAfterDays ?? 30;
  if (ageDays <= 2) return "fresh";
  if (ageDays <= staleAfterDays * 0.66) return "current";
  if (ageDays <= staleAfterDays) return "aging";
  if (ageDays <= staleAfterDays * 3) return "stale";
  return "expired";
}

export function buildIntelligenceItemRow(input: IntelligenceItemInput, opts: { id?: string; now?: Date } = {}): IntelligenceItemRow {
  const parsed = intelligenceItemInputSchema.parse(input);
  const now = opts.now ?? new Date();
  const collectedAt = parsed.collectedAt ?? now;
  const staleAfterDays = parsed.staleAfterDays ?? staleAfterDaysForItemType(parsed.itemType);
  return {
    id: opts.id ?? newId("intel_item"),
    itemType: parsed.itemType,
    scope: parsed.scope,
    clientId: parsed.clientId ?? null,
    targetId: parsed.targetId ?? null,
    sourceId: parsed.sourceId ?? null,
    sourceUrl: parsed.sourceUrl ?? null,
    platform: parsed.platform ?? null,
    actorName: parsed.actorName ?? null,
    title: parsed.title,
    summary: parsed.summary,
    rawText: parsed.rawText ?? null,
    trustLevel: parsed.trustLevel,
    approvalStatus: parsed.approvalStatus,
    freshnessStatus: calculateFreshnessStatus({
      observedAt: parsed.observedAt,
      collectedAt,
      now,
      staleAfterDays,
    }),
    confidence: numericString(parsed.confidence),
    observedAt: dateOrNull(parsed.observedAt),
    collectedAt,
    lastCheckedAt: dateOrNull(parsed.lastCheckedAt),
    tags: parsed.tags,
    metrics: parsed.metrics,
    extracted: parsed.extracted,
    relations: parsed.relations,
    metadata: { ...parsed.metadata, staleAfterDays },
    createdByAgent: parsed.createdByAgent ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export const intelligenceInsightInputSchema = z.object({
  insightType: z.enum(INTELLIGENCE_INSIGHT_TYPES),
  scope: z.enum(INTELLIGENCE_SCOPES).default("wobble"),
  clientId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  recommendation: z.string().optional(),
  evidenceItemIds: stringArraySchema,
  sourceIds: stringArraySchema,
  appliesToModules: stringArraySchema,
  confidence: confidenceSchema,
  impactScore: z.coerce.number().int().min(0).max(100).default(50),
  approvalStatus: z.enum(INTELLIGENCE_APPROVAL_STATUSES).default("pending"),
  freshnessStatus: z.enum(FRESHNESS_STATUSES).optional(),
  supersedesInsightId: z.string().trim().min(1).optional(),
  createdByAgent: z.string().trim().min(1).optional(),
  metadata: metadataSchema,
});
export type IntelligenceInsightInput = z.input<typeof intelligenceInsightInputSchema>;

export interface IntelligenceInsightRow {
  id: string;
  insightType: IntelligenceInsightType;
  scope: IntelligenceScope;
  clientId: string | null;
  title: string;
  summary: string;
  recommendation: string | null;
  evidenceItemIds: string[];
  sourceIds: string[];
  appliesToModules: string[];
  confidence: string;
  impactScore: number;
  approvalStatus: IntelligenceApprovalStatus;
  freshnessStatus: FreshnessStatus;
  supersedesInsightId: string | null;
  createdByAgent: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

export function buildIntelligenceInsightRow(
  input: IntelligenceInsightInput,
  opts: { id?: string; now?: Date } = {},
): IntelligenceInsightRow {
  const parsed = intelligenceInsightInputSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("intel_insight"),
    insightType: parsed.insightType,
    scope: parsed.scope,
    clientId: parsed.clientId ?? null,
    title: parsed.title,
    summary: parsed.summary,
    recommendation: parsed.recommendation ?? null,
    evidenceItemIds: parsed.evidenceItemIds,
    sourceIds: parsed.sourceIds,
    appliesToModules: parsed.appliesToModules,
    confidence: numericString(parsed.confidence),
    impactScore: parsed.impactScore,
    approvalStatus: parsed.approvalStatus,
    freshnessStatus: parsed.freshnessStatus ?? "current",
    supersedesInsightId: parsed.supersedesInsightId ?? null,
    createdByAgent: parsed.createdByAgent ?? null,
    approvedBy: null,
    approvedAt: null,
    createdAt: now,
    updatedAt: now,
    metadata: parsed.metadata,
  };
}

export const intelligenceSuggestionInputSchema = z.object({
  suggestionType: z.enum(INTELLIGENCE_SUGGESTION_TYPES),
  scope: z.enum(INTELLIGENCE_SCOPES).default("wobble"),
  clientId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  rationale: z.string().trim().min(1),
  proposedAction: z.string().trim().min(1),
  evidenceItemIds: stringArraySchema,
  evidenceInsightIds: stringArraySchema,
  priority: z.enum(SUGGESTION_PRIORITIES).default("medium"),
  confidence: confidenceSchema,
  createdByAgent: z.string().trim().min(1).default("dreamer"),
  reviewAfter: optionalDateSchema,
  metadata: metadataSchema,
});
export type IntelligenceSuggestionInput = z.input<typeof intelligenceSuggestionInputSchema>;

export interface IntelligenceSuggestionRow {
  id: string;
  suggestionType: IntelligenceSuggestionType;
  scope: IntelligenceScope;
  clientId: string | null;
  title: string;
  rationale: string;
  proposedAction: string;
  evidenceItemIds: string[];
  evidenceInsightIds: string[];
  priority: SuggestionPriority;
  confidence: string;
  status: SuggestionStatus;
  approvalStatus: IntelligenceApprovalStatus;
  approvalId: string | null;
  createdByAgent: string;
  reviewAfter: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

export function buildIntelligenceSuggestionRow(
  input: IntelligenceSuggestionInput,
  opts: { id?: string; now?: Date; approvalId?: string | null } = {},
): IntelligenceSuggestionRow {
  const parsed = intelligenceSuggestionInputSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("intel_suggestion"),
    suggestionType: parsed.suggestionType,
    scope: parsed.scope,
    clientId: parsed.clientId ?? null,
    title: parsed.title,
    rationale: parsed.rationale,
    proposedAction: parsed.proposedAction,
    evidenceItemIds: parsed.evidenceItemIds,
    evidenceInsightIds: parsed.evidenceInsightIds,
    priority: parsed.priority,
    confidence: numericString(parsed.confidence),
    status: "pending",
    approvalStatus: "pending",
    approvalId: opts.approvalId ?? null,
    createdByAgent: parsed.createdByAgent,
    reviewAfter: dateOrNull(parsed.reviewAfter),
    createdAt: now,
    updatedAt: now,
    metadata: parsed.metadata,
  };
}

export const experimentInputSchema = z.object({
  scope: z.enum(INTELLIGENCE_SCOPES).default("wobble"),
  clientId: z.string().trim().min(1).optional(),
  linkedSuggestionId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  hypothesis: z.string().trim().min(1),
  goal: z.string().trim().min(1),
  primaryMetric: z.string().trim().min(1),
  expectedResult: z.string().trim().min(1),
  owner: z.string().trim().min(1).optional(),
  reviewAt: optionalDateSchema,
  metadata: metadataSchema,
});
export type ExperimentInput = z.input<typeof experimentInputSchema>;

export interface ExperimentRow {
  id: string;
  scope: IntelligenceScope;
  clientId: string | null;
  linkedSuggestionId: string | null;
  title: string;
  hypothesis: string;
  goal: string;
  primaryMetric: string;
  expectedResult: string;
  actualResult: string | null;
  decision: string | null;
  owner: string | null;
  status: ExperimentStatus;
  approvalStatus: IntelligenceApprovalStatus;
  startedAt: Date | null;
  endedAt: Date | null;
  reviewAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

export function buildExperimentRow(input: ExperimentInput, opts: { id?: string; now?: Date } = {}): ExperimentRow {
  const parsed = experimentInputSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("experiment"),
    scope: parsed.scope,
    clientId: parsed.clientId ?? null,
    linkedSuggestionId: parsed.linkedSuggestionId ?? null,
    title: parsed.title,
    hypothesis: parsed.hypothesis,
    goal: parsed.goal,
    primaryMetric: parsed.primaryMetric,
    expectedResult: parsed.expectedResult,
    actualResult: null,
    decision: null,
    owner: parsed.owner ?? null,
    status: "planned",
    approvalStatus: "pending",
    startedAt: null,
    endedAt: null,
    reviewAt: dateOrNull(parsed.reviewAt),
    createdAt: now,
    updatedAt: now,
    metadata: parsed.metadata,
  };
}

const taskPlans: Record<
  IntelligenceTask,
  { itemTypes: IntelligenceItemType[]; insightTypes: IntelligenceInsightType[]; modules: string[] }
> = {
  ask: {
    itemTypes: ["research_source", "internal_decision", "strategy_recommendation", "future_opportunity"],
    insightTypes: ["strategy_recommendation", "opportunity", "risk", "stale_knowledge"],
    modules: ["ask_wobble"],
  },
  social_content: {
    itemTypes: [
      "competitor_post",
      "competitor_reel",
      "social_performance",
      "client_social_performance",
      "audience_comment",
      "winning_hook",
      "failed_hook",
      "winning_format",
      "failed_format",
      "approved_example",
      "rejected_example",
      "platform_trend",
    ],
    insightTypes: ["content_pattern", "competitor_pattern", "performance_learning", "platform_shift", "voice_of_customer"],
    modules: ["content_command", "content_worker"],
  },
  blog_seo: {
    itemTypes: ["blog_traffic", "website_traffic", "seo_ranking", "search_keyword", "competitor_blog", "market_trend"],
    insightTypes: ["seo_opportunity", "website_opportunity", "market_shift", "performance_learning"],
    modules: ["seo_blog", "content_worker"],
  },
  strategy: {
    itemTypes: ["market_trend", "industry_news", "campaign_result", "offer_performance", "sales_objection", "internal_decision"],
    insightTypes: ["market_shift", "opportunity", "risk", "strategy_recommendation", "performance_learning"],
    modules: ["decision_room", "client_aios_lab"],
  },
  decision: {
    itemTypes: ["campaign_result", "sales_objection", "lead_quality", "offer_performance", "internal_decision", "website_traffic"],
    insightTypes: ["risk", "opportunity", "strategy_recommendation", "performance_learning", "stale_knowledge"],
    modules: ["decision_room"],
  },
  offer: {
    itemTypes: ["competitor_offer", "competitor_pricing", "competitor_funnel", "offer_performance", "sales_objection", "lead_quality"],
    insightTypes: ["offer_opportunity", "risk", "strategy_recommendation", "voice_of_customer"],
    modules: ["offer_lab"],
  },
  media: {
    itemTypes: ["approved_example", "rejected_example", "winning_format", "failed_format", "social_performance"],
    insightTypes: ["content_pattern", "performance_learning"],
    modules: ["media_studio"],
  },
  client_work: {
    itemTypes: ["client_note", "client_social_performance", "website_traffic", "campaign_result", "sales_objection"],
    insightTypes: ["strategy_recommendation", "performance_learning", "risk", "opportunity", "voice_of_customer"],
    modules: ["client_aios_lab", "presentation_maker"],
  },
};

export interface IntelligenceContextPlanInput {
  task: IntelligenceTask;
  scope?: IntelligenceScope;
  clientId?: string;
}

export interface IntelligenceContextPlan {
  task: IntelligenceTask;
  scope: IntelligenceScope;
  clientId: string | null;
  requiredItemTypes: IntelligenceItemType[];
  requiredInsightTypes: IntelligenceInsightType[];
  appliesToModules: string[];
  approvalRequired: true;
}

export function buildIntelligenceContextPlan(input: IntelligenceContextPlanInput): IntelligenceContextPlan {
  const task = z.enum(INTELLIGENCE_TASKS).parse(input.task);
  const scope = input.scope ? z.enum(INTELLIGENCE_SCOPES).parse(input.scope) : "wobble";
  const plan = taskPlans[task];
  return {
    task,
    scope,
    clientId: input.clientId ?? null,
    requiredItemTypes: plan.itemTypes,
    requiredInsightTypes: plan.insightTypes,
    appliesToModules: plan.modules,
    approvalRequired: true,
  };
}

function scopeMatches(rowScope: IntelligenceScope, plan: IntelligenceContextPlan, rowClientId?: string | null): boolean {
  // Client-scoped rows are visible ONLY to a request for that exact client — never leak across
  // clients (previously a scope=client request with no clientId matched every client's data).
  if (rowScope === "client") return Boolean(plan.clientId) && rowClientId === plan.clientId;
  if (rowScope === "global") return true;
  return rowScope === plan.scope;
}

function freshnessRank(status: FreshnessStatus): number {
  switch (status) {
    case "fresh":
      return 6;
    case "current":
      return 5;
    case "aging":
      return 4;
    case "stale":
      return 2;
    case "expired":
      return 1;
    default:
      return 0;
  }
}

export interface ApprovedIntelligenceContext {
  plan: IntelligenceContextPlan;
  items: IntelligenceItemRow[];
  insights: IntelligenceInsightRow[];
  excluded: Array<{ id: string; reason: string }>;
  gaps: string[];
}

export function selectApprovedIntelligenceForTask(input: {
  plan: IntelligenceContextPlan;
  items: IntelligenceItemRow[];
  insights: IntelligenceInsightRow[];
  now?: Date;
  limit?: number;
}): ApprovedIntelligenceContext {
  const limit = input.limit ?? 20;
  const excluded: Array<{ id: string; reason: string }> = [];
  const approvedItems = input.items.filter((item) => {
    if (item.approvalStatus !== "approved") {
      excluded.push({ id: item.id, reason: `approvalStatus:${item.approvalStatus}` });
      return false;
    }
    if (!scopeMatches(item.scope, input.plan, item.clientId)) {
      excluded.push({ id: item.id, reason: `scope:${item.scope}` });
      return false;
    }
    if (!input.plan.requiredItemTypes.includes(item.itemType)) return false;
    return true;
  });

  const approvedInsights = input.insights.filter((insight) => {
    if (insight.approvalStatus !== "approved") return false;
    if (!scopeMatches(insight.scope, input.plan, insight.clientId)) return false;
    return input.plan.requiredInsightTypes.includes(insight.insightType);
  });

  const sortedItems = approvedItems
    .sort(
      (a, b) =>
        freshnessRank(b.freshnessStatus) - freshnessRank(a.freshnessStatus) ||
        Number(b.confidence) - Number(a.confidence) ||
        b.collectedAt.getTime() - a.collectedAt.getTime(),
    )
    .slice(0, limit);

  const sortedInsights = approvedInsights
    .sort(
      (a, b) =>
        freshnessRank(b.freshnessStatus) - freshnessRank(a.freshnessStatus) ||
        b.impactScore - a.impactScore ||
        Number(b.confidence) - Number(a.confidence),
    )
    .slice(0, limit);

  const presentItemTypes = new Set(sortedItems.map((item) => item.itemType));
  const presentInsightTypes = new Set(sortedInsights.map((insight) => insight.insightType));
  const gaps = [
    ...input.plan.requiredItemTypes.filter((type) => !presentItemTypes.has(type)),
    ...input.plan.requiredInsightTypes.filter((type) => !presentInsightTypes.has(type)),
  ];

  return { plan: input.plan, items: sortedItems, insights: sortedInsights, excluded, gaps };
}

export const INTELLIGENCE_INBOX_RECORD_TYPES = ["item", "insight", "suggestion"] as const;
export type IntelligenceInboxRecordType = (typeof INTELLIGENCE_INBOX_RECORD_TYPES)[number];

export const INTELLIGENCE_REVIEW_ACTIONS = ["approve", "reject", "needs_review", "archive"] as const;
export type IntelligenceReviewAction = (typeof INTELLIGENCE_REVIEW_ACTIONS)[number];

export const INTELLIGENCE_REJECTION_REASONS = [
  "off_brand",
  "weak_idea",
  "too_generic",
  "wrong_audience",
  "factually_wrong",
  "poor_strategy",
  "not_premium_enough",
  "not_relevant",
  "duplicate",
  "other",
] as const;

export const intelligenceInboxQuerySchema = z.object({
  scope: z.enum(INTELLIGENCE_SCOPES).optional(),
  clientId: z.string().trim().min(1).optional(),
  approvalStatus: z.enum(INTELLIGENCE_APPROVAL_STATUSES).optional(),
  limit: z.coerce.number().int().positive().optional(),
});
export type IntelligenceInboxQuery = z.input<typeof intelligenceInboxQuerySchema>;

export const intelligenceReviewInputSchema = z.object({
  recordType: z.enum(INTELLIGENCE_INBOX_RECORD_TYPES),
  id: z.string().trim().min(1),
  action: z.enum(INTELLIGENCE_REVIEW_ACTIONS),
  reviewedBy: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
}).superRefine((value, ctx) => {
  if (value.action === "reject" && !value.reason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "reason is required when rejecting intelligence" });
  }
});
export type IntelligenceReviewInput = z.input<typeof intelligenceReviewInputSchema>;

export const intelligenceEditInputSchema = z.object({
  recordType: z.enum(INTELLIGENCE_INBOX_RECORD_TYPES),
  id: z.string().trim().min(1),
  editedBy: z.string().trim().min(1),
  patch: z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length > 0, "patch must include at least one field"),
  notes: z.string().trim().min(1).optional(),
});
export type IntelligenceEditInput = z.input<typeof intelligenceEditInputSchema>;

export const intelligenceRouteToMemoryInputSchema = z.object({
  recordType: z.enum(INTELLIGENCE_INBOX_RECORD_TYPES),
  id: z.string().trim().min(1),
  proposedBy: z.string().trim().min(1),
  affectedArea: z.string().trim().min(1).optional(),
  knowledgeType: z.string().trim().min(1).optional(),
  suggestedBankSlugs: z.array(z.string().trim().min(1)).default([]),
  notes: z.string().trim().min(1).optional(),
});
export type IntelligenceRouteToMemoryInput = z.input<typeof intelligenceRouteToMemoryInputSchema>;

export const intelligenceMergeInputSchema = z.object({
  recordType: z.enum(INTELLIGENCE_INBOX_RECORD_TYPES),
  primaryId: z.string().trim().min(1),
  duplicateId: z.string().trim().min(1),
  mergedBy: z.string().trim().min(1),
  reason: z.string().trim().min(1),
});
export type IntelligenceMergeInput = z.input<typeof intelligenceMergeInputSchema>;

export type IntelligenceInboxRecord = IntelligenceItemRow | IntelligenceInsightRow | IntelligenceSuggestionRow;

export interface IntelligenceInboxEntry {
  recordType: IntelligenceInboxRecordType;
  id: string;
  title: string;
  summary: string;
  approvalStatus: IntelligenceApprovalStatus;
  confidence: string;
  priority: SuggestionPriority | null;
  sourceIds: string[];
  evidenceItemIds: string[];
  evidenceInsightIds: string[];
  appliesToModules: string[];
  agentSlug: string | null;
  freshnessStatus: FreshnessStatus | null;
  createdAt: Date;
  updatedAt: Date;
  record: IntelligenceInboxRecord;
}

export function mapReviewActionToApprovalStatus(action: IntelligenceReviewAction): IntelligenceApprovalStatus {
  switch (action) {
    case "approve":
      return "approved";
    case "reject":
      return "rejected";
    case "needs_review":
      return "needs_review";
    case "archive":
      return "archived";
  }
}

export function normalizeIntelligenceInboxEntry(
  recordType: IntelligenceInboxRecordType,
  record: IntelligenceInboxRecord,
): IntelligenceInboxEntry {
  if (recordType === "item") {
    const item = record as IntelligenceItemRow;
    return {
      recordType,
      id: item.id,
      title: item.title,
      summary: item.summary,
      approvalStatus: item.approvalStatus,
      confidence: item.confidence,
      priority: null,
      sourceIds: item.sourceId ? [item.sourceId] : [],
      evidenceItemIds: [item.id],
      evidenceInsightIds: [],
      appliesToModules: [],
      agentSlug: item.createdByAgent,
      freshnessStatus: item.freshnessStatus,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      record: item,
    };
  }
  if (recordType === "insight") {
    const insight = record as IntelligenceInsightRow;
    return {
      recordType,
      id: insight.id,
      title: insight.title,
      summary: insight.summary,
      approvalStatus: insight.approvalStatus,
      confidence: insight.confidence,
      priority: null,
      sourceIds: insight.sourceIds,
      evidenceItemIds: insight.evidenceItemIds,
      evidenceInsightIds: [insight.id],
      appliesToModules: insight.appliesToModules,
      agentSlug: insight.createdByAgent,
      freshnessStatus: insight.freshnessStatus,
      createdAt: insight.createdAt,
      updatedAt: insight.updatedAt,
      record: insight,
    };
  }

  const suggestion = record as IntelligenceSuggestionRow;
  return {
    recordType,
    id: suggestion.id,
    title: suggestion.title,
    summary: suggestion.rationale,
    approvalStatus: suggestion.approvalStatus,
    confidence: suggestion.confidence,
    priority: suggestion.priority,
    sourceIds: [],
    evidenceItemIds: suggestion.evidenceItemIds,
    evidenceInsightIds: suggestion.evidenceInsightIds,
    appliesToModules: [],
    agentSlug: suggestion.createdByAgent,
    freshnessStatus: null,
    createdAt: suggestion.createdAt,
    updatedAt: suggestion.updatedAt,
    record: suggestion,
  };
}

export function buildReviewMetadata(
  existing: Record<string, unknown>,
  input: z.output<typeof intelligenceReviewInputSchema>,
  now: Date,
): Record<string, unknown> {
  const history = Array.isArray(existing.reviewHistory) ? existing.reviewHistory : [];
  const review = {
    action: input.action,
    reviewedBy: input.reviewedBy,
    reason: input.reason ?? null,
    notes: input.notes ?? null,
    reviewedAt: now.toISOString(),
  };
  return { ...existing, review, reviewHistory: [...history, review] };
}

export function buildEditMetadata(
  existing: Record<string, unknown>,
  input: z.output<typeof intelligenceEditInputSchema>,
  now: Date,
): Record<string, unknown> {
  const history = Array.isArray(existing.editHistory) ? existing.editHistory : [];
  const edit = {
    editedBy: input.editedBy,
    notes: input.notes ?? null,
    editedAt: now.toISOString(),
    fields: Object.keys(input.patch),
  };
  return { ...existing, edit, editHistory: [...history, edit] };
}

export function buildMergeMetadata(
  existing: Record<string, unknown>,
  input: z.output<typeof intelligenceMergeInputSchema>,
  now: Date,
): Record<string, unknown> {
  return {
    ...existing,
    merge: {
      mergedIntoId: input.primaryId,
      mergedBy: input.mergedBy,
      reason: input.reason,
      mergedAt: now.toISOString(),
    },
  };
}

export function buildMemoryProposalFromIntelligence(input: {
  recordType: IntelligenceInboxRecordType;
  record: IntelligenceInboxRecord;
  affectedArea?: string;
  knowledgeType?: string;
  suggestedBankSlugs?: string[];
  proposedBy: string;
}) {
  const entry = normalizeIntelligenceInboxEntry(input.recordType, input.record);
  const sourceId = entry.sourceIds[0];
  const sourceIntakeRunId =
    input.recordType === "item" && typeof (input.record as IntelligenceItemRow).metadata.sourceIntakeRunId === "string"
      ? String((input.record as IntelligenceItemRow).metadata.sourceIntakeRunId)
      : undefined;
  const affectedArea = input.affectedArea ?? inferAffectedAreaForIntelligence(entry);
  const knowledgeType = input.knowledgeType ?? inferKnowledgeTypeForIntelligence(entry);

  return {
    proposedMemory: [
      entry.title,
      entry.summary,
      input.recordType === "insight" && (input.record as IntelligenceInsightRow).recommendation
        ? `Recommendation: ${(input.record as IntelligenceInsightRow).recommendation}`
        : null,
      input.recordType === "suggestion" ? `Proposed action: ${(input.record as IntelligenceSuggestionRow).proposedAction}` : null,
    ].filter(Boolean).join("\n\n"),
    reason: `Route ${input.recordType} ${entry.id} from the Intelligence Review Inbox into approved memory banks.`,
    sourceId,
    sourceIntakeRunId,
    affectedArea,
    knowledgeType,
    confidence: Number(entry.confidence),
    suggestedBankSlugs: input.suggestedBankSlugs ?? [],
    proposedBy: input.proposedBy,
  };
}

export function inferAffectedAreaForIntelligence(entry: IntelligenceInboxEntry): string {
  const joined = [entry.title, entry.summary, entry.recordType, ...entry.appliesToModules].join(" ").toLowerCase();
  if (joined.includes("seo") || joined.includes("blog") || joined.includes("keyword")) return "seo";
  if (joined.includes("offer") || joined.includes("pricing")) return "offer";
  if (joined.includes("design") || joined.includes("visual") || joined.includes("carousel")) return "design";
  if (joined.includes("competitor")) return "competitor";
  if (joined.includes("content") || joined.includes("hook") || joined.includes("caption")) return "content";
  return "research";
}

export function inferKnowledgeTypeForIntelligence(entry: IntelligenceInboxEntry): string {
  if (entry.recordType === "item") return (entry.record as IntelligenceItemRow).itemType;
  if (entry.recordType === "insight") return (entry.record as IntelligenceInsightRow).insightType;
  return (entry.record as IntelligenceSuggestionRow).suggestionType;
}
