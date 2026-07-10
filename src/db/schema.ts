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
});

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
});

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
