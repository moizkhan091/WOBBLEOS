import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, varchar, vector } from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const metadata = () => jsonb("metadata").$type<Record<string, unknown>>().notNull().default({});

export const founderProfiles = pgTable("founder_profiles", {
  id: id(),
  displayName: varchar("display_name", { length: 80 }).notNull(),
  role: varchar("role", { length: 120 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  approvalDefault: boolean("approval_default").notNull().default(false),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const authSessions = pgTable("auth_sessions", {
  id: id(),
  sessionTokenHash: text("session_token_hash").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const settings = pgTable("settings", {
  id: id(),
  key: varchar("key", { length: 120 }).notNull(),
  scope: varchar("scope", { length: 64 }).notNull().default("global"),
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
  description: text("description"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const jobs = pgTable("jobs", {
  id: id(),
  queue: varchar("queue", { length: 80 }).notNull(),
  type: varchar("type", { length: 120 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  priority: integer("priority").notNull().default(0),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  result: jsonb("result").$type<Record<string, unknown>>(),
  idempotencyKey: varchar("idempotency_key", { length: 160 }),
  linkedModule: varchar("linked_module", { length: 80 }),
  linkedEntityType: varchar("linked_entity_type", { length: 80 }),
  linkedEntityId: text("linked_entity_id"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  runAfter: timestamp("run_after", { withTimezone: true }),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  failureReason: text("failure_reason"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  // Only ONE live (pending/active) job may hold a given idempotency key — closes the
  // check-then-insert race so a double-submit can't create two runs of the same work.
  uniqueIndex("jobs_idempotency_live_idx").on(table.idempotencyKey).where(sql`status in ('pending','active') and idempotency_key is not null`),
]);

export const jobAttempts = pgTable("job_attempts", {
  id: id(),
  jobId: text("job_id").notNull(),
  attemptNumber: integer("attempt_number").notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  error: text("error"),
  metadata: metadata(),
  createdAt: createdAt(),
});

export const workerHeartbeats = pgTable("worker_heartbeats", {
  id: id(),
  workerName: varchar("worker_name", { length: 120 }).notNull(),
  workerType: varchar("worker_type", { length: 80 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("online"),
  currentJobId: text("current_job_id"),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).notNull().defaultNow(),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sourceTrustLevels = pgTable("source_trust_levels", {
  id: id(),
  slug: varchar("slug", { length: 80 }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  priority: integer("priority").notNull(),
  description: text("description").notNull(),
  canUpdateBrain: boolean("can_update_brain").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sources = pgTable("sources", {
  id: id(),
  title: text("title").notNull(),
  sourceType: varchar("source_type", { length: 80 }).notNull(),
  url: text("url"),
  ownerScope: varchar("owner_scope", { length: 64 }).notNull().default("company"),
  ownerId: text("owner_id"),
  intendedUse: jsonb("intended_use").$type<string[]>().notNull().default([]),
  connectedAgents: jsonb("connected_agents").$type<string[]>().notNull().default([]),
  refreshFrequency: varchar("refresh_frequency", { length: 40 }).notNull().default("manual"),
  lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
  processingStatus: varchar("processing_status", { length: 40 }).notNull().default("pending_approval"),
  confidence: numeric("confidence"),
  costUsed: numeric("cost_used").notNull().default("0"),
  memoryBanksFed: jsonb("memory_banks_fed").$type<string[]>().notNull().default([]),
  relatedOutputIds: jsonb("related_output_ids").$type<string[]>().notNull().default([]),
  extractedData: jsonb("extracted_data").$type<Record<string, unknown>>().notNull().default({}),
  lastError: text("last_error"),
  trustLevel: varchar("trust_level", { length: 80 }).notNull().default("tier_4_experimental"),
  approvalStatus: varchar("approval_status", { length: 32 }).notNull().default("pending"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  discoveredBy: varchar("discovered_by", { length: 120 }),
  addedBy: varchar("added_by", { length: 120 }),
  approvedBy: varchar("approved_by", { length: 120 }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sourceTypeDefinitions = pgTable("source_type_definitions", {
  id: id(),
  slug: varchar("slug", { length: 80 }).notNull(),
  label: varchar("label", { length: 140 }).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  description: text("description").notNull(),
  requiredFields: jsonb("required_fields").$type<string[]>().notNull().default([]),
  optionalFields: jsonb("optional_fields").$type<string[]>().notNull().default([]),
  defaultConnectedAgents: jsonb("default_connected_agents").$type<string[]>().notNull().default([]),
  defaultMemoryBanks: jsonb("default_memory_banks").$type<string[]>().notNull().default([]),
  defaultRefreshFrequency: varchar("default_refresh_frequency", { length: 40 }).notNull().default("manual"),
  supportsUrl: boolean("supports_url").notNull().default(false),
  supportsFile: boolean("supports_file").notNull().default(false),
  requiresTranscript: boolean("requires_transcript").notNull().default(false),
  requiresVision: boolean("requires_vision").notNull().default(false),
  supportsScrape: boolean("supports_scrape").notNull().default(false),
  intakeHandlerSlug: varchar("intake_handler_slug", { length: 120 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("source_type_definitions_slug_unique").on(table.slug),
  index("source_type_definitions_category_idx").on(table.category),
  index("source_type_definitions_status_idx").on(table.status),
]);

export const sourceIntakeRuns = pgTable("source_intake_runs", {
  id: id(),
  sourceId: text("source_id").notNull(),
  sourceType: varchar("source_type", { length: 80 }).notNull(),
  handlerSlug: varchar("handler_slug", { length: 120 }).notNull(),
  trigger: varchar("trigger", { length: 40 }).notNull().default("manual"),
  status: varchar("status", { length: 40 }).notNull().default("queued"),
  tool: varchar("tool", { length: 120 }),
  agentRunId: text("agent_run_id"),
  jobId: text("job_id"),
  rawPayloadRef: text("raw_payload_ref"),
  extractedInsightId: text("extracted_insight_id"),
  costEstimate: numeric("cost_estimate"),
  actualCost: numeric("actual_cost"),
  logs: jsonb("logs").$type<Array<Record<string, unknown>>>().notNull().default([]),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("source_intake_runs_source_id_idx").on(table.sourceId),
  index("source_intake_runs_status_idx").on(table.status),
  index("source_intake_runs_handler_slug_idx").on(table.handlerSlug),
]);

export const files = pgTable("files", {
  id: id(),
  path: text("path").notNull(),
  fileType: varchar("file_type", { length: 80 }).notNull(),
  module: varchar("module", { length: 80 }).notNull(),
  linkedEntityType: varchar("linked_entity_type", { length: 80 }),
  linkedEntityId: text("linked_entity_id"),
  createdBy: varchar("created_by", { length: 120 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  approvalState: varchar("approval_state", { length: 32 }).notNull().default("not_required"),
  sizeBytes: numeric("size_bytes"),
  checksum: text("checksum"),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sourceChunks = pgTable("source_chunks", {
  id: id(),
  sourceId: text("source_id").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const memoryBanks = pgTable("memory_banks", {
  id: id(),
  slug: varchar("slug", { length: 120 }).notNull(),
  label: varchar("label", { length: 160 }).notNull(),
  scope: varchar("scope", { length: 40 }).notNull(),
  purpose: text("purpose").notNull(),
  description: text("description").notNull(),
  defaultTier: varchar("default_tier", { length: 32 }).notNull(),
  allowedTrustLevels: jsonb("allowed_trust_levels").$type<string[]>().notNull().default([]),
  ownerScope: varchar("owner_scope", { length: 40 }),
  ownerId: text("owner_id"),
  parentSlug: varchar("parent_slug", { length: 120 }),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  priority: integer("priority").notNull().default(100),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("memory_banks_slug_unique").on(table.slug),
  index("memory_banks_scope_idx").on(table.scope),
  index("memory_banks_status_idx").on(table.status),
  index("memory_banks_parent_slug_idx").on(table.parentSlug),
]);

export const memoryRecords = pgTable("memory_records", {
  id: id(),
  slug: varchar("slug", { length: 120 }).notNull(),
  title: text("title").notNull(),
  memoryTier: varchar("memory_tier", { length: 32 }).notNull(),
  area: varchar("area", { length: 80 }).notNull(),
  content: text("content").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  sourceId: text("source_id"),
  confidence: numeric("confidence"),
  bankSlugs: jsonb("bank_slugs").$type<string[]>().notNull().default([]),
  approvedBy: varchar("approved_by", { length: 120 }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  // Soft-delete grace window: archived records can be restored until purgeAfter, then hard-deleted.
  purgeAfter: timestamp("purge_after", { withTimezone: true }),
  // Staleness: prompt a founder to re-confirm a memory after this time (interval depends on tier).
  reviewAfter: timestamp("review_after", { withTimezone: true }),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  // Pinning: pinned/important memories are protected and weigh more in retrieval.
  pinned: boolean("pinned").notNull().default(false),
  importance: integer("importance").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// When a new memory looks like it duplicates or contradicts an existing one, we flag it
// here for the founder to resolve (keep new / keep existing / keep both) instead of
// silently piling up duplicates or conflicting truths.
export const memoryConflicts = pgTable("memory_conflicts", {
  id: id(),
  newRecordId: text("new_record_id").notNull(),
  existingRecordId: text("existing_record_id").notNull(),
  bankSlug: varchar("bank_slug", { length: 120 }),
  similarity: numeric("similarity"),
  status: varchar("status", { length: 32 }).notNull().default("open"),
  resolution: varchar("resolution", { length: 32 }),
  detectedBy: varchar("detected_by", { length: 120 }),
  resolvedBy: varchar("resolved_by", { length: 120 }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("memory_conflicts_status_idx").on(table.status),
  index("memory_conflicts_new_record_idx").on(table.newRecordId),
]);

// Full edit history for memory records (undo / see-what-changed / restore-to-version).
export const memoryRecordVersions = pgTable("memory_record_versions", {
  id: id(),
  memoryRecordId: text("memory_record_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  editedBy: varchar("edited_by", { length: 120 }),
  changeReason: text("change_reason"),
  createdAt: createdAt(),
}, (table) => [
  index("memory_record_versions_record_id_idx").on(table.memoryRecordId),
]);

export const memoryChunks = pgTable("memory_chunks", {
  id: id(),
  memoryRecordId: text("memory_record_id"),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  memoryTier: varchar("memory_tier", { length: 32 }).notNull(),
  trustLevel: varchar("trust_level", { length: 48 }).notNull(),
  sourceId: text("source_id"),
  parentEntityId: text("parent_entity_id"),
  entityType: varchar("entity_type", { length: 64 }),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  archived: boolean("archived").notNull().default(false),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  bankSlugs: jsonb("bank_slugs").$type<string[]>().notNull().default([]),
  pinned: boolean("pinned").notNull().default(false),
  sourceTimestamp: timestamp("source_timestamp", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const memoryUpdateProposals = pgTable("memory_update_proposals", {
  id: id(),
  proposedMemory: text("proposed_memory").notNull(),
  reason: text("reason").notNull(),
  sourceId: text("source_id"),
  sourceIntakeRunId: text("source_intake_run_id"),
  affectedArea: varchar("affected_area", { length: 80 }).notNull(),
  knowledgeType: varchar("knowledge_type", { length: 80 }),
  confidence: numeric("confidence"),
  suggestedBankSlugs: jsonb("suggested_bank_slugs").$type<string[]>().notNull().default([]),
  approvedBankSlugs: jsonb("approved_bank_slugs").$type<string[]>().notNull().default([]),
  routerReason: text("router_reason"),
  routerConfidence: numeric("router_confidence"),
  approvalId: text("approval_id"),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  approvedBy: varchar("approved_by", { length: 120 }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedBy: varchar("rejected_by", { length: 120 }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectedReason: text("rejected_reason"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const memoryBankLinks = pgTable("memory_bank_links", {
  id: id(),
  memoryBankSlug: varchar("memory_bank_slug", { length: 120 }).notNull(),
  memoryRecordId: text("memory_record_id"),
  memoryChunkId: text("memory_chunk_id"),
  sourceId: text("source_id"),
  proposalId: text("proposal_id"),
  linkType: varchar("link_type", { length: 40 }).notNull().default("membership"),
  createdBy: varchar("created_by", { length: 120 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("memory_bank_links_bank_slug_idx").on(table.memoryBankSlug),
  index("memory_bank_links_record_id_idx").on(table.memoryRecordId),
  index("memory_bank_links_chunk_id_idx").on(table.memoryChunkId),
  index("memory_bank_links_source_id_idx").on(table.sourceId),
  index("memory_bank_links_proposal_id_idx").on(table.proposalId),
]);

export const approvals = pgTable("approvals", {
  id: id(),
  approvalType: varchar("approval_type", { length: 80 }).notNull(),
  entityType: varchar("entity_type", { length: 80 }).notNull(),
  entityId: text("entity_id").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  riskLevel: varchar("risk_level", { length: 32 }).notNull().default("normal"),
  requestedBy: varchar("requested_by", { length: 120 }),
  approvedBy: varchar("approved_by", { length: 120 }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedBy: varchar("rejected_by", { length: 120 }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  approvalAction: varchar("approval_action", { length: 80 }),
  confirmationRequired: boolean("confirmation_required").notNull().default(false),
  confirmationCompleted: boolean("confirmation_completed").notNull().default(false),
  notes: text("notes"),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("approvals_status_idx").on(table.status),
  index("approvals_created_at_idx").on(table.createdAt),
]);

export const approvalActions = pgTable("approval_actions", {
  id: id(),
  slug: varchar("slug", { length: 80 }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  description: text("description").notNull(),
  riskLevel: varchar("risk_level", { length: 32 }).notNull().default("normal"),
  requiresConfirmation: boolean("requires_confirmation").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const contentTracks = pgTable("content_tracks", {
  id: id(),
  slug: varchar("slug", { length: 120 }).notNull(),
  label: varchar("label", { length: 160 }).notNull(),
  ownerType: varchar("owner_type", { length: 64 }).notNull().default("company"),
  voiceProfile: jsonb("voice_profile").$type<Record<string, unknown>>().notNull().default({}),
  goals: jsonb("goals").$type<string[]>().notNull().default([]),
  allowedTopics: jsonb("allowed_topics").$type<string[]>().notNull().default([]),
  bannedPhrases: jsonb("banned_phrases").$type<string[]>().notNull().default([]),
  aggressionRange: jsonb("aggression_range").$type<{ min: number; max: number }>().notNull().default({ min: 0, max: 10 }),
  platformPriorities: jsonb("platform_priorities").$type<string[]>().notNull().default([]),
  approvalRequired: boolean("approval_required").notNull().default(true),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const contentPackets = pgTable("content_packets", {
  id: id(),
  contentTrackId: text("content_track_id").notNull().default("track_wobble_company"),
  platform: varchar("platform", { length: 80 }).notNull(),
  format: varchar("format", { length: 80 }).notNull(),
  objective: text("objective").notNull(),
  targetAudience: text("target_audience").notNull(),
  angle: text("angle").notNull(),
  hook: text("hook"),
  mainCopy: text("main_copy"),
  carouselSlides: jsonb("carousel_slides").$type<Array<Record<string, unknown>>>().notNull().default([]),
  caption: text("caption"),
  cta: text("cta"),
  designDirection: text("design_direction"),
  sourceIdsUsed: jsonb("source_ids_used").$type<string[]>().notNull().default([]),
  insightIdsUsed: jsonb("insight_ids_used").$type<string[]>().notNull().default([]),
  memoryChunksUsed: jsonb("memory_chunks_used").$type<string[]>().notNull().default([]),
  evidenceSummary: text("evidence_summary"),
  claimRiskLevel: varchar("claim_risk_level", { length: 32 }).notNull().default("low"),
  proofRequired: boolean("proof_required").notNull().default(false),
  qualityStatus: varchar("quality_status", { length: 32 }).notNull().default("not_reviewed"),
  approvalStatus: varchar("approval_status", { length: 32 }).notNull().default("draft"),
  n8nHandoffStatus: varchar("n8n_handoff_status", { length: 32 }).notNull().default("not_sent"),
  createdBy: varchar("created_by", { length: 120 }).notNull().default("system"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const contentVersions = pgTable("content_versions", {
  id: id(),
  contentPacketId: text("content_packet_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  changeReason: text("change_reason"),
  createdBy: varchar("created_by", { length: 120 }).notNull(),
  createdAt: createdAt(),
});

export const qualityReviews = pgTable("quality_reviews", {
  id: id(),
  entityType: varchar("entity_type", { length: 80 }).notNull(),
  entityId: text("entity_id").notNull(),
  usefulness: integer("usefulness").notNull(),
  originality: integer("originality").notNull(),
  brandFit: integer("brand_fit").notNull(),
  clarity: integer("clarity").notNull(),
  aggressionControl: integer("aggression_control").notNull(),
  proofStrength: integer("proof_strength").notNull(),
  postWorthiness: varchar("post_worthiness", { length: 32 }).notNull(),
  passed: boolean("passed").notNull(),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const modelRuns = pgTable("model_runs", {
  id: id(),
  provider: varchar("provider", { length: 64 }).notNull(),
  model: varchar("model", { length: 128 }).notNull(),
  role: varchar("role", { length: 64 }).notNull(),
  module: varchar("module", { length: 64 }).notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  estimatedCost: numeric("estimated_cost"),
  actualCost: numeric("actual_cost"),
  latencyMs: integer("latency_ms"),
  status: varchar("status", { length: 32 }).notNull(),
  error: text("error"),
  linkedEntityType: varchar("linked_entity_type", { length: 80 }),
  linkedEntityId: text("linked_entity_id"),
  providerRunId: text("provider_run_id"),
  createdAt: createdAt(),
}, (table) => [
  index("model_runs_created_at_idx").on(table.createdAt),
  index("model_runs_module_created_idx").on(table.module, table.createdAt),
]);

export const providerRuns = pgTable("provider_runs", {
  id: id(),
  provider: varchar("provider", { length: 80 }).notNull(),
  operation: varchar("operation", { length: 120 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  requestMetadata: jsonb("request_metadata").$type<Record<string, unknown>>().notNull().default({}),
  responseMetadata: jsonb("response_metadata").$type<Record<string, unknown>>(),
  estimatedCost: numeric("estimated_cost"),
  actualCost: numeric("actual_cost"),
  latencyMs: integer("latency_ms"),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  // Human-facing bucket so the log is easy to read/filter (creation/edit/deletion/restore/approval/access/...).
  category: varchar("category", { length: 40 }).notNull().default("system"),
  module: varchar("module", { length: 64 }).notNull(),
  entityType: varchar("entity_type", { length: 80 }),
  entityId: text("entity_id"),
  actor: varchar("actor", { length: 80 }),
  // Where the action happened (page/route/agent) so we can see what was done and from where.
  surface: varchar("surface", { length: 120 }),
  modelRunId: text("model_run_id"),
  costEstimate: numeric("cost_estimate"),
  metadata: metadata(),
  createdAt: createdAt(),
}, (table) => [
  index("audit_logs_category_idx").on(table.category),
  index("audit_logs_event_type_idx").on(table.eventType),
  index("audit_logs_created_at_idx").on(table.createdAt),
]);

export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: id(),
  name: varchar("name", { length: 120 }).notNull(),
  module: varchar("module", { length: 80 }).notNull(),
  url: text("url").notNull(),
  secretRefName: varchar("secret_ref_name", { length: 120 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const webhookEvents = pgTable("webhook_events", {
  id: id(),
  endpointId: text("endpoint_id"),
  direction: varchar("direction", { length: 32 }).notNull(),
  eventType: varchar("event_type", { length: 120 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 160 }),
  signatureVerified: boolean("signature_verified").notNull().default(false),
  replayProtected: boolean("replay_protected").notNull().default(false),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  response: jsonb("response").$type<Record<string, unknown>>(),
  failureReason: text("failure_reason"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const deadLetters = pgTable("dead_letters", {
  id: id(),
  sourceType: varchar("source_type", { length: 80 }).notNull(),
  sourceId: text("source_id").notNull(),
  module: varchar("module", { length: 80 }).notNull(),
  reason: text("reason").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  retryCount: integer("retry_count").notNull().default(0),
  status: varchar("status", { length: 32 }).notNull().default("open"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const budgetCaps = pgTable("budget_caps", {
  id: id(),
  category: varchar("category", { length: 80 }).notNull(),
  period: varchar("period", { length: 32 }).notNull(),
  amount: numeric("amount").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("USD"),
  maxBatchSize: integer("max_batch_size"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const automations = pgTable("automations", {
  id: id(),
  name: varchar("name", { length: 160 }).notNull(),
  module: varchar("module", { length: 80 }).notNull(),
  triggerType: varchar("trigger_type", { length: 80 }).notNull(),
  schedule: varchar("schedule", { length: 120 }),
  n8nWorkflowId: varchar("n8n_workflow_id", { length: 160 }),
  workerQueue: varchar("worker_queue", { length: 80 }),
  status: varchar("status", { length: 32 }).notNull().default("paused"),
  killSwitchKey: varchar("kill_switch_key", { length: 120 }),
  lastSuccessfulRunAt: timestamp("last_successful_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const automationRuns = pgTable("automation_runs", {
  id: id(),
  automationId: text("automation_id").notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  failureReason: text("failure_reason"),
  metadata: metadata(),
  createdAt: createdAt(),
});

export const backupRuns = pgTable("backup_runs", {
  id: id(),
  backupType: varchar("backup_type", { length: 80 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  storagePath: text("storage_path"),
  sizeBytes: numeric("size_bytes"),
  checksum: text("checksum"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  failureReason: text("failure_reason"),
  createdAt: createdAt(),
});

export const providerConnections = pgTable("provider_connections", {
  id: id(),
  slug: varchar("slug", { length: 120 }).notNull(),
  label: varchar("label", { length: 160 }).notNull(),
  providerType: varchar("provider_type", { length: 80 }).notNull(),
  credentialKeyName: varchar("credential_key_name", { length: 120 }).notNull(),
  enabled: boolean("enabled").notNull().default(false),
  allowedModules: jsonb("allowed_modules").$type<string[]>().notNull().default([]),
  permissionMode: varchar("permission_mode", { length: 80 }).notNull().default("read_write"),
  costCategory: varchar("cost_category", { length: 80 }).notNull(),
  healthStatus: varchar("health_status", { length: 32 }).notNull().default("unknown"),
  referenceDocPath: text("reference_doc_path"),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const promptSkills = pgTable("prompt_skills", {
  id: id(),
  slug: varchar("slug", { length: 120 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  module: varchar("module", { length: 80 }).notNull(),
  trigger: text("trigger").notNull(),
  version: integer("version").notNull().default(1),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  goal: text("goal").notNull(),
  promptBody: text("prompt_body").notNull(),
  rules: jsonb("rules").$type<string[]>().notNull().default([]),
  referencePaths: jsonb("reference_paths").$type<string[]>().notNull().default([]),
  approvedBy: varchar("approved_by", { length: 120 }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const researchTargets = pgTable("research_targets", {
  id: id(),
  targetType: varchar("target_type", { length: 80 }).notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  platform: varchar("platform", { length: 80 }),
  handleOrUrl: text("handle_or_url"),
  query: text("query"),
  scope: varchar("scope", { length: 64 }).notNull().default("wobble"),
  clientId: text("client_id"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  approvalStatus: varchar("approval_status", { length: 32 }).notNull().default("pending"),
  trustLevel: varchar("trust_level", { length: 80 }).notNull().default("tier_4_experimental"),
  cadence: varchar("cadence", { length: 40 }).notNull().default("manual"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  addedBy: varchar("added_by", { length: 120 }),
  approvedBy: varchar("approved_by", { length: 120 }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const intelligenceItems = pgTable("intelligence_items", {
  id: id(),
  itemType: varchar("item_type", { length: 80 }).notNull(),
  scope: varchar("scope", { length: 64 }).notNull().default("wobble"),
  clientId: text("client_id"),
  targetId: text("target_id"),
  sourceId: text("source_id"),
  sourceUrl: text("source_url"),
  platform: varchar("platform", { length: 80 }),
  actorName: varchar("actor_name", { length: 180 }),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  rawText: text("raw_text"),
  summaryEmbedding: vector("summary_embedding", { dimensions: 1536 }),
  trustLevel: varchar("trust_level", { length: 80 }).notNull().default("tier_4_experimental"),
  approvalStatus: varchar("approval_status", { length: 32 }).notNull().default("pending"),
  freshnessStatus: varchar("freshness_status", { length: 32 }).notNull().default("unknown"),
  confidence: numeric("confidence").notNull().default("0.6"),
  observedAt: timestamp("observed_at", { withTimezone: true }),
  collectedAt: timestamp("collected_at", { withTimezone: true }).notNull().defaultNow(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull().default({}),
  extracted: jsonb("extracted").$type<Record<string, unknown>>().notNull().default({}),
  relations: jsonb("relations").$type<Record<string, unknown>>().notNull().default({}),
  metadata: metadata(),
  createdByAgent: varchar("created_by_agent", { length: 120 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const intelligenceInsights = pgTable("intelligence_insights", {
  id: id(),
  insightType: varchar("insight_type", { length: 80 }).notNull(),
  scope: varchar("scope", { length: 64 }).notNull().default("wobble"),
  clientId: text("client_id"),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  recommendation: text("recommendation"),
  summaryEmbedding: vector("summary_embedding", { dimensions: 1536 }),
  evidenceItemIds: jsonb("evidence_item_ids").$type<string[]>().notNull().default([]),
  sourceIds: jsonb("source_ids").$type<string[]>().notNull().default([]),
  appliesToModules: jsonb("applies_to_modules").$type<string[]>().notNull().default([]),
  confidence: numeric("confidence").notNull().default("0.6"),
  impactScore: integer("impact_score").notNull().default(50),
  approvalStatus: varchar("approval_status", { length: 32 }).notNull().default("pending"),
  freshnessStatus: varchar("freshness_status", { length: 32 }).notNull().default("current"),
  supersedesInsightId: text("supersedes_insight_id"),
  createdByAgent: varchar("created_by_agent", { length: 120 }),
  approvedBy: varchar("approved_by", { length: 120 }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const intelligenceSuggestions = pgTable("intelligence_suggestions", {
  id: id(),
  suggestionType: varchar("suggestion_type", { length: 80 }).notNull(),
  scope: varchar("scope", { length: 64 }).notNull().default("wobble"),
  clientId: text("client_id"),
  title: text("title").notNull(),
  rationale: text("rationale").notNull(),
  proposedAction: text("proposed_action").notNull(),
  evidenceItemIds: jsonb("evidence_item_ids").$type<string[]>().notNull().default([]),
  evidenceInsightIds: jsonb("evidence_insight_ids").$type<string[]>().notNull().default([]),
  priority: varchar("priority", { length: 32 }).notNull().default("medium"),
  confidence: numeric("confidence").notNull().default("0.6"),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  approvalStatus: varchar("approval_status", { length: 32 }).notNull().default("pending"),
  approvalId: text("approval_id"),
  createdByAgent: varchar("created_by_agent", { length: 120 }).notNull().default("dreamer"),
  reviewAfter: timestamp("review_after", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const experiments = pgTable("experiments", {
  id: id(),
  scope: varchar("scope", { length: 64 }).notNull().default("wobble"),
  clientId: text("client_id"),
  linkedSuggestionId: text("linked_suggestion_id"),
  title: text("title").notNull(),
  hypothesis: text("hypothesis").notNull(),
  goal: text("goal").notNull(),
  primaryMetric: varchar("primary_metric", { length: 120 }).notNull(),
  expectedResult: text("expected_result").notNull(),
  actualResult: text("actual_result"),
  decision: text("decision"),
  owner: varchar("owner", { length: 120 }),
  status: varchar("status", { length: 32 }).notNull().default("planned"),
  approvalStatus: varchar("approval_status", { length: 32 }).notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  reviewAt: timestamp("review_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const outputIntelligenceUsage = pgTable("output_intelligence_usage", {
  id: id(),
  outputType: varchar("output_type", { length: 80 }).notNull(),
  outputId: text("output_id").notNull(),
  sourceId: text("source_id"),
  intelligenceItemId: text("intelligence_item_id"),
  insightId: text("insight_id"),
  memoryChunkId: text("memory_chunk_id"),
  weight: numeric("weight"),
  metadata: metadata(),
  createdAt: createdAt(),
});

export const tasteProfiles = pgTable("taste_profiles", {
  id: id(),
  profileKey: varchar("profile_key", { length: 160 }).notNull(),
  scope: varchar("scope", { length: 40 }).notNull(),
  subjectId: text("subject_id"),
  label: varchar("label", { length: 180 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  hardConstraints: jsonb("hard_constraints").$type<string[]>().notNull().default([]),
  preferenceWeights: jsonb("preference_weights").$type<Record<string, number>>().notNull().default({}),
  positiveSignals: integer("positive_signals").notNull().default(0),
  negativeSignals: integer("negative_signals").notNull().default(0),
  confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull().default("0"),
  lastFeedbackAt: timestamp("last_feedback_at", { withTimezone: true }),
  provenanceEventIds: jsonb("provenance_event_ids").$type<string[]>().notNull().default([]),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("taste_profiles_profile_key_unique").on(table.profileKey),
  index("taste_profiles_scope_idx").on(table.scope),
  index("taste_profiles_subject_idx").on(table.subjectId),
  index("taste_profiles_status_idx").on(table.status),
]);

export const feedbackEvents = pgTable("feedback_events", {
  id: id(),
  targetType: varchar("target_type", { length: 80 }).notNull(),
  targetId: text("target_id").notNull(),
  decision: varchar("decision", { length: 32 }).notNull(),
  reasonCategory: varchar("reason_category", { length: 80 }),
  reason: text("reason"),
  actor: varchar("actor", { length: 120 }).notNull(),
  founderId: varchar("founder_id", { length: 120 }),
  clientId: text("client_id"),
  projectId: text("project_id"),
  outputType: varchar("output_type", { length: 120 }),
  module: varchar("module", { length: 80 }),
  agentSlug: varchar("agent_slug", { length: 120 }),
  sourceIds: jsonb("source_ids").$type<string[]>().notNull().default([]),
  memoryBankSlugs: jsonb("memory_bank_slugs").$type<string[]>().notNull().default([]),
  dimensions: jsonb("dimensions").$type<Array<{ key: string; value: string; weight?: number }>>().notNull().default([]),
  profileKeys: jsonb("profile_keys").$type<string[]>().notNull().default([]),
  signalStrength: numeric("signal_strength", { precision: 6, scale: 4 }).notNull().default("1"),
  metadata: metadata(),
  createdAt: createdAt(),
}, (table) => [
  index("feedback_events_target_idx").on(table.targetType, table.targetId),
  index("feedback_events_actor_idx").on(table.actor),
  index("feedback_events_module_idx").on(table.module),
  index("feedback_events_agent_slug_idx").on(table.agentSlug),
  index("feedback_events_created_at_idx").on(table.createdAt),
]);


// ---- Chunk 52: Agent Registry & Orchestration (the hive-mind backbone) ----
// Every AI agent/sub-agent is registered here (visible, not hidden) and every
// run is logged with cost/quality/provenance so we can see the team working.
export const agents = pgTable("agents", {
  id: id(),
  slug: varchar("slug", { length: 120 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  role: varchar("role", { length: 80 }).notNull(),
  module: varchar("module", { length: 80 }).notNull(),
  team: varchar("team", { length: 80 }),
  purpose: text("purpose").notNull(),
  inputTypes: jsonb("input_types").$type<string[]>().notNull().default([]),
  outputTypes: jsonb("output_types").$type<string[]>().notNull().default([]),
  tools: jsonb("tools").$type<string[]>().notNull().default([]),
  memoryBanks: jsonb("memory_banks").$type<string[]>().notNull().default([]),
  modelRole: varchar("model_role", { length: 80 }),
  costProfile: varchar("cost_profile", { length: 40 }).notNull().default("mid"),
  cadence: varchar("cadence", { length: 40 }).notNull().default("manual"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  qualityScore: numeric("quality_score", { precision: 5, scale: 2 }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  runCount: integer("run_count").notNull().default(0),
  failureCount: integer("failure_count").notNull().default(0),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("agents_slug_unique").on(table.slug),
  index("agents_module_idx").on(table.module),
  index("agents_team_idx").on(table.team),
  index("agents_status_idx").on(table.status),
]);

export const agentRuns = pgTable("agent_runs", {
  id: id(),
  agentId: text("agent_id").notNull(),
  agentSlug: varchar("agent_slug", { length: 120 }).notNull(),
  jobId: text("job_id"),
  status: varchar("status", { length: 32 }).notNull().default("running"),
  inputSummary: text("input_summary"),
  outputSummary: text("output_summary"),
  modelRunIds: jsonb("model_run_ids").$type<string[]>().notNull().default([]),
  sourceIdsUsed: jsonb("source_ids_used").$type<string[]>().notNull().default([]),
  memoryIdsUsed: jsonb("memory_ids_used").$type<string[]>().notNull().default([]),
  costEstimate: numeric("cost_estimate", { precision: 12, scale: 6 }),
  latencyMs: integer("latency_ms"),
  qualityScore: numeric("quality_score", { precision: 5, scale: 2 }),
  error: text("error"),
  ownerScope: varchar("owner_scope", { length: 40 }),
  ownerId: text("owner_id"),
  metadata: metadata(),
  createdAt: createdAt(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  index("agent_runs_agent_id_idx").on(table.agentId),
  index("agent_runs_agent_slug_idx").on(table.agentSlug),
  index("agent_runs_status_idx").on(table.status),
  index("agent_runs_created_at_idx").on(table.createdAt),
]);

// ---- Conversational memory: log every chat (per founder) so a background
// Memory Harvester can learn durable facts/preferences and route them to the
// right memory bank (this founder's taste vs WOBBLE brand, gated by trust). ----
export const conversations = pgTable("conversations", {
  id: id(),
  founderId: varchar("founder_id", { length: 120 }),
  founderName: varchar("founder_name", { length: 120 }),
  surface: varchar("surface", { length: 80 }).notNull().default("ask_wobble"),
  scope: varchar("scope", { length: 40 }).notNull().default("founder"),
  clientId: text("client_id"),
  projectId: text("project_id"),
  title: text("title"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  messageCount: integer("message_count").notNull().default(0),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  harvestStatus: varchar("harvest_status", { length: 32 }).notNull().default("pending"),
  harvestedAt: timestamp("harvested_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("conversations_founder_id_idx").on(table.founderId),
  index("conversations_status_idx").on(table.status),
  index("conversations_harvest_status_idx").on(table.harvestStatus),
  index("conversations_surface_idx").on(table.surface),
]);

export const conversationMessages = pgTable("conversation_messages", {
  id: id(),
  conversationId: text("conversation_id").notNull(),
  role: varchar("role", { length: 32 }).notNull(),
  content: text("content"),
  toolName: varchar("tool_name", { length: 120 }),
  modelRunId: text("model_run_id"),
  metadata: metadata(),
  createdAt: createdAt(),
}, (table) => [
  index("conversation_messages_conversation_id_idx").on(table.conversationId),
]);

// ---- Chunk 13: Knowledge Compiler (Karpathy "compile, don't just retrieve"). ----
// For each APPROVED source, the compiler extracts atomic, self-contained knowledge
// notes (claim/insight/framework/hook_pattern/objection/data_point), each grounded in
// provenance (sourceId + chunkIds), typed + topical + confidence-scored + embedded, and
// SYNTHESIZED into the existing base (dedupe → reinforce, interlink related, flag
// contradictions). This is the compiled "wiki" layer that compounds; raw source_chunks
// remain the fidelity/citation layer. Downstream agents retrieve notes + chunks via one
// hybrid contract, auto-picking-up new knowledge with no code change.
export const knowledgeNotes = pgTable("knowledge_notes", {
  id: id(),
  // Provenance — the primary source + the exact chunk ids the note was compiled from.
  sourceId: text("source_id"),
  sourceIds: jsonb("source_ids").$type<string[]>().notNull().default([]), // all sources that reinforced this note
  provenanceChunkIds: jsonb("provenance_chunk_ids").$type<string[]>().notNull().default([]),
  noteType: varchar("note_type", { length: 40 }).notNull(),
  topic: varchar("topic", { length: 160 }).notNull(),
  area: varchar("area", { length: 80 }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(), // the atomic, self-contained note
  confidence: numeric("confidence"),
  trustLevel: varchar("trust_level", { length: 48 }).notNull().default("experimental"),
  embedding: vector("embedding", { dimensions: 1536 }),
  status: varchar("status", { length: 32 }).notNull().default("active"), // active | archived | superseded
  supersededByNoteId: text("superseded_by_note_id"),
  timesReinforced: integer("times_reinforced").notNull().default(0),
  bankSlugs: jsonb("bank_slugs").$type<string[]>().notNull().default([]), // routed memory banks
  createdBy: varchar("created_by", { length: 120 }),
  lastCompiledAt: timestamp("last_compiled_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("knowledge_notes_source_id_idx").on(table.sourceId),
  index("knowledge_notes_note_type_idx").on(table.noteType),
  index("knowledge_notes_topic_idx").on(table.topic),
  index("knowledge_notes_status_idx").on(table.status),
]);

// The interlinked "wiki" graph: a note supports / refines / contradicts / duplicates another.
export const knowledgeNoteLinks = pgTable("knowledge_note_links", {
  id: id(),
  fromNoteId: text("from_note_id").notNull(),
  toNoteId: text("to_note_id").notNull(),
  linkType: varchar("link_type", { length: 40 }).notNull().default("relates_to"),
  confidence: numeric("confidence"),
  createdBy: varchar("created_by", { length: 120 }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("knowledge_note_links_from_idx").on(table.fromNoteId),
  index("knowledge_note_links_to_idx").on(table.toNoteId),
  index("knowledge_note_links_type_idx").on(table.linkType),
]);

// ---- Content Library & Scheduler ----
// The library holds every publishable asset: the founder's existing content (reels, images,
// carousels, captions) AND packs approved out of Content Command. scheduled_posts is the
// calendar/queue that dispatches an asset to a platform at a time via a pluggable publisher
// (manual / n8n / a unified social API) — provider-agnostic so we're never locked in.
export const contentAssets = pgTable("content_assets", {
  id: id(),
  title: text("title").notNull(),
  kind: varchar("kind", { length: 40 }).notNull().default("image"), // reel | image | carousel | video | story | text
  caption: text("caption"),
  mediaRefs: jsonb("media_refs").$type<Array<{ url?: string; path?: string; kind?: string; order?: number }>>().notNull().default([]),
  platforms: jsonb("platforms").$type<string[]>().notNull().default([]),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  ownerScope: varchar("owner_scope", { length: 40 }).notNull().default("company"),
  ownerId: text("owner_id"),
  sourceType: varchar("source_type", { length: 40 }).notNull().default("imported"), // imported | content_pack | manual
  sourcePacketId: text("source_packet_id"), // links back to a content_packet when it came from Content Command
  status: varchar("status", { length: 32 }).notNull().default("draft"), // draft | ready | scheduled | published | archived
  createdBy: varchar("created_by", { length: 120 }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("content_assets_status_idx").on(table.status),
  index("content_assets_kind_idx").on(table.kind),
  index("content_assets_source_packet_idx").on(table.sourcePacketId),
]);

export const scheduledPosts = pgTable("scheduled_posts", {
  id: id(),
  assetId: text("asset_id").notNull(),
  platform: varchar("platform", { length: 40 }).notNull(), // instagram | facebook | linkedin | x | youtube | tiktok
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("scheduled"), // scheduled | publishing | published | failed | canceled
  publisher: varchar("publisher", { length: 40 }).notNull().default("manual"), // manual | ayrshare | zernio | n8n
  publisherRef: text("publisher_ref"), // external post id from the publisher
  publishedAt: timestamp("published_at", { withTimezone: true }),
  result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
  error: text("error"),
  createdBy: varchar("created_by", { length: 120 }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("scheduled_posts_status_idx").on(table.status),
  index("scheduled_posts_scheduled_at_idx").on(table.scheduledAt),
  index("scheduled_posts_asset_id_idx").on(table.assetId),
  index("scheduled_posts_platform_idx").on(table.platform),
  // At most ONE published row per asset+platform — the DB backstop against a concurrent
  // mark-posted race creating duplicate published rows. Partial, so non-published rows
  // (scheduled/canceled history, reschedules) are unaffected.
  uniqueIndex("scheduled_posts_published_asset_platform_uidx").on(table.assetId, table.platform).where(sql`status = 'published'`),
]);

// ---------------------------------------------------------------- Wobble ERP Control Layer (CRM spine)
// Connected business backbone: Company is the parent object; Contacts/Leads/Opportunities hang off
// it. Soft-delete via archived_at (no hard delete); every stage move logged to history + audit.

export const crmCompanies = pgTable("crm_companies", {
  id: id(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  industry: varchar("industry", { length: 120 }),
  website: text("website"),
  country: varchar("country", { length: 80 }),
  city: varchar("city", { length: 120 }),
  email: text("email"),
  phone: varchar("phone", { length: 60 }),
  whatsapp: varchar("whatsapp", { length: 60 }),
  socialLinks: jsonb("social_links").$type<Record<string, string>>().notNull().default({}),
  leadSource: varchar("lead_source", { length: 80 }),
  status: varchar("status", { length: 40 }).notNull().default("prospect"),
  clientType: varchar("client_type", { length: 60 }),
  companySize: varchar("company_size", { length: 40 }),
  notes: text("notes"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  metadata: metadata(),
  createdBy: varchar("created_by", { length: 120 }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("crm_companies_status_idx").on(table.status),
  index("crm_companies_archived_idx").on(table.archivedAt),
]);

export const crmContacts = pgTable("crm_contacts", {
  id: id(),
  companyId: text("company_id"),
  fullName: text("full_name").notNull(),
  role: varchar("role", { length: 120 }),
  email: text("email"),
  phone: varchar("phone", { length: 60 }),
  whatsapp: varchar("whatsapp", { length: 60 }),
  linkedin: text("linkedin"),
  relationshipType: varchar("relationship_type", { length: 40 }).notNull().default("other"),
  leadSource: varchar("lead_source", { length: 80 }),
  preferredChannel: varchar("preferred_channel", { length: 40 }),
  lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
  nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
  assignedOwner: varchar("assigned_owner", { length: 120 }),
  notes: text("notes"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  metadata: metadata(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("crm_contacts_company_idx").on(table.companyId),
  index("crm_contacts_archived_idx").on(table.archivedAt),
]);

export const crmLeads = pgTable("crm_leads", {
  id: id(),
  name: text("name").notNull(),
  companyId: text("company_id"),
  contactId: text("contact_id"),
  // Raw capture fields — a lead often arrives before formal company/contact records exist; convertLead promotes these.
  contactName: text("contact_name"),
  email: text("email"),
  phone: varchar("phone", { length: 60 }),
  whatsapp: varchar("whatsapp", { length: 60 }),
  companyName: text("company_name"),
  website: text("website"),
  industry: varchar("industry", { length: 120 }),
  source: varchar("source", { length: 80 }),
  campaign: varchar("campaign", { length: 120 }),
  score: integer("score").notNull().default(0),
  intentLevel: varchar("intent_level", { length: 20 }).notNull().default("unknown"),
  budgetLevel: varchar("budget_level", { length: 20 }).notNull().default("unknown"),
  urgencyLevel: varchar("urgency_level", { length: 20 }).notNull().default("unknown"),
  fitLevel: varchar("fit_level", { length: 20 }).notNull().default("unknown"),
  problemStated: text("problem_stated"),
  serviceInterest: jsonb("service_interest").$type<string[]>().notNull().default([]),
  assignedOwner: varchar("assigned_owner", { length: 120 }),
  status: varchar("status", { length: 32 }).notNull().default("new"),
  convertedOpportunityId: text("converted_opportunity_id"),
  metadata: metadata(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("crm_leads_status_idx").on(table.status),
  index("crm_leads_company_idx").on(table.companyId),
]);

export const crmOpportunities = pgTable("crm_opportunities", {
  id: id(),
  name: text("name").notNull(),
  companyId: text("company_id").notNull(),
  contactId: text("contact_id"),
  stage: varchar("stage", { length: 40 }).notNull().default("new_lead"),
  valueCents: integer("value_cents").notNull().default(0),
  currency: varchar("currency", { length: 8 }).notNull().default("USD"),
  probability: integer("probability").notNull().default(0),
  expectedCloseAt: timestamp("expected_close_at", { withTimezone: true }),
  source: varchar("source", { length: 80 }),
  assignedOwner: varchar("assigned_owner", { length: 120 }),
  priority: varchar("priority", { length: 20 }).notNull().default("medium"),
  serviceInterest: jsonb("service_interest").$type<string[]>().notNull().default([]),
  painPoints: text("pain_points"),
  nextAction: text("next_action"),
  nextActionAt: timestamp("next_action_at", { withTimezone: true }),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  lostReason: text("lost_reason"),
  winReason: text("win_reason"),
  proposalId: text("proposal_id"),
  invoiceId: text("invoice_id"),
  metadata: metadata(),
  createdBy: varchar("created_by", { length: 120 }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("crm_opportunities_stage_idx").on(table.stage),
  index("crm_opportunities_status_idx").on(table.status),
  index("crm_opportunities_company_idx").on(table.companyId),
]);

export const crmStageHistory = pgTable("crm_stage_history", {
  id: id(),
  opportunityId: text("opportunity_id").notNull(),
  oldStage: varchar("old_stage", { length: 40 }),
  newStage: varchar("new_stage", { length: 40 }).notNull(),
  movedBy: varchar("moved_by", { length: 120 }),
  reason: text("reason"),
  createdAt: createdAt(),
}, (table) => [
  index("crm_stage_history_opportunity_idx").on(table.opportunityId),
]);

// ---------------------------------------------------------------- Invoices + Finance-lite
// Draft/track invoices, link to opportunities. AI may DRAFT but must not approve/send/mark-paid or
// move money without human approval (ERP brief section G).

export const invoices = pgTable("invoices", {
  id: id(),
  invoiceNumber: varchar("invoice_number", { length: 40 }).notNull(),
  companyId: text("company_id"),
  contactId: text("contact_id"),
  opportunityId: text("opportunity_id"),
  proposalId: text("proposal_id"),
  billingDetails: jsonb("billing_details").$type<Record<string, unknown>>().notNull().default({}),
  lineItems: jsonb("line_items").$type<Array<{ description: string; quantity: number; unitPriceCents: number }>>().notNull().default([]),
  currency: varchar("currency", { length: 8 }).notNull().default("USD"),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  discountCents: integer("discount_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  amountPaidCents: integer("amount_paid_cents").notNull().default(0),
  dueDate: timestamp("due_date", { withTimezone: true }),
  paymentTerms: varchar("payment_terms", { length: 80 }),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  paymentReference: text("payment_reference"),
  notes: text("notes"),
  createdBy: varchar("created_by", { length: 120 }),
  approvedBy: varchar("approved_by", { length: 120 }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("invoices_number_idx").on(table.invoiceNumber),
  index("invoices_status_idx").on(table.status),
  index("invoices_company_idx").on(table.companyId),
  index("invoices_opportunity_idx").on(table.opportunityId),
]);

// ---- Payments ledger: one row per received payment. invoices.amount_paid_cents is the SUM of these,
// recomputed under a row lock — never a mutated running total. The partial unique index makes a
// paymentReference (the idempotency key) applicable at most once per invoice, so a duplicate submit
// (double-click / webhook retry) cannot double-count. Reference-less payments are each distinct. ----
export const payments = pgTable("payments", {
  id: id(),
  invoiceId: text("invoice_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  paymentReference: varchar("payment_reference", { length: 200 }),
  method: varchar("method", { length: 40 }).notNull().default("manual"),
  note: text("note"),
  recordedBy: varchar("recorded_by", { length: 120 }),
  metadata: metadata(),
  createdAt: createdAt(),
}, (table) => [
  index("payments_invoice_id_idx").on(table.invoiceId),
  uniqueIndex("payments_invoice_ref_uidx").on(table.invoiceId, table.paymentReference).where(sql`payment_reference IS NOT NULL`),
]);

// ---------------------------------------------------------------- Audits (Free / Paid AI audits)
// A prospect audit attached to a company/opportunity. v1 free audit = deterministic diagnosis over
// the Wobble service catalog; the LLM agent team + paid McKinsey-depth audit layer on later.

export const audits = pgTable("audits", {
  id: id(),
  kind: varchar("kind", { length: 16 }).notNull().default("free"), // free | paid
  companyId: text("company_id"),
  opportunityId: text("opportunity_id"),
  businessName: text("business_name").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("complete"),
  report: jsonb("report").$type<Record<string, unknown>>().notNull().default({}),
  input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: varchar("created_by", { length: 120 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("audits_kind_idx").on(table.kind),
  index("audits_company_idx").on(table.companyId),
]);

// ---------------------------------------------------------------- Proposals
// Built from an audit's findings (services + scope + timeline + pricing), linked to an opportunity.
// Founder-approved before sending; an accepted proposal can trigger an invoice draft.

export const proposals = pgTable("proposals", {
  id: id(),
  companyId: text("company_id"),
  opportunityId: text("opportunity_id"),
  auditId: text("audit_id"),
  title: text("title").notNull(),
  services: jsonb("services").$type<Array<{ name: string; description?: string; priceCents?: number }>>().notNull().default([]),
  scope: text("scope"),
  timeline: jsonb("timeline").$type<Array<{ phase: string; months?: string; focus?: string }>>().notNull().default([]),
  pricingCents: integer("pricing_cents").notNull().default(0),
  currency: varchar("currency", { length: 8 }).notNull().default("USD"),
  terms: text("terms"),
  status: varchar("status", { length: 24 }).notNull().default("draft"), // draft|needs_review|approved|sent|viewed|accepted|rejected|expired|archived
  version: integer("version").notNull().default(1),
  createdBy: varchar("created_by", { length: 120 }),
  approvedBy: varchar("approved_by", { length: 120 }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  rejectedReason: text("rejected_reason"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("proposals_status_idx").on(table.status),
  index("proposals_company_idx").on(table.companyId),
  index("proposals_opportunity_idx").on(table.opportunityId),
]);

// ---------------------------------------------------------------- Tasks + Meetings (ERP brief E + F)
// Work allocation + calendar. Connected to company/contact/opportunity/proposal/invoice. Soft-delete.

export const tasks = pgTable("tasks", {
  id: id(),
  title: text("title").notNull(),
  description: text("description"),
  taskType: varchar("task_type", { length: 40 }).notNull().default("internal_admin"),
  priority: varchar("priority", { length: 20 }).notNull().default("medium"),
  status: varchar("status", { length: 24 }).notNull().default("not_started"), // not_started|in_progress|waiting|blocked|needs_review|completed|cancelled
  assignedTo: varchar("assigned_to", { length: 120 }),
  assignedBy: varchar("assigned_by", { length: 120 }),
  companyId: text("company_id"),
  contactId: text("contact_id"),
  opportunityId: text("opportunity_id"),
  proposalId: text("proposal_id"),
  invoiceId: text("invoice_id"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  reminderDate: timestamp("reminder_date", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  notes: text("notes"),
  createdBy: varchar("created_by", { length: 120 }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("tasks_status_idx").on(table.status),
  index("tasks_assigned_idx").on(table.assignedTo),
  index("tasks_company_idx").on(table.companyId),
  index("tasks_due_idx").on(table.dueDate),
]);

export const meetings = pgTable("meetings", {
  id: id(),
  title: text("title").notNull(),
  description: text("description"),
  meetingType: varchar("meeting_type", { length: 40 }).notNull().default("ai_readiness_call"),
  startAt: timestamp("start_at", { withTimezone: true }),
  endAt: timestamp("end_at", { withTimezone: true }),
  timezone: varchar("timezone", { length: 60 }),
  organizer: varchar("organizer", { length: 120 }),
  attendees: jsonb("attendees").$type<string[]>().notNull().default([]),
  companyId: text("company_id"),
  contactId: text("contact_id"),
  opportunityId: text("opportunity_id"),
  location: text("location"),
  status: varchar("status", { length: 24 }).notNull().default("scheduled"), // scheduled|completed|rescheduled|cancelled|no_show|needs_follow_up
  outcome: text("outcome"),
  notes: text("notes"),
  followUpRequired: boolean("follow_up_required").notNull().default(false),
  createdBy: varchar("created_by", { length: 120 }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("meetings_status_idx").on(table.status),
  index("meetings_start_idx").on(table.startAt),
  index("meetings_company_idx").on(table.companyId),
]);

// ---------------------------------------------------------------- Projects / Client Delivery (ERP brief I)
// A won deal becomes a client project workspace. Milestones/deliverables + health.

export const projects = pgTable("projects", {
  id: id(),
  name: text("name").notNull(),
  companyId: text("company_id"),
  opportunityId: text("opportunity_id"),
  proposalId: text("proposal_id"),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  owner: varchar("owner", { length: 120 }),
  teamMembers: jsonb("team_members").$type<string[]>().notNull().default([]),
  status: varchar("status", { length: 24 }).notNull().default("not_started"), // not_started|onboarding|in_progress|waiting_on_client|at_risk|completed|paused|cancelled
  servicesIncluded: jsonb("services_included").$type<string[]>().notNull().default([]),
  milestones: jsonb("milestones").$type<Array<{ title: string; due?: string; done?: boolean }>>().notNull().default([]),
  deliverables: jsonb("deliverables").$type<Array<{ title: string; done?: boolean }>>().notNull().default([]),
  healthScore: integer("health_score").notNull().default(80),
  clientNotes: text("client_notes"),
  internalNotes: text("internal_notes"),
  createdBy: varchar("created_by", { length: 120 }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("projects_status_idx").on(table.status),
  index("projects_company_idx").on(table.companyId),
  index("projects_opportunity_idx").on(table.opportunityId),
]);

// ---------------------------------------------------------------- Decision Room (strategy)
// Where strategy is debated, scored and committed — each decision keeps its reasoning trail.

export const decisions = pgTable("decisions", {
  id: id(),
  title: text("title").notNull(),
  context: text("context"),
  category: varchar("category", { length: 40 }).notNull().default("strategy"),
  status: varchar("status", { length: 20 }).notNull().default("open"), // open|scoring|decided|revisit|archived
  options: jsonb("options").$type<Array<{ id: string; label: string; rationale?: string; pros?: string[]; cons?: string[]; score?: number }>>().notNull().default([]),
  decidedOptionId: text("decided_option_id"),
  decisionRationale: text("decision_rationale"),
  reasoningTrail: jsonb("reasoning_trail").$type<Array<{ at: string; note: string; by?: string }>>().notNull().default([]),
  confidence: integer("confidence").notNull().default(0),
  owner: varchar("owner", { length: 120 }),
  companyId: text("company_id"),
  opportunityId: text("opportunity_id"),
  createdBy: varchar("created_by", { length: 120 }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("decisions_status_idx").on(table.status),
  index("decisions_category_idx").on(table.category),
]);

// ---------------------------------------------------------------- Offer Lab (strategy)
// Design, test and iterate offers. Low-confidence experiments never reach a founder cold.

export const offers = pgTable("offers", {
  id: id(),
  name: text("name").notNull(),
  hypothesis: text("hypothesis"),
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft|testing|winning|paused|retired
  audience: text("audience"),
  promise: text("promise"),
  priceModel: varchar("price_model", { length: 40 }),
  priceCents: integer("price_cents").notNull().default(0),
  currency: varchar("currency", { length: 8 }).notNull().default("USD"),
  deliverables: jsonb("deliverables").$type<string[]>().notNull().default([]),
  experiments: jsonb("experiments").$type<Array<{ id: string; name: string; metric?: string; result?: string; status?: string }>>().notNull().default([]),
  score: integer("score").notNull().default(0),
  resultNotes: text("result_notes"),
  owner: varchar("owner", { length: 120 }),
  createdBy: varchar("created_by", { length: 120 }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("offers_status_idx").on(table.status),
]);

// ---------------------------------------------------------------- Automations (operations)
// Recurring/triggered rules: a trigger fires an action (enqueue a real job). No fake automation.

export const automationRules = pgTable("automation_rules", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  triggerType: varchar("trigger_type", { length: 20 }).notNull().default("manual"), // manual|event|schedule
  triggerEvent: varchar("trigger_event", { length: 80 }), // audit event type to match, when triggerType=event
  schedule: varchar("schedule", { length: 60 }), // cron-ish, when triggerType=schedule
  actionQueue: varchar("action_queue", { length: 60 }).notNull().default("general"),
  actionType: varchar("action_type", { length: 80 }).notNull(),
  actionPayload: jsonb("action_payload").$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean("enabled").notNull().default(true),
  runCount: integer("run_count").notNull().default(0),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastStatus: varchar("last_status", { length: 20 }),
  createdBy: varchar("created_by", { length: 120 }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("automation_rules_enabled_idx").on(table.enabled),
  index("automation_rules_trigger_idx").on(table.triggerEvent),
]);

// ---------------------------------------------------------------- SEO & Blog Engine (growth)
// AI keyword + blog planning. A plan is generated by the LLM, then a founder edits/approves.

export const seoPlans = pgTable("seo_plans", {
  id: id(),
  topic: text("topic").notNull(),
  audience: text("audience"),
  status: varchar("status", { length: 16 }).notNull().default("draft"), // draft|planned|active|archived
  pillar: text("pillar"),
  targetKeywords: jsonb("target_keywords").$type<Array<{ keyword: string; intent?: string; priority?: string; note?: string }>>().notNull().default([]),
  blogIdeas: jsonb("blog_ideas").$type<Array<{ title: string; angle?: string; targetKeyword?: string; outline?: string[] }>>().notNull().default([]),
  notes: text("notes"),
  createdBy: varchar("created_by", { length: 120 }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("seo_plans_status_idx").on(table.status),
]);

// ---------------------------------------------------------------- Research Radar (pipeline)
// AI signal scan across markets, competitors and culture. Surfaced + scored for review.

export const radarScans = pgTable("radar_scans", {
  id: id(),
  focus: text("focus").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("new"), // new|reviewed|actioned|dismissed
  signals: jsonb("signals").$type<Array<{ title: string; category?: string; summary?: string; implication?: string; score?: number }>>().notNull().default([]),
  createdBy: varchar("created_by", { length: 120 }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("radar_scans_status_idx").on(table.status),
]);

// ---------------------------------------------------------------- Social Intelligence (growth)
// AI platform strategy: positioning, content pillars, hooks, competitor angles, post ideas.

export const socialStrategies = pgTable("social_strategies", {
  id: id(),
  platform: varchar("platform", { length: 24 }).notNull().default("multi"), // instagram|linkedin|tiktok|x|multi
  niche: text("niche").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("draft"), // draft|active|archived
  strategy: jsonb("strategy").$type<{ positioning?: string; cadence?: string; pillars?: string[]; hooks?: string[]; competitorAngles?: string[]; contentIdeas?: Array<{ format?: string; idea: string; hook?: string }> }>().notNull().default({}),
  createdBy: varchar("created_by", { length: 120 }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("social_strategies_status_idx").on(table.status),
]);

// ---- Graph checkpointing: durable per-node outputs so a multi-agent graph (content graph,
// paid-audit graph) can RESUME after a late-node failure, worker/app restart, or retry WITHOUT
// re-running (and re-charging) the nodes that already completed. Keyed by a stable graphRunId; one
// row per node per run (unique) so duplicate workers / duplicate job delivery can't create dupes.
// schemaVersion invalidates stale/incompatible cached outputs. Cleared on success; retention purge
// sweeps abandoned runs. ----
export const graphCheckpoints = pgTable("graph_checkpoints", {
  id: id(),
  graphRunId: varchar("graph_run_id", { length: 200 }).notNull(),
  graph: varchar("graph", { length: 64 }).notNull(),
  nodeSlug: varchar("node_slug", { length: 120 }).notNull(),
  nodeIndex: integer("node_index").notNull().default(0),
  status: varchar("status", { length: 32 }).notNull().default("completed"),
  schemaVersion: integer("schema_version").notNull().default(1),
  outputText: text("output_text").notNull().default(""),
  output: jsonb("output").$type<Record<string, unknown> | null>(),
  modelRunIds: jsonb("model_run_ids").$type<string[]>().notNull().default([]),
  error: text("error"),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("graph_checkpoints_run_node_uidx").on(table.graphRunId, table.nodeSlug),
  index("graph_checkpoints_run_idx").on(table.graphRunId),
  index("graph_checkpoints_created_at_idx").on(table.createdAt),
]);

// ---- Durable handoff runtime (Phase 2): the persistent inter-agent communication backbone. One row
// per structured handoff, with a delivery state machine (created→delivered→processing→acknowledged→
// completed | failed→retry/dead_lettered | cancelled), a processing lease for crash recovery, bounded
// retries with backoff (run_after), dead-letter + manual redrive, idempotent consumption (unique
// workflow+key), full envelope payload, telemetry, and terminal-state retention. ----
export const handoffs = pgTable("handoffs", {
  id: id(),
  workflowId: varchar("workflow_id", { length: 200 }).notNull(),
  taskId: varchar("task_id", { length: 120 }).notNull(),
  parentTaskId: varchar("parent_task_id", { length: 120 }),
  correlationId: varchar("correlation_id", { length: 200 }).notNull(),
  causationId: varchar("causation_id", { length: 120 }),
  department: varchar("department", { length: 64 }).notNull(),
  sourceAgent: varchar("source_agent", { length: 120 }).notNull(),
  destinationAgent: varchar("destination_agent", { length: 120 }),
  destinationCapability: varchar("destination_capability", { length: 120 }),
  companyId: text("company_id"),
  clientWorkspaceId: text("client_workspace_id"),
  projectId: text("project_id"),
  leadId: text("lead_id"),
  actor: varchar("actor", { length: 120 }).notNull(),
  dataClassification: varchar("data_classification", { length: 40 }).notNull().default("internal"),
  schemaVersion: integer("schema_version").notNull().default(1),
  envelope: jsonb("envelope").$type<Record<string, unknown>>().notNull(),
  deliveryState: varchar("delivery_state", { length: 32 }).notNull().default("delivered"),
  idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull(),
  leaseOwner: varchar("lease_owner", { length: 120 }),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(5),
  runAfter: timestamp("run_after", { withTimezone: true }),
  failureReason: text("failure_reason"),
  costEstimate: numeric("cost_estimate", { precision: 12, scale: 6 }),
  latencyMs: integer("latency_ms"),
  qualityScore: numeric("quality_score", { precision: 5, scale: 2 }),
  metadata: metadata(),
  createdAt: createdAt(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("handoffs_workflow_key_uidx").on(table.workflowId, table.idempotencyKey),
  index("handoffs_workflow_idx").on(table.workflowId),
  index("handoffs_correlation_idx").on(table.correlationId),
  index("handoffs_state_idx").on(table.deliveryState),
  index("handoffs_destination_idx").on(table.destinationAgent),
  index("handoffs_created_at_idx").on(table.createdAt),
]);

// ---- Approval effects OUTBOX (transactional-outbox pattern): when an approval is resolved, the flip
// AND the intent to run its downstream effect (activate source + compile, create memory, import
// content) are recorded in ONE transaction. A reconciliation worker then APPLIES each pending effect
// idempotently and marks it applied — so a crash between the flip and the effect converges without
// manual repair, and duplicate delivery applies the effect exactly once. ----
export const approvalEffects = pgTable("approval_effects", {
  id: id(),
  approvalId: text("approval_id").notNull(),
  effectType: varchar("effect_type", { length: 64 }).notNull(),
  entityType: varchar("entity_type", { length: 64 }).notNull(),
  entityId: text("entity_id").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  state: varchar("state", { length: 32 }).notNull().default("pending"), // pending | applied | failed
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(8),
  runAfter: timestamp("run_after", { withTimezone: true }),
  lastError: text("last_error"),
  actor: varchar("actor", { length: 120 }),
  createdAt: createdAt(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  updatedAt: updatedAt(),
}, (table) => [
  // At most one effect per (approval, type) — the dedup guarantee that makes it exactly-once.
  uniqueIndex("approval_effects_approval_type_uidx").on(table.approvalId, table.effectType),
  index("approval_effects_state_idx").on(table.state),
  index("approval_effects_created_at_idx").on(table.createdAt),
]);

// ---- DEPARTMENTS (Phase 3): a department is an independent operating unit — versioned identity, an
// orchestrator, hard tool/memory/data-classification permissions, the handoff schemas it accepts, the
// products it emits, the departments it delivers to, approvals + escalation, KPIs, and budget/limits.
// Authorization comes from THIS record + explicit memberships — never inferred from a free-text label. ----
export const departments = pgTable("departments", {
  id: id(),
  slug: varchar("slug", { length: 120 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  purpose: text("purpose").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("draft"), // draft | active | inactive | archived
  version: integer("version").notNull().default(1),
  orchestratorAgentSlug: varchar("orchestrator_agent_slug", { length: 120 }),
  deterministicServices: jsonb("deterministic_services").$type<string[]>().notNull().default([]),
  permissions: jsonb("permissions").$type<Record<string, unknown>>().notNull().default({}),
  io: jsonb("io").$type<Record<string, unknown>>().notNull().default({}),
  events: jsonb("events").$type<Record<string, unknown>>().notNull().default({}),
  governance: jsonb("governance").$type<Record<string, unknown>>().notNull().default({}),
  kpis: jsonb("kpis").$type<Record<string, unknown>[]>().notNull().default([]),
  budget: jsonb("budget").$type<Record<string, unknown>>().notNull().default({}),
  limits: jsonb("limits").$type<Record<string, unknown>>().notNull().default({}),
  degradedBehaviour: text("degraded_behaviour"),
  healthStatus: varchar("health_status", { length: 32 }).notNull().default("unknown"),
  owner: varchar("owner", { length: 120 }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("departments_slug_unique").on(table.slug),
  index("departments_status_idx").on(table.status),
  index("departments_health_idx").on(table.healthStatus),
]);

// ---- DEPARTMENT MEMBERSHIP (Phase 3): the EXPLICIT link between a department and a specialist agent or
// deterministic service, with per-membership scoped grants (tools, memory, input schemas, approval
// authority, budget). Security/memory authorization is derived from these rows + the department policy —
// never from a display label. An agent joins >1 department only via separate explicit memberships. ----
export const departmentMembers = pgTable("department_members", {
  id: id(),
  departmentSlug: varchar("department_slug", { length: 120 }).notNull(),
  memberType: varchar("member_type", { length: 16 }).notNull().default("agent"), // agent | service
  memberRef: varchar("member_ref", { length: 160 }).notNull(),
  role: varchar("role", { length: 80 }).notNull(),
  responsibility: text("responsibility").notNull(),
  managerAgentSlug: varchar("manager_agent_slug", { length: 120 }),
  active: boolean("active").notNull().default(true),
  priority: integer("priority").notNull().default(100),
  capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
  toolGrants: jsonb("tool_grants").$type<string[]>().notNull().default([]),
  memoryGrants: jsonb("memory_grants").$type<string[]>().notNull().default([]),
  allowedInputSchemas: jsonb("allowed_input_schemas").$type<string[]>().notNull().default([]),
  expectedOutputs: jsonb("expected_outputs").$type<string[]>().notNull().default([]),
  approvalAuthority: jsonb("approval_authority").$type<string[]>().notNull().default([]),
  escalationDestination: varchar("escalation_destination", { length: 160 }),
  budgetLimits: jsonb("budget_limits").$type<Record<string, unknown>>().notNull().default({}),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  // One membership per (department, memberType, memberRef).
  uniqueIndex("department_members_unique").on(table.departmentSlug, table.memberType, table.memberRef),
  index("department_members_dept_idx").on(table.departmentSlug),
  index("department_members_ref_idx").on(table.memberRef),
  index("department_members_active_idx").on(table.active),
]);

// ---- BUDGET RESERVATIONS (Phase 3): real operational budget enforcement via reserve → settle. Expensive
// work RESERVES an estimated spend against a department's windowed caps BEFORE the provider call; the
// actual cost SETTLES it afterward; abandoned reservations EXPIRE and release their hold. Idempotent per
// unit of work (department, workflow, task) so a retry never double-charges. ----
export const budgetReservations = pgTable("budget_reservations", {
  id: id(),
  departmentSlug: varchar("department_slug", { length: 120 }).notNull(),
  workflowId: text("workflow_id").notNull(),
  taskId: varchar("task_id", { length: 160 }).notNull(),
  estimatedCents: integer("estimated_cents").notNull().default(0),
  estimatedTokens: integer("estimated_tokens").notNull().default(0),
  actualCents: integer("actual_cents"),
  actualTokens: integer("actual_tokens"),
  provider: varchar("provider", { length: 80 }),
  state: varchar("state", { length: 16 }).notNull().default("reserved"), // reserved | settled | released | expired
  reason: text("reason"),
  overrideBy: varchar("override_by", { length: 120 }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  updatedAt: updatedAt(),
}, (table) => [
  // Idempotency: one reservation per unit of work — a retry reuses it (never double-charges).
  uniqueIndex("budget_reservations_unit_uidx").on(table.departmentSlug, table.workflowId, table.taskId),
  index("budget_reservations_dept_state_idx").on(table.departmentSlug, table.state),
  index("budget_reservations_state_expiry_idx").on(table.state, table.expiresAt),
  index("budget_reservations_created_idx").on(table.createdAt),
]);

// ---- ESCALATIONS (Phase 3): when work is blocked, a real escalation is raised for founder/department
// decision — with reason, severity, evidence, attempted recoveries, required decision, assignee, SLA and
// a truthful resolution (resume / reroute / blocked / terminate). Idempotent per (department, workflow,
// task, reason) so the same blocked step doesn't spam duplicate escalations. ----
export const escalations = pgTable("escalations", {
  id: id(),
  departmentSlug: varchar("department_slug", { length: 120 }).notNull(),
  workflowId: text("workflow_id"),
  taskId: varchar("task_id", { length: 160 }),
  clientWorkspaceId: varchar("client_workspace_id", { length: 120 }),
  sourceAgent: varchar("source_agent", { length: 120 }),
  reason: varchar("reason", { length: 48 }).notNull(), // reason category
  severity: varchar("severity", { length: 16 }).notNull().default("medium"), // low | medium | high | critical
  // Links to the real execution so a founder action controls the actual workflow (not just the record).
  handoffId: text("handoff_id"),
  budgetReservationId: text("budget_reservation_id"),
  approvalId: text("approval_id"),
  jobId: text("job_id"),
  graphRunId: text("graph_run_id"),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  attemptedRecoveries: jsonb("attempted_recoveries").$type<string[]>().notNull().default([]),
  requiredDecision: text("required_decision").notNull(),
  assignee: varchar("assignee", { length: 120 }),
  slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
  status: varchar("status", { length: 16 }).notNull().default("open"), // open | acknowledged | resolved | dismissed
  resolution: text("resolution"),
  resolutionAction: varchar("resolution_action", { length: 16 }), // resume | reroute | blocked | terminate
  resolvedBy: varchar("resolved_by", { length: 120 }),
  createdAt: createdAt(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  updatedAt: updatedAt(),
}, (table) => [
  // At most one OPEN escalation per (department, workflow, task, reason) — dedup so a retrying step
  // doesn't spam duplicates; resolved/dismissed rows don't participate (re-escalation is allowed later).
  uniqueIndex("escalations_open_dedup_uidx").on(table.departmentSlug, table.workflowId, table.taskId, table.reason).where(sql`status = 'open'`),
  index("escalations_dept_status_idx").on(table.departmentSlug, table.status),
  index("escalations_status_idx").on(table.status),
  index("escalations_created_idx").on(table.createdAt),
]);

// Phase 4 — independent QA board reviews. Append-only: a re-review after a `revise` is a legitimately new
// row (the PK is the only uniqueness). An INDEPENDENT reviewer (distinct agent identity) evaluates another
// department's artifact against explicit evidence + criteria; the authoring agent can never approve its own.
export const qaReviews = pgTable("qa_reviews", {
  id: id(),
  boardSlug: varchar("board_slug", { length: 120 }).notNull(),
  reviewerAgentSlug: varchar("reviewer_agent_slug", { length: 120 }).notNull(),
  department: varchar("department", { length: 120 }).notNull(),
  artifactSchema: varchar("artifact_schema", { length: 120 }).notNull(),
  authorAgentSlug: varchar("author_agent_slug", { length: 120 }).notNull(),
  workflowId: text("workflow_id").notNull(),
  taskId: varchar("task_id", { length: 160 }),
  clientWorkspaceId: varchar("client_workspace_id", { length: 120 }),
  verdict: varchar("verdict", { length: 16 }).notNull(), // pass | fail | revise | blocked
  score: numeric("score", { precision: 6, scale: 4 }).notNull().default("0"), // 0..1
  independent: boolean("independent").notNull().default(true),
  criteria: jsonb("criteria").$type<Record<string, unknown>[]>().notNull().default([]),
  evidence: jsonb("evidence").$type<Record<string, unknown>[]>().notNull().default([]),
  routingTarget: jsonb("routing_target").$type<Record<string, unknown> | null>(),
  summary: text("summary").notNull(),
  blockedReason: text("blocked_reason"),
  createdAt: createdAt(),
}, (table) => [
  index("qa_reviews_board_workflow_idx").on(table.boardSlug, table.workflowId),
  index("qa_reviews_dept_verdict_idx").on(table.department, table.verdict),
  index("qa_reviews_workflow_idx").on(table.workflowId),
  index("qa_reviews_created_idx").on(table.createdAt),
]);

// ---- PROVIDER USAGE (Phase 3): the ONE normalized contract for every provider call's ACTUAL usage —
// tokens (incl. cached + reasoning), provider-reported vs internally-calculated cost, latency, attempt,
// and the full workflow/task/handoff/department/agent/tenant context. Budget settles against THIS (actual),
// never the estimate. Idempotent by provider_request_id so retries + duplicate callbacks never double-charge. ----
export const providerUsage = pgTable("provider_usage", {
  id: id(),
  providerRequestId: varchar("provider_request_id", { length: 200 }).notNull(),
  provider: varchar("provider", { length: 80 }).notNull(),
  model: varchar("model", { length: 160 }).notNull(),
  attempt: integer("attempt").notNull().default(1),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  cachedInputTokens: integer("cached_input_tokens"),
  cachedOutputTokens: integer("cached_output_tokens"),
  reasoningTokens: integer("reasoning_tokens"),
  toolCalls: integer("tool_calls").notNull().default(0),
  providerReportedCostUsd: numeric("provider_reported_cost_usd", { precision: 12, scale: 6 }),
  calculatedCostUsd: numeric("calculated_cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  currency: varchar("currency", { length: 8 }).notNull().default("USD"),
  creditsConsumed: numeric("credits_consumed", { precision: 14, scale: 6 }),
  latencyMs: integer("latency_ms"),
  status: varchar("status", { length: 16 }).notNull().default("succeeded"), // succeeded | failed
  billable: boolean("billable").notNull().default(true),
  estimationStatus: varchar("estimation_status", { length: 16 }).notNull().default("estimated"), // estimated | actual
  verificationStatus: varchar("verification_status", { length: 16 }).notNull().default("unverified"), // unverified | verified
  workflowId: text("workflow_id"),
  taskId: varchar("task_id", { length: 160 }),
  handoffId: text("handoff_id"),
  departmentSlug: varchar("department_slug", { length: 120 }),
  agentSlug: varchar("agent_slug", { length: 120 }),
  companyId: varchar("company_id", { length: 120 }),
  clientWorkspaceId: varchar("client_workspace_id", { length: 120 }),
  role: varchar("role", { length: 80 }),
  module: varchar("module", { length: 80 }),
  modelRunId: text("model_run_id"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (table) => [
  // Idempotency: one usage row per (provider_request_id, attempt) — retries/duplicate callbacks converge.
  uniqueIndex("provider_usage_request_uidx").on(table.providerRequestId, table.attempt),
  index("provider_usage_unit_idx").on(table.departmentSlug, table.workflowId, table.taskId),
  index("provider_usage_created_idx").on(table.createdAt),
  index("provider_usage_client_idx").on(table.clientWorkspaceId),
]);

// ---- DECISION LEARNING (Doctrine 7): durable scoped policy PROPOSALS derived from committed Decision Room
// decisions. Never auto-applied — a row is `proposed` until an explicit, gated approval flips it to `active`.
// Partial-unique backstop: at most one LIVE (proposed|active) policy per (scope, scope_id, category,
// direction) so a concurrent proposer can't duplicate a direction the service already tracks. ----
export const decisionPolicies = pgTable("decision_policies", {
  id: id(),
  scope: varchar("scope", { length: 16 }).notNull(), // wobble | founder | client | project
  scopeId: varchar("scope_id", { length: 200 }).notNull(),
  category: varchar("category", { length: 120 }).notNull(),
  direction: text("direction").notNull(),
  statement: text("statement").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("proposed"), // proposed | active | superseded | rejected
  confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("0"), // 0..1
  repetitionCount: integer("repetition_count").notNull().default(0),
  agreementRatio: numeric("agreement_ratio", { precision: 4, scale: 3 }).notNull().default("0"), // 0..1
  contested: boolean("contested").notNull().default(false),
  dissentCount: integer("dissent_count").notNull().default(0),
  evidence: jsonb("evidence").$type<Record<string, unknown>[]>().notNull().default([]),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  supersedes: text("supersedes"),
  origin: varchar("origin", { length: 24 }).notNull(), // repetition | explicit_approval
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("decision_policies_live_natural_uidx").on(table.scope, table.scopeId, table.category, table.direction).where(sql`status in ('proposed','active')`),
  index("decision_policies_scope_idx").on(table.scope, table.scopeId, table.category),
  index("decision_policies_status_idx").on(table.status),
]);

// ---- AIOS VALUE / KPI (Doctrine 9): the durable, curated task/work inventory the value KPIs are computed
// from. Each row carries its OWN evidence tier (founder-estimate … verified-financial) so an aggregate KPI
// is never stronger than its weakest input. Curated (not auto-derived from logs), hence durable + editable. ----
export const taskInventory = pgTable("task_inventory", {
  id: id(),
  task: text("task").notNull(),
  owner: varchar("owner", { length: 120 }).notNull(),
  department: varchar("department", { length: 120 }).notNull(),
  frequency: jsonb("frequency").$type<{ per: string; count: number }>().notNull(),
  baselineMinutes: numeric("baseline_minutes", { precision: 10, scale: 2 }).notNull().default("0"),
  currentMinutes: numeric("current_minutes", { precision: 10, scale: 2 }).notNull().default("0"),
  automationState: varchar("automation_state", { length: 16 }).notNull(), // manual | augmented | automated | autonomous
  humanReviewMinutes: numeric("human_review_minutes", { precision: 10, scale: 2 }).notNull().default("0"),
  evidenceSource: varchar("evidence_source", { length: 24 }).notNull(), // AIOS_EVIDENCE_TIERS
  confidence: varchar("confidence", { length: 8 }).notNull().default("low"), // none | low | medium | high
  completedCount: integer("completed_count"),
  clientId: varchar("client_id", { length: 120 }), // denormalized from metadata for scope queries
  projectId: varchar("project_id", { length: 120 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("task_inventory_department_idx").on(table.department),
  index("task_inventory_client_idx").on(table.clientId),
  index("task_inventory_project_idx").on(table.projectId),
]);

// ---- DAILY FOUNDER BRIEF (Doctrine 8): the durable, evidence-linked founder brief assembled on a cadence
// from real WOBBLE signals (escalations/approvals/finance/delivery/…). Stores the full ranked brief so the
// founder surface renders progressive disclosure + every signal's drill-to-evidence link. ----
export const dailyBriefs = pgTable("daily_briefs", {
  id: id(),
  scopeType: varchar("scope_type", { length: 16 }).notNull(), // company | department | client | project
  scopeId: varchar("scope_id", { length: 200 }),
  cadence: varchar("cadence", { length: 16 }).notNull(), // daily | weekly | monthly | on_demand
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  isEmpty: boolean("is_empty").notNull().default(true),
  totalSignals: integer("total_signals").notNull().default(0),
  lowestConfidence: varchar("lowest_confidence", { length: 8 }), // none | low | medium | high
  degradedCategories: jsonb("degraded_categories").$type<string[]>().notNull().default([]),
  omittedSignals: integer("omitted_signals").notNull().default(0),
  note: text("note").notNull().default(""),
  brief: jsonb("brief").$type<Record<string, unknown>>().notNull(), // the full assembled FounderBrief
  createdAt: createdAt(),
}, (table) => [
  index("daily_briefs_scope_generated_idx").on(table.scopeType, table.scopeId, table.generatedAt),
  index("daily_briefs_generated_idx").on(table.generatedAt),
]);

// ---- CONTEXT OS (onboarding → trusted context). Raw intake is IMMUTABLE; extracted assertions are PENDING
// until an explicit founder approval makes them trusted; retrieval is scope-isolated + telemetered. Raw is
// never trusted directly. ----
export const contextSources = pgTable("context_sources", {
  id: id(),
  kind: varchar("kind", { length: 40 }).notNull(), // questionnaire | interview | manual | document | url | api | webhook | transcript | chatgpt_export | claude_export | drive | notion | crm
  content: text("content").notNull(),
  scopeType: varchar("scope_type", { length: 16 }).notNull(), // company | founder | client | project | department
  scopeId: varchar("scope_id", { length: 200 }).notNull(),
  classification: varchar("classification", { length: 32 }).notNull().default("internal"),
  importedBy: varchar("imported_by", { length: 120 }),
  metadata: metadata(),
  createdAt: createdAt(),
}, (table) => [
  index("context_sources_scope_idx").on(table.scopeType, table.scopeId),
  index("context_sources_created_idx").on(table.createdAt),
]);

export const contextAssertions = pgTable("context_assertions", {
  id: id(),
  sourceId: text("source_id").notNull(), // provenance → the immutable raw source
  statement: text("statement").notNull(),
  entities: jsonb("entities").$type<string[]>().notNull().default([]),
  scopeType: varchar("scope_type", { length: 16 }).notNull(),
  scopeId: varchar("scope_id", { length: 200 }).notNull(),
  classification: varchar("classification", { length: 32 }).notNull().default("internal"),
  trust: numeric("trust", { precision: 4, scale: 3 }).notNull().default("0.5"),
  status: varchar("status", { length: 16 }).notNull().default("extracted"), // extracted | approved | rejected | superseded
  version: integer("version").notNull().default(1),
  supersedes: text("supersedes"),
  extractedByAgent: varchar("extracted_by_agent", { length: 120 }),
  approvedBy: varchar("approved_by", { length: 120 }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("context_assertions_scope_status_idx").on(table.scopeType, table.scopeId, table.status),
  index("context_assertions_source_idx").on(table.sourceId),
]);

export const contextRetrievals = pgTable("context_retrievals", {
  id: id(),
  scopeType: varchar("scope_type", { length: 16 }).notNull(),
  scopeId: varchar("scope_id", { length: 200 }).notNull(),
  task: varchar("task", { length: 80 }).notNull(),
  agentSlug: varchar("agent_slug", { length: 120 }),
  // The exact approved assertion ids returned to the generator (the evidence of what shaped the output).
  assertionIds: jsonb("assertion_ids").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
}, (table) => [
  index("context_retrievals_scope_idx").on(table.scopeType, table.scopeId),
  index("context_retrievals_created_idx").on(table.createdAt),
]);

// A trusted-context retrieval that FAILED (fail-open: the generator proceeded WITHOUT grounding rather than
// fabricating context or crashing). Recorded EXPLICITLY so a sustained Context OS fault is founder-visible in the
// Command Centre (health), never silently degrading grounding. Captures generator + scope/tenant + error class +
// retryability + correlation + the downstream outcome.
export const contextRetrievalFailures = pgTable("context_retrieval_failures", {
  id: id(),
  generator: varchar("generator", { length: 120 }),  // the agent that requested grounding (content_strategist, audit_discovery…)
  task: varchar("task", { length: 80 }).notNull(),    // the retrieval task (social_content, paid_audit, proposal_synthesis…)
  scopeType: varchar("scope_type", { length: 16 }).notNull(), // the tenant scope: company | client | project | founder | department
  scopeId: varchar("scope_id", { length: 200 }).notNull(),
  errorCategory: varchar("error_category", { length: 40 }).notNull(), // db_unavailable | query_error | timeout | unknown
  errorMessage: text("error_message"),
  correlationId: varchar("correlation_id", { length: 120 }),
  retryable: boolean("retryable").notNull().default(true),
  downstreamOutcome: varchar("downstream_outcome", { length: 40 }).notNull().default("proceeded_ungrounded"),
  createdAt: createdAt(),
}, (table) => [
  index("context_retrieval_failures_scope_idx").on(table.scopeType, table.scopeId),
  index("context_retrieval_failures_created_idx").on(table.createdAt),
]);

// ---- COMMUNICATIONS OUTBOX (Phase 6): the durable artifact for the notification + external-comms Earned-Autonomy
// action points. A communication moves through a lifecycle: PREPARED (a reversible draft) → READY (staged for a
// founder send) → SENT (dispatched) | CANCELLED. Preparation is reversible → an earned grant can RELEASE it; the
// SEND of an EXTERNAL comm is externally-visible → it stays confirm-capped (never auto-sent by a policy). An
// INTERNAL notification is low-risk + reversible, so a grant can release its delivery. ----
export const communications = pgTable("communications", {
  id: id(),
  channel: varchar("channel", { length: 40 }).notNull(), // internal_notification | external_email | external_dm | external_other | proposal_send
  kind: varchar("kind", { length: 60 }).notNull(),       // alert | digest | reminder | outreach | follow_up | proposal_delivery …
  subject: varchar("subject", { length: 300 }).notNull(),
  body: text("body").notNull(),
  audience: varchar("audience", { length: 200 }),        // internal: role/team/actor; external: a recipient REFERENCE (handle/company), never a raw secret/address
  status: varchar("status", { length: 24 }).notNull().default("prepared"), // prepared | ready | sent | cancelled
  riskLevel: varchar("risk_level", { length: 16 }).notNull().default("low"),
  scopeType: varchar("scope_type", { length: 16 }).notNull().default("company"),
  companyId: varchar("company_id", { length: 120 }),
  clientId: varchar("client_id", { length: 120 }),
  projectId: varchar("project_id", { length: 120 }),
  relatedEntityType: varchar("related_entity_type", { length: 40 }), // e.g. proposal
  relatedEntityId: varchar("related_entity_id", { length: 120 }),
  autonomyLevel: varchar("autonomy_level", { length: 16 }),   // the level resolved at the acting point (observe…autonomous)
  autonomyPolicyId: varchar("autonomy_policy_id", { length: 120 }), // the policy that released the action (null when founder-driven)
  actedAutonomously: boolean("acted_autonomously").notNull().default(false), // true when a grant released prepare/deliver without a founder
  preparedBy: varchar("prepared_by", { length: 120 }).notNull(),
  sentBy: varchar("sent_by", { length: 120 }),
  dedupeKey: varchar("dedupe_key", { length: 200 }), // idempotent retries: a repeated prepare with the same key never double-creates
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
}, (table) => [
  index("communications_status_idx").on(table.status),
  index("communications_channel_idx").on(table.channel),
  index("communications_scope_idx").on(table.scopeType, table.companyId),
  uniqueIndex("communications_dedupe_uidx").on(table.dedupeKey).where(sql`dedupe_key is not null`),
]);

// ---- EARNED AUTONOMY (Phase 6): durable per-action autonomy policies. A policy GRANTS a level for an action
// category within a narrow scope + conditions; it is EARNED (founder-approved, versioned, revocable, expirable).
// There is no global switch — resolution is per action from the matching active policies, with hard caps. ----
export const autonomyPolicies = pgTable("autonomy_policies", {
  id: id(),
  category: varchar("category", { length: 80 }).notNull(), // e.g. content.publish | source.activation | proposal.send
  grantedLevel: varchar("granted_level", { length: 16 }).notNull(), // observe | inform | recommend | confirm | autonomous
  status: varchar("status", { length: 16 }).notNull().default("active"), // active | revoked
  actor: varchar("actor", { length: 120 }),
  companyId: varchar("company_id", { length: 120 }),
  clientId: varchar("client_id", { length: 120 }),
  projectId: varchar("project_id", { length: 120 }),
  maxRiskLevel: varchar("max_risk_level", { length: 16 }), // low | medium | high | critical
  maxFinancialCents: integer("max_financial_cents"),
  requiresQaPass: boolean("requires_qa_pass").notNull().default(false),
  successThreshold: numeric("success_threshold", { precision: 4, scale: 3 }), // historical success ratio required to earn
  historicalSampleSize: integer("historical_sample_size"),
  approvedBy: varchar("approved_by", { length: 120 }).notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("autonomy_policies_category_status_idx").on(table.category, table.status),
]);

// ---- CONTROLLED DREAM / OPTIMIZER (Phase 8): the OS may PROPOSE improvements to its own behaviour, but NEVER
// silently rewrites production. A cycle OBSERVES real signals → forms EVIDENCE-backed opportunities → HISTORICAL
// test → founder APPROVAL → versioned ACTIVATION → MONITOR vs baseline → ROLLBACK if degraded. The optimizer only
// ever writes to its OWN tables; the ONLY path to an `active` improvement is proposed → approved → active. ----
export const optimizerCycles = pgTable("optimizer_cycles", {
  id: id(),
  trigger: varchar("trigger", { length: 24 }).notNull().default("scheduled"), // scheduled | manual
  status: varchar("status", { length: 24 }).notNull().default("observing"),   // observing | proposed | complete | failed
  scope: varchar("scope", { length: 40 }).notNull().default("os"),
  observationCount: integer("observation_count").notNull().default(0),
  opportunityCount: integer("opportunity_count").notNull().default(0),
  note: text("note"),
  metadata: metadata(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (table) => [
  index("optimizer_cycles_status_idx").on(table.status),
  index("optimizer_cycles_started_idx").on(table.startedAt),
]);

// Real evidence: each observation is a measured signal from a REAL production table (never fabricated), with a
// pointer (evidenceRef) back to the rows it summarizes so a founder can audit the basis of any opportunity.
export const optimizerObservations = pgTable("optimizer_observations", {
  id: id(),
  cycleId: varchar("cycle_id", { length: 120 }).notNull(),
  signalType: varchar("signal_type", { length: 40 }).notNull(), // qa_failure | revision_frequency | workflow_retry | dead_letter | provider_cost | tool_failure | source_value | content_outcome | proposal_outcome | sales_outcome | delivery_outcome | aios_value | founder_feedback
  metricKey: varchar("metric_key", { length: 120 }).notNull(),
  metricValue: numeric("metric_value", { precision: 14, scale: 4 }).notNull(),
  sampleSize: integer("sample_size").notNull().default(0),
  evidenceRef: jsonb("evidence_ref").$type<Record<string, unknown>>().notNull().default({}),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (table) => [
  index("optimizer_observations_cycle_idx").on(table.cycleId),
  index("optimizer_observations_signal_idx").on(table.signalType),
]);

// An evidence-backed improvement OPPORTUNITY. estimatedValue/cost/risk drive the priority score; the historical
// test records baseline vs candidate. status governs the lifecycle — the ONLY path to `active` is proposed→approved→active.
export const improvementProposals = pgTable("improvement_proposals", {
  id: id(),
  cycleId: varchar("cycle_id", { length: 120 }),
  pattern: text("pattern").notNull(),
  hypothesis: text("hypothesis").notNull(),
  targetType: varchar("target_type", { length: 24 }).notNull(), // prompt | workflow | model | skill | agent | tool | policy | qa_rubric | parameter
  targetRef: varchar("target_ref", { length: 200 }),
  evidence: jsonb("evidence").$type<string[]>().notNull().default([]), // observation ids
  estimatedValue: numeric("estimated_value", { precision: 6, scale: 2 }).notNull().default("0"),
  estimatedCostCents: integer("estimated_cost_cents").notNull().default(0),
  riskLevel: varchar("risk_level", { length: 16 }).notNull().default("low"),
  score: numeric("score", { precision: 10, scale: 2 }),
  historicalBaselineMetric: numeric("historical_baseline_metric", { precision: 14, scale: 4 }),
  historicalCandidateMetric: numeric("historical_candidate_metric", { precision: 14, scale: 4 }),
  historicalSampleSize: integer("historical_sample_size"),
  status: varchar("status", { length: 16 }).notNull().default("proposed"), // proposed | approved | active | rejected | rolled_back | superseded
  version: integer("version").notNull().default(1),
  approvedBy: varchar("approved_by", { length: 120 }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  rejectedReason: text("rejected_reason"),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("improvement_proposals_status_idx").on(table.status),
  index("improvement_proposals_cycle_idx").on(table.cycleId),
]);

// A versioned ACTIVATION — the durable record of an approved improvement being made active, pinned to the baseline
// it must beat. Activation writes ONLY this record; it never mutates a prompt/skill/workflow/model/etc. in place.
export const optimizerActivations = pgTable("optimizer_activations", {
  id: id(),
  proposalId: varchar("proposal_id", { length: 120 }).notNull(),
  version: integer("version").notNull().default(1),
  baselineMetric: numeric("baseline_metric", { precision: 14, scale: 4 }).notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}), // the versioned change payload (read by a consumer; never applied silently)
  status: varchar("status", { length: 16 }).notNull().default("active"), // active | rolled_back
  activatedBy: varchar("activated_by", { length: 120 }).notNull(),
  activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (table) => [
  index("optimizer_activations_proposal_idx").on(table.proposalId),
  index("optimizer_activations_status_idx").on(table.status),
]);

// MONITORED OUTCOMES vs baseline for an active improvement — the signal that decides rollback.
export const optimizerMonitoring = pgTable("optimizer_monitoring", {
  id: id(),
  proposalId: varchar("proposal_id", { length: 120 }).notNull(),
  activationId: varchar("activation_id", { length: 120 }).notNull(),
  measuredMetric: numeric("measured_metric", { precision: 14, scale: 4 }).notNull(),
  baselineMetric: numeric("baseline_metric", { precision: 14, scale: 4 }).notNull(),
  sampleSize: integer("sample_size").notNull().default(0),
  degraded: boolean("degraded").notNull().default(false),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (table) => [
  index("optimizer_monitoring_proposal_idx").on(table.proposalId),
]);

// ROLLBACK EVENTS — a durable, audited record every time an active improvement is reverted (degraded or by founder).
export const optimizerRollbackEvents = pgTable("optimizer_rollback_events", {
  id: id(),
  proposalId: varchar("proposal_id", { length: 120 }).notNull(),
  activationId: varchar("activation_id", { length: 120 }),
  reason: text("reason").notNull(),
  measuredMetric: numeric("measured_metric", { precision: 14, scale: 4 }),
  baselineMetric: numeric("baseline_metric", { precision: 14, scale: 4 }),
  rolledBackBy: varchar("rolled_back_by", { length: 120 }).notNull(), // system | a founder
  createdAt: createdAt(),
}, (table) => [
  index("optimizer_rollback_events_proposal_idx").on(table.proposalId),
]);

// ---- SELECTIVE REVISION (Phase 7): a composite artifact is a graph of versioned COMPONENTS. When only SOME
// components fail QA we rerun EXACTLY the failed ones + their transitive dependents, PRESERVING every approved
// component + its evidence. A revision cycle records the plan; component versions snapshot each state for rollback. ----
export const revisionCycles = pgTable("revision_cycles", {
  id: id(),
  artifactKind: varchar("artifact_kind", { length: 40 }).notNull(), // content_graph | proposal | audit_report | content_pack
  artifactRef: varchar("artifact_ref", { length: 200 }).notNull(),  // the real artifact id
  graphRunId: varchar("graph_run_id", { length: 200 }),             // set when bound to a checkpointed graph run (selective node clear)
  status: varchar("status", { length: 24 }).notNull().default("planned"), // planned | reran | applied | rolled_back
  triggeredBy: varchar("triggered_by", { length: 120 }).notNull(),  // e.g. qa_gate:content_quality
  // Durable natural-key idempotency backstop: a stable key for this revision ROUND (graph: run+trigger;
  // proposal: workflow+task+failed-stage set). A partial unique index enforces ONE OPEN (planned) cycle per key
  // so a duplicate/reclaimed handoff RETRY cannot spawn multiple live cycles for the same revision round.
  dedupeKey: varchar("dedupe_key", { length: 200 }),
  failedComponents: jsonb("failed_components").$type<string[]>().notNull().default([]),
  plan: jsonb("plan").$type<Record<string, unknown>>().notNull().default({}), // { rerun, preserved, specialists, nextVersions, requiresGlobalConsistencyQa }
  companyId: varchar("company_id", { length: 120 }),
  clientId: varchar("client_id", { length: 120 }),
  createdBy: varchar("created_by", { length: 120 }),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
  metadata: metadata(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("revision_cycles_artifact_idx").on(table.artifactKind, table.artifactRef),
  index("revision_cycles_status_idx").on(table.status),
  // At most ONE OPEN (planned) cycle per dedupe key — the transaction-safe idempotency backstop against
  // concurrent duplicate triggers. Once a cycle leaves `planned`, a genuinely new round can open a fresh one.
  uniqueIndex("revision_cycles_dedupe_planned_uq").on(table.dedupeKey).where(sql`status = 'planned' and dedupe_key is not null`),
]);

export const revisionComponents = pgTable("revision_components", {
  id: id(),
  cycleId: varchar("cycle_id", { length: 60 }).notNull(),
  componentKey: varchar("component_key", { length: 120 }).notNull(), // stage / graph-node key
  kind: varchar("kind", { length: 60 }).notNull(),
  producedBy: varchar("produced_by", { length: 120 }).notNull(),     // the specialist re-invoked on a rerun
  dependsOn: jsonb("depends_on").$type<string[]>().notNull().default([]),
  version: integer("version").notNull().default(1),
  status: varchar("status", { length: 20 }).notNull().default("approved"), // approved | failed | pending | rerun
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("revision_components_cycle_key_uq").on(table.cycleId, table.componentKey),
]);

export const revisionComponentVersions = pgTable("revision_component_versions", {
  id: id(),
  cycleId: varchar("cycle_id", { length: 60 }).notNull(),
  componentKey: varchar("component_key", { length: 120 }).notNull(),
  version: integer("version").notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  snapshotReason: varchar("snapshot_reason", { length: 40 }).notNull(), // pre_revision | post_apply
  createdAt: createdAt(),
}, (table) => [
  index("revision_component_versions_cycle_idx").on(table.cycleId, table.componentKey),
]);
