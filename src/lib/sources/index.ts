import { and, desc, eq, ne } from "drizzle-orm";
import { files as filesTable, sourceChunks, sourceIntakeRuns, sources, sourceTrustLevels, sourceTypeDefinitions } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { createApproval, applyApprovalAction, type ApprovalRow, type ApprovalStore } from "@/lib/approvals";
import { enqueueKnowledgeCompileJob } from "@/lib/knowledge";
import { embedTexts } from "@/lib/embeddings";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  buildFileRow,
  buildSourceChunkRows,
  buildSourceIntakeRunRow,
  buildSourceTypeDefinitionRow,
  buildSourceRow,
  DEFAULT_SOURCE_TYPE_DEFINITIONS,
  resolveSourceTrust,
  resolveSourceTypeDefinition,
  type AddSourceInput,
  type SourceApprovalStatus,
  type SourceChunkRow,
  type SourceChunksInput,
  type SourceFileInput,
  type SourceFileRow,
  type SourceIntakeRunRow,
  type SourceIntakeStatus,
  type SourceProcessingStatus,
  type SourceRecordStatus,
  type SourceRow,
  type SourceTypeDefinitionRow,
  type SourceTrustLevel,
} from "@/lib/domain/sources";

export type { SourceChunkRow, SourceFileRow, SourceIntakeRunRow, SourceRow, SourceTypeDefinitionRow, SourceTrustLevel };

export interface ListSourcesQuery {
  approvalStatus?: SourceApprovalStatus;
  status?: SourceRecordStatus;
  trustLevel?: string;
  sourceType?: string;
  limit?: number;
}

export const DEFAULT_SOURCE_LIMIT = 50;
export const MAX_SOURCE_LIMIT = 200;

export function clampSourceLimit(limit?: number): number {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_SOURCE_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_SOURCE_LIMIT);
}

export interface SourceLibraryStore {
  insertSource(row: SourceRow): Promise<void>;
  insertFile(row: SourceFileRow): Promise<void>;
  getSourceById(id: string): Promise<SourceRow | null>;
  updateSource(id: string, fields: Partial<SourceRow>): Promise<void>;
  updateFilesForSource?(sourceId: string, fields: Partial<SourceFileRow>): Promise<void>;
  insertSourceChunks(rows: SourceChunkRow[]): Promise<void>;
  listSources(query: Required<Pick<ListSourcesQuery, "limit">> & Omit<ListSourcesQuery, "limit">): Promise<SourceRow[]>;
  listApprovedSourcesForJobs(query: { limit: number; sourceType?: string; trustLevel?: string }): Promise<SourceRow[]>;
  listSourceChunks?(sourceId: string, limit: number): Promise<SourceChunkRow[]>;
  listTrustLevels?(): Promise<SourceTrustLevel[]>;
  insertSourceIntakeRun?(row: SourceIntakeRunRow): Promise<void>;
  getSourceIntakeRunById?(id: string): Promise<SourceIntakeRunRow | null>;
  updateSourceIntakeRun?(id: string, fields: Partial<SourceIntakeRunRow>): Promise<void>;
  listSourceIntakeRuns?(query: { sourceId?: string; status?: SourceIntakeStatus; limit: number }): Promise<SourceIntakeRunRow[]>;
  listSourceTypeDefinitions?(query: { category?: string; limit: number }): Promise<SourceTypeDefinitionRow[]>;
}

export interface SourceDeps {
  store?: SourceLibraryStore;
  approvalStore?: ApprovalStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

async function trustLevelsFor(
  store: SourceLibraryStore,
  explicit?: SourceTrustLevel[],
): Promise<SourceTrustLevel[] | undefined> {
  if (explicit) return explicit;
  return store.listTrustLevels ? store.listTrustLevels() : undefined;
}

export interface CreateSourceInput extends AddSourceInput {
  file?: SourceFileInput & { path: string };
  trustLevels?: SourceTrustLevel[];
}

export interface CreateSourceResult {
  source: SourceRow;
  file: SourceFileRow | null;
  approval: ApprovalRow;
}

export async function createSource(input: CreateSourceInput, deps: SourceDeps = {}): Promise<CreateSourceResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const source = buildSourceRow(input, { now });
  resolveSourceTrust(source.trustLevel, await trustLevelsFor(store, input.trustLevels));

  const file = input.file ? buildFileRow(input.file, { now, linkedEntityId: source.id }) : null;

  await store.insertSource(source);
  if (file) await store.insertFile(file);

  await recordAudit({
    eventType: "source.added",
    module: "source_library",
    entityType: "source",
    entityId: source.id,
    actor: source.addedBy ?? source.discoveredBy ?? undefined,
    metadata: {
      title: source.title,
      sourceType: source.sourceType,
      ownerScope: source.ownerScope,
      ownerId: source.ownerId,
      intendedUse: source.intendedUse,
      connectedAgents: source.connectedAgents,
      refreshFrequency: source.refreshFrequency,
      trustLevel: source.trustLevel,
      hasFile: Boolean(file),
      approvalStatus: source.approvalStatus,
    },
  });

  const approval = await createApproval(
    {
      approvalType: "source",
      entityType: "source",
      entityId: source.id,
      riskLevel: "normal",
      requestedBy: source.addedBy ?? source.discoveredBy ?? undefined,
      notes: `Review source: ${source.title}`,
      metadata: {
        title: source.title,
        sourceType: source.sourceType,
        ownerScope: source.ownerScope,
        intendedUse: source.intendedUse,
        connectedAgents: source.connectedAgents,
        requestedTrustLevel: source.trustLevel,
      },
    },
    { store: deps.approvalStore, recordAudit, now },
  );

  return { source, file, approval };
}

export interface ApproveSourceInput {
  sourceId: string;
  approvalId: string;
  approvedBy: string;
  trustLevel: string;
  trustLevels?: SourceTrustLevel[];
  notes?: string;
}

export interface SourceActionResult {
  source: SourceRow;
}

export async function approveSource(input: ApproveSourceInput, deps: SourceDeps = {}): Promise<SourceActionResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const source = await getExistingSource(store, input.sourceId);
  const trust = resolveSourceTrust(input.trustLevel, await trustLevelsFor(store, input.trustLevels));
  if (trust.isBlocked) {
    throw new Error("blocked source trust level cannot be approved");
  }

  await applyApprovalAction(
    {
      approvalId: input.approvalId,
      action: "approve",
      approvedBy: input.approvedBy,
      notes: input.notes,
    },
    { store: deps.approvalStore, recordAudit, now },
  );

  const fields: Partial<SourceRow> = {
    approvalStatus: "approved",
    trustLevel: trust.slug,
    status: "active",
    processingStatus: "ready",
    approvedBy: input.approvedBy,
    approvedAt: now,
    updatedAt: now,
  };
  await store.updateSource(source.id, fields);
  if (store.updateFilesForSource) {
    await store.updateFilesForSource(source.id, { approvalState: "approved", updatedAt: now });
  }

  const approvedSource: SourceRow = { ...source, ...fields };
  await recordAudit({
    eventType: "source.approved",
    module: "source_library",
    entityType: "source",
    entityId: source.id,
    actor: input.approvedBy,
    metadata: { trustLevel: trust.slug, canUpdateBrain: trust.canUpdateBrain, approvalId: input.approvalId },
  });

  // On approval: run intake (scrape → chunk → embed) FIRST; the intake worker then chains to the
  // knowledge compiler once chunks exist. Best-effort + env-gated so it never blocks approval.
  if (process.env.DATABASE_URL) {
    try {
      const { enqueueJob } = await import("@/lib/jobs");
      await enqueueJob({ queue: "general", type: "source.intake", payload: { sourceId: source.id, triggeredBy: input.approvedBy }, linkedModule: "source_library", idempotencyKey: `source.intake:${source.id}` });
    } catch {
      // Fallback: if intake couldn't be queued, still try to compile whatever chunks exist.
      try { await enqueueKnowledgeCompileJob({ sourceId: source.id, triggeredBy: input.approvedBy }); } catch { /* never block approval */ }
    }
  }

  return { source: approvedSource };
}

export interface RejectSourceInput {
  sourceId: string;
  approvalId: string;
  rejectedBy: string;
  reason?: string;
}

export async function rejectSource(input: RejectSourceInput, deps: SourceDeps = {}): Promise<SourceActionResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const source = await getExistingSource(store, input.sourceId);

  await applyApprovalAction(
    {
      approvalId: input.approvalId,
      action: "reject",
      approvedBy: input.rejectedBy,
      notes: input.reason,
    },
    { store: deps.approvalStore, recordAudit, now },
  );

  const fields: Partial<SourceRow> = {
    approvalStatus: "rejected",
    status: "archived",
    processingStatus: "archived",
    updatedAt: now,
  };
  await store.updateSource(source.id, fields);
  if (store.updateFilesForSource) {
    await store.updateFilesForSource(source.id, { approvalState: "rejected", status: "archived", updatedAt: now });
  }

  const rejectedSource: SourceRow = { ...source, ...fields };
  await recordAudit({
    eventType: "source.rejected",
    module: "source_library",
    entityType: "source",
    entityId: source.id,
    actor: input.rejectedBy,
    metadata: { approvalId: input.approvalId, reason: input.reason },
  });

  return { source: rejectedSource };
}

export async function attachSourceChunks(
  input: SourceChunksInput,
  deps: SourceDeps = {},
): Promise<SourceChunkRow[]> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const source = await getExistingSource(store, input.sourceId);
  if (source.status !== "active" || source.approvalStatus !== "approved") {
    throw new Error("source must be approved and active before chunks can be attached");
  }

  const rows = buildSourceChunkRows(input, { now });
  // Embed chunk content so it's actually retrievable — searchSourceChunks filters on a non-null
  // embedding, so previously every attached chunk was invisible. Best-effort (null if no embedder).
  try {
    const vectors = await embedTexts(rows.map((r) => r.content));
    if (vectors) rows.forEach((r, i) => { if (vectors[i]) r.embedding = vectors[i]; });
  } catch { /* embedding is best-effort; chunk still stored */ }
  await store.insertSourceChunks(rows);
  await recordAudit({
    eventType: "source.chunks_attached",
    module: "source_library",
    entityType: "source",
    entityId: source.id,
    metadata: { chunkCount: rows.length },
  });

  return rows;
}

export async function listSources(query: ListSourcesQuery = {}, deps: SourceDeps = {}): Promise<SourceRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listSources({ ...query, limit: clampSourceLimit(query.limit) });
}

export async function listApprovedSourcesForJobs(
  input: { store?: SourceLibraryStore; limit?: number; sourceType?: string; trustLevel?: string } = {},
): Promise<SourceRow[]> {
  const store = input.store ?? defaultStore();
  return store.listApprovedSourcesForJobs({
    limit: clampSourceLimit(input.limit),
    sourceType: input.sourceType,
    trustLevel: input.trustLevel,
  });
}

export async function listSourceChunks(
  sourceId: string,
  input: { store?: SourceLibraryStore; limit?: number } = {},
): Promise<SourceChunkRow[]> {
  const store = input.store ?? defaultStore();
  if (!store.listSourceChunks) return [];
  return store.listSourceChunks(sourceId, clampSourceLimit(input.limit));
}

export interface ListSourceTypeDefinitionsQuery {
  category?: string;
  limit?: number;
  store?: SourceLibraryStore;
}

export async function listSourceTypeDefinitions(input: ListSourceTypeDefinitionsQuery = {}): Promise<SourceTypeDefinitionRow[]> {
  const store = input.store ?? defaultStore();
  if (store.listSourceTypeDefinitions) {
    return store.listSourceTypeDefinitions({ category: input.category, limit: clampSourceLimit(input.limit) });
  }
  const now = new Date();
  return DEFAULT_SOURCE_TYPE_DEFINITIONS
    .map((definition) => buildSourceTypeDefinitionRow(definition, { id: `sourcetype_${definition.slug}`, now }))
    .filter((definition) => (input.category ? definition.category === input.category : true))
    .slice(0, clampSourceLimit(input.limit));
}

export interface ListSourceIntakeRunsQuery {
  sourceId?: string;
  status?: SourceIntakeStatus;
  limit?: number;
  store?: SourceLibraryStore;
}

export async function listSourceIntakeRuns(input: ListSourceIntakeRunsQuery = {}): Promise<SourceIntakeRunRow[]> {
  const store = input.store ?? defaultStore();
  if (!store.listSourceIntakeRuns) return [];
  return store.listSourceIntakeRuns({ sourceId: input.sourceId, status: input.status, limit: clampSourceLimit(input.limit) });
}

export interface CreateSourceIntakeRunInput {
  sourceId: string;
  trigger?: "manual" | "n8n" | "schedule" | "agent";
  status?: SourceIntakeStatus;
  tool?: string;
  agentRunId?: string;
  jobId?: string;
  rawPayloadRef?: string;
  costEstimate?: number;
  logs?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
}

export interface SourceIntakeRunResult {
  run: SourceIntakeRunRow;
  source: SourceRow;
}

export async function createSourceIntakeRun(
  input: CreateSourceIntakeRunInput,
  deps: SourceDeps = {},
): Promise<SourceIntakeRunResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  if (!store.insertSourceIntakeRun) throw new Error("source intake run store is not configured");

  const source = await getExistingSource(store, input.sourceId);
  const definition = resolveSourceTypeForIntake(source.sourceType);
  const run = buildSourceIntakeRunRow(
    {
      sourceId: source.id,
      sourceType: source.sourceType,
      handlerSlug: definition.intakeHandlerSlug,
      trigger: input.trigger ?? "manual",
      status: input.status ?? "queued",
      tool: input.tool,
      agentRunId: input.agentRunId,
      jobId: input.jobId,
      rawPayloadRef: input.rawPayloadRef,
      costEstimate: input.costEstimate,
      logs: input.logs ?? [],
      metadata: input.metadata ?? {},
    },
    { now },
  );

  await store.insertSourceIntakeRun(run);
  await store.updateSource(source.id, {
    processingStatus: statusToProcessing(run.status),
    lastError: null,
    updatedAt: now,
  });

  await recordAudit({
    eventType: "source.intake.queued",
    module: "source_registry",
    entityType: "source",
    entityId: source.id,
    actor: source.addedBy ?? source.discoveredBy ?? undefined,
    costEstimate: run.costEstimate !== null ? Number(run.costEstimate) : undefined,
    metadata: {
      intakeRunId: run.id,
      sourceType: run.sourceType,
      handlerSlug: run.handlerSlug,
      trigger: run.trigger,
      tool: run.tool,
      agentRunId: run.agentRunId,
    },
  });

  return { run, source: { ...source, processingStatus: statusToProcessing(run.status), updatedAt: now } };
}

export interface CompleteSourceIntakeRunInput {
  intakeRunId: string;
  status: Extract<SourceIntakeStatus, "routed" | "succeeded" | "failed" | "cancelled">;
  rawPayloadRef?: string;
  extractedInsightId?: string;
  extractedData?: Record<string, unknown>;
  memoryBanksFed?: string[];
  relatedOutputIds?: string[];
  confidence?: number;
  costUsed?: number;
  actualCost?: number;
  logs?: Array<Record<string, unknown>>;
  error?: string;
}

export async function markSourceIntakeRunComplete(
  input: CompleteSourceIntakeRunInput,
  deps: SourceDeps = {},
): Promise<SourceIntakeRunResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  if (!store.getSourceIntakeRunById || !store.updateSourceIntakeRun) throw new Error("source intake run store is not configured");

  const existingRun = await store.getSourceIntakeRunById(input.intakeRunId);
  if (!existingRun) throw new Error(`source intake run '${input.intakeRunId}' not found`);
  const source = await getExistingSource(store, existingRun.sourceId);
  const runFields: Partial<SourceIntakeRunRow> = {
    status: input.status,
    rawPayloadRef: input.rawPayloadRef ?? existingRun.rawPayloadRef,
    extractedInsightId: input.extractedInsightId ?? existingRun.extractedInsightId,
    actualCost: input.actualCost !== undefined ? String(input.actualCost) : existingRun.actualCost,
    logs: input.logs ?? existingRun.logs,
    error: input.error ?? null,
    completedAt: now,
    updatedAt: now,
  };
  await store.updateSourceIntakeRun(existingRun.id, runFields);

  const processingStatus = statusToProcessing(input.status);
  const sourceFields: Partial<SourceRow> = {
    processingStatus,
    extractedData: input.extractedData ?? source.extractedData,
    memoryBanksFed: input.memoryBanksFed ?? source.memoryBanksFed,
    relatedOutputIds: input.relatedOutputIds ?? source.relatedOutputIds,
    confidence: input.confidence !== undefined ? String(input.confidence) : source.confidence,
    costUsed: input.costUsed !== undefined ? String(input.costUsed) : source.costUsed,
    lastScrapedAt: input.status === "failed" || input.status === "cancelled" ? source.lastScrapedAt : now,
    lastError: input.error ?? null,
    updatedAt: now,
  };
  await store.updateSource(source.id, sourceFields);

  const eventType = input.status === "failed" ? "source.intake.failed" : `source.intake.${input.status}`;
  await recordAudit({
    eventType,
    module: "source_registry",
    entityType: "source",
    entityId: source.id,
    costEstimate: input.costUsed,
    metadata: {
      intakeRunId: existingRun.id,
      sourceType: existingRun.sourceType,
      handlerSlug: existingRun.handlerSlug,
      extractedInsightId: sourceFields.extractedData ? input.extractedInsightId : undefined,
      memoryBanksFed: sourceFields.memoryBanksFed,
      confidence: sourceFields.confidence,
      error: input.error,
    },
  });

  return { run: { ...existingRun, ...runFields }, source: { ...source, ...sourceFields } };
}

async function getExistingSource(store: SourceLibraryStore, sourceId: string): Promise<SourceRow> {
  if (!sourceId.trim()) throw new Error("sourceId is required");
  const source = await store.getSourceById(sourceId);
  if (!source) throw new Error(`source '${sourceId}' not found`);
  return source;
}

function resolveSourceTypeForIntake(sourceType: string): SourceTypeDefinitionRow {
  try {
    return resolveSourceTypeDefinition(sourceType);
  } catch {
    return buildSourceTypeDefinitionRow(
      {
        slug: sourceType,
        label: sourceType,
        category: "custom",
        description: "Custom legacy source type. It can be stored, but should be migrated into a registered type before advanced automation.",
        intakeHandlerSlug: sourceType,
      },
      { id: `sourcetype_${sourceType}` },
    );
  }
}

function statusToProcessing(status: SourceIntakeStatus): SourceProcessingStatus {
  if (status === "cancelled") return "ready";
  if (status === "succeeded") return "succeeded";
  return status;
}

export function defaultStore(db: Db = getDb()): SourceLibraryStore {
  return {
    async insertSource(row) {
      await db.insert(sources).values(row);
    },
    async insertFile(row) {
      await db.insert(filesTable).values(row);
    },
    async getSourceById(id) {
      const rows = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
      return (rows[0] as SourceRow | undefined) ?? null;
    },
    async updateSource(id, fields) {
      await db.update(sources).set(fields).where(eq(sources.id, id));
    },
    async updateFilesForSource(sourceId, fields) {
      await db
        .update(filesTable)
        .set(fields)
        .where(and(eq(filesTable.linkedEntityType, "source"), eq(filesTable.linkedEntityId, sourceId)));
    },
    async insertSourceChunks(rows) {
      await db.insert(sourceChunks).values(rows);
    },
    async listSources(query) {
      const conditions = [];
      if (query.approvalStatus) conditions.push(eq(sources.approvalStatus, query.approvalStatus));
      if (query.status) conditions.push(eq(sources.status, query.status));
      if (query.trustLevel) conditions.push(eq(sources.trustLevel, query.trustLevel));
      if (query.sourceType) conditions.push(eq(sources.sourceType, query.sourceType));
      const where = conditions.length ? and(...conditions) : undefined;
      return db.select().from(sources).where(where).orderBy(desc(sources.createdAt)).limit(query.limit) as Promise<SourceRow[]>;
    },
    async listApprovedSourcesForJobs(query) {
      const conditions = [
        eq(sources.approvalStatus, "approved"),
        eq(sources.status, "active"),
        ne(sources.trustLevel, "blocked"),
      ];
      if (query.sourceType) conditions.push(eq(sources.sourceType, query.sourceType));
      if (query.trustLevel) conditions.push(eq(sources.trustLevel, query.trustLevel));
      return db
        .select()
        .from(sources)
        .where(and(...conditions))
        .orderBy(desc(sources.createdAt))
        .limit(query.limit) as Promise<SourceRow[]>;
    },
    async listSourceChunks(sourceId, limit) {
      return db
        .select()
        .from(sourceChunks)
        .where(eq(sourceChunks.sourceId, sourceId))
        .orderBy(sourceChunks.chunkIndex)
        .limit(limit) as Promise<SourceChunkRow[]>;
    },
    async listTrustLevels() {
      const rows = await db.select().from(sourceTrustLevels).orderBy(sourceTrustLevels.priority);
      return rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        label: row.label,
        priority: row.priority,
        canUpdateBrain: row.canUpdateBrain,
      }));
    },
    async insertSourceIntakeRun(row) {
      await db.insert(sourceIntakeRuns).values(row);
    },
    async getSourceIntakeRunById(id) {
      const rows = await db.select().from(sourceIntakeRuns).where(eq(sourceIntakeRuns.id, id)).limit(1);
      return (rows[0] as SourceIntakeRunRow | undefined) ?? null;
    },
    async updateSourceIntakeRun(id, fields) {
      await db.update(sourceIntakeRuns).set(fields).where(eq(sourceIntakeRuns.id, id));
    },
    async listSourceIntakeRuns(query) {
      const conditions = [];
      if (query.sourceId) conditions.push(eq(sourceIntakeRuns.sourceId, query.sourceId));
      if (query.status) conditions.push(eq(sourceIntakeRuns.status, query.status));
      const where = conditions.length ? and(...conditions) : undefined;
      return db
        .select()
        .from(sourceIntakeRuns)
        .where(where)
        .orderBy(desc(sourceIntakeRuns.createdAt))
        .limit(query.limit) as Promise<SourceIntakeRunRow[]>;
    },
    async listSourceTypeDefinitions(query) {
      const conditions = [];
      if (query.category) conditions.push(eq(sourceTypeDefinitions.category, query.category));
      const where = conditions.length ? and(...conditions) : undefined;
      const rows = await db
        .select()
        .from(sourceTypeDefinitions)
        .where(where)
        .orderBy(sourceTypeDefinitions.category, sourceTypeDefinitions.label)
        .limit(query.limit);
      if (rows.length > 0) return rows as SourceTypeDefinitionRow[];
      return DEFAULT_SOURCE_TYPE_DEFINITIONS
        .map((definition) => buildSourceTypeDefinitionRow(definition, { id: `sourcetype_${definition.slug}` }))
        .filter((definition) => (query.category ? definition.category === query.category : true))
        .slice(0, query.limit);
    },
  };
}
