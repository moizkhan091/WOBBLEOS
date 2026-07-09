import { z } from "zod";
import { newId } from "@/lib/ids";

export type MemoryTier = "core" | "working" | "episodic";
export type TrustLevel = "founder_core" | "approved_expert" | "monitored" | "experimental" | "blocked";
export type QueryMode = "current" | "historical" | "include_archived";

export const MEMORY_TIERS = ["core", "working", "episodic"] as const;
export const MEMORY_TRUST_LEVELS = ["founder_core", "approved_expert", "monitored", "experimental", "blocked"] as const;
export const MEMORY_PROPOSAL_STATUSES = ["pending", "approved", "rejected"] as const;
export const MEMORY_BANK_SCOPES = ["global", "company", "client", "project", "competitor", "founder", "agent", "system"] as const;
export type MemoryProposalStatus = (typeof MEMORY_PROPOSAL_STATUSES)[number];
export type MemoryBankScope = (typeof MEMORY_BANK_SCOPES)[number];

export interface MemoryBankDefinition {
  slug: string;
  label: string;
  scope: MemoryBankScope;
  purpose: string;
  description: string;
  defaultTier: MemoryTier;
  allowedTrustLevels: TrustLevel[];
  ownerScope?: string;
  ownerId?: string;
  parentSlug?: string;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export const DEFAULT_MEMORY_BANKS: MemoryBankDefinition[] = [
  {
    slug: "global",
    label: "Global Knowledge",
    scope: "global",
    purpose: "Cross-company knowledge that can inform any WOBBLE OS module.",
    description: "High-level durable knowledge shared across the whole operating system.",
    defaultTier: "working",
    allowedTrustLevels: ["founder_core", "approved_expert", "monitored"],
    priority: 10,
  },
  {
    slug: "company",
    label: "WOBBLE Company",
    scope: "company",
    purpose: "Internal WOBBLE company truth, positioning, operating principles, and strategy.",
    description: "Company-level knowledge used by Ask WOBBLE, Decision Room, content, offers, and operations.",
    defaultTier: "core",
    allowedTrustLevels: ["founder_core", "approved_expert"],
    priority: 20,
  },
  {
    slug: "client",
    label: "Client Knowledge",
    scope: "client",
    purpose: "Reusable client-specific context before it is split into exact client/project banks.",
    description: "Client notes, requirements, outcomes, campaign context, and approved client intelligence.",
    defaultTier: "working",
    allowedTrustLevels: ["approved_expert", "monitored"],
    priority: 30,
  },
  {
    slug: "project",
    label: "Project Knowledge",
    scope: "project",
    purpose: "Current project and campaign details that should stay scoped.",
    description: "Active project plans, briefs, decisions, and temporary working context.",
    defaultTier: "working",
    allowedTrustLevels: ["approved_expert", "monitored", "experimental"],
    priority: 40,
  },
  {
    slug: "competitor",
    label: "Competitor Intelligence",
    scope: "competitor",
    purpose: "Competitor positioning, content, offers, funnels, pricing, and market moves.",
    description: "Approved competitor patterns and analysis from sources and research agents.",
    defaultTier: "episodic",
    allowedTrustLevels: ["approved_expert", "monitored", "experimental"],
    priority: 50,
  },
  {
    slug: "brand",
    label: "Brand Rules",
    scope: "company",
    purpose: "Voice, positioning, do-not-say, proof requirements, and brand guardrails.",
    description: "Rules that control how WOBBLE and client brands should sound and behave.",
    defaultTier: "core",
    allowedTrustLevels: ["founder_core", "approved_expert"],
    priority: 60,
  },
  {
    slug: "design",
    label: "Design Intelligence",
    scope: "company",
    purpose: "Visual taste, layout principles, design patterns, and creative direction.",
    description: "Approved design intelligence used by Media Studio, creative graph, and reference selection.",
    defaultTier: "working",
    allowedTrustLevels: ["founder_core", "approved_expert", "monitored"],
    priority: 70,
  },
  {
    slug: "content",
    label: "Content Strategy",
    scope: "company",
    purpose: "Content principles, angles, formats, captions, scripts, and platform strategy.",
    description: "Knowledge used by Content Command and future social/blog agents.",
    defaultTier: "working",
    allowedTrustLevels: ["founder_core", "approved_expert", "monitored"],
    priority: 80,
  },
  {
    slug: "seo",
    label: "SEO & Blog",
    scope: "company",
    purpose: "Search intent, keywords, blog performance, internal linking, and AEO/SEO learnings.",
    description: "SEO/blog intelligence used by the SEO & Blog Growth Engine.",
    defaultTier: "working",
    allowedTrustLevels: ["approved_expert", "monitored", "experimental"],
    priority: 90,
  },
  {
    slug: "offer",
    label: "Offer Intelligence",
    scope: "company",
    purpose: "Offers, pricing, guarantees, objections, bundles, positioning, and conversion angles.",
    description: "Knowledge that powers Offer Lab, sales strategy, and client offer recommendations.",
    defaultTier: "working",
    allowedTrustLevels: ["founder_core", "approved_expert", "monitored"],
    priority: 100,
  },
  {
    slug: "research",
    label: "Research",
    scope: "company",
    purpose: "Market research, trend analysis, source conclusions, and researched observations.",
    description: "General research memory before specialized banks consume it.",
    defaultTier: "episodic",
    allowedTrustLevels: ["approved_expert", "monitored", "experimental"],
    priority: 110,
  },
  {
    slug: "founder_taste",
    label: "Founder Taste",
    scope: "founder",
    purpose: "Shared founder taste and review signals that tune outputs within brand constraints.",
    description: "Cross-founder taste patterns, approvals, dislikes, and creative preference signals.",
    defaultTier: "working",
    allowedTrustLevels: ["founder_core", "approved_expert"],
    priority: 120,
  },
  {
    slug: "founder_moiz",
    label: "Moiz Taste",
    scope: "founder",
    purpose: "Moiz-specific preferences without overwriting global WOBBLE taste.",
    description: "Individual founder taste bank for approval/rejection learning.",
    defaultTier: "working",
    allowedTrustLevels: ["founder_core", "approved_expert"],
    ownerScope: "founder",
    ownerId: "moiz",
    parentSlug: "founder_taste",
    priority: 121,
  },
  {
    slug: "founder_ali",
    label: "Ali Taste",
    scope: "founder",
    purpose: "Ali-specific preferences without overwriting global WOBBLE taste.",
    description: "Individual founder taste bank for approval/rejection learning.",
    defaultTier: "working",
    allowedTrustLevels: ["founder_core", "approved_expert"],
    ownerScope: "founder",
    ownerId: "ali",
    parentSlug: "founder_taste",
    priority: 122,
  },
  {
    slug: "founder_ibrahim",
    label: "Ibrahim Taste",
    scope: "founder",
    purpose: "Ibrahim-specific preferences without overwriting global WOBBLE taste.",
    description: "Individual founder taste bank for approval/rejection learning.",
    defaultTier: "working",
    allowedTrustLevels: ["founder_core", "approved_expert"],
    ownerScope: "founder",
    ownerId: "ibrahim",
    parentSlug: "founder_taste",
    priority: 123,
  },
  {
    slug: "founder_haad",
    label: "Haad Taste",
    scope: "founder",
    purpose: "Haad-specific preferences without overwriting global WOBBLE taste.",
    description: "Individual founder taste bank for approval/rejection learning.",
    defaultTier: "working",
    allowedTrustLevels: ["founder_core", "approved_expert"],
    ownerScope: "founder",
    ownerId: "haad",
    parentSlug: "founder_taste",
    priority: 124,
  },
  {
    slug: "rejected_ideas",
    label: "Rejected Ideas",
    scope: "company",
    purpose: "Rejected outputs and reasons so the OS learns what not to repeat.",
    description: "Rejected ideas remain learnable context, not trusted truth.",
    defaultTier: "episodic",
    allowedTrustLevels: ["monitored", "experimental"],
    priority: 130,
  },
  {
    slug: "approved_output",
    label: "Approved Output",
    scope: "company",
    purpose: "Approved content, strategies, creative, offers, and deliverables.",
    description: "Examples of work that passed founder/client review.",
    defaultTier: "episodic",
    allowedTrustLevels: ["founder_core", "approved_expert"],
    priority: 140,
  },
  {
    slug: "performance",
    label: "Performance Results",
    scope: "company",
    purpose: "Content, SEO, website, campaign, and offer performance data.",
    description: "Result memory that future agents use to adapt strategy.",
    defaultTier: "working",
    allowedTrustLevels: ["approved_expert", "monitored"],
    priority: 150,
  },
  {
    slug: "agent_learning",
    label: "Agent Learning",
    scope: "agent",
    purpose: "Quality, failure, and improvement signals for WOBBLE OS agents.",
    description: "What agents did well or poorly, including QA and review history.",
    defaultTier: "working",
    allowedTrustLevels: ["approved_expert", "monitored"],
    priority: 160,
  },
  {
    slug: "hook_library",
    label: "Hook Library",
    scope: "company",
    purpose: "Winning and failed hooks with context, performance, and source proof.",
    description: "Creative sub-bank read by content agents.",
    defaultTier: "working",
    allowedTrustLevels: ["approved_expert", "monitored", "experimental"],
    parentSlug: "content",
    priority: 170,
  },
  {
    slug: "visual_reference",
    label: "Visual Reference Library",
    scope: "company",
    purpose: "Approved visual references and design descriptors.",
    description: "Creative sub-bank read by Media Studio and image-prompt agents.",
    defaultTier: "working",
    allowedTrustLevels: ["founder_core", "approved_expert", "monitored"],
    parentSlug: "design",
    priority: 180,
  },
  {
    slug: "carousel_structure",
    label: "Carousel Structure",
    scope: "company",
    purpose: "Carousel layout, slide flow, copy pacing, and visual hierarchy patterns.",
    description: "Carousel-specific intelligence from approved posts and references.",
    defaultTier: "working",
    allowedTrustLevels: ["approved_expert", "monitored", "experimental"],
    parentSlug: "content",
    priority: 190,
  },
  {
    slug: "ad_inspiration",
    label: "Ad Inspiration",
    scope: "company",
    purpose: "Paid social angles, ad concepts, offers, and creative inspiration.",
    description: "Ad intelligence used by content, offer, and media agents.",
    defaultTier: "working",
    allowedTrustLevels: ["approved_expert", "monitored", "experimental"],
    priority: 200,
  },
  {
    slug: "audience_response",
    label: "Audience Response",
    scope: "company",
    purpose: "Comments, objections, sentiment, reactions, and voice-of-customer language.",
    description: "Audience intelligence used by content, strategy, and offer agents.",
    defaultTier: "working",
    allowedTrustLevels: ["approved_expert", "monitored", "experimental"],
    priority: 210,
  },
];

export interface MemoryChunkCandidate {
  id: string;
  similarity: number;
  tier: MemoryTier;
  trustLevel: TrustLevel;
  createdAt: string;
  archived: boolean;
  pinned?: boolean;
}

export interface RankedMemoryChunk extends MemoryChunkCandidate {
  score: number;
}

export const memoryBankInputSchema = z.object({
  slug: z.string().trim().min(1).regex(/^[a-z0-9_]+$/, "memory bank slug must use lowercase letters, numbers, and underscores"),
  label: z.string().trim().min(1),
  scope: z.enum(MEMORY_BANK_SCOPES),
  purpose: z.string().trim().min(1),
  description: z.string().trim().min(1),
  defaultTier: z.enum(MEMORY_TIERS),
  allowedTrustLevels: z.array(z.enum(MEMORY_TRUST_LEVELS)).min(1),
  ownerScope: z.string().trim().min(1).optional(),
  ownerId: z.string().trim().min(1).optional(),
  parentSlug: z.string().trim().min(1).optional(),
  priority: z.number().int().positive().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type MemoryBankInput = z.input<typeof memoryBankInputSchema>;

export interface MemoryBankRow {
  id: string;
  slug: string;
  label: string;
  scope: MemoryBankScope;
  purpose: string;
  description: string;
  defaultTier: MemoryTier;
  allowedTrustLevels: TrustLevel[];
  ownerScope: string | null;
  ownerId: string | null;
  parentSlug: string | null;
  status: "active" | "archived";
  priority: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export function buildMemoryBankRow(input: MemoryBankInput, opts: { id?: string; now?: Date } = {}): MemoryBankRow {
  const parsed = memoryBankInputSchema.parse(input);
  const now = opts.now ?? new Date();

  return {
    id: opts.id ?? newId("memorybank"),
    slug: parsed.slug,
    label: parsed.label,
    scope: parsed.scope,
    purpose: parsed.purpose,
    description: parsed.description,
    defaultTier: parsed.defaultTier,
    allowedTrustLevels: parsed.allowedTrustLevels,
    ownerScope: parsed.ownerScope ?? null,
    ownerId: parsed.ownerId ?? null,
    parentSlug: parsed.parentSlug ?? null,
    status: "active",
    priority: parsed.priority ?? 100,
    metadata: parsed.metadata,
    createdAt: now,
    updatedAt: now,
  };
}

export const memoryBankLinkInputSchema = z.object({
  memoryBankSlug: z.string().trim().min(1),
  memoryRecordId: z.string().trim().min(1).optional(),
  memoryChunkId: z.string().trim().min(1).optional(),
  sourceId: z.string().trim().min(1).optional(),
  proposalId: z.string().trim().min(1).optional(),
  linkType: z.string().trim().min(1).default("membership"),
  createdBy: z.string().trim().min(1).optional(),
});

export type MemoryBankLinkInput = z.input<typeof memoryBankLinkInputSchema>;

export interface MemoryBankLinkRow {
  id: string;
  memoryBankSlug: string;
  memoryRecordId: string | null;
  memoryChunkId: string | null;
  sourceId: string | null;
  proposalId: string | null;
  linkType: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function buildMemoryBankLinkRow(
  input: MemoryBankLinkInput,
  opts: { id?: string; now?: Date } = {},
): MemoryBankLinkRow {
  const parsed = memoryBankLinkInputSchema.parse(input);
  if (!parsed.memoryRecordId && !parsed.memoryChunkId) {
    throw new Error("memory bank link requires memoryRecordId or memoryChunkId");
  }
  const now = opts.now ?? new Date();

  return {
    id: opts.id ?? newId("memorybanklink"),
    memoryBankSlug: parsed.memoryBankSlug,
    memoryRecordId: parsed.memoryRecordId ?? null,
    memoryChunkId: parsed.memoryChunkId ?? null,
    sourceId: parsed.sourceId ?? null,
    proposalId: parsed.proposalId ?? null,
    linkType: parsed.linkType,
    createdBy: parsed.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export const memoryRecordInputSchema = z.object({
  slug: z.string().trim().min(1),
  title: z.string().trim().min(1),
  memoryTier: z.enum(MEMORY_TIERS),
  area: z.string().trim().min(1),
  content: z.string().trim().min(1),
  sourceId: z.string().trim().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  approvedBy: z.string().trim().min(1).optional(),
  bankSlugs: z.array(z.string().trim().min(1)).optional(),
});

export type MemoryRecordInput = z.input<typeof memoryRecordInputSchema>;

export interface MemoryRecordRow {
  id: string;
  slug: string;
  title: string;
  memoryTier: MemoryTier;
  area: string;
  content: string;
  status: "active" | "archived";
  sourceId: string | null;
  confidence: string | null;
  bankSlugs: string[];
  approvedBy: string | null;
  approvedAt: Date | null;
  archivedAt: Date | null;
  purgeAfter: Date | null;
  reviewAfter: Date | null;
  lastReviewedAt: Date | null;
  pinned: boolean;
  importance: number;
  createdAt: Date;
  updatedAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long a memory stays "fresh" before a founder is prompted to re-confirm it. */
export const REVIEW_INTERVAL_MS_BY_TIER: Record<MemoryTier, number> = {
  core: 180 * DAY_MS,
  working: 60 * DAY_MS,
  episodic: 30 * DAY_MS,
};
export function computeReviewAfter(tier: MemoryTier, now: Date): Date {
  return new Date(now.getTime() + REVIEW_INTERVAL_MS_BY_TIER[tier]);
}

export function buildMemoryRecordRow(
  input: MemoryRecordInput,
  opts: { id?: string; now?: Date } = {},
): MemoryRecordRow {
  const parsed = memoryRecordInputSchema.parse(input);
  const now = opts.now ?? new Date();

  return {
    id: opts.id ?? newId("memory"),
    slug: parsed.slug,
    title: parsed.title,
    memoryTier: parsed.memoryTier,
    area: parsed.area,
    content: parsed.content,
    status: "active",
    sourceId: parsed.sourceId ?? null,
    confidence: parsed.confidence !== undefined ? String(parsed.confidence) : null,
    bankSlugs: parsed.bankSlugs?.length ? parsed.bankSlugs : [parsed.area],
    approvedBy: parsed.approvedBy ?? null,
    approvedAt: parsed.approvedBy ? now : null,
    archivedAt: null,
    purgeAfter: null,
    reviewAfter: computeReviewAfter(parsed.memoryTier, now),
    lastReviewedAt: null,
    pinned: false,
    importance: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export interface MemoryRecordVersionRow {
  id: string;
  memoryRecordId: string;
  versionNumber: number;
  title: string;
  content: string;
  editedBy: string | null;
  changeReason: string | null;
  createdAt: Date;
}

export function buildMemoryRecordVersionRow(
  input: { memoryRecordId: string; versionNumber: number; title: string; content: string; editedBy?: string; changeReason?: string },
  opts: { id?: string; now?: Date } = {},
): MemoryRecordVersionRow {
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("memver"),
    memoryRecordId: input.memoryRecordId,
    versionNumber: input.versionNumber,
    title: input.title,
    content: input.content,
    editedBy: input.editedBy ?? null,
    changeReason: input.changeReason ?? null,
    createdAt: now,
  };
}

/** Soft-delete grace window (48h) during which an archived memory can be restored before purge. */
export const MEMORY_PURGE_GRACE_MS = 48 * 60 * 60 * 1000;

// ---- Dedup + conflict detection on write ----

/** At/above this cosine similarity a new memory is treated as a duplicate (skip, don't pile up). */
export const MEMORY_DUPLICATE_THRESHOLD = 0.93;
/** Between conflict and duplicate: similar-but-different → flag for the founder to resolve. */
export const MEMORY_CONFLICT_THRESHOLD = 0.82;

export type MemoryWriteVerdict = "new" | "duplicate" | "conflict";

export interface RelatedMemory {
  recordId: string;
  content: string;
  similarity: number;
}

export interface MemoryWriteClassification {
  verdict: MemoryWriteVerdict;
  topSimilarity: number;
  relatedRecordId: string | null;
}

/** Decide whether a new memory is genuinely new, a duplicate, or a conflict, from its nearest neighbours. */
export function classifyMemoryWrite(related: RelatedMemory[]): MemoryWriteClassification {
  const top = related.reduce<RelatedMemory | null>((best, r) => (!best || r.similarity > best.similarity ? r : best), null);
  if (!top) return { verdict: "new", topSimilarity: 0, relatedRecordId: null };
  if (top.similarity >= MEMORY_DUPLICATE_THRESHOLD) return { verdict: "duplicate", topSimilarity: top.similarity, relatedRecordId: top.recordId };
  if (top.similarity >= MEMORY_CONFLICT_THRESHOLD) return { verdict: "conflict", topSimilarity: top.similarity, relatedRecordId: top.recordId };
  return { verdict: "new", topSimilarity: top.similarity, relatedRecordId: null };
}

export type ConflictResolution = "keep_new" | "keep_existing" | "keep_both" | "merged";

export interface MemoryConflictRow {
  id: string;
  newRecordId: string;
  existingRecordId: string;
  bankSlug: string | null;
  similarity: string | null;
  status: string;
  resolution: string | null;
  detectedBy: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export function buildMemoryConflictRow(
  input: { newRecordId: string; existingRecordId: string; bankSlug?: string | null; similarity?: number; detectedBy?: string; metadata?: Record<string, unknown> },
  opts: { id?: string; now?: Date } = {},
): MemoryConflictRow {
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("memconflict"),
    newRecordId: input.newRecordId,
    existingRecordId: input.existingRecordId,
    bankSlug: input.bankSlug ?? null,
    similarity: input.similarity !== undefined ? String(input.similarity) : null,
    status: "open",
    resolution: null,
    detectedBy: input.detectedBy ?? null,
    resolvedBy: null,
    resolvedAt: null,
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
}

export const memoryChunkInputSchema = z.object({
  memoryRecordId: z.string().trim().min(1).optional(),
  content: z.string().trim().min(1),
  memoryTier: z.enum(MEMORY_TIERS),
  trustLevel: z.enum(MEMORY_TRUST_LEVELS),
  sourceId: z.string().trim().min(1).optional(),
  parentEntityId: z.string().trim().min(1).optional(),
  entityType: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  bankSlugs: z.array(z.string().trim().min(1)).optional(),
  sourceTimestamp: z.coerce.date().optional(),
});

export type MemoryChunkInput = z.input<typeof memoryChunkInputSchema>;

export interface MemoryChunkRow {
  id: string;
  memoryRecordId: string | null;
  content: string;
  embedding: number[] | null;
  memoryTier: MemoryTier;
  trustLevel: TrustLevel;
  sourceId: string | null;
  parentEntityId: string | null;
  entityType: string | null;
  status: "active" | "archived";
  archived: boolean;
  pinned: boolean;
  tags: string[];
  bankSlugs: string[];
  sourceTimestamp: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function buildMemoryChunkRows(
  input: MemoryChunkInput,
  opts: { ids?: string[]; now?: Date } = {},
): MemoryChunkRow[] {
  const parsed = memoryChunkInputSchema.parse(input);
  const now = opts.now ?? new Date();

  return [
    {
      id: opts.ids?.[0] ?? newId("memorychunk"),
      memoryRecordId: parsed.memoryRecordId ?? null,
      content: parsed.content,
      embedding: null,
      memoryTier: parsed.memoryTier,
      trustLevel: parsed.trustLevel,
      sourceId: parsed.sourceId ?? null,
      parentEntityId: parsed.parentEntityId ?? parsed.memoryRecordId ?? null,
      entityType: parsed.entityType ?? null,
      status: "active",
      archived: false,
      tags: parsed.tags,
      bankSlugs: parsed.bankSlugs?.length ? parsed.bankSlugs : parsed.tags,
      pinned: false,
      sourceTimestamp: parsed.sourceTimestamp ?? null,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export const memoryUpdateProposalInputSchema = z.object({
  proposedMemory: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  sourceId: z.string().trim().min(1).optional(),
  sourceIntakeRunId: z.string().trim().min(1).optional(),
  affectedArea: z.string().trim().min(1),
  knowledgeType: z.string().trim().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  suggestedBankSlugs: z.array(z.string().trim().min(1)).default([]),
  routerReason: z.string().trim().min(1).optional(),
  routerConfidence: z.number().min(0).max(1).optional(),
});

export type MemoryUpdateProposalInput = z.input<typeof memoryUpdateProposalInputSchema>;

export interface MemoryUpdateProposalRow {
  id: string;
  proposedMemory: string;
  reason: string;
  sourceId: string | null;
  sourceIntakeRunId: string | null;
  affectedArea: string;
  knowledgeType: string | null;
  confidence: string | null;
  suggestedBankSlugs: string[];
  approvedBankSlugs: string[];
  routerReason: string | null;
  routerConfidence: string | null;
  approvalId: string | null;
  status: MemoryProposalStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectedBy: string | null;
  rejectedAt: Date | null;
  rejectedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function buildMemoryUpdateProposalRow(
  input: MemoryUpdateProposalInput,
  opts: { id?: string; now?: Date } = {},
): MemoryUpdateProposalRow {
  const parsed = memoryUpdateProposalInputSchema.parse(input);
  const now = opts.now ?? new Date();

  return {
    id: opts.id ?? newId("memproposal"),
    proposedMemory: parsed.proposedMemory,
    reason: parsed.reason,
    sourceId: parsed.sourceId ?? null,
    sourceIntakeRunId: parsed.sourceIntakeRunId ?? null,
    affectedArea: parsed.affectedArea,
    knowledgeType: parsed.knowledgeType ?? null,
    confidence: parsed.confidence !== undefined ? String(parsed.confidence) : null,
    suggestedBankSlugs: parsed.suggestedBankSlugs,
    approvedBankSlugs: [],
    routerReason: parsed.routerReason ?? null,
    routerConfidence: parsed.routerConfidence !== undefined ? String(parsed.routerConfidence) : null,
    approvalId: null,
    status: "pending",
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectedReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface RetrievalMemoryChunk extends MemoryChunkCandidate {
  memoryRecordId: string | null;
  content: string;
  sourceId: string | null;
  parentEntityId: string | null;
  entityType: string | null;
  status: "active" | "archived";
  tags: string[];
  bankSlugs: string[];
}

export type RankedRetrievalMemoryChunk = RetrievalMemoryChunk & { score: number };

export const memoryBankRoutingInputSchema = z.object({
  content: z.string().trim().min(1),
  affectedArea: z.string().trim().min(1).optional(),
  knowledgeType: z.string().trim().min(1).optional(),
  sourceType: z.string().trim().min(1).optional(),
  sourceId: z.string().trim().min(1).optional(),
  sourceIntakeRunId: z.string().trim().min(1).optional(),
  ownerScope: z.string().trim().min(1).optional(),
  ownerId: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  candidateBankSlugs: z.array(z.string().trim().min(1)).default([]),
  maxBanks: z.number().int().positive().max(12).default(6),
});

export type MemoryBankRoutingInput = z.input<typeof memoryBankRoutingInputSchema>;

export interface MemoryBankRoutingSuggestion {
  bankSlugs: string[];
  reason: string;
  confidence: number;
  needsApproval: true;
}

const sourceTypeBankHints: Record<string, string[]> = {
  website: ["brand", "offer", "seo", "design", "research"],
  blog: ["seo", "content", "research"],
  rss_feed: ["research", "content", "seo"],
  youtube_video: ["content", "research", "hook_library"],
  youtube_channel: ["content", "research", "competitor"],
  instagram_reel: ["content", "hook_library", "competitor", "audience_response", "ad_inspiration"],
  instagram_post: ["content", "competitor", "audience_response"],
  instagram_carousel: ["content", "design", "carousel_structure", "visual_reference", "competitor"],
  instagram_profile: ["competitor", "content", "brand"],
  tiktok_video: ["content", "hook_library", "competitor", "audience_response"],
  tiktok_profile: ["competitor", "content", "brand"],
  reddit_post: ["audience_response", "research", "content"],
  reddit_thread_feed: ["audience_response", "research", "content"],
  competitor_website: ["competitor", "offer", "seo", "brand", "design"],
  competitor_social_profile: ["competitor", "content", "hook_library", "audience_response"],
  design_reference: ["design", "visual_reference"],
  brand_reference: ["brand", "design", "company"],
  market_research_source: ["research", "competitor", "offer"],
  client_source: ["client", "project", "brand"],
  internal_company_document: ["company", "brand"],
  uploaded_file: ["research"],
  manual_note: ["company", "research"],
  api_source: ["research", "performance"],
  n8n_source: ["research", "agent_learning"],
};

const keywordBankHints: Array<{ bank: string; patterns: RegExp[] }> = [
  { bank: "hook_library", patterns: [/\bhook\b/i, /\bopening line\b/i, /\battention\b/i] },
  { bank: "visual_reference", patterns: [/\bvisual\b/i, /\bdesign\b/i, /\blayout\b/i, /\btypography\b/i, /\bimage\b/i] },
  { bank: "carousel_structure", patterns: [/\bcarousel\b/i, /\bslide\b/i] },
  { bank: "audience_response", patterns: [/\bcomment\b/i, /\bsentiment\b/i, /\baudience\b/i, /\bobjection\b/i] },
  { bank: "seo", patterns: [/\bseo\b/i, /\bkeyword\b/i, /\bsearch intent\b/i, /\branking\b/i, /\bblog\b/i] },
  { bank: "offer", patterns: [/\boffer\b/i, /\bpricing\b/i, /\bguarantee\b/i, /\bpackage\b/i] },
  { bank: "performance", patterns: [/\bperformance\b/i, /\btraffic\b/i, /\bconversion\b/i, /\bengagement\b/i, /\bctr\b/i] },
  { bank: "brand", patterns: [/\bbrand\b/i, /\bvoice\b/i, /\bpositioning\b/i, /\bdo not say\b/i] },
  { bank: "founder_taste", patterns: [/\bfounder\b/i, /\btaste\b/i, /\bapproved by\b/i, /\brejected by\b/i] },
  { bank: "agent_learning", patterns: [/\bagent\b/i, /\bworker\b/i, /\bquality score\b/i, /\bfailure\b/i] },
  { bank: "rejected_ideas", patterns: [/\breject/i, /\bunusable\b/i, /\bbad idea\b/i] },
];

function pushUnique(target: string[], values: string[]) {
  for (const value of values) {
    const clean = value.trim();
    if (clean && !target.includes(clean)) target.push(clean);
  }
}

export function suggestMemoryBanks(
  input: MemoryBankRoutingInput,
  availableBanks: Pick<MemoryBankRow, "slug" | "status">[] = DEFAULT_MEMORY_BANKS.map((bank) => ({
    slug: bank.slug,
    status: "active" as const,
  })),
): MemoryBankRoutingSuggestion {
  const parsed = memoryBankRoutingInputSchema.parse(input);
  const activeSlugs = new Set(availableBanks.filter((bank) => bank.status === "active").map((bank) => bank.slug));
  const candidates = parsed.candidateBankSlugs.length ? new Set(parsed.candidateBankSlugs.filter((slug) => activeSlugs.has(slug))) : activeSlugs;
  const picked: string[] = [];

  if (parsed.affectedArea && candidates.has(parsed.affectedArea)) pushUnique(picked, [parsed.affectedArea]);
  if (parsed.knowledgeType && candidates.has(parsed.knowledgeType)) pushUnique(picked, [parsed.knowledgeType]);
  if (parsed.ownerScope === "client" && candidates.has("client")) pushUnique(picked, ["client"]);
  if (parsed.ownerScope === "project" && candidates.has("project")) pushUnique(picked, ["project"]);
  if (parsed.ownerScope === "founder" && candidates.has("founder_taste")) pushUnique(picked, ["founder_taste"]);
  if (parsed.sourceType && sourceTypeBankHints[parsed.sourceType]) pushUnique(picked, sourceTypeBankHints[parsed.sourceType].filter((slug) => candidates.has(slug)));

  const searchable = `${parsed.content} ${parsed.tags.join(" ")} ${parsed.affectedArea ?? ""} ${parsed.knowledgeType ?? ""}`;
  for (const hint of keywordBankHints) {
    if (hint.patterns.some((pattern) => pattern.test(searchable)) && candidates.has(hint.bank)) pushUnique(picked, [hint.bank]);
  }

  if (!picked.length && candidates.has("research")) pushUnique(picked, ["research"]);
  if (!picked.length && candidates.has("global")) pushUnique(picked, ["global"]);

  const bankSlugs = picked.slice(0, parsed.maxBanks);
  const signalCount = bankSlugs.length + (parsed.sourceType ? 1 : 0) + (parsed.affectedArea ? 1 : 0) + parsed.tags.length;
  return {
    bankSlugs,
    reason:
      bankSlugs.length > 0
        ? `Suggested ${bankSlugs.join(", ")} from source type, affected area, tags, and content signals. Founder approval is still required before storage.`
        : "No confident bank match was found; founder should choose a bank manually.",
    confidence: Math.min(0.92, Math.max(0.42, 0.48 + signalCount * 0.06)),
    needsApproval: true,
  };
}

/** Pinned/important memories get a strong ranking boost so they surface reliably. */
const PIN_BOOST = 0.25;

const tierBoost: Record<MemoryTier, number> = {
  core: 0.18,
  working: 0.1,
  episodic: 0,
};

const trustBoost: Record<TrustLevel, number> = {
  founder_core: 0.2,
  approved_expert: 0.12,
  monitored: 0.04,
  experimental: -0.06,
  blocked: -999,
};

function recencyScore(createdAt: string, now: Date, queryMode: QueryMode): number {
  if (queryMode === "historical" || queryMode === "include_archived") return 0;
  const ageMs = Math.max(0, now.getTime() - new Date(createdAt).getTime());
  const ageDays = ageMs / 86_400_000;
  return Math.max(-0.14, 0.12 - ageDays * 0.0002);
}

export function rankMemoryChunks<T extends MemoryChunkCandidate>(input: {
  chunks: T[];
  now: Date;
  queryMode: QueryMode;
}): Array<T & { score: number }> {
  return input.chunks
    .filter((chunk) => chunk.trustLevel !== "blocked")
    .filter((chunk) => input.queryMode === "include_archived" || !chunk.archived)
    .map((chunk) => ({
      ...chunk,
      score:
        chunk.similarity +
        tierBoost[chunk.tier] +
        trustBoost[chunk.trustLevel] +
        recencyScore(chunk.createdAt, input.now, input.queryMode) +
        (chunk.pinned ? PIN_BOOST : 0),
    }))
    .sort((a, b) => b.score - a.score);
}

// ---- Founder-scoped edit permissions for direct memory management ----

function normalizeFounderKey(actor?: string | null): string {
  return (actor ?? "").trim().toLowerCase().replace(/^founder[_-]?/, "");
}

/** If a bank is a specific founder's OWNED personal bank, return that founder key (founder_taste is shared → null). */
export function personalBankOwner(bankSlug: string): string | null {
  const match = bankSlug.match(/^founder_(.+)$/);
  if (!match || match[1] === "taste") return null;
  return match[1];
}

export interface MemoryEditPermission {
  allowed: boolean;
  reason: string;
}

/**
 * A founder may edit shared banks (audited) and their OWN personal bank, but never
 * another founder's personal bank. Applied across every bank a record belongs to.
 */
export function canEditMemoryBanks(actor: string | undefined, bankSlugs: string[]): MemoryEditPermission {
  const actorKey = normalizeFounderKey(actor);
  for (const bank of bankSlugs) {
    const owner = personalBankOwner(bank);
    if (owner && owner !== actorKey) {
      return { allowed: false, reason: `'${bank}' is ${owner}'s personal memory bank and can only be edited by ${owner}.` };
    }
  }
  return { allowed: true, reason: "ok" };
}
