import { and, cosineDistance, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { memoryBankLinks, memoryBanks, memoryChunks as memoryChunksTable, memoryRecords, memoryUpdateProposals } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { createApproval, applyApprovalAction, type ApprovalRow, type ApprovalStore } from "@/lib/approvals";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { embedText, embedTexts, type Embedder } from "@/lib/embeddings";
import {
  buildMemoryChunkRows,
  buildMemoryBankLinkRow,
  buildMemoryRecordRow,
  buildMemoryUpdateProposalRow,
  suggestMemoryBanks,
  type MemoryBankLinkRow,
  type MemoryBankRow,
  type MemoryBankRoutingInput,
  type MemoryBankRoutingSuggestion,
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

export type { MemoryBankLinkRow, MemoryBankRow, MemoryChunkRow, MemoryRecordRow, MemoryUpdateProposalRow, RetrievalMemoryChunk };

export interface ListMemoryRecordsQuery {
  memoryTier?: MemoryTier;
  area?: string;
  bankSlug?: string;
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
  queryEmbedding?: number[];
  queryMode?: QueryMode;
  tiers?: MemoryTier[];
  trustLevels?: TrustLevel[];
  bankSlugs?: string[];
  limit?: number;
}

export interface ListMemoryBanksQuery {
  scope?: string;
  status?: "active" | "archived";
  limit?: number;
}

export interface MemoryStore {
  insertProposal(row: MemoryUpdateProposalRow): Promise<void>;
  getProposalById(id: string): Promise<MemoryUpdateProposalRow | null>;
  updateProposal(id: string, fields: Partial<MemoryUpdateProposalRow>): Promise<void>;
  listMemoryBanks(query?: ListMemoryBanksQuery & { limit: number }): Promise<MemoryBankRow[]>;
  insertMemoryBankLinks?(rows: MemoryBankLinkRow[]): Promise<void>;
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
  embedder?: Embedder | null;
  now?: Date;
}

/**
 * Attach embedding vectors to memory chunks so they are semantically retrievable.
 * Non-fatal: if embeddings are not configured or the call fails, the chunk is
 * stored without a vector rather than losing the memory.
 */
async function attachEmbeddings(chunks: MemoryChunkRow[], deps: MemoryDeps): Promise<MemoryChunkRow[]> {
  if (!chunks.length) return chunks;
  try {
    const vectors = await embedTexts(chunks.map((chunk) => chunk.content), { embedder: deps.embedder });
    if (!vectors) return chunks;
    return chunks.map((chunk, index) => ({ ...chunk, embedding: vectors[index] ?? chunk.embedding }));
  } catch (error) {
    console.error("memory embedding failed:", error instanceof Error ? error.message : error);
    return chunks;
  }
}

export const DEFAULT_MEMORY_LIMIT = 50;
export const MAX_MEMORY_LIMIT = 200;

export function clampMemoryLimit(limit?: number): number {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_MEMORY_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_MEMORY_LIMIT);
}

export async function listMemoryBanks(query: ListMemoryBanksQuery = {}, deps: MemoryDeps = {}) {
  const store = deps.store ?? defaultStore();
  return store.listMemoryBanks({ ...query, limit: clampMemoryLimit(query.limit) });
}

export async function routeMemoryPlacement(
  input: MemoryBankRoutingInput,
  deps: Pick<MemoryDeps, "store"> = {},
): Promise<MemoryBankRoutingSuggestion> {
  const store = deps.store ?? defaultStore();
  const banks = await store.listMemoryBanks({ status: "active", limit: MAX_MEMORY_LIMIT });
  return suggestMemoryBanks(input, banks);
}

async function resolveApprovedBankSlugs(bankSlugs: string[], store: MemoryStore): Promise<string[]> {
  const unique = [...new Set(bankSlugs.map((slug) => slug.trim()).filter(Boolean))];
  if (!unique.length) throw new Error("at least one memory bank is required");
  const banks = await store.listMemoryBanks({ status: "active", limit: MAX_MEMORY_LIMIT });
  const active = new Set(banks.map((bank) => bank.slug));
  const unknown = unique.filter((slug) => !active.has(slug));
  if (unknown.length) throw new Error(`unknown or inactive memory bank(s): ${unknown.join(", ")}`);
  return unique;
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

  const routing =
    input.suggestedBankSlugs?.length
      ? {
          bankSlugs: input.suggestedBankSlugs,
          reason: input.routerReason ?? "Founder or upstream agent supplied suggested memory banks.",
          confidence: input.routerConfidence ?? input.confidence ?? 0.7,
          needsApproval: true as const,
        }
      : await routeMemoryPlacement(
          {
            content: input.proposedMemory,
            affectedArea: input.affectedArea,
            knowledgeType: input.knowledgeType,
            sourceId: input.sourceId,
            sourceIntakeRunId: input.sourceIntakeRunId,
            tags: [input.affectedArea, input.knowledgeType].filter(Boolean) as string[],
          },
          { store },
        );

  const proposal = buildMemoryUpdateProposalRow(
    {
      ...input,
      suggestedBankSlugs: routing.bankSlugs,
      routerReason: routing.reason,
      routerConfidence: routing.confidence,
    },
    { now },
  );
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
      sourceIntakeRunId: proposal.sourceIntakeRunId,
      confidence: proposal.confidence,
      suggestedBankSlugs: proposal.suggestedBankSlugs,
      routerReason: proposal.routerReason,
      routerConfidence: proposal.routerConfidence,
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
        sourceIntakeRunId: proposal.sourceIntakeRunId,
        confidence: proposal.confidence,
        suggestedBankSlugs: proposal.suggestedBankSlugs,
        routerReason: proposal.routerReason,
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
  bankSlugs?: string[];
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
  const approvedBankSlugs = await resolveApprovedBankSlugs(
    input.bankSlugs?.length ? input.bankSlugs : proposal.suggestedBankSlugs.length ? proposal.suggestedBankSlugs : [proposal.affectedArea],
    store,
  );

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
      bankSlugs: approvedBankSlugs,
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
      tags: input.tags ?? [proposal.affectedArea, ...approvedBankSlugs],
      bankSlugs: approvedBankSlugs,
    },
    { now },
  );

  const embeddedChunks = await attachEmbeddings(memoryChunks, deps);

  await store.insertMemoryRecord(memoryRecord);
  await store.insertMemoryChunks(embeddedChunks);
  if (store.insertMemoryBankLinks) {
    await store.insertMemoryBankLinks(
      approvedBankSlugs.flatMap((bankSlug) => [
        buildMemoryBankLinkRow(
          {
            memoryBankSlug: bankSlug,
            memoryRecordId: memoryRecord.id,
            sourceId: proposal.sourceId ?? undefined,
            proposalId: proposal.id,
            createdBy: input.approvedBy,
          },
          { now },
        ),
        ...memoryChunks.map((chunk) =>
          buildMemoryBankLinkRow(
            {
              memoryBankSlug: bankSlug,
              memoryRecordId: memoryRecord.id,
              memoryChunkId: chunk.id,
              sourceId: proposal.sourceId ?? undefined,
              proposalId: proposal.id,
              createdBy: input.approvedBy,
            },
            { now },
          ),
        ),
      ]),
    );
  }

  const fields: Partial<MemoryUpdateProposalRow> = {
    status: "approved",
    approvedBankSlugs,
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
      approvedBankSlugs,
    },
  });

  return { proposal: updatedProposal, memoryRecord, memoryChunks: embeddedChunks };
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
    rejectedReason: input.reason ?? null,
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

  let queryEmbedding = input.queryEmbedding;
  if (!queryEmbedding) {
    try {
      const vector = await embedText(input.query, { embedder: deps.embedder });
      queryEmbedding = vector ?? undefined;
    } catch (error) {
      console.error("memory query embedding failed:", error instanceof Error ? error.message : error);
    }
  }

  const candidates = await store.retrieveMemoryCandidates({ ...input, queryEmbedding, queryMode, limit: MAX_MEMORY_LIMIT });
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
    async listMemoryBanks(query = { limit: DEFAULT_MEMORY_LIMIT }) {
      const conditions = [];
      if (query.scope) conditions.push(eq(memoryBanks.scope, query.scope));
      if (query.status) conditions.push(eq(memoryBanks.status, query.status));
      const where = conditions.length ? and(...conditions) : undefined;
      return db
        .select()
        .from(memoryBanks)
        .where(where)
        .orderBy(memoryBanks.priority, memoryBanks.label)
        .limit(query.limit) as Promise<MemoryBankRow[]>;
    },
    async insertMemoryBankLinks(rows) {
      if (!rows.length) return;
      await db.insert(memoryBankLinks).values(rows);
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
      if (input.bankSlugs?.length) {
        const links = await db
          .select({ memoryChunkId: memoryBankLinks.memoryChunkId })
          .from(memoryBankLinks)
          .where(inArray(memoryBankLinks.memoryBankSlug, input.bankSlugs));
        const chunkIds = [...new Set(links.map((link) => link.memoryChunkId).filter((id): id is string => Boolean(id)))];
        if (!chunkIds.length) return [];
        conditions.push(inArray(memoryChunksTable.id, chunkIds));
      }

      const columns = {
        id: memoryChunksTable.id,
        memoryRecordId: memoryChunksTable.memoryRecordId,
        content: memoryChunksTable.content,
        memoryTier: memoryChunksTable.memoryTier,
        trustLevel: memoryChunksTable.trustLevel,
        sourceId: memoryChunksTable.sourceId,
        parentEntityId: memoryChunksTable.parentEntityId,
        entityType: memoryChunksTable.entityType,
        status: memoryChunksTable.status,
        archived: memoryChunksTable.archived,
        tags: memoryChunksTable.tags,
        bankSlugs: memoryChunksTable.bankSlugs,
        createdAt: memoryChunksTable.createdAt,
      };

      // Semantic path: real pgvector cosine similarity when a query embedding is available.
      // Fallback path: recency ordering (used before embeddings are configured/backfilled).
      const useVector = Array.isArray(input.queryEmbedding) && input.queryEmbedding.length > 0;

      let rows: Array<Record<string, unknown> & { similarity: number }>;
      if (useVector) {
        const similarity = sql<number>`1 - (${cosineDistance(memoryChunksTable.embedding, input.queryEmbedding as number[])})`;
        rows = (await db
          .select({ ...columns, similarity })
          .from(memoryChunksTable)
          .where(and(...conditions, isNotNull(memoryChunksTable.embedding)))
          .orderBy(desc(similarity))
          .limit(input.limit)) as typeof rows;
      } else {
        const where = conditions.length ? and(...conditions) : undefined;
        const base = await db
          .select(columns)
          .from(memoryChunksTable)
          .where(where)
          .orderBy(desc(memoryChunksTable.createdAt))
          .limit(input.limit);
        rows = base.map((row) => ({ ...row, similarity: 0.75 }));
      }

      return rows.map((row) => ({
        id: row.id as string,
        memoryRecordId: (row.memoryRecordId as string | null) ?? null,
        content: row.content as string,
        similarity: Number(row.similarity),
        tier: row.memoryTier as MemoryTier,
        trustLevel: row.trustLevel as TrustLevel,
        sourceId: (row.sourceId as string | null) ?? null,
        parentEntityId: (row.parentEntityId as string | null) ?? null,
        entityType: (row.entityType as string | null) ?? null,
        status: row.status as "active" | "archived",
        archived: row.archived as boolean,
        tags: row.tags as string[],
        bankSlugs: row.bankSlugs as string[],
        createdAt: asIsoDate(row.createdAt as Date | string),
      }));
    },
    async listMemoryRecords(query = { limit: DEFAULT_MEMORY_LIMIT }) {
      const conditions = [];
      if (query.memoryTier) conditions.push(eq(memoryRecords.memoryTier, query.memoryTier));
      if (query.area) conditions.push(eq(memoryRecords.area, query.area));
      if (query.status) conditions.push(eq(memoryRecords.status, query.status));
      if (query.bankSlug) {
        const links = await db
          .select({ memoryRecordId: memoryBankLinks.memoryRecordId })
          .from(memoryBankLinks)
          .where(eq(memoryBankLinks.memoryBankSlug, query.bankSlug));
        const recordIds = [...new Set(links.map((link) => link.memoryRecordId).filter((id): id is string => Boolean(id)))];
        if (!recordIds.length) return [];
        conditions.push(inArray(memoryRecords.id, recordIds));
      }
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
