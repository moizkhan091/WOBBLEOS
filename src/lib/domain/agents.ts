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
    status: "active",
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
  { slug: "dreamer", name: "WOBBLE Dreamer", role: "auditor", module: "intelligence", team: "intelligence", purpose: "Self-improvement auditor: proposes improvements from approvals/performance (approval-gated).", inputTypes: ["signals"], outputTypes: ["suggestion"], tools: ["openrouter"], memoryBanks: ["agent_learning", "performance"], costProfile: "strong", cadence: "schedule" },
  { slug: "knowledge_compiler", name: "Knowledge Compiler", role: "research", module: "learning_engine", team: "intelligence", purpose: "Karpathy-style: compiles approved sources into synthesized, deduped, interlinked knowledge notes routed to memory banks.", inputTypes: ["source"], outputTypes: ["knowledge_note"], tools: ["openrouter"], memoryBanks: ["research", "competitor", "content"], costProfile: "strong" },
  { slug: "memory_router", name: "Memory Router", role: "memory_router", module: "memory", team: "intelligence", purpose: "Decides which memory bank(s) extracted knowledge should feed; proposes placement for approval.", inputTypes: ["knowledge_note"], outputTypes: ["memory_placement"], tools: ["openrouter"], memoryBanks: [], costProfile: "cheap" },
];
