import { and, cosineDistance, desc, eq, inArray, isNotNull, lt, notInArray, sql } from "drizzle-orm";
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
  personalBankOwner,
  normalizeFounderKey,
  classifyMemoryWrite,
  computeReviewAfter,
  identityScopedBanks,
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
  resolveDeniedBankSlugs,
  isChunkVisibleForAccess,
  type MemoryAccessContext,
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

export type { MemoryAccessContext, MemoryBankLinkRow, MemoryBankRow, MemoryChunkRow, MemoryRecordRow, MemoryUpdateProposalRow, RetrievalMemoryChunk };

export interface ListMemoryRecordsQuery {
  memoryTier?: MemoryTier;
  area?: string;
  bankSlug?: string;
  status?: "active" | "archived";
  limit?: number;
  /**
   * IDENTITY-SAFE PERSONALIZATION — not an access control (see `identityScopedBanks`).
   *
   * When set, records in ANOTHER founder's personal bank are excluded, so WOBBLE does not adopt Ali's
   * preferences as Moiz's defaults while answering Moiz. Founder memory is otherwise transparent:
   * every authenticated founder may READ every founder's company memory, and founder-facing browse
   * endpoints deliberately do NOT set this.
   *
   * Set it ONLY when assembling the automatic context WOBBLE speaks *as* / *for* a founder. Leave it
   * undefined for browse, export, and explicit collaboration reads ("what has Ali been working on?").
   */
  personalizationFounder?: string;
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
  /**
   * Authorization for owner-scoped private banks. Omit for the safe default (shared banks only —
   * founder-private and client/project-private banks are excluded). Ignored when `bankSlugs` names
   * banks explicitly (an explicit request is itself the opt-in).
   */
  access?: MemoryAccessContext;
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
  /** Run a multi-row write chain (record + chunks + bank links + proposal) atomically. Optional so
   *  lightweight test stores can omit it — callers fall back to a sequential run. */
  transaction?<T>(fn: (txStore: MemoryStore) => Promise<T>): Promise<T>;
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
  /** Atomic flip+effect (transactional outbox). Injectable for tests; defaults to the DB implementation. */
  claimAndRecordEffect?: (input: { approvalId: string; approvedBy: string; effect: { approvalId: string; effectType: string; entityType: string; entityId: string; payload?: Record<string, unknown>; actor?: string | null } }) => Promise<{ claimed: boolean; effectId: string | null }>;
  now?: Date;
}

/** Run `fn` inside the store's transaction when it supports one, else sequentially. */
async function withMemoryTransaction<T>(store: MemoryStore, fn: (s: MemoryStore) => Promise<T>): Promise<T> {
  return store.transaction ? store.transaction(fn) : fn(store);
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

/** Founder-supplied fields the memory-apply effect carries in its payload (so the reconciler can rebuild
 *  the memory write independently after a crash). */
export interface ActivateApprovedMemoryUpdateOpts {
  slug: string;
  title: string;
  memoryTier: MemoryTier;
  trustLevel: TrustLevel;
  bankSlugs?: string[];
  tags?: string[];
  approvedBy: string;
}

/**
 * Idempotent downstream of approving a memory update: write the memory record + chunks + bank links and
 * flip the proposal to `approved` — all in ONE memory transaction. Reconciler-safe: re-fetches the
 * proposal and returns `null` if it is no longer pending (the flip commits inside the same tx, so
 * status==="approved" ⟺ the memory was already fully written). This is the applier for the `memory.apply`
 * approval effect and the inline fast-path for {@link approveMemoryUpdate}.
 */
export async function activateApprovedMemoryUpdate(
  proposalId: string,
  opts: ActivateApprovedMemoryUpdateOpts,
  deps: MemoryDeps = {},
): Promise<ApproveMemoryUpdateResult | null> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const proposal = await store.getProposalById(proposalId);
  if (!proposal) throw new Error(`memory update proposal '${proposalId}' not found`);
  if (proposal.status !== "pending") return null; // already applied — idempotent no-op

  const approvedBankSlugs = await resolveApprovedBankSlugs(
    opts.bankSlugs?.length ? opts.bankSlugs : proposal.suggestedBankSlugs.length ? proposal.suggestedBankSlugs : [proposal.affectedArea],
    store,
  );

  const memoryRecord = buildMemoryRecordRow(
    {
      slug: opts.slug,
      title: opts.title,
      memoryTier: opts.memoryTier,
      area: proposal.affectedArea,
      content: proposal.proposedMemory,
      sourceId: proposal.sourceId ?? undefined,
      confidence: proposal.confidence !== null ? Number(proposal.confidence) : undefined,
      approvedBy: opts.approvedBy,
      bankSlugs: approvedBankSlugs,
    },
    { now },
  );
  const memoryChunks = buildMemoryChunkRows(
    {
      memoryRecordId: memoryRecord.id,
      content: proposal.proposedMemory,
      memoryTier: opts.memoryTier,
      trustLevel: opts.trustLevel,
      sourceId: proposal.sourceId ?? undefined,
      parentEntityId: memoryRecord.id,
      entityType: "memory_record",
      tags: opts.tags ?? [proposal.affectedArea, ...approvedBankSlugs],
      bankSlugs: approvedBankSlugs,
    },
    { now },
  );

  const embeddedChunks = await attachEmbeddings(memoryChunks, deps); // network call — OUTSIDE the tx

  const fields: Partial<MemoryUpdateProposalRow> = {
    status: "approved",
    approvedBankSlugs,
    approvedBy: opts.approvedBy,
    approvedAt: now,
    updatedAt: now,
  };

  // Atomic: record + chunks + bank links + proposal flip commit together or roll back — no orphaned
  // record-without-chunks/links (invisible to bank-scoped retrieval) and no consumed-proposal-no-memory.
  await withMemoryTransaction(store, async (tx) => {
    await tx.insertMemoryRecord(memoryRecord);
    await tx.insertMemoryChunks(embeddedChunks);
    if (tx.insertMemoryBankLinks) {
      await tx.insertMemoryBankLinks(
        approvedBankSlugs.flatMap((bankSlug) => [
          buildMemoryBankLinkRow(
            {
              memoryBankSlug: bankSlug,
              memoryRecordId: memoryRecord.id,
              sourceId: proposal.sourceId ?? undefined,
              proposalId: proposal.id,
              createdBy: opts.approvedBy,
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
                createdBy: opts.approvedBy,
              },
              { now },
            ),
          ),
        ]),
      );
    }
    await tx.updateProposal(proposal.id, fields);
  });

  const updatedProposal = { ...proposal, ...fields };
  await recordAudit({
    eventType: "memory_update.approved",
    module: "memory",
    entityType: "memory_update_proposal",
    entityId: proposal.id,
    actor: opts.approvedBy,
    metadata: {
      memoryRecordId: memoryRecord.id,
      memoryTier: opts.memoryTier,
      trustLevel: opts.trustLevel,
      approvedBankSlugs,
    },
  });

  return { proposal: updatedProposal, memoryRecord, memoryChunks: embeddedChunks };
}

export async function approveMemoryUpdate(
  input: ApproveMemoryUpdateInput,
  deps: MemoryDeps = {},
): Promise<ApproveMemoryUpdateResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  // Validation-first: the proposal must be pending and every target bank must be active BEFORE we
  // consume the approval — so a bad request never leaves an approved approval with no memory.
  const proposal = await getPendingProposal(store, input.proposalId);
  const approvedBankSlugs = await resolveApprovedBankSlugs(
    input.bankSlugs?.length ? input.bankSlugs : proposal.suggestedBankSlugs.length ? proposal.suggestedBankSlugs : [proposal.affectedArea],
    store,
  );

  // Transactional outbox: atomically flip the approval + record the memory-apply effect (one DB tx). The
  // effect payload carries the founder-supplied fields so the scheduler reconciler can rebuild the memory
  // write independently if we crash before the inline apply below. Idempotent: a lost claim is a no-op.
  const claimFn = deps.claimAndRecordEffect ?? (async (i: Parameters<NonNullable<MemoryDeps["claimAndRecordEffect"]>>[0]) => (await import("@/lib/approval-effects")).claimApprovalAndRecordEffect(i, { now }));
  const { claimed, effectId } = await claimFn({
    approvalId: input.approvalId,
    approvedBy: input.approvedBy,
    effect: {
      approvalId: input.approvalId,
      effectType: "memory.apply",
      entityType: "memory_update_proposal",
      entityId: proposal.id,
      payload: { slug: input.slug, title: input.title, memoryTier: input.memoryTier, trustLevel: input.trustLevel, tags: input.tags ?? null, bankSlugs: approvedBankSlugs },
      actor: input.approvedBy,
    },
  });

  await recordAudit({ eventType: "approval.approve", module: "approvals", entityType: "approval", entityId: input.approvalId, actor: input.approvedBy, metadata: { approvalType: "memory_update", toStatus: "approved", claimed } });

  // Inline fast-path (idempotent). If we crash before/inside this, the pending effect is applied by the
  // scheduler reconciler — the state converges either way (no consumed-approval-without-memory).
  const applied = await activateApprovedMemoryUpdate(
    proposal.id,
    { slug: input.slug, title: input.title, memoryTier: input.memoryTier, trustLevel: input.trustLevel, tags: input.tags, bankSlugs: approvedBankSlugs, approvedBy: input.approvedBy },
    { store, recordAudit, embedder: deps.embedder, now },
  );

  if (claimed && effectId && !deps.claimAndRecordEffect) {
    try {
      const { reconcileApprovalEffects } = await import("@/lib/approval-effects");
      const { APPROVAL_EFFECT_APPLIERS } = await import("@/lib/approval-effects/appliers");
      await reconcileApprovalEffects(APPROVAL_EFFECT_APPLIERS, { onlyId: effectId, now });
    } catch { /* the scheduler reconciler is the safety net */ }
  }

  if (applied) return applied;
  // Lost the claim (a concurrent approve won) — the winner wrote the memory. Echo the persisted proposal
  // plus the freshly-built record shape so the API response is well-formed; nobody consumes the record id.
  const finalProposal = (await store.getProposalById(proposal.id)) ?? proposal;
  const echoRecord = buildMemoryRecordRow(
    { slug: input.slug, title: input.title, memoryTier: input.memoryTier, area: proposal.affectedArea, content: proposal.proposedMemory, sourceId: proposal.sourceId ?? undefined, confidence: proposal.confidence !== null ? Number(proposal.confidence) : undefined, approvedBy: input.approvedBy, bankSlugs: approvedBankSlugs },
    { now },
  );
  return { proposal: finalProposal, memoryRecord: echoRecord, memoryChunks: [] };
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

  // Deny-by-default bank scoping. When the caller did NOT name banks explicitly, exclude any chunk
  // that lives exclusively in owner-scoped private banks (a founder's personal taste, a specific
  // client's/project's confidential context) it isn't authorized for. Explicit `bankSlugs` is the
  // opt-in and bypasses this. Filtering happens over the fetched MAX_MEMORY_LIMIT (200) window and
  // the result is sliced to `limit` (typically 6–8), so recall has ample headroom.
  let scoped = candidates;
  if (!input.bankSlugs?.length && !input.access?.allowOwnerScoped && typeof store.listMemoryBanks === "function") {
    const banks = await store.listMemoryBanks({ limit: MAX_MEMORY_LIMIT });
    const denied = new Set(resolveDeniedBankSlugs(banks, input.access ?? {}));
    if (denied.size) scoped = candidates.filter((chunk) => isChunkVisibleForAccess(chunk.bankSlugs, denied));
  }

  const activeCandidates =
    queryMode === "include_archived" ? scoped : scoped.filter((chunk) => chunk.status === "active");
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

  // Atomic: record + chunks + bank links commit together (no orphaned record invisible to retrieval).
  await withMemoryTransaction(store, async (tx) => {
    await tx.insertMemoryRecord(record);
    await tx.insertMemoryChunks(chunks);
    if (tx.insertMemoryBankLinks) {
      await tx.insertMemoryBankLinks(
        bankSlugs.flatMap((bankSlug) => [
          buildMemoryBankLinkRow({ memoryBankSlug: bankSlug, memoryRecordId: record.id, createdBy: input.createdBy }, { now }),
          ...chunks.map((chunk) => buildMemoryBankLinkRow({ memoryBankSlug: bankSlug, memoryRecordId: record.id, memoryChunkId: chunk.id, createdBy: input.createdBy }, { now })),
        ]),
      );
    }
  });

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
    // Re-embed defensively: on failure or when no embedder is configured, PRESERVE the
    // existing embedding (do not null it out) so the memory never silently drops out of
    // semantic search. Only overwrite the embedding when we have a fresh vector.
    let vectors: number[][] | null = null;
    try {
      vectors = await embedTexts(chunks.map(() => input.content!), { embedder: deps.embedder });
    } catch (error) {
      console.error("memory edit re-embed failed (keeping old vector):", error instanceof Error ? error.message : error);
    }
    for (let i = 0; i < chunks.length; i++) {
      const fields: { content: string; embedding?: number[] | null; updatedAt: Date } = { content: input.content!, updatedAt: now };
      if (vectors && vectors[i]) fields.embedding = vectors[i];
      await store.updateChunk(chunks[i].id, fields);
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

export interface CorrectFounderMemoryInput {
  recordId: string;
  /** The founder whose memory is being corrected — comes from the ROUTE PATH, never a request-body/query field. */
  targetFounder: string;
  /** The super-admin performing the correction — comes from the verified SESSION, never the body. */
  actor: string;
  title?: string;
  content?: string;
  /** MANDATORY. A correction with no stated reason is refused. */
  reason: string;
  /** MANDATORY explicit confirmation. A correction without it is refused (no accidental cross-founder edit). */
  confirm: boolean;
}

export interface CorrectFounderMemoryDeps extends MemoryDeps {
  /** Notify the affected founder. Injected in tests; the route wires the internal-notification comms channel. */
  notifyFounder?: (n: { founder: string; subject: string; body: string; recordId: string; actor: string; reason: string }) => Promise<void>;
}

export interface FounderMemoryCorrection {
  record: MemoryRecordRow;
  before: { title: string; content: string };
  after: { title: string; content: string };
}

/**
 * GOVERNED super-admin correction of ANOTHER founder's memory (BINDING FOUNDER CORRECTION #3).
 *
 * A super-admin may fix a wrong entry in a colleague's founder memory, but ONLY through this governed path —
 * never a silent edit (`canEditMemoryBanks` deliberately blocks that). Every guard here is load-bearing:
 *  - The TARGET is the route path, and the record must actually belong to that founder's personal bank. A
 *    record owned by someone else is REFUSED — a generic body/query field can never silently retarget who
 *    gets corrected.
 *  - A `reason` and explicit `confirm` are mandatory.
 *  - The ACTOR is the verified super-admin session, attributed distinctly in the audit (not the owner).
 *  - Full before/after is captured, a version snapshot is written (so the owner can restore), and the
 *    affected founder is NOTIFIED. A correction the owner cannot see or undo would be exactly the silent
 *    override this rule exists to prevent.
 *
 * It does NOT touch shared company/brand banks (those are edited normally) — only a founder PERSONAL bank.
 */
export async function correctFounderMemory(input: CorrectFounderMemoryInput, deps: CorrectFounderMemoryDeps = {}): Promise<FounderMemoryCorrection> {
  if (!input.confirm) throw new Error("founder memory correction requires explicit confirmation");
  if (!input.reason?.trim()) throw new Error("founder memory correction requires a reason");
  if (input.title === undefined && input.content === undefined) throw new Error("founder memory correction has nothing to change");

  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const record = await store.getMemoryRecordById(input.recordId);
  if (!record) throw new Error(`memory record '${input.recordId}' not found`);

  // The record MUST live in a founder PERSONAL bank, and that owner MUST equal the path target. This is what
  // makes the target authoritative — we correct exactly the named founder's memory or nothing.
  const owner = record.bankSlugs.map((b) => personalBankOwner(b)).find((o): o is string => Boolean(o)) ?? null;
  if (!owner) throw new Error(`record '${input.recordId}' is not a founder personal memory — governed correction does not apply`);
  if (normalizeFounderKey(owner) !== normalizeFounderKey(input.targetFounder)) {
    throw new Error(`record '${input.recordId}' belongs to '${owner}', not '${input.targetFounder}' — refusing to correct a different founder's memory`);
  }

  const before = { title: record.title, content: record.content };
  const contentChanged = input.content !== undefined && input.content !== before.content;

  // Version snapshot of the PRIOR state — the owner can restore it, so the correction is never irreversible.
  const versionNumber = (await store.countRecordVersions(input.recordId)) + 1;
  await store.insertRecordVersion(
    buildMemoryRecordVersionRow(
      { memoryRecordId: input.recordId, versionNumber, title: before.title, content: before.content, editedBy: input.actor, changeReason: `super-admin correction: ${input.reason}` },
      { now },
    ),
  );

  const fields: Partial<MemoryRecordRow> = { updatedAt: now };
  if (input.title !== undefined) fields.title = input.title;
  if (input.content !== undefined) fields.content = input.content;
  await store.updateMemoryRecordFields(input.recordId, fields);

  if (contentChanged) {
    const chunks = await store.listChunkIdsForRecord(input.recordId);
    let vectors: number[][] | null = null;
    try {
      vectors = await embedTexts(chunks.map(() => input.content!), { embedder: deps.embedder });
    } catch (error) {
      console.error("founder correction re-embed failed (keeping old vector):", error instanceof Error ? error.message : error);
    }
    for (let i = 0; i < chunks.length; i++) {
      const chunkFields: { content: string; embedding?: number[] | null; updatedAt: Date } = { content: input.content!, updatedAt: now };
      if (vectors && vectors[i]) chunkFields.embedding = vectors[i];
      await store.updateChunk(chunks[i].id, chunkFields);
    }
  }

  const after = { title: fields.title ?? record.title, content: fields.content ?? record.content };

  await recordAudit({
    eventType: "memory.founder_corrected",
    module: "memory",
    entityType: "memory_record",
    entityId: input.recordId,
    // The ACTOR is the super-admin, kept distinct from the record's owner — the audit answers WHO changed
    // WHOSE memory, and why, with the full before/after.
    actor: input.actor,
    metadata: {
      targetFounder: normalizeFounderKey(input.targetFounder),
      recordId: input.recordId,
      before,
      after,
      reason: input.reason,
      superAdminOverride: true,
      versionNumber,
    },
  });

  // Notify the affected founder — a governed correction the owner never learns about is a silent override.
  if (deps.notifyFounder) {
    await deps
      .notifyFounder({ founder: normalizeFounderKey(input.targetFounder), subject: `Your memory "${before.title}" was corrected by ${input.actor}`, body: `${input.actor} corrected your founder memory record "${before.title}". Reason: ${input.reason}. The prior version was saved and you can restore it.`, recordId: input.recordId, actor: input.actor, reason: input.reason })
      .catch((e) => console.error("founder correction notify failed (non-fatal):", e instanceof Error ? e.message : e));
  }

  return { record: { ...record, ...fields }, before, after };
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
  /** The founder this memory is ABOUT (may be someone other than the viewer — that is allowed). */
  founder: string;
  bank: string;
  count: number;
  records: MemoryRecordRow[];
  /** The authenticated founder who read it. */
  viewer: string;
  /** True only when viewer === founder: other founders' profiles are read-only, never hidden. */
  editable: boolean;
}

/**
 * A founder's company memory — for their own review/export AND for any other authenticated founder
 * reading their profile ("what has Ali been working on?").
 *
 * Reading another founder's bank is INTENDED, not a leak: founder memory is transparent across the
 * company. `viewer` is recorded for attribution/audit and to mark the response read-only in the UI; it
 * deliberately does not restrict WHICH bank may be read. The caller must still be an authenticated
 * founder — that gate lives in the route (and is what stops an unauthenticated or revoked reader).
 *
 * Editing remains owner-only via `canEditMemoryBanks`; `editable` tells the caller which it is.
 */
export async function getFounderMemory(founder: string, viewer: string, deps: MemoryDeps = {}): Promise<FounderMemoryExport> {
  const store = deps.store ?? defaultStore();
  const bank = founderBankSlug(founder);
  const records = await store.listMemoryRecords({ bankSlug: bank, status: "active", limit: MAX_MEMORY_LIMIT });
  return { founder, bank, count: records.length, records, viewer, editable: canEditMemoryBanks(viewer, [bank]).allowed };
}

// ---- Bulk operations + merge / split ----

export type BulkMemoryOperation = "archive" | "restore" | "pin" | "unpin";

export interface BulkMemoryResult {
  operation: BulkMemoryOperation;
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

/** Apply one operation to many memories; per-record permission + audit; collects partial failures. */
export async function bulkMemoryOperation(
  input: { recordIds: string[]; operation: BulkMemoryOperation; actor: string; reason?: string },
  deps: MemoryDeps = {},
): Promise<BulkMemoryResult> {
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const succeeded: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  for (const id of input.recordIds) {
    try {
      if (input.operation === "archive") await archiveMemoryRecord({ id, archivedBy: input.actor, reason: input.reason }, deps);
      else if (input.operation === "restore") await restoreMemoryRecord({ id, restoredBy: input.actor }, deps);
      else if (input.operation === "pin") await pinMemory({ id, pinned: true, actor: input.actor }, deps);
      else await pinMemory({ id, pinned: false, actor: input.actor }, deps);
      succeeded.push(id);
    } catch (error) {
      failed.push({ id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  await recordAudit({
    eventType: `memory.bulk_${input.operation}`,
    module: "memory",
    entityType: "memory_record",
    actor: input.actor,
    metadata: { operation: input.operation, total: input.recordIds.length, succeeded: succeeded.length, failed: failed.length },
  });
  return { operation: input.operation, total: input.recordIds.length, succeeded, failed };
}

export interface MergeMemoryInput {
  sourceIds: string[];
  title: string;
  content: string;
  area?: string;
  memoryTier?: MemoryTier;
  trustLevel?: TrustLevel;
  bankSlugs?: string[];
  actor: string;
}

/** Merge several memories into one new record (union of banks by default), archiving the sources. Audited. */
export async function mergeMemoryRecords(input: MergeMemoryInput, deps: MemoryDeps = {}): Promise<MemoryRecordRow> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  if (input.sourceIds.length < 2) throw new Error("merge requires at least 2 source memories");

  const sources = await Promise.all(input.sourceIds.map((id) => store.getMemoryRecordById(id)));
  const missing = input.sourceIds.filter((_id, i) => !sources[i]);
  if (missing.length) throw new Error(`memory record(s) not found: ${missing.join(", ")}`);
  const found = sources.filter((s): s is MemoryRecordRow => Boolean(s));

  const bankSlugs = input.bankSlugs ?? [...new Set(found.flatMap((s) => s.bankSlugs))];
  const merged = await createMemoryRecord(
    {
      title: input.title,
      content: input.content,
      area: input.area ?? found[0].area,
      memoryTier: input.memoryTier ?? found[0].memoryTier,
      trustLevel: input.trustLevel ?? "approved_expert",
      bankSlugs,
      createdBy: input.actor,
      dedupe: false,
      detectConflicts: false,
    },
    deps,
  );
  for (const source of found) {
    await archiveMemoryRecord({ id: source.id, archivedBy: input.actor, reason: `merged into ${merged.id}` }, deps);
  }
  await recordAudit({
    eventType: "memory.merged",
    module: "memory",
    entityType: "memory_record",
    entityId: merged.id,
    actor: input.actor,
    metadata: { mergedFrom: input.sourceIds, into: merged.id },
  });
  return merged;
}

/** Split one memory into several new records, archiving the original. Audited. */
export async function splitMemoryRecord(
  input: { recordId: string; parts: Array<{ title: string; content: string }>; actor: string },
  deps: MemoryDeps = {},
): Promise<MemoryRecordRow[]> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  if (input.parts.length < 2) throw new Error("split requires at least 2 parts");

  const record = await store.getMemoryRecordById(input.recordId);
  if (!record) throw new Error(`memory record '${input.recordId}' not found`);

  const created: MemoryRecordRow[] = [];
  for (const part of input.parts) {
    created.push(
      await createMemoryRecord(
        {
          title: part.title,
          content: part.content,
          area: record.area,
          memoryTier: record.memoryTier,
          trustLevel: "approved_expert",
          bankSlugs: record.bankSlugs,
          createdBy: input.actor,
          dedupe: false,
          detectConflicts: false,
        },
        deps,
      ),
    );
  }
  await archiveMemoryRecord({ id: input.recordId, archivedBy: input.actor, reason: `split into ${created.length} memories` }, deps);
  await recordAudit({
    eventType: "memory.split",
    module: "memory",
    entityType: "memory_record",
    entityId: input.recordId,
    actor: input.actor,
    metadata: { splitInto: created.map((c) => c.id) },
  });
  return created;
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
      // Exclude archived/soft-deleted chunks unless explicitly asked — this fixes dedup/conflict
      // detection (findRelatedMemories) matching against deleted memories, and keeps retrieval clean.
      if (input.queryMode !== "include_archived") conditions.push(eq(memoryChunksTable.status, "active"));
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
      // Identity-safe personalization, NOT confidentiality. Founder memory is transparent to every
      // authenticated founder, so browse/export endpoints leave this unset and see everything. This
      // only keeps another founder's personal memory out of the context WOBBLE speaks *as* someone.
      //
      // `!== undefined`, NOT a truthiness test: an EMPTY value means "personalizing for an actor we
      // could not resolve", which must exclude EVERY personal bank (no owner matches "") rather than
      // fall through to no filter. Truthiness would fail open on exactly the case that must fail closed.
      if (query.personalizationFounder !== undefined) {
        const personal = await db
          .select({ memoryRecordId: memoryBankLinks.memoryRecordId, bank: memoryBankLinks.memoryBankSlug })
          .from(memoryBankLinks)
          .where(sql`${memoryBankLinks.memoryBankSlug} like 'founder\\_%'`);
        const foreignBanks = new Set(identityScopedBanks(query.personalizationFounder, [...new Set(personal.map((l) => l.bank ?? ""))]));
        const hidden = [
          ...new Set(
            personal
              .filter((link) => foreignBanks.has(link.bank ?? ""))
              .map((link) => link.memoryRecordId)
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        if (hidden.length) conditions.push(notInArray(memoryRecords.id, hidden));
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
      // Atomic cascade: versions + links + chunks + record delete together (no partial delete leaving orphans).
      await db.transaction(async (tx) => {
        await tx.delete(memoryRecordVersions).where(eq(memoryRecordVersions.memoryRecordId, recordId));
        await tx.delete(memoryBankLinks).where(eq(memoryBankLinks.memoryRecordId, recordId));
        await tx.delete(memoryChunksTable).where(eq(memoryChunksTable.memoryRecordId, recordId));
        await tx.delete(memoryRecords).where(eq(memoryRecords.id, recordId));
      });
    },
    async transaction(fn) {
      return db.transaction((tx) => fn(defaultStore(tx as unknown as Db)));
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
