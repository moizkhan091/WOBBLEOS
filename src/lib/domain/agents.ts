import { z } from "zod";
import { newId } from "@/lib/ids";

/**
 * Agent Registry (Chunk 52) - domain layer.
 * Every AI agent/sub-agent is a first-class, visible record. Every run is logged
 * (cost/quality/provenance) so the hive-mind is observable, not hidden.
 */
export const AGENT_STATUSES = ["active", "paused", "disabled"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const AGENT_COST_PROFILES = ["cheap", "mid", "strong", "vision"] as const;
export type AgentCostProfile = (typeof AGENT_COST_PROFILES)[number];

export const AGENT_CADENCES = ["manual", "schedule", "n8n"] as const;
export type AgentCadence = (typeof AGENT_CADENCES)[number];

export const AGENT_RUN_STATUSES = ["running", "succeeded", "failed"] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export interface AgentRow {
  id: string;
  slug: string;
  name: string;
  role: string;
  module: string;
  team: string | null;
  purpose: string;
  inputTypes: string[];
  outputTypes: string[];
  tools: string[];
  memoryBanks: string[];
  modelRole: string | null;
  costProfile: AgentCostProfile;
  cadence: AgentCadence;
  status: AgentStatus;
  qualityScore: string | null;
  lastRunAt: Date | null;
  runCount: number;
  failureCount: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentRunRow {
  id: string;
  agentId: string;
  agentSlug: string;
  jobId: string | null;
  status: AgentRunStatus;
  inputSummary: string | null;
  outputSummary: string | null;
  modelRunIds: string[];
  sourceIdsUsed: string[];
  memoryIdsUsed: string[];
  costEstimate: string | null;
  latencyMs: number | null;
  qualityScore: string | null;
  error: string | null;
  ownerScope: string | null;
  ownerId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  completedAt: Date | null;
}

export const registerAgentSchema = z.object({
  slug: z.string().trim().min(1).regex(/^[a-z0-9_]+$/, "slug must be lowercase letters/numbers/underscore"),
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  module: z.string().trim().min(1),
  team: z.string().trim().min(1).optional(),
  purpose: z.string().trim().min(1),
  inputTypes: z.array(z.string().trim().min(1)).default([]),
  outputTypes: z.array(z.string().trim().min(1)).default([]),
  tools: z.array(z.string().trim().min(1)).default([]),
  memoryBanks: z.array(z.string().trim().min(1)).default([]),
  modelRole: z.string().trim().min(1).optional(),
  costProfile: z.enum(AGENT_COST_PROFILES).default("mid"),
  cadence: z.enum(AGENT_CADENCES).default("manual"),
  // 'active' = has a real worker/graph that executes it. 'paused' = registered identity, not yet wired to run.
  status: z.enum(AGENT_STATUSES).default("active"),
});
export type RegisterAgentInput = z.input<typeof registerAgentSchema>;

export const recordAgentRunSchema = z.object({
  agentSlug: z.string().trim().min(1),
  status: z.enum(AGENT_RUN_STATUSES).default("succeeded"),
  jobId: z.string().trim().min(1).optional(),
  inputSummary: z.string().trim().min(1).optional(),
  outputSummary: z.string().trim().min(1).optional(),
  modelRunIds: z.array(z.string().trim().min(1)).default([]),
  sourceIdsUsed: z.array(z.string().trim().min(1)).default([]),
  memoryIdsUsed: z.array(z.string().trim().min(1)).default([]),
  costEstimate: z.number().nonnegative().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  qualityScore: z.number().min(0).max(10).optional(),
  error: z.string().trim().min(1).optional(),
  ownerScope: z.enum(["global", "company", "client", "project"]).optional(),
  ownerId: z.string().trim().min(1).optional(),
});
export type RecordAgentRunInput = z.input<typeof recordAgentRunSchema>;

export function buildAgentRow(input: RegisterAgentInput, opts: { now?: Date; id?: string } = {}): AgentRow {
  const p = registerAgentSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("agent"),
    slug: p.slug,
    name: p.name,
    role: p.role,
    module: p.module,
    team: p.team ?? null,
    purpose: p.purpose,
    inputTypes: p.inputTypes,
    outputTypes: p.outputTypes,
    tools: p.tools,
    memoryBanks: p.memoryBanks,
    modelRole: p.modelRole ?? null,
    costProfile: p.costProfile,
    cadence: p.cadence,
    status: p.status,
    qualityScore: null,
    lastRunAt: null,
    runCount: 0,
    failureCount: 0,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function buildAgentRunRow(agent: Pick<AgentRow, "id" | "slug">, input: RecordAgentRunInput, opts: { now?: Date; id?: string } = {}): AgentRunRow {
  const p = recordAgentRunSchema.parse(input);
  const now = opts.now ?? new Date();
  const finished = p.status !== "running";
  return {
    id: opts.id ?? newId("agentrun"),
    agentId: agent.id,
    agentSlug: agent.slug,
    jobId: p.jobId ?? null,
    status: p.status,
    inputSummary: p.inputSummary ?? null,
    outputSummary: p.outputSummary ?? null,
    modelRunIds: p.modelRunIds,
    sourceIdsUsed: p.sourceIdsUsed,
    memoryIdsUsed: p.memoryIdsUsed,
    costEstimate: p.costEstimate !== undefined ? String(p.costEstimate) : null,
    latencyMs: p.latencyMs ?? null,
    qualityScore: p.qualityScore !== undefined ? String(p.qualityScore) : null,
    error: p.error ?? null,
    ownerScope: p.ownerScope ?? null,
    ownerId: p.ownerId ?? null,
    metadata: {},
    createdAt: now,
    completedAt: finished ? now : null,
  };
}

/** Seed the agents we already run + the near-term creative/research team (visible from day one). */
export const DEFAULT_AGENTS: RegisterAgentInput[] = [
  { slug: "ask_wobble", name: "Ask WOBBLE", role: "router", module: "ask_wobble", team: "command", purpose: "Front-door command surface: answers from approved Brain + sources, routes actions.", inputTypes: ["question"], outputTypes: ["answer", "route"], tools: ["openrouter"], memoryBanks: ["global", "company"], modelRole: "ask_wobble", costProfile: "strong" },
  { slug: "content_worker", name: "Content Worker", role: "copywriter", module: "content_command", team: "content", purpose: "Generates WOBBLE content packets grounded in approved sources + memory (evolving into the multi-agent creative graph).", inputTypes: ["brief"], outputTypes: ["content_packet"], tools: ["openrouter"], memoryBanks: ["content", "brand"], modelRole: "content_strategy", costProfile: "strong" },
  { slug: "content_excellence_gate", name: "Content Excellence Gate", role: "qa", module: "content_command", team: "content", purpose: "Scores hooks/anti-fluff/CTA/proof/voice; blocks weak drafts from the founder queue.", inputTypes: ["content_packet"], outputTypes: ["score"], tools: [], memoryBanks: ["brand"], costProfile: "mid" },
  // Chunk 15 (evolution): the multi-agent content graph. Each node is a distinct, visible agent.
  { slug: "content_strategist", name: "Content Strategist", role: "strategist", module: "content_command", team: "content", purpose: "Creative director: decides topic/angle/format/platform against goals, brand brain, and knowledge (novelty-aware).", inputTypes: ["objective"], outputTypes: ["creative_brief"], tools: ["openrouter"], memoryBanks: ["content", "brand", "research"], modelRole: "content_strategy", costProfile: "strong" },
  { slug: "content_researcher", name: "Content Researcher", role: "research", module: "content_command", team: "content", purpose: "Pulls grounded evidence (knowledge notes + source chunks) for the brief; no claim without provenance.", inputTypes: ["creative_brief"], outputTypes: ["evidence_pack"], tools: ["openrouter"], memoryBanks: ["content", "research", "competitor"], modelRole: "content_research", costProfile: "mid" },
  { slug: "content_copywriter", name: "Content Copywriter", role: "copywriter", module: "content_command", team: "content", purpose: "Writes in-brand hook/caption/CTA/carousel copy with an inner draft→self-critique→revise loop.", inputTypes: ["creative_brief", "evidence_pack"], outputTypes: ["content_copy"], tools: ["openrouter"], memoryBanks: ["content", "brand", "founder_taste"], modelRole: "content_copywriting", costProfile: "strong" },
  { slug: "content_scorer", name: "Content Scorer", role: "qa", module: "content_command", team: "content", purpose: "Scores impact/brand-fit/platform-fit and gates post-worthiness before a pack reaches the founder.", inputTypes: ["content_copy"], outputTypes: ["score"], tools: ["openrouter"], memoryBanks: ["brand"], modelRole: "content_scoring", costProfile: "mid" },
  { slug: "dreamer", name: "WOBBLE Dreamer", role: "auditor", module: "intelligence", team: "intelligence", purpose: "Self-improvement auditor: proposes improvements from approvals/performance (approval-gated).", inputTypes: ["signals"], outputTypes: ["suggestion"], tools: ["openrouter"], memoryBanks: ["agent_learning", "performance"], costProfile: "strong", cadence: "schedule" },
  { slug: "knowledge_compiler", name: "Knowledge Compiler", role: "research", module: "learning_engine", team: "intelligence", purpose: "Karpathy-style: compiles approved sources into synthesized, deduped, interlinked knowledge notes routed to memory banks.", inputTypes: ["source"], outputTypes: ["knowledge_note"], tools: ["openrouter"], memoryBanks: ["research", "competitor", "content"], costProfile: "strong" },
  { slug: "memory_router", name: "Memory Router", role: "memory_router", module: "memory", team: "intelligence", purpose: "Decides which memory bank(s) extracted knowledge should feed; proposes placement for approval.", inputTypes: ["knowledge_note"], outputTypes: ["memory_placement"], tools: ["openrouter"], memoryBanks: [], costProfile: "cheap" },
  { slug: "source_intake_orchestrator", name: "Source Intake Orchestrator", role: "orchestrator", module: "source_registry", team: "intelligence", purpose: "Routes each source type through the correct scrape/transcript/vision/analyze workflow and records intake runs.", inputTypes: ["source"], outputTypes: ["source_intake_run"], tools: ["jobs", "n8n", "openrouter"], memoryBanks: ["research"], costProfile: "mid", cadence: "manual" },
  { slug: "competitor_scout", name: "Competitor Scout", role: "research", module: "source_registry", team: "intelligence", purpose: "Tracks competitor websites and social profiles for positioning, offers, formats, pricing, and market moves.", inputTypes: ["website", "social_profile"], outputTypes: ["intelligence_item"], tools: ["search_api", "n8n", "openrouter"], memoryBanks: ["competitor", "offer", "content"], costProfile: "mid", cadence: "schedule" },
  { slug: "social_content_analyst", name: "Social Content Analyst", role: "analyst", module: "source_registry", team: "content", purpose: "Extracts hooks, captions, formats, CTAs, comments, engagement, and why posts/reels/carousels work.", inputTypes: ["social_post", "reel", "carousel"], outputTypes: ["content_pattern"], tools: ["n8n", "openrouter"], memoryBanks: ["content", "audience_response"], costProfile: "strong" , status: "paused" },
  { slug: "transcript_analyst", name: "Transcript Analyst", role: "analyst", module: "source_registry", team: "intelligence", purpose: "Analyzes YouTube, podcast, webinar, ad, and reel transcripts into insights with source provenance.", inputTypes: ["transcript"], outputTypes: ["knowledge_note"], tools: ["n8n", "openrouter"], memoryBanks: ["research", "content"], costProfile: "mid" , status: "paused" },
  { slug: "visual_reference_analyst", name: "Visual Reference Analyst", role: "vision_analyst", module: "media_studio", team: "creative", purpose: "Creates structured visual descriptors for design references, carousels, posts, and reels without blending references.", inputTypes: ["image", "carousel", "video_frame"], outputTypes: ["style_descriptor"], tools: ["vision_model", "openrouter"], memoryBanks: ["design", "founder_taste"], costProfile: "vision" , status: "paused" },
  { slug: "website_seo_scout", name: "Website SEO Scout", role: "seo_research", module: "source_registry", team: "growth", purpose: "Extracts positioning, internal-link, keyword, page, funnel, and SEO signals from websites and blogs.", inputTypes: ["website", "blog", "search_console"], outputTypes: ["seo_insight"], tools: ["search_api", "n8n", "openrouter"], memoryBanks: ["seo", "offer", "research"], costProfile: "mid", cadence: "schedule" , status: "paused" },
  { slug: "source_quality_checker", name: "Source Quality Checker", role: "fact_checker", module: "source_registry", team: "intelligence", purpose: "Flags weak, duplicate, stale, conflicting, blocked, or low-trust sources before they influence memory.", inputTypes: ["source", "intelligence_item"], outputTypes: ["source_quality_score"], tools: ["openrouter"], memoryBanks: ["research"], costProfile: "cheap" , status: "paused" },
  // Not independently wired: its identity is currently a model-role alias used by the Intelligence
  // Analyst (runProvider role "performance_learning_agent"); no separate run path records it. Kept as
  // a registered-but-paused identity until it has its own execution path. See registry-integrity test.
  { slug: "performance_learning_agent", name: "Performance Learning Agent", role: "analyst", module: "intelligence", team: "growth", purpose: "Compares social, SEO, website, campaign, and client performance data over time and proposes improvements.", inputTypes: ["analytics", "performance_snapshot"], outputTypes: ["performance_insight"], tools: ["api_source", "openrouter"], memoryBanks: ["performance", "agent_learning"], costProfile: "mid", cadence: "schedule", status: "paused" },
  { slug: "market_researcher", name: "Market Researcher", role: "research", module: "research_radar", team: "intelligence", purpose: "Studies industries, buyer pain points, objections, positioning, competitors, and market shifts.", inputTypes: ["market_source", "community_source", "web_source"], outputTypes: ["market_insight"], tools: ["search_api", "openrouter"], memoryBanks: ["research", "market", "offer"], costProfile: "strong" , status: "paused" },
  { slug: "trend_radar", name: "Trend Radar", role: "research", module: "research_radar", team: "intelligence", purpose: "Tracks platform trends, format changes, audience behavior shifts, and new market opportunities.", inputTypes: ["feed", "platform_source"], outputTypes: ["trend_insight"], tools: ["rss", "search_api", "openrouter"], memoryBanks: ["trend", "content", "research"], costProfile: "mid", cadence: "schedule" , status: "paused" },
  { slug: "brand_voice_guardian", name: "Brand Voice Guardian", role: "qa", module: "wobble_brain", team: "brand", purpose: "Protects brand voice, do-not-say rules, claims, and tone across knowledge and outputs.", inputTypes: ["brand_reference", "output"], outputTypes: ["brand_review"], tools: ["openrouter"], memoryBanks: ["brand"], costProfile: "mid" , status: "paused" },
  { slug: "model_scout", name: "Model Scout", role: "auditor", module: "settings", team: "intelligence", purpose: "Watches the AI model landscape and proposes GENUINE model upgrades per role when a new model is actually better for that job. Always approval-gated; never force-swaps.", inputTypes: ["model_signal", "release_note"], outputTypes: ["model_upgrade_proposal"], tools: ["search_api", "openrouter"], memoryBanks: ["agent_learning"], costProfile: "mid", cadence: "schedule" , status: "paused" },
  { slug: "system_auditor", name: "System Auditor", role: "auditor", module: "settings", team: "intelligence", purpose: "Continuously audits every module, agent, prompt, and feature for weaknesses, gaps, stale logic, and upgrade opportunities; proposes improvements to the approval queue.", inputTypes: ["system_state"], outputTypes: ["suggestion"], tools: ["openrouter"], memoryBanks: ["agent_learning", "performance"], costProfile: "strong", cadence: "schedule" , status: "paused" },
  // Paid Audit team (McKinsey-depth). Each node is a distinct, visible agent — grounds in Brain + the Wobble service catalog.
  { slug: "audit_discovery_mapper", name: "Audit Discovery Mapper", role: "consultant", module: "paid_audit", team: "audit", purpose: "Maps a prospect's business into acquisition/delivery/support systems and pinpoints the real bottlenecks from stakeholder interviews.", inputTypes: ["intake_notes"], outputTypes: ["current_state_map"], tools: ["openrouter"], memoryBanks: ["company", "research"], modelRole: "audit_discovery", costProfile: "strong" },
  { slug: "audit_opportunity_finder", name: "Audit Opportunity Finder", role: "consultant", module: "paid_audit", team: "audit", purpose: "Identifies AI/automation opportunities across the process map, grounded in the full Wobble service catalog, rated by impact + difficulty.", inputTypes: ["current_state_map"], outputTypes: ["opportunity_set"], tools: ["openrouter"], memoryBanks: ["offer", "company"], modelRole: "audit_opportunity", costProfile: "strong" },
  { slug: "audit_prioritizer", name: "Audit Prioritizer", role: "analyst", module: "paid_audit", team: "audit", purpose: "Sorts opportunities onto an impact/difficulty matrix — quick wins vs big swings.", inputTypes: ["opportunity_set"], outputTypes: ["prioritization"], tools: ["openrouter"], memoryBanks: [], modelRole: "audit_prioritization", costProfile: "mid" },
  { slug: "audit_roadmap_architect", name: "Audit Roadmap Architect", role: "strategist", module: "paid_audit", team: "audit", purpose: "Builds the phased 12-month AI transformation roadmap: quick wins first, big swings sequenced.", inputTypes: ["prioritization"], outputTypes: ["roadmap"], tools: ["openrouter"], memoryBanks: ["offer"], modelRole: "audit_roadmap", costProfile: "strong" },
  { slug: "audit_report_writer", name: "Audit Report Writer", role: "consultant", module: "paid_audit", team: "audit", purpose: "Writes the executive summary + grounded ROI for the client leadership deck.", inputTypes: ["roadmap"], outputTypes: ["audit_report"], tools: ["openrouter"], memoryBanks: ["brand"], modelRole: "audit_report", costProfile: "strong" },
  { slug: "paid_audit_orchestrator", name: "Paid Audit Orchestrator", role: "orchestrator", module: "paid_audit", team: "audit", purpose: "Receives a Paid Audit department handoff, drives the 5 specialists through the runtime, aggregates the audit, and routes it to Proposal.", inputTypes: ["current_state_map"], outputTypes: ["business_audit"], tools: [], memoryBanks: ["company", "research", "offer", "brand"], modelRole: "default", costProfile: "mid", cadence: "manual" },
  { slug: "content_orchestrator", name: "Content Orchestrator", role: "orchestrator", module: "content_command", team: "content", purpose: "Receives a Content department handoff, drives strategy→research→copy→scoring through the runtime, and produces the approvable pack.", inputTypes: ["creative_brief"], outputTypes: ["content_pack"], tools: [], memoryBanks: ["content", "brand", "research", "founder_taste"], modelRole: "default", costProfile: "mid", cadence: "manual" },
  // Proposal & Solution Design team. The orchestrator runs the department policy (runProposalDepartment);
  // the solution architect synthesizes the technical design from the audit (real LLM judgment, budget-settled);
  // the deterministic createProposalFromAudit service does the write + fires the commercial chain on accept.
  { slug: "proposal_orchestrator", name: "Proposal Orchestrator", role: "orchestrator", module: "proposals", team: "commercial", purpose: "Receives a Paid Audit handoff, runs the solution architect, then the deterministic proposal service, and surfaces the proposal for founder approval.", inputTypes: ["business_audit"], outputTypes: ["proposal_artifact"], tools: [], memoryBanks: ["company", "offer", "research"], modelRole: "default", costProfile: "mid", cadence: "manual" },
  { slug: "proposal_solution_architect", name: "Proposal Solution Architect", role: "solution_architect", module: "proposals", team: "commercial", purpose: "Designs the technical solution, integration approach, ROI assumptions and delivery risks grounded in the audit's opportunities.", inputTypes: ["business_audit"], outputTypes: ["technical_solution"], tools: ["openrouter"], memoryBanks: ["company", "offer", "research"], modelRole: "content_strategy", costProfile: "strong" },
  { slug: "wobble_pitch_writer", name: "Pitch Writer", role: "consultant", module: "audit", team: "audit", purpose: "Writes the niche-customized Doc 1 pitch (what Wobble can do + free diagnosis) grounded in scraped signals.", inputTypes: ["diagnosis"], outputTypes: ["pitch"], tools: ["openrouter"], memoryBanks: ["brand", "offer"], modelRole: "pitch_writer", costProfile: "strong" },
  { slug: "audit_interview_planner", name: "Audit Interview Planner", role: "consultant", module: "audit", team: "audit", purpose: "Builds the internal Doc 2 interview roadmap (who to interview + what to ask) from the client pitch.", inputTypes: ["pitch"], outputTypes: ["interview_plan"], tools: ["openrouter"], memoryBanks: ["research"], modelRole: "audit_interview_planner", costProfile: "strong" },
  { slug: "intelligence_analyst", name: "Intelligence Analyst", role: "analyst", module: "intelligence", team: "intelligence", purpose: "Turns recent observations into approval-gated insight proposals.", inputTypes: ["intelligence_item"], outputTypes: ["intelligence_insight"], tools: ["openrouter"], memoryBanks: ["performance", "competitor"], modelRole: "performance_learning_agent", costProfile: "mid" },
];
