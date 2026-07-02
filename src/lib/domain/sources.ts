import { z } from "zod";
import { newId } from "@/lib/ids";

export const SOURCE_APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type SourceApprovalStatus = (typeof SOURCE_APPROVAL_STATUSES)[number];

export const SOURCE_RECORD_STATUSES = ["active", "archived"] as const;
export type SourceRecordStatus = (typeof SOURCE_RECORD_STATUSES)[number];

export const SOURCE_OWNER_SCOPES = ["global", "company", "client", "project"] as const;
export type SourceOwnerScope = (typeof SOURCE_OWNER_SCOPES)[number];

export const SOURCE_PROCESSING_STATUSES = [
  "pending_approval",
  "ready",
  "queued",
  "scraping",
  "analyzing",
  "routed",
  "succeeded",
  "failed",
  "archived",
] as const;
export type SourceProcessingStatus = (typeof SOURCE_PROCESSING_STATUSES)[number];

export const SOURCE_REFRESH_FREQUENCIES = ["manual", "hourly", "daily", "weekly", "monthly", "never"] as const;
export type SourceRefreshFrequency = (typeof SOURCE_REFRESH_FREQUENCIES)[number];

export const SOURCE_INTAKE_TRIGGERS = ["manual", "n8n", "schedule", "agent"] as const;
export type SourceIntakeTrigger = (typeof SOURCE_INTAKE_TRIGGERS)[number];

export const SOURCE_INTAKE_STATUSES = ["queued", "scraping", "analyzing", "routed", "succeeded", "failed", "cancelled"] as const;
export type SourceIntakeStatus = (typeof SOURCE_INTAKE_STATUSES)[number];

export interface SourceTrustLevel {
  id: string;
  slug: string;
  label: string;
  priority: number;
  canUpdateBrain: boolean;
}

export interface ResolvedSourceTrust extends SourceTrustLevel {
  isBlocked: boolean;
}

export const DEFAULT_SOURCE_TRUST_LEVELS: SourceTrustLevel[] = [
  {
    id: "trust_tier_1_core_wobble",
    slug: "tier_1_core_wobble",
    label: "Tier 1: Core WOBBLE",
    priority: 1,
    canUpdateBrain: true,
  },
  {
    id: "trust_tier_2_approved_expert",
    slug: "tier_2_approved_expert",
    label: "Tier 2: Approved Expert",
    priority: 2,
    canUpdateBrain: false,
  },
  {
    id: "trust_tier_3_monitored",
    slug: "tier_3_monitored",
    label: "Tier 3: Monitored",
    priority: 3,
    canUpdateBrain: false,
  },
  {
    id: "trust_tier_4_experimental",
    slug: "tier_4_experimental",
    label: "Tier 4: Experimental",
    priority: 4,
    canUpdateBrain: false,
  },
  {
    id: "trust_blocked",
    slug: "blocked",
    label: "Blocked",
    priority: 99,
    canUpdateBrain: false,
  },
];

export const DEFAULT_SOURCE_TRUST = "tier_4_experimental";

export const sourceTypeDefinitionSchema = z.object({
  slug: z.string().trim().min(1).regex(/^[a-z0-9_]+$/, "source type slug must be lowercase letters/numbers/underscore"),
  label: z.string().trim().min(1),
  category: z.string().trim().min(1),
  description: z.string().trim().min(1),
  requiredFields: z.array(z.string().trim().min(1)).default([]),
  optionalFields: z.array(z.string().trim().min(1)).default([]),
  defaultConnectedAgents: z.array(z.string().trim().min(1)).default([]),
  defaultMemoryBanks: z.array(z.string().trim().min(1)).default([]),
  defaultRefreshFrequency: z.enum(SOURCE_REFRESH_FREQUENCIES).default("manual"),
  supportsUrl: z.boolean().default(false),
  supportsFile: z.boolean().default(false),
  requiresTranscript: z.boolean().default(false),
  requiresVision: z.boolean().default(false),
  supportsScrape: z.boolean().default(false),
  intakeHandlerSlug: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type SourceTypeDefinitionInput = z.input<typeof sourceTypeDefinitionSchema>;

export interface SourceTypeDefinitionRow {
  id: string;
  slug: string;
  label: string;
  category: string;
  description: string;
  requiredFields: string[];
  optionalFields: string[];
  defaultConnectedAgents: string[];
  defaultMemoryBanks: string[];
  defaultRefreshFrequency: SourceRefreshFrequency;
  supportsUrl: boolean;
  supportsFile: boolean;
  requiresTranscript: boolean;
  requiresVision: boolean;
  supportsScrape: boolean;
  intakeHandlerSlug: string;
  status: "active" | "disabled";
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

function sourceType(input: SourceTypeDefinitionInput): SourceTypeDefinitionInput {
  return input;
}

export const DEFAULT_SOURCE_TYPE_DEFINITIONS: SourceTypeDefinitionInput[] = [
  sourceType({ slug: "website", label: "Website", category: "web", description: "A website or important page set to scrape for positioning, offers, SEO signals, UI patterns, and proof.", requiredFields: ["url"], optionalFields: ["ownerScope", "refreshFrequency"], defaultConnectedAgents: ["source_intake_orchestrator", "website_seo_scout"], defaultMemoryBanks: ["seo", "offer", "design", "research"], defaultRefreshFrequency: "weekly", supportsUrl: true, supportsScrape: true }),
  sourceType({ slug: "blog", label: "Blog / Article", category: "web", description: "A blog/article URL used for topic, SEO, market, or content intelligence.", requiredFields: ["url"], defaultConnectedAgents: ["source_intake_orchestrator", "website_seo_scout"], defaultMemoryBanks: ["seo", "content", "research"], defaultRefreshFrequency: "monthly", supportsUrl: true, supportsScrape: true }),
  sourceType({ slug: "rss_feed", label: "RSS Feed", category: "web", description: "A feed watched for repeated market/news/content updates.", requiredFields: ["url"], defaultConnectedAgents: ["source_intake_orchestrator", "trend_radar"], defaultMemoryBanks: ["research"], defaultRefreshFrequency: "daily", supportsUrl: true, supportsScrape: true }),
  sourceType({ slug: "youtube_video", label: "YouTube Video", category: "video", description: "A YouTube video that needs metadata, transcript extraction, summary, and memory routing.", requiredFields: ["url"], optionalFields: ["transcript"], defaultConnectedAgents: ["source_intake_orchestrator", "transcript_analyst"], defaultMemoryBanks: ["research", "content"], defaultRefreshFrequency: "never", supportsUrl: true, requiresTranscript: true, supportsScrape: true }),
  sourceType({ slug: "youtube_channel", label: "YouTube Channel", category: "video", description: "A channel monitored for new videos and transcript/source candidates.", requiredFields: ["url"], defaultConnectedAgents: ["source_intake_orchestrator", "competitor_scout", "transcript_analyst"], defaultMemoryBanks: ["research", "competitor", "content"], defaultRefreshFrequency: "weekly", supportsUrl: true, supportsScrape: true }),
  sourceType({ slug: "instagram_reel", label: "Instagram Reel", category: "social", description: "A reel with caption, transcript, engagement, comments, frames, hook, pacing, and visual structure.", requiredFields: ["url"], optionalFields: ["caption", "transcript", "engagement"], defaultConnectedAgents: ["source_intake_orchestrator", "social_content_analyst", "visual_reference_analyst"], defaultMemoryBanks: ["competitor", "content", "design", "audience_response"], defaultRefreshFrequency: "weekly", supportsUrl: true, requiresTranscript: true, requiresVision: true, supportsScrape: true }),
  sourceType({ slug: "instagram_post", label: "Instagram Post", category: "social", description: "A static Instagram post with caption, creative, engagement, comments, and CTA analysis.", requiredFields: ["url"], defaultConnectedAgents: ["source_intake_orchestrator", "social_content_analyst", "visual_reference_analyst"], defaultMemoryBanks: ["content", "design", "audience_response"], defaultRefreshFrequency: "weekly", supportsUrl: true, requiresVision: true, supportsScrape: true }),
  sourceType({ slug: "instagram_carousel", label: "Instagram Carousel", category: "social", description: "A carousel with per-slide vision analysis, hierarchy, copy style, offer structure, and design patterns.", requiredFields: ["url"], optionalFields: ["slides", "caption", "comments", "engagement"], defaultConnectedAgents: ["source_intake_orchestrator", "social_content_analyst", "visual_reference_analyst"], defaultMemoryBanks: ["design", "content", "competitor", "carousel_structure"], defaultRefreshFrequency: "weekly", supportsUrl: true, requiresVision: true, supportsScrape: true }),
  sourceType({ slug: "instagram_profile", label: "Instagram Profile", category: "social", description: "A profile monitored for posts, reels, carousels, bio, offer, and positioning changes.", requiredFields: ["url"], defaultConnectedAgents: ["source_intake_orchestrator", "competitor_scout", "social_content_analyst"], defaultMemoryBanks: ["competitor", "content", "offer"], defaultRefreshFrequency: "weekly", supportsUrl: true, supportsScrape: true }),
  sourceType({ slug: "tiktok_video", label: "TikTok Video", category: "social", description: "A TikTok video with caption/transcript/comment/engagement and format analysis.", requiredFields: ["url"], defaultConnectedAgents: ["source_intake_orchestrator", "social_content_analyst", "visual_reference_analyst"], defaultMemoryBanks: ["content", "trend", "audience_response"], defaultRefreshFrequency: "weekly", supportsUrl: true, requiresTranscript: true, requiresVision: true, supportsScrape: true }),
  sourceType({ slug: "tiktok_profile", label: "TikTok Profile", category: "social", description: "A TikTok profile monitored for new videos, formats, hooks, and audience response.", requiredFields: ["url"], defaultConnectedAgents: ["source_intake_orchestrator", "competitor_scout", "trend_radar"], defaultMemoryBanks: ["competitor", "content", "trend"], defaultRefreshFrequency: "weekly", supportsUrl: true, supportsScrape: true }),
  sourceType({ slug: "reddit_post", label: "Reddit Post", category: "community", description: "A Reddit post used for pain points, objections, language, sentiment, and topic opportunities.", requiredFields: ["url"], defaultConnectedAgents: ["source_intake_orchestrator", "market_researcher"], defaultMemoryBanks: ["audience_response", "research", "offer"], defaultRefreshFrequency: "monthly", supportsUrl: true, supportsScrape: true }),
  sourceType({ slug: "reddit_thread_feed", label: "Reddit Thread / Feed", category: "community", description: "A subreddit/thread feed monitored for repeated objections, topics, language, and market signals.", requiredFields: ["url"], defaultConnectedAgents: ["source_intake_orchestrator", "market_researcher", "trend_radar"], defaultMemoryBanks: ["audience_response", "research", "content"], defaultRefreshFrequency: "daily", supportsUrl: true, supportsScrape: true }),
  sourceType({ slug: "competitor_website", label: "Competitor Website", category: "competitor", description: "A competitor site for offers, pricing, positioning, proof, funnel, SEO, and design patterns.", requiredFields: ["url"], defaultConnectedAgents: ["source_intake_orchestrator", "competitor_scout", "website_seo_scout"], defaultMemoryBanks: ["competitor", "offer", "seo", "design"], defaultRefreshFrequency: "weekly", supportsUrl: true, supportsScrape: true }),
  sourceType({ slug: "competitor_social_profile", label: "Competitor Social Profile", category: "competitor", description: "A competitor social account monitored for post cadence, hooks, formats, offers, comments, and performance patterns.", requiredFields: ["url"], defaultConnectedAgents: ["source_intake_orchestrator", "competitor_scout", "social_content_analyst"], defaultMemoryBanks: ["competitor", "content", "audience_response"], defaultRefreshFrequency: "weekly", supportsUrl: true, supportsScrape: true }),
  sourceType({ slug: "design_reference", label: "Design Reference", category: "creative", description: "A visual/design reference that should get a structured style descriptor and approval before generation uses it.", requiredFields: ["url_or_file"], defaultConnectedAgents: ["source_intake_orchestrator", "visual_reference_analyst"], defaultMemoryBanks: ["design", "founder_taste"], defaultRefreshFrequency: "never", supportsUrl: true, supportsFile: true, requiresVision: true }),
  sourceType({ slug: "brand_reference", label: "Brand Reference", category: "creative", description: "Brand guideline, visual language, tone, logo, examples, or approved/rejected taste reference.", requiredFields: ["url_or_file"], defaultConnectedAgents: ["source_intake_orchestrator", "brand_voice_guardian", "visual_reference_analyst"], defaultMemoryBanks: ["brand", "design", "founder_taste"], defaultRefreshFrequency: "never", supportsUrl: true, supportsFile: true, requiresVision: true }),
  sourceType({ slug: "market_research_source", label: "Market Research Source", category: "research", description: "Market research, reports, industry data, or manually approved intelligence source.", requiredFields: ["url_or_file"], defaultConnectedAgents: ["source_intake_orchestrator", "market_researcher"], defaultMemoryBanks: ["research", "market"], defaultRefreshFrequency: "monthly", supportsUrl: true, supportsFile: true, supportsScrape: true }),
  sourceType({ slug: "client_source", label: "Client Source", category: "client", description: "Client-specific docs, notes, analytics, briefs, or campaign data isolated by owner/client.", requiredFields: ["ownerId"], defaultConnectedAgents: ["source_intake_orchestrator", "market_researcher"], defaultMemoryBanks: ["client", "project"], defaultRefreshFrequency: "manual", supportsUrl: true, supportsFile: true }),
  sourceType({ slug: "internal_company_document", label: "Internal Company Document", category: "company", description: "Internal WOBBLE document, SOP, transcript, strategy note, or company knowledge upload.", requiredFields: ["file_or_text"], defaultConnectedAgents: ["source_intake_orchestrator", "knowledge_compiler"], defaultMemoryBanks: ["company", "brand", "research"], defaultRefreshFrequency: "manual", supportsFile: true }),
  sourceType({ slug: "uploaded_file", label: "Uploaded File", category: "file", description: "A generic uploaded source file whose parser depends on file type and founder approval.", requiredFields: ["file"], defaultConnectedAgents: ["source_intake_orchestrator", "knowledge_compiler"], defaultMemoryBanks: ["research"], defaultRefreshFrequency: "manual", supportsFile: true }),
  sourceType({ slug: "manual_note", label: "Manual Note", category: "manual", description: "A manually entered note or observation requiring approval and memory routing before use.", requiredFields: ["text"], defaultConnectedAgents: ["source_intake_orchestrator", "memory_router"], defaultMemoryBanks: ["research"], defaultRefreshFrequency: "never" }),
  sourceType({ slug: "api_source", label: "API Source", category: "api", description: "An external API feed such as analytics, Search Console, social stats, CRM, or SEO provider.", requiredFields: ["provider"], defaultConnectedAgents: ["source_intake_orchestrator", "performance_learning_agent"], defaultMemoryBanks: ["performance", "seo", "audience_response"], defaultRefreshFrequency: "daily" }),
  sourceType({ slug: "n8n_source", label: "n8n Source", category: "automation", description: "A source delivered by an n8n workflow, with signed payload logs and idempotent intake runs.", requiredFields: ["workflow"], defaultConnectedAgents: ["source_intake_orchestrator", "knowledge_compiler"], defaultMemoryBanks: ["research"], defaultRefreshFrequency: "manual" }),
];

export function buildSourceTypeDefinitionRow(
  input: SourceTypeDefinitionInput,
  opts: { id?: string; now?: Date } = {},
): SourceTypeDefinitionRow {
  const parsed = sourceTypeDefinitionSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("sourcetype"),
    slug: parsed.slug,
    label: parsed.label,
    category: parsed.category,
    description: parsed.description,
    requiredFields: parsed.requiredFields,
    optionalFields: parsed.optionalFields,
    defaultConnectedAgents: parsed.defaultConnectedAgents,
    defaultMemoryBanks: parsed.defaultMemoryBanks,
    defaultRefreshFrequency: parsed.defaultRefreshFrequency,
    supportsUrl: parsed.supportsUrl,
    supportsFile: parsed.supportsFile,
    requiresTranscript: parsed.requiresTranscript,
    requiresVision: parsed.requiresVision,
    supportsScrape: parsed.supportsScrape,
    intakeHandlerSlug: parsed.intakeHandlerSlug ?? parsed.slug,
    status: "active",
    metadata: parsed.metadata,
    createdAt: now,
    updatedAt: now,
  };
}

export function resolveSourceTypeDefinition(sourceType: string): SourceTypeDefinitionRow {
  const found = DEFAULT_SOURCE_TYPE_DEFINITIONS.find((definition) => definition.slug === sourceType.trim());
  if (!found) {
    throw new Error(`unknown source type '${sourceType}'`);
  }
  return buildSourceTypeDefinitionRow(found, { id: `sourcetype_${found.slug}` });
}

export const addSourceSchema = z.object({
  title: z.string().trim().min(1, "title is required"),
  sourceType: z.string().trim().min(1, "sourceType is required"),
  url: z.string().trim().url().optional(),
  ownerScope: z.enum(SOURCE_OWNER_SCOPES).default("company"),
  ownerId: z.string().trim().min(1).optional(),
  intendedUse: z.array(z.string().trim().min(1)).default([]),
  connectedAgents: z.array(z.string().trim().min(1)).default([]),
  refreshFrequency: z.enum(SOURCE_REFRESH_FREQUENCIES).default("manual"),
  trustLevel: z.string().trim().min(1).default(DEFAULT_SOURCE_TRUST),
  approvalStatus: z.enum(SOURCE_APPROVAL_STATUSES).optional(),
  discoveredBy: z.string().trim().min(1).optional(),
  addedBy: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type AddSourceInput = z.input<typeof addSourceSchema>;

export interface SourceRow {
  id: string;
  title: string;
  sourceType: string;
  url: string | null;
  ownerScope: SourceOwnerScope;
  ownerId: string | null;
  intendedUse: string[];
  connectedAgents: string[];
  refreshFrequency: SourceRefreshFrequency;
  lastScrapedAt: Date | null;
  processingStatus: SourceProcessingStatus;
  confidence: string | null;
  costUsed: string;
  memoryBanksFed: string[];
  relatedOutputIds: string[];
  extractedData: Record<string, unknown>;
  lastError: string | null;
  trustLevel: string;
  approvalStatus: SourceApprovalStatus;
  status: SourceRecordStatus;
  discoveredBy: string | null;
  addedBy: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export function buildSourceRow(input: AddSourceInput, opts: { id?: string; now?: Date } = {}): SourceRow {
  const parsed = addSourceSchema.parse(input);
  const now = opts.now ?? new Date();
  const registryDefaults = DEFAULT_SOURCE_TYPE_DEFINITIONS.find((definition) => definition.slug === parsed.sourceType);
  const connectedAgents = parsed.connectedAgents.length ? parsed.connectedAgents : registryDefaults?.defaultConnectedAgents ?? [];

  return {
    id: opts.id ?? newId("source"),
    title: parsed.title,
    sourceType: parsed.sourceType,
    url: parsed.url ?? null,
    ownerScope: parsed.ownerScope,
    ownerId: parsed.ownerId ?? null,
    intendedUse: parsed.intendedUse,
    connectedAgents,
    refreshFrequency: parsed.refreshFrequency === "manual" && registryDefaults ? registryDefaults.defaultRefreshFrequency ?? "manual" : parsed.refreshFrequency,
    lastScrapedAt: null,
    processingStatus: "pending_approval",
    confidence: null,
    costUsed: "0",
    memoryBanksFed: [],
    relatedOutputIds: [],
    extractedData: {},
    lastError: null,
    trustLevel: parsed.trustLevel,
    // Source creation is never self-trusting. Approval attribution is written
    // only by approveSource after the founder gate runs.
    approvalStatus: "pending",
    status: "active",
    discoveredBy: parsed.discoveredBy ?? null,
    addedBy: parsed.addedBy ?? null,
    approvedBy: null,
    approvedAt: null,
    metadata: parsed.metadata,
    createdAt: now,
    updatedAt: now,
  };
}

export const sourceIntakeRunInputSchema = z.object({
  sourceId: z.string().trim().min(1),
  sourceType: z.string().trim().min(1),
  handlerSlug: z.string().trim().min(1).optional(),
  trigger: z.enum(SOURCE_INTAKE_TRIGGERS).default("manual"),
  status: z.enum(SOURCE_INTAKE_STATUSES).default("queued"),
  tool: z.string().trim().min(1).optional(),
  agentRunId: z.string().trim().min(1).optional(),
  jobId: z.string().trim().min(1).optional(),
  rawPayloadRef: z.string().trim().min(1).optional(),
  extractedInsightId: z.string().trim().min(1).optional(),
  costEstimate: z.number().nonnegative().optional(),
  actualCost: z.number().nonnegative().optional(),
  logs: z.array(z.record(z.string(), z.unknown())).default([]),
  error: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type SourceIntakeRunInput = z.input<typeof sourceIntakeRunInputSchema>;

export interface SourceIntakeRunRow {
  id: string;
  sourceId: string;
  sourceType: string;
  handlerSlug: string;
  trigger: SourceIntakeTrigger;
  status: SourceIntakeStatus;
  tool: string | null;
  agentRunId: string | null;
  jobId: string | null;
  rawPayloadRef: string | null;
  extractedInsightId: string | null;
  costEstimate: string | null;
  actualCost: string | null;
  logs: Array<Record<string, unknown>>;
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export function buildSourceIntakeRunRow(
  input: SourceIntakeRunInput,
  opts: { id?: string; now?: Date } = {},
): SourceIntakeRunRow {
  const parsed = sourceIntakeRunInputSchema.parse(input);
  const now = opts.now ?? new Date();
  const finished = parsed.status === "succeeded" || parsed.status === "failed" || parsed.status === "cancelled";
  return {
    id: opts.id ?? newId("sourceintake"),
    sourceId: parsed.sourceId,
    sourceType: parsed.sourceType,
    handlerSlug: parsed.handlerSlug ?? parsed.sourceType,
    trigger: parsed.trigger,
    status: parsed.status,
    tool: parsed.tool ?? null,
    agentRunId: parsed.agentRunId ?? null,
    jobId: parsed.jobId ?? null,
    rawPayloadRef: parsed.rawPayloadRef ?? null,
    extractedInsightId: parsed.extractedInsightId ?? null,
    costEstimate: parsed.costEstimate !== undefined ? String(parsed.costEstimate) : null,
    actualCost: parsed.actualCost !== undefined ? String(parsed.actualCost) : null,
    logs: parsed.logs,
    error: parsed.error ?? null,
    startedAt: now,
    completedAt: finished ? now : null,
    metadata: parsed.metadata,
    createdAt: now,
    updatedAt: now,
  };
}

export function resolveSourceTrust(
  requestedTrustLevel: string | undefined,
  trustLevels: SourceTrustLevel[] = DEFAULT_SOURCE_TRUST_LEVELS,
): ResolvedSourceTrust {
  const slug = requestedTrustLevel?.trim() || DEFAULT_SOURCE_TRUST;
  const found = trustLevels.find((level) => level.slug === slug);
  if (!found) {
    throw new Error(`unknown source trust level '${slug}'`);
  }
  return { ...found, isBlocked: found.slug === "blocked" };
}

const supportedExtensions = new Set([
  "pdf",
  "txt",
  "md",
  "csv",
  "docx",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "mp4",
  "mov",
  "mp3",
  "wav",
]);

const supportedMimeTypes = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
]);

export const sourceFileInputSchema = z.object({
  path: z.string().trim().min(1).optional(),
  filename: z.string().trim().min(1).optional(),
  fileType: z.string().trim().min(1).optional(),
  mimeType: z.string().trim().min(1).optional(),
  module: z.string().trim().min(1).default("source_library"),
  linkedEntityId: z.string().trim().min(1).optional(),
  createdBy: z.string().trim().min(1),
  sizeBytes: z.number().nonnegative().optional(),
  checksum: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type SourceFileInput = z.input<typeof sourceFileInputSchema>;

export const sourceFileSupportSchema = z.object({
  path: z.string().trim().min(1).optional(),
  filename: z.string().trim().min(1).optional(),
  fileType: z.string().trim().min(1).optional(),
  mimeType: z.string().trim().min(1).optional(),
  sizeBytes: z.number().nonnegative().optional(),
});

export type SourceFileSupportInput = z.input<typeof sourceFileSupportSchema>;

export interface SourceFileRow {
  id: string;
  path: string;
  fileType: string;
  module: string;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  createdBy: string;
  status: string;
  approvalState: string;
  sizeBytes: string | null;
  checksum: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

function extensionFrom(input: { filename?: string; path?: string; fileType?: string }): string | undefined {
  if (input.fileType?.trim()) return input.fileType.trim().replace(/^\./, "").toLowerCase();
  const value = input.filename ?? input.path;
  const match = value?.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1];
}

export function assertSupportedSourceFile(input: SourceFileSupportInput): { extension: string; mimeType: string | null } {
  const parsed = sourceFileSupportSchema.parse(input);
  const extension = extensionFrom(parsed);
  const mimeType = parsed.mimeType?.toLowerCase() ?? null;

  const extensionOk = extension ? supportedExtensions.has(extension) : false;
  const mimeOk = mimeType ? supportedMimeTypes.has(mimeType) : false;

  if (!extensionOk && !mimeOk) {
    throw new Error(`unsupported source file type '${extension ?? mimeType ?? "unknown"}'`);
  }

  return { extension: extension ?? "unknown", mimeType };
}

export function buildFileRow(
  input: SourceFileInput & { path: string; linkedEntityId?: string },
  opts: { id?: string; now?: Date; linkedEntityId?: string } = {},
): SourceFileRow {
  const parsed = sourceFileInputSchema.extend({ path: z.string().trim().min(1) }).parse(input);
  const supported = assertSupportedSourceFile(parsed);
  const now = opts.now ?? new Date();
  const linkedEntityId = opts.linkedEntityId ?? parsed.linkedEntityId ?? null;

  return {
    id: opts.id ?? newId("file"),
    path: parsed.path,
    fileType: supported.extension,
    module: parsed.module,
    linkedEntityType: linkedEntityId ? "source" : null,
    linkedEntityId,
    createdBy: parsed.createdBy,
    status: "active",
    approvalState: "pending",
    sizeBytes: parsed.sizeBytes !== undefined ? String(parsed.sizeBytes) : null,
    checksum: parsed.checksum ?? null,
    metadata: {
      ...parsed.metadata,
      ...(supported.mimeType ? { mimeType: supported.mimeType } : {}),
      ...(parsed.filename ? { filename: parsed.filename } : {}),
    },
    createdAt: now,
    updatedAt: now,
  };
}

export const sourceChunksInputSchema = z.object({
  sourceId: z.string().trim().min(1),
  chunks: z.array(z.string().trim().min(1)).min(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type SourceChunksInput = z.input<typeof sourceChunksInputSchema>;

export interface SourceChunkRow {
  id: string;
  sourceId: string;
  chunkIndex: number;
  content: string;
  embedding: number[] | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export function buildSourceChunkRows(
  input: SourceChunksInput,
  opts: { ids?: string[]; now?: Date } = {},
): SourceChunkRow[] {
  const parsed = sourceChunksInputSchema.parse(input);
  const now = opts.now ?? new Date();

  return parsed.chunks.map((content, index) => ({
    id: opts.ids?.[index] ?? newId("sourcechunk"),
    sourceId: parsed.sourceId,
    chunkIndex: index,
    content,
    embedding: null,
    metadata: parsed.metadata,
    createdAt: now,
    updatedAt: now,
  }));
}
