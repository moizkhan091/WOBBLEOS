import { and, desc, eq, ne } from "drizzle-orm";
import { files as filesTable, sourceChunks, sources, sourceTrustLevels } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { createApproval, applyApprovalAction, type ApprovalRow, type ApprovalStore } from "@/lib/approvals";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  buildFileRow,
  buildSourceChunkRows,
  buildSourceRow,
  resolveSourceTrust,
  type AddSourceInput,
  type SourceApprovalStatus,
  type SourceChunkRow,
  type SourceChunksInput,
  type SourceFileInput,
  type SourceFileRow,
  type SourceRecordStatus,
  type SourceRow,
  type SourceTrustLevel,
} from "@/lib/domain/sources";

export type { SourceChunkRow, SourceFileRow, SourceRow, SourceTrustLevel };

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

async function getExistingSource(store: SourceLibraryStore, sourceId: string): Promise<SourceRow> {
  if (!sourceId.trim()) throw new Error("sourceId is required");
  const source = await store.getSourceById(sourceId);
  if (!source) throw new Error(`source '${sourceId}' not found`);
  return source;
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
  };
}
