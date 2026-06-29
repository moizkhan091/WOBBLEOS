import { and, desc, eq, inArray } from "drizzle-orm";
import { memoryChunks as memoryChunksTable, memoryRecords, memoryUpdateProposals } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { createApproval, applyApprovalAction, type ApprovalRow, type ApprovalStore } from "@/lib/approvals";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  buildMemoryChunkRows,
  buildMemoryRecordRow,
  buildMemoryUpdateProposalRow,
  rankMemoryChunks,
  type MemoryChunkRow,
  type MemoryProposalStatus,
  type MemoryRecordRow,
  type MemoryTier,
  type MemoryUpdateProposalInput,
  type MemoryUpdateProposalRow,
  type QueryMode,
  type RankedRetrievalMemoryChunk,
  type RetrievalMemoryChunk,
  type TrustLevel,
} from "@/lib/domain/memory";

export type { MemoryChunkRow, MemoryRecordRow, MemoryUpdateProposalRow, RetrievalMemoryChunk };

export interface ListMemoryRecordsQuery {
  memoryTier?: MemoryTier;
  area?: string;
  status?: "active" | "archived";
  limit?: number;
}

export interface ListMemoryProposalsQuery {
  status?: MemoryProposalStatus;
  affectedArea?: string;
  limit?: number;
}

export interface RetrieveMemoryQuery {
  query: string;
  queryMode?: QueryMode;
  tiers?: MemoryTier[];
  trustLevels?: TrustLevel[];
  limit?: number;
}

export interface MemoryStore {
  insertProposal(row: MemoryUpdateProposalRow): Promise<void>;
  getProposalById(id: string): Promise<MemoryUpdateProposalRow | null>;
  updateProposal(id: string, fields: Partial<MemoryUpdateProposalRow>): Promise<void>;
  insertMemoryRecord(row: MemoryRecordRow): Promise<void>;
  insertMemoryChunks(rows: MemoryChunkRow[]): Promise<void>;
  retrieveMemoryCandidates(input: RetrieveMemoryQuery & { limit: number }): Promise<RetrievalMemoryChunk[]>;
  listMemoryRecords(query?: ListMemoryRecordsQuery & { limit: number }): Promise<MemoryRecordRow[]>;
  listMemoryProposals(query?: ListMemoryProposalsQuery & { limit: number }): Promise<MemoryUpdateProposalRow[]>;
}

export interface MemoryDeps {
  store?: MemoryStore;
  approvalStore?: ApprovalStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

export const DEFAULT_MEMORY_LIMIT = 50;
export const MAX_MEMORY_LIMIT = 200;

export function clampMemoryLimit(limit?: number): number {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_MEMORY_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_MEMORY_LIMIT);
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

export interface ProposeMemoryUpdateInput extends MemoryUpdateProposalInput {
  proposedBy?: string;
}

export interface ProposeMemoryUpdateResult {
  proposal: MemoryUpdateProposalRow;
  approval: ApprovalRow;
}

export async function proposeMemoryUpdate(
  input: ProposeMemoryUpdateInput,
  deps: MemoryDeps = {},
): Promise<ProposeMemoryUpdateResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const proposal = buildMemoryUpdateProposalRow(input, { now });
  await store.insertProposal(proposal);

  await recordAudit({
    eventType: "memory_update.proposed",
    module: "memory",
    entityType: "memory_update_proposal",
    entityId: proposal.id,
    actor: input.proposedBy,
    metadata: {
      affectedArea: proposal.affectedArea,
      sourceId: proposal.sourceId,
      confidence: proposal.confidence,
    },
  });

  const approval = await createApproval(
    {
      approvalType: "memory_update",
      entityType: "memory_update_proposal",
      entityId: proposal.id,
      riskLevel: "normal",
      requestedBy: input.proposedBy,
      notes: `Review memory update for ${proposal.affectedArea}`,
      metadata: {
        affectedArea: proposal.affectedArea,
        sourceId: proposal.sourceId,
        confidence: proposal.confidence,
      },
    },
    { store: deps.approvalStore, recordAudit, now },
  );

  await store.updateProposal(proposal.id, { approvalId: approval.id, updatedAt: now });

  return { proposal: { ...proposal, approvalId: approval.id, updatedAt: now }, approval };
}

export interface ApproveMemoryUpdateInput {
  proposalId: string;
  approvalId: string;
  approvedBy: string;
  slug: string;
  title: string;
  memoryTier: MemoryTier;
  trustLevel: TrustLevel;
  tags?: string[];
  notes?: string;
}

export interface ApproveMemoryUpdateResult {
  proposal: MemoryUpdateProposalRow;
  memoryRecord: MemoryRecordRow;
  memoryChunks: MemoryChunkRow[];
}

export async function approveMemoryUpdate(
  input: ApproveMemoryUpdateInput,
  deps: MemoryDeps = {},
): Promise<ApproveMemoryUpdateResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const proposal = await getPendingProposal(store, input.proposalId);

  await applyApprovalAction(
    {
      approvalId: input.approvalId,
      action: "approve",
      approvedBy: input.approvedBy,
      notes: input.notes,
    },
    { store: deps.approvalStore, recordAudit, now },
  );

  const memoryRecord = buildMemoryRecordRow(
    {
      slug: input.slug,
      title: input.title,
      memoryTier: input.memoryTier,
      area: proposal.affectedArea,
      content: proposal.proposedMemory,
      sourceId: proposal.sourceId ?? undefined,
      confidence: proposal.confidence !== null ? Number(proposal.confidence) : undefined,
      approvedBy: input.approvedBy,
    },
    { now },
  );
  const memoryChunks = buildMemoryChunkRows(
    {
      memoryRecordId: memoryRecord.id,
      content: proposal.proposedMemory,
      memoryTier: input.memoryTier,
      trustLevel: input.trustLevel,
      sourceId: proposal.sourceId ?? undefined,
      parentEntityId: memoryRecord.id,
      entityType: "memory_record",
      tags: input.tags ?? [proposal.affectedArea],
    },
    { now },
  );

  await store.insertMemoryRecord(memoryRecord);
  await store.insertMemoryChunks(memoryChunks);

  const fields: Partial<MemoryUpdateProposalRow> = {
    status: "approved",
    approvedBy: input.approvedBy,
    approvedAt: now,
    updatedAt: now,
  };
  await store.updateProposal(proposal.id, fields);

  const updatedProposal = { ...proposal, ...fields };
  await recordAudit({
    eventType: "memory_update.approved",
    module: "memory",
    entityType: "memory_update_proposal",
    entityId: proposal.id,
    actor: input.approvedBy,
    metadata: {
      approvalId: input.approvalId,
      memoryRecordId: memoryRecord.id,
      memoryTier: input.memoryTier,
      trustLevel: input.trustLevel,
    },
  });

  return { proposal: updatedProposal, memoryRecord, memoryChunks };
}

export interface RejectMemoryUpdateInput {
  proposalId: string;
  approvalId: string;
  rejectedBy: string;
  reason?: string;
}

export async function rejectMemoryUpdate(input: RejectMemoryUpdateInput, deps: MemoryDeps = {}) {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const proposal = await getPendingProposal(store, input.proposalId);

  await applyApprovalAction(
    {
      approvalId: input.approvalId,
      action: "reject",
      approvedBy: input.rejectedBy,
      notes: input.reason,
    },
    { store: deps.approvalStore, recordAudit, now },
  );

  const fields: Partial<MemoryUpdateProposalRow> = {
    status: "rejected",
    rejectedBy: input.rejectedBy,
    rejectedAt: now,
    updatedAt: now,
  };
  await store.updateProposal(proposal.id, fields);

  const updatedProposal = { ...proposal, ...fields };
  await recordAudit({
    eventType: "memory_update.rejected",
    module: "memory",
    entityType: "memory_update_proposal",
    entityId: proposal.id,
    actor: input.rejectedBy,
    metadata: { approvalId: input.approvalId, reason: input.reason },
  });

  return { proposal: updatedProposal };
}

export async function retrieveMemoryContext(
  input: RetrieveMemoryQuery,
  deps: MemoryDeps = {},
): Promise<RankedRetrievalMemoryChunk[]> {
  if (!input.query.trim()) throw new Error("query is required");

  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const queryMode = input.queryMode ?? "current";
  const limit = clampMemoryLimit(input.limit);

  const candidates = await store.retrieveMemoryCandidates({ ...input, queryMode, limit: MAX_MEMORY_LIMIT });
  const activeCandidates =
    queryMode === "include_archived" ? candidates : candidates.filter((chunk) => chunk.status === "active");
  const ranked = rankMemoryChunks({ chunks: activeCandidates, now, queryMode });
  return ranked.slice(0, limit);
}

export async function listMemoryRecords(query: ListMemoryRecordsQuery = {}, deps: MemoryDeps = {}) {
  const store = deps.store ?? defaultStore();
  return store.listMemoryRecords({ ...query, limit: clampMemoryLimit(query.limit) });
}

export async function listMemoryProposals(query: ListMemoryProposalsQuery = {}, deps: MemoryDeps = {}) {
  const store = deps.store ?? defaultStore();
  return store.listMemoryProposals({ ...query, limit: clampMemoryLimit(query.limit) });
}

async function getPendingProposal(store: MemoryStore, proposalId: string): Promise<MemoryUpdateProposalRow> {
  if (!proposalId.trim()) throw new Error("proposalId is required");
  const proposal = await store.getProposalById(proposalId);
  if (!proposal) throw new Error(`memory update proposal '${proposalId}' not found`);
  if (proposal.status !== "pending") {
    throw new Error(`memory update proposal '${proposalId}' is not pending`);
  }
  return proposal;
}

function asIsoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function defaultStore(db: Db = getDb()): MemoryStore {
  return {
    async insertProposal(row) {
      await db.insert(memoryUpdateProposals).values(row);
    },
    async getProposalById(id) {
      const rows = await db.select().from(memoryUpdateProposals).where(eq(memoryUpdateProposals.id, id)).limit(1);
      return (rows[0] as MemoryUpdateProposalRow | undefined) ?? null;
    },
    async updateProposal(id, fields) {
      await db.update(memoryUpdateProposals).set(fields).where(eq(memoryUpdateProposals.id, id));
    },
    async insertMemoryRecord(row) {
      await db.insert(memoryRecords).values(row);
    },
    async insertMemoryChunks(rows) {
      await db.insert(memoryChunksTable).values(rows);
    },
    async retrieveMemoryCandidates(input) {
      const conditions = [];
      if (input.tiers?.length) conditions.push(inArray(memoryChunksTable.memoryTier, input.tiers));
      if (input.trustLevels?.length) conditions.push(inArray(memoryChunksTable.trustLevel, input.trustLevels));
      const where = conditions.length ? and(...conditions) : undefined;
      const rows = await db
        .select()
        .from(memoryChunksTable)
        .where(where)
        .orderBy(desc(memoryChunksTable.createdAt))
        .limit(input.limit);

      return rows.map((row) => ({
        id: row.id,
        memoryRecordId: row.memoryRecordId,
        content: row.content,
        similarity: 0.75,
        tier: row.memoryTier as MemoryTier,
        trustLevel: row.trustLevel as TrustLevel,
        sourceId: row.sourceId,
        parentEntityId: row.parentEntityId,
        entityType: row.entityType,
        status: row.status as "active" | "archived",
        archived: row.archived,
        tags: row.tags,
        createdAt: asIsoDate(row.createdAt),
      }));
    },
    async listMemoryRecords(query = { limit: DEFAULT_MEMORY_LIMIT }) {
      const conditions = [];
      if (query.memoryTier) conditions.push(eq(memoryRecords.memoryTier, query.memoryTier));
      if (query.area) conditions.push(eq(memoryRecords.area, query.area));
      if (query.status) conditions.push(eq(memoryRecords.status, query.status));
      const where = conditions.length ? and(...conditions) : undefined;
      return db
        .select()
        .from(memoryRecords)
        .where(where)
        .orderBy(desc(memoryRecords.createdAt))
        .limit(query.limit) as Promise<MemoryRecordRow[]>;
    },
    async listMemoryProposals(query = { limit: DEFAULT_MEMORY_LIMIT }) {
      const conditions = [];
      if (query.status) conditions.push(eq(memoryUpdateProposals.status, query.status));
      if (query.affectedArea) conditions.push(eq(memoryUpdateProposals.affectedArea, query.affectedArea));
      const where = conditions.length ? and(...conditions) : undefined;
      return db
        .select()
        .from(memoryUpdateProposals)
        .where(where)
        .orderBy(desc(memoryUpdateProposals.createdAt))
        .limit(query.limit) as Promise<MemoryUpdateProposalRow[]>;
    },
  };
}
