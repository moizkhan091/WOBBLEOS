import { and, cosineDistance, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { memoryBankLinks, memoryBanks, memoryChunks as memoryChunksTable, memoryConflicts, memoryRecords, memoryRecordVersions, memoryUpdateProposals } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { createApproval, applyApprovalAction, type ApprovalRow, type ApprovalStore } from "@/lib/approvals";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { embedText, embedTexts, type Embedder } from "@/lib/embeddings";
import { founderBankSlug } from "@/lib/domain/conversations";
import {
  buildMemoryChunkRows,
  buildMemoryBankLinkRow,
  buildMemoryConflictRow,
  buildMemoryRecordRow,
  buildMemoryRecordVersionRow,
  buildMemoryUpdateProposalRow,
  canEditMemoryBanks,
  classifyMemoryWrite,
  computeReviewAfter,
  MEMORY_PURGE_GRACE_MS,
  suggestMemoryBanks,
  type ConflictResolution,
  type MemoryConflictRow,
  type MemoryRecordVersionRow,
  type RelatedMemory,
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
  getMemoryRecordById(id: string): Promise<MemoryRecordRow | null>;
  updateMemoryRecordFields(id: string, fields: Partial<MemoryRecordRow>): Promise<void>;
  listChunkIdsForRecord(recordId: string): Promise<Array<{ id: string; content: string }>>;
  updateChunk(id: string, fields: { content?: string; embedding?: number[] | null; status?: string; archived?: boolean; updatedAt: Date }): Promise<void>;
  setChunksStatusForRecord(recordId: string, status: string, archived: boolean, updatedAt: Date): Promise<void>;
  insertRecordVersion(row: MemoryRecordVersionRow): Promise<void>;
  listRecordVersions(recordId: string): Promise<MemoryRecordVersionRow[]>;
  getRecordVersion(id: string): Promise<MemoryRecordVersionRow | null>;
  countRecordVersions(recordId: string): Promise<number>;
  listExpiredArchivedRecords(before: Date, limit: number): Promise<MemoryRecordRow[]>;
  deleteRecordCascade(recordId: string): Promise<void>;
  // Optional (capability-based): conflict detection + staleness review. defaultStore implements all.
  insertConflict?(row: MemoryConflictRow): Promise<void>;
  getConflict?(id: string): Promise<MemoryConflictRow | null>;
  updateConflict?(id: string, fields: Partial<MemoryConflictRow>): Promise<void>;
  listOpenConflicts?(limit: number): Promise<MemoryConflictRow[]>;
  listRecordsDueForReview?(before: Date, limit: number): Promise<MemoryRecordRow[]>;
  setChunksPinnedForRecord?(recordId: string, pinned: boolean, updatedAt: Date): Promise<void>;
}

/** Semantic nearest-neighbours of a candidate memory within the given banks (for dedup/conflict). */
async function findRelatedMemories(
  input: { content: string; embedding: number[] | null; bankSlugs: string[]; excludeRecordId?: string; limit?: number },
  store: MemoryStore,
): Promise<RelatedMemory[]> {
  if (!input.embedding || !input.bankSlugs.length) return [];
  const candidates = await store.retrieveMemoryCandidates({
    query: input.content,
    queryEmbedding: input.embedding,
    bankSlugs: input.bankSlugs,
    queryMode: "current",
    limit: input.limit ?? 5,
  });
  const byRecord = new Map<string, RelatedMemory>();
  for (const c of candidates) {
    if (!c.memoryRecordId || c.memoryRecordId === input.excludeRecordId) continue;
    const current = byRecord.get(c.memoryRecordId);
    if (!current || c.similarity > current.similarity) {
      byRecord.set(c.memoryRecordId, { recordId: c.memoryRecordId, content: c.content, similarity: c.similarity });
    }
  }
  return [...byRecord.values()];
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

// ---- Direct memory management: founders read + edit + add + remove their banks (audited) ----

export interface MemoryRecordDetail extends MemoryRecordRow {
  chunkCount: number;
}

export async function getMemoryRecordDetail(id: string, deps: MemoryDeps = {}): Promise<MemoryRecordDetail | null> {
  const store = deps.store ?? defaultStore();
  const record = await store.getMemoryRecordById(id);
  if (!record) return null;
  const chunks = await store.listChunkIdsForRecord(id);
  return { ...record, chunkCount: chunks.length };
}

export interface CreateMemoryRecordInput {
  title: string;
  content: string;
  area: string;
  memoryTier: MemoryTier;
  trustLevel: TrustLevel;
  bankSlugs: string[];
  createdBy: string;
  sourceId?: string;
  confidence?: number;
  /** Skip creating if a near-identical memory already exists in the same bank (default true). */
  dedupe?: boolean;
  /** Flag a conflict for founder review when a similar-but-different memory exists (default true). */
  detectConflicts?: boolean;
}

/** Founder adds a memory directly. Permission-checked, embedded, dedup + conflict aware, audited. */
export async function createMemoryRecord(input: CreateMemoryRecordInput, deps: MemoryDeps = {}): Promise<MemoryRecordRow> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const bankSlugs = await resolveApprovedBankSlugs(input.bankSlugs, store);
  const permission = canEditMemoryBanks(input.createdBy, bankSlugs);
  if (!permission.allowed) throw new Error(permission.reason);

  // Embed the content ONCE and reuse it for dedup/conflict search AND the stored chunk.
  let embedding: number[] | null = null;
  try {
    const vectors = await embedTexts([input.content], { embedder: deps.embedder });
    embedding = vectors ? vectors[0] ?? null : null;
  } catch (error) {
    console.error("memory create embedding failed:", error instanceof Error ? error.message : error);
  }

  const dedupe = input.dedupe ?? true;
  const detectConflicts = input.detectConflicts ?? true;
  const related = dedupe || detectConflicts ? await findRelatedMemories({ content: input.content, embedding, bankSlugs, limit: 5 }, store) : [];
  const classification = classifyMemoryWrite(related);

  // Duplicate -> don't pile up; return the existing memory.
  if (dedupe && classification.verdict === "duplicate" && classification.relatedRecordId) {
    const existing = await store.getMemoryRecordById(classification.relatedRecordId);
    if (existing) {
      await recordAudit({
        eventType: "memory_record.deduplicated",
        module: "memory",
        entityType: "memory_record",
        entityId: existing.id,
        actor: input.createdBy,
        metadata: { duplicateOf: existing.id, similarity: classification.topSimilarity, skipped: input.title },
      });
      return existing;
    }
  }

  const record = buildMemoryRecordRow(
    { slug: memoryManageSlug(input.area), title: input.title, memoryTier: input.memoryTier, area: input.area, content: input.content, sourceId: input.sourceId, confidence: input.confidence, approvedBy: input.createdBy, bankSlugs },
    { now },
  );
  const chunks = buildMemoryChunkRows(
    { memoryRecordId: record.id, content: input.content, memoryTier: input.memoryTier, trustLevel: input.trustLevel, sourceId: input.sourceId, parentEntityId: record.id, entityType: "memory_record", tags: [input.area, ...bankSlugs], bankSlugs },
    { now },
  ).map((chunk) => ({ ...chunk, embedding }));

  await store.insertMemoryRecord(record);
  await store.insertMemoryChunks(chunks);
  if (store.insertMemoryBankLinks) {
    await store.insertMemoryBankLinks(
      bankSlugs.flatMap((bankSlug) => [
        buildMemoryBankLinkRow({ memoryBankSlug: bankSlug, memoryRecordId: record.id, createdBy: input.createdBy }, { now }),
        ...chunks.map((chunk) => buildMemoryBankLinkRow({ memoryBankSlug: bankSlug, memoryRecordId: record.id, memoryChunkId: chunk.id, createdBy: input.createdBy }, { now })),
      ]),
    );
  }

  await recordAudit({
    eventType: "memory_record.created",
    module: "memory",
    entityType: "memory_record",
    entityId: record.id,
    actor: input.createdBy,
    metadata: { title: record.title, area: record.area, bankSlugs, memoryTier: input.memoryTier, trustLevel: input.trustLevel, direct: true },
  });

  // Similar-but-different -> flag a conflict for the founder to resolve.
  if (detectConflicts && classification.verdict === "conflict" && classification.relatedRecordId && store.insertConflict) {
    const conflict = buildMemoryConflictRow(
      { newRecordId: record.id, existingRecordId: classification.relatedRecordId, bankSlug: bankSlugs[0] ?? null, similarity: classification.topSimilarity, detectedBy: input.createdBy },
      { now },
    );
    await store.insertConflict(conflict);
    await recordAudit({
      eventType: "memory.conflict_detected",
      module: "memory",
      entityType: "memory_conflict",
      entityId: conflict.id,
      actor: input.createdBy,
      metadata: { newRecordId: record.id, existingRecordId: classification.relatedRecordId, similarity: classification.topSimilarity },
    });
  }

  return record;
}

export interface EditMemoryRecordInput {
  id: string;
  title?: string;
  content?: string;
  editedBy: string;
  reason?: string;
}

/** Founder edits a memory. If content changes, the embedding is regenerated so search stays correct. Audited with before/after. */
export async function editMemoryRecord(input: EditMemoryRecordInput, deps: MemoryDeps = {}): Promise<MemoryRecordRow> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const record = await store.getMemoryRecordById(input.id);
  if (!record) throw new Error(`memory record '${input.id}' not found`);
  const permission = canEditMemoryBanks(input.editedBy, record.bankSlugs);
  if (!permission.allowed) throw new Error(permission.reason);

  const before = { title: record.title, content: record.content };
  // Compute this BEFORE the update so it never depends on whether the store returns
  // a detached copy or a live reference.
  const contentChanged = input.content !== undefined && input.content !== before.content;

  // Snapshot the PRIOR state to version history (undo / see-what-changed / restore).
  const versionNumber = (await store.countRecordVersions(input.id)) + 1;
  await store.insertRecordVersion(
    buildMemoryRecordVersionRow(
      { memoryRecordId: input.id, versionNumber, title: before.title, content: before.content, editedBy: input.editedBy, changeReason: input.reason },
      { now },
    ),
  );

  const fields: Partial<MemoryRecordRow> = { updatedAt: now };
  if (input.title !== undefined) fields.title = input.title;
  if (input.content !== undefined) fields.content = input.content;
  await store.updateMemoryRecordFields(input.id, fields);

  if (contentChanged) {
    const chunks = await store.listChunkIdsForRecord(input.id);
    const vectors = await embedTexts(chunks.map(() => input.content!), { embedder: deps.embedder });
    for (let i = 0; i < chunks.length; i++) {
      await store.updateChunk(chunks[i].id, { content: input.content!, embedding: vectors ? vectors[i] ?? null : null, updatedAt: now });
    }
  }

  await recordAudit({
    eventType: "memory_record.edited",
    module: "memory",
    entityType: "memory_record",
    entityId: input.id,
    actor: input.editedBy,
    metadata: {
      before,
      after: { title: fields.title ?? record.title, content: fields.content ?? record.content },
      reEmbedded: contentChanged,
      reason: input.reason ?? null,
    },
  });
  return { ...record, ...fields };
}

/** Founder removes (soft-deletes) a memory. Reversible via restoreMemoryRecord. Audited. */
export async function archiveMemoryRecord(input: { id: string; archivedBy: string; reason?: string }, deps: MemoryDeps = {}): Promise<void> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  const record = await store.getMemoryRecordById(input.id);
  if (!record) throw new Error(`memory record '${input.id}' not found`);
  const permission = canEditMemoryBanks(input.archivedBy, record.bankSlugs);
  if (!permission.allowed) throw new Error(permission.reason);

  const purgeAfter = new Date(now.getTime() + MEMORY_PURGE_GRACE_MS);
  await store.updateMemoryRecordFields(input.id, { status: "archived", archivedAt: now, purgeAfter, updatedAt: now });
  await store.setChunksStatusForRecord(input.id, "archived", true, now);
  await recordAudit({
    eventType: "memory_record.archived",
    module: "memory",
    entityType: "memory_record",
    entityId: input.id,
    actor: input.archivedBy,
    metadata: { title: record.title, bankSlugs: record.bankSlugs, reason: input.reason ?? null, restorableUntil: purgeAfter.toISOString() },
  });
}

export async function restoreMemoryRecord(input: { id: string; restoredBy: string }, deps: MemoryDeps = {}): Promise<void> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  const record = await store.getMemoryRecordById(input.id);
  if (!record) throw new Error(`memory record '${input.id}' not found`);
  const permission = canEditMemoryBanks(input.restoredBy, record.bankSlugs);
  if (!permission.allowed) throw new Error(permission.reason);

  await store.updateMemoryRecordFields(input.id, { status: "active", archivedAt: null, purgeAfter: null, updatedAt: now });
  await store.setChunksStatusForRecord(input.id, "active", false, now);
  await recordAudit({
    eventType: "memory_record.restored",
    module: "memory",
    entityType: "memory_record",
    entityId: input.id,
    actor: input.restoredBy,
    metadata: { title: record.title },
  });
}

/** List a memory's edit history (newest version first). */
export async function listMemoryVersions(recordId: string, deps: MemoryDeps = {}): Promise<MemoryRecordVersionRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listRecordVersions(recordId);
}

/** Roll a memory back to a prior version (non-destructive: the current state is snapshotted first, then re-embedded). */
export async function restoreMemoryVersion(
  input: { recordId: string; versionId: string; restoredBy: string },
  deps: MemoryDeps = {},
): Promise<MemoryRecordRow> {
  const store = deps.store ?? defaultStore();
  const version = await store.getRecordVersion(input.versionId);
  if (!version || version.memoryRecordId !== input.recordId) {
    throw new Error(`memory version '${input.versionId}' not found for record '${input.recordId}'`);
  }
  return editMemoryRecord(
    { id: input.recordId, title: version.title, content: version.content, editedBy: input.restoredBy, reason: `restore to version ${version.versionNumber}` },
    deps,
  );
}

export interface PurgeResult {
  purged: number;
  ids: string[];
}

/**
 * Hard-delete archived memories whose 48h grace window has elapsed (record + chunks +
 * links + versions). Safe to run on a schedule. Everything before the window is restorable.
 */
export async function purgeExpiredArchivedMemory(input: { limit?: number } = {}, deps: MemoryDeps = {}): Promise<PurgeResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  const expired = await store.listExpiredArchivedRecords(now, input.limit ?? 100);
  const ids: string[] = [];
  for (const record of expired) {
    await store.deleteRecordCascade(record.id);
    ids.push(record.id);
    await recordAudit({
      eventType: "memory_record.purged",
      module: "memory",
      entityType: "memory_record",
      entityId: record.id,
      actor: "system",
      metadata: { title: record.title, archivedAt: record.archivedAt, purgeAfter: record.purgeAfter },
    });
  }
  return { purged: ids.length, ids };
}

// ---- Conflict resolution + staleness review ----

export async function listMemoryConflicts(input: { limit?: number } = {}, deps: MemoryDeps = {}): Promise<MemoryConflictRow[]> {
  const store = deps.store ?? defaultStore();
  if (!store.listOpenConflicts) return [];
  return store.listOpenConflicts(input.limit ?? 50);
}

/** Resolve a flagged conflict: keep_new archives the old, keep_existing archives the new, keep_both/merged keep both. Audited. */
export async function resolveMemoryConflict(
  input: { conflictId: string; resolution: ConflictResolution; resolvedBy: string },
  deps: MemoryDeps = {},
): Promise<void> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  if (!store.getConflict || !store.updateConflict) throw new Error("conflict store is not available");

  const conflict = await store.getConflict(input.conflictId);
  if (!conflict) throw new Error(`memory conflict '${input.conflictId}' not found`);
  if (conflict.status !== "open") throw new Error(`memory conflict '${input.conflictId}' is already ${conflict.status}`);

  if (input.resolution === "keep_new") {
    await archiveMemoryRecord({ id: conflict.existingRecordId, archivedBy: input.resolvedBy, reason: "superseded by conflict resolution (keep_new)" }, deps);
  } else if (input.resolution === "keep_existing") {
    await archiveMemoryRecord({ id: conflict.newRecordId, archivedBy: input.resolvedBy, reason: "conflict resolution (keep_existing)" }, deps);
  }

  await store.updateConflict(input.conflictId, { status: "resolved", resolution: input.resolution, resolvedBy: input.resolvedBy, resolvedAt: now, updatedAt: now });
  await recordAudit({
    eventType: "memory.conflict_resolved",
    module: "memory",
    entityType: "memory_conflict",
    entityId: input.conflictId,
    actor: input.resolvedBy,
    metadata: { resolution: input.resolution, newRecordId: conflict.newRecordId, existingRecordId: conflict.existingRecordId },
  });
}

/** Memories whose freshness window has elapsed — prompt the founder to re-confirm. */
export async function listMemoriesDueForReview(input: { limit?: number } = {}, deps: MemoryDeps = {}): Promise<MemoryRecordRow[]> {
  const store = deps.store ?? defaultStore();
  if (!store.listRecordsDueForReview) return [];
  const now = deps.now ?? new Date();
  return store.listRecordsDueForReview(now, input.limit ?? 50);
}

/** Mark a memory as re-confirmed (resets its freshness window). Audited. */
export async function reviewMemory(input: { id: string; reviewedBy: string }, deps: MemoryDeps = {}): Promise<void> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  const record = await store.getMemoryRecordById(input.id);
  if (!record) throw new Error(`memory record '${input.id}' not found`);
  await store.updateMemoryRecordFields(input.id, { lastReviewedAt: now, reviewAfter: computeReviewAfter(record.memoryTier, now), updatedAt: now });
  await recordAudit({
    eventType: "memory_record.reviewed",
    module: "memory",
    entityType: "memory_record",
    entityId: input.id,
    actor: input.reviewedBy,
    metadata: { title: record.title, tier: record.memoryTier },
  });
}

// ---- Pinning + per-founder export ----

/** Pin/unpin a memory (permission-checked, audited). Pinned memories weigh more in retrieval. */
export async function pinMemory(input: { id: string; pinned: boolean; importance?: number; actor: string }, deps: MemoryDeps = {}): Promise<void> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  const record = await store.getMemoryRecordById(input.id);
  if (!record) throw new Error(`memory record '${input.id}' not found`);
  const permission = canEditMemoryBanks(input.actor, record.bankSlugs);
  if (!permission.allowed) throw new Error(permission.reason);
  const importance = input.importance ?? (input.pinned ? Math.max(record.importance, 1) : 0);
  await store.updateMemoryRecordFields(input.id, { pinned: input.pinned, importance, updatedAt: now });
  if (store.setChunksPinnedForRecord) await store.setChunksPinnedForRecord(input.id, input.pinned, now);
  await recordAudit({
    eventType: input.pinned ? "memory_record.pinned" : "memory_record.unpinned",
    module: "memory",
    entityType: "memory_record",
    entityId: input.id,
    actor: input.actor,
    metadata: { title: record.title, importance },
  });
}

export interface FounderMemoryExport {
  founder: string;
  bank: string;
  count: number;
  records: MemoryRecordRow[];
}

/** "What WOBBLE knows about me" — everything in a founder's personal bank, for review/export. */
export async function getFounderMemory(founder: string, deps: MemoryDeps = {}): Promise<FounderMemoryExport> {
  const store = deps.store ?? defaultStore();
  const bank = founderBankSlug(founder);
  const records = await store.listMemoryRecords({ bankSlug: bank, status: "active", limit: MAX_MEMORY_LIMIT });
  return { founder, bank, count: records.length, records };
}

function memoryManageSlug(area: string): string {
  const base = area.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "memory";
  return `${base}-${newId("m").split("_").pop()!.slice(0, 8)}`;
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
        pinned: memoryChunksTable.pinned,
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
        pinned: Boolean(row.pinned),
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
    async getMemoryRecordById(id) {
      const rows = await db.select().from(memoryRecords).where(eq(memoryRecords.id, id)).limit(1);
      return (rows[0] as MemoryRecordRow | undefined) ?? null;
    },
    async updateMemoryRecordFields(id, fields) {
      await db.update(memoryRecords).set(fields).where(eq(memoryRecords.id, id));
    },
    async listChunkIdsForRecord(recordId) {
      return db
        .select({ id: memoryChunksTable.id, content: memoryChunksTable.content })
        .from(memoryChunksTable)
        .where(eq(memoryChunksTable.memoryRecordId, recordId));
    },
    async updateChunk(id, fields) {
      await db.update(memoryChunksTable).set(fields).where(eq(memoryChunksTable.id, id));
    },
    async setChunksStatusForRecord(recordId, status, archived, updatedAt) {
      await db.update(memoryChunksTable).set({ status, archived, updatedAt }).where(eq(memoryChunksTable.memoryRecordId, recordId));
    },
    async setChunksPinnedForRecord(recordId, pinned, updatedAt) {
      await db.update(memoryChunksTable).set({ pinned, updatedAt }).where(eq(memoryChunksTable.memoryRecordId, recordId));
    },
    async insertRecordVersion(row) {
      await db.insert(memoryRecordVersions).values(row);
    },
    async listRecordVersions(recordId) {
      return db
        .select()
        .from(memoryRecordVersions)
        .where(eq(memoryRecordVersions.memoryRecordId, recordId))
        .orderBy(desc(memoryRecordVersions.versionNumber)) as Promise<MemoryRecordVersionRow[]>;
    },
    async getRecordVersion(id) {
      const rows = await db.select().from(memoryRecordVersions).where(eq(memoryRecordVersions.id, id)).limit(1);
      return (rows[0] as MemoryRecordVersionRow | undefined) ?? null;
    },
    async countRecordVersions(recordId) {
      const rows = await db.select({ n: sql<number>`count(*)::int` }).from(memoryRecordVersions).where(eq(memoryRecordVersions.memoryRecordId, recordId));
      return Number(rows[0]?.n ?? 0);
    },
    async listExpiredArchivedRecords(before, limit) {
      return db
        .select()
        .from(memoryRecords)
        .where(and(eq(memoryRecords.status, "archived"), isNotNull(memoryRecords.purgeAfter), lt(memoryRecords.purgeAfter, before)))
        .limit(limit) as Promise<MemoryRecordRow[]>;
    },
    async deleteRecordCascade(recordId) {
      await db.delete(memoryRecordVersions).where(eq(memoryRecordVersions.memoryRecordId, recordId));
      await db.delete(memoryBankLinks).where(eq(memoryBankLinks.memoryRecordId, recordId));
      await db.delete(memoryChunksTable).where(eq(memoryChunksTable.memoryRecordId, recordId));
      await db.delete(memoryRecords).where(eq(memoryRecords.id, recordId));
    },
    async insertConflict(row) {
      await db.insert(memoryConflicts).values(row);
    },
    async getConflict(id) {
      const rows = await db.select().from(memoryConflicts).where(eq(memoryConflicts.id, id)).limit(1);
      return (rows[0] as MemoryConflictRow | undefined) ?? null;
    },
    async updateConflict(id, fields) {
      await db.update(memoryConflicts).set(fields).where(eq(memoryConflicts.id, id));
    },
    async listOpenConflicts(limit) {
      return db
        .select()
        .from(memoryConflicts)
        .where(eq(memoryConflicts.status, "open"))
        .orderBy(desc(memoryConflicts.createdAt))
        .limit(limit) as Promise<MemoryConflictRow[]>;
    },
    async listRecordsDueForReview(before, limit) {
      return db
        .select()
        .from(memoryRecords)
        .where(and(eq(memoryRecords.status, "active"), isNotNull(memoryRecords.reviewAfter), lt(memoryRecords.reviewAfter, before)))
        .orderBy(memoryRecords.reviewAfter)
        .limit(limit) as Promise<MemoryRecordRow[]>;
    },
  };
}
