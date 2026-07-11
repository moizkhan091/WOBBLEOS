import { and, cosineDistance, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { knowledgeNotes, knowledgeNoteLinks, sourceChunks, sources } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { embedText, embedTexts, type EmbedderDeps } from "@/lib/embeddings";
import { runTextProvider, type ProviderMessage } from "@/lib/providers";
import { recordAgentRun } from "@/lib/agents";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { loadApprovedSkill } from "@/lib/prompt-skills";
import { enqueueJob } from "@/lib/jobs";
import type { EnqueueJobInput, JobRow } from "@/lib/domain/jobs";
import {
  KNOWLEDGE_MODULE,
  KNOWLEDGE_COMPILER_AGENT_SLUG,
  KNOWLEDGE_COMPILER_ROLE,
  KNOWLEDGE_COMPILE_JOB_TYPE,
  KNOWLEDGE_COMPILE_QUEUE,
  assertCompileContext,
  buildCompilerPrompt,
  buildKnowledgeNoteLinkRow,
  buildKnowledgeNoteRow,
  classifyNoteSynthesis,
  normalizeNoteType,
  parseCompilerOutput,
  resolveProvenanceChunkIds,
  suggestNoteBanks,
  type CompileChunkRef,
  type CompileSourceRef,
  type KnowledgeNoteLinkRow,
  type KnowledgeNoteRow,
} from "@/lib/domain/knowledge";

/**
 * Chunk 13 — Knowledge Compiler service (IO).
 *
 * compileSource(): approved source + raw chunks -> LLM extracts atomic notes -> embed ->
 * synthesize (reinforce near-duplicates, insert + interlink the rest) -> log. Notes are the
 * compiled "wiki" and are immediately retrievable. retrieveKnowledge() is the ONE hybrid
 * contract downstream agents call (synthesized notes + raw source chunks).
 */

// ---------------------------------------------------------------- store

export interface SimilarNote {
  noteId: string;
  similarity: number;
  topic: string;
}
export interface KnowledgeNoteView extends Omit<KnowledgeNoteRow, "embedding"> {
  similarity?: number | null;
}
export interface RetrievedChunk {
  id: string;
  sourceId: string | null;
  content: string;
  similarity: number;
}

export interface ListNotesQuery {
  limit?: number;
  status?: string;
  topic?: string;
  noteTypes?: string[];
  sourceId?: string;
}

export interface KnowledgeStore {
  getSource(id: string): Promise<CompileSourceRef | null>;
  listSourceChunks(sourceId: string, limit: number): Promise<CompileChunkRef[]>;
  insertNote(row: KnowledgeNoteRow): Promise<void>;
  insertNoteLinks(rows: KnowledgeNoteLinkRow[]): Promise<void>;
  reinforceNote(input: { noteId: string; addSourceId: string | null; addChunkIds: string[]; now: Date }): Promise<void>;
  findSimilarNotes(embedding: number[], limit: number): Promise<SimilarNote[]>;
  listNotes(query: ListNotesQuery): Promise<KnowledgeNoteView[]>;
  getNoteById(id: string): Promise<KnowledgeNoteView | null>;
  listLinksForNote(noteId: string): Promise<KnowledgeNoteLinkRow[]>;
  archiveNote(id: string, now: Date): Promise<boolean>;
  searchNotes(embedding: number[], input: { limit: number; noteTypes?: string[]; topic?: string }): Promise<KnowledgeNoteView[]>;
  searchSourceChunks(embedding: number[], limit: number): Promise<RetrievedChunk[]>;
}

export interface KnowledgeDeps {
  store?: KnowledgeStore;
  embedder?: EmbedderDeps;
  loadSkill?: (slug: string) => Promise<{ promptBody: string; rules: string[] } | null>;
  runProvider?: (input: {
    role: string;
    module: string;
    messages: ProviderMessage[];
    maxTokens?: number;
    temperature?: number;
    linkedEntityType?: string;
    linkedEntityId?: string;
  }) => Promise<{ text: string; runId?: string; costEstimate?: number }>;
  recordAgentRun?: (input: Record<string, unknown>) => Promise<unknown>;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  enqueueJob?: (input: EnqueueJobInput) => Promise<unknown>;
  now?: Date;
}

// ---------------------------------------------------------------- compile

export interface CompileSourceInput {
  sourceId: string;
  triggeredBy?: string;
  sourceChunkLimit?: number;
}
export interface CompileSourceResult {
  sourceId: string;
  notesCreated: number;
  notesReinforced: number;
  linksCreated: number;
  skippedNotes: number;
  modelRunId?: string;
  noteIds: string[];
}

async function defaultLoadSkill(slug: string): Promise<{ promptBody: string; rules: string[] } | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const skill = await loadApprovedSkill(slug);
    return skill ? { promptBody: skill.promptBody, rules: skill.rules } : null;
  } catch {
    return null;
  }
}

async function defaultRunProvider(input: {
  role: string;
  module: string;
  messages: ProviderMessage[];
  maxTokens?: number;
  temperature?: number;
  linkedEntityType?: string;
  linkedEntityId?: string;
}): Promise<{ text: string; runId?: string; costEstimate?: number }> {
  const result = await runTextProvider(input);
  return {
    text: result.text,
    runId: result.run?.id,
    costEstimate: result.run?.estimatedCost ? Number(result.run.estimatedCost) : undefined,
  };
}

async function safeRecordAgentRun(deps: KnowledgeDeps, input: Record<string, unknown>): Promise<void> {
  try {
    await (deps.recordAgentRun ?? ((i: Record<string, unknown>) => recordAgentRun(i as never)))(input);
  } catch {
    /* logging must never fail the compile */
  }
}

/** Compile ONE approved source into synthesized, interlinked knowledge notes. */
export async function compileSource(input: CompileSourceInput, deps: KnowledgeDeps = {}): Promise<CompileSourceResult> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const actor = input.triggeredBy ?? KNOWLEDGE_COMPILER_AGENT_SLUG;
  const recordAudit = deps.recordAudit ?? (async (i: AuditEventInput) => void (await writeAuditEvent(i)));

  const source = await store.getSource(input.sourceId);
  if (!source) throw new Error(`source '${input.sourceId}' not found`);
  const chunks = await store.listSourceChunks(input.sourceId, input.sourceChunkLimit ?? 60);
  assertCompileContext({ source, chunks }); // throws on unapproved / no chunks (anti-waste)

  await recordAudit({
    eventType: "knowledge_compile.started",
    module: KNOWLEDGE_MODULE,
    entityType: "source",
    entityId: source.id,
    actor,
    metadata: { chunks: chunks.length },
  });

  try {
    const skill = (await (deps.loadSkill ?? defaultLoadSkill)("knowledge_compilation")) ?? null;
    const prompt = buildCompilerPrompt({ source, chunks, skill });
    const provider = deps.runProvider ?? defaultRunProvider;
    const providerResult = await provider({
      role: KNOWLEDGE_COMPILER_ROLE,
      module: KNOWLEDGE_MODULE,
      messages: prompt.messages,
      maxTokens: 2200,
      temperature: 0.2,
      linkedEntityType: "source",
      linkedEntityId: source.id,
    });

    const { notes: candidates, skipped } = parseCompilerOutput(providerResult.text);
    const embeddings = candidates.length
      ? await embedTexts(candidates.map((c) => `${c.title}. ${c.content}`), deps.embedder ?? {})
      : [];

    const noteIds: string[] = [];
    let created = 0;
    let reinforced = 0;
    let linksCreated = 0;

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      const embedding = embeddings ? embeddings[i] ?? null : null;
      const provenanceChunkIds = resolveProvenanceChunkIds(candidate.provenanceChunkIndexes, chunks);

      const related = embedding ? await store.findSimilarNotes(embedding, 8) : [];
      const action = classifyNoteSynthesis(related);

      if (action.action === "reinforce") {
        await store.reinforceNote({ noteId: action.targetNoteId, addSourceId: source.id, addChunkIds: provenanceChunkIds, now });
        reinforced += 1;
        noteIds.push(action.targetNoteId);
        continue;
      }

      const row = buildKnowledgeNoteRow(
        {
          sourceId: source.id,
          provenanceChunkIds,
          noteType: normalizeNoteType(candidate.type),
          topic: candidate.topic,
          area: candidate.area,
          title: candidate.title,
          content: candidate.content,
          confidence: candidate.confidence ?? null,
          trustLevel: source.trustLevel ?? "experimental",
          embedding,
          bankSlugs: suggestNoteBanks({ area: candidate.area ?? candidate.topic, topic: candidate.topic, noteType: candidate.type }),
          createdBy: actor,
        },
        { now },
      );
      await store.insertNote(row);
      created += 1;
      noteIds.push(row.id);

      if (action.links.length) {
        const linkRows = action.links.map((l) =>
          buildKnowledgeNoteLinkRow(
            { fromNoteId: row.id, toNoteId: l.toNoteId, linkType: l.linkType, confidence: l.similarity, createdBy: actor },
            { now },
          ),
        );
        await store.insertNoteLinks(linkRows);
        linksCreated += linkRows.length;
      }
    }

    await safeRecordAgentRun(deps, {
      agentSlug: KNOWLEDGE_COMPILER_AGENT_SLUG,
      status: "succeeded",
      inputSummary: `compile source ${source.title}`.slice(0, 500),
      outputSummary: `${created} new, ${reinforced} reinforced, ${linksCreated} links`,
      modelRunIds: providerResult.runId ? [providerResult.runId] : [],
      sourceIdsUsed: [source.id],
      costEstimate: providerResult.costEstimate,
    });

    await recordAudit({
      eventType: "knowledge_compile.completed",
      module: KNOWLEDGE_MODULE,
      entityType: "source",
      entityId: source.id,
      actor,
      metadata: { created, reinforced, linksCreated, skipped, modelRunId: providerResult.runId ?? null },
    });

    return { sourceId: source.id, notesCreated: created, notesReinforced: reinforced, linksCreated, skippedNotes: skipped, modelRunId: providerResult.runId, noteIds };
  } catch (error) {
    await safeRecordAgentRun(deps, {
      agentSlug: KNOWLEDGE_COMPILER_AGENT_SLUG,
      status: "failed",
      inputSummary: `compile source ${input.sourceId}`,
      error: error instanceof Error ? error.message : String(error),
    });
    await recordAudit({
      eventType: "knowledge_compile.failed",
      module: KNOWLEDGE_MODULE,
      entityType: "source",
      entityId: input.sourceId,
      actor,
      metadata: { reason: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

// ---------------------------------------------------------------- retrieval (hybrid)

export interface RetrieveKnowledgeInput {
  query: string;
  limit?: number;
  chunkLimit?: number;
  noteTypes?: string[];
  topic?: string;
}
export interface RetrieveKnowledgeResult {
  notes: KnowledgeNoteView[];
  chunks: RetrievedChunk[];
  embedded: boolean;
}

/** The ONE hybrid retrieval contract: synthesized notes (understanding) + raw chunks (fidelity). */
export async function retrieveKnowledge(input: RetrieveKnowledgeInput, deps: KnowledgeDeps = {}): Promise<RetrieveKnowledgeResult> {
  const store = deps.store ?? defaultStore();
  const embedding = await embedText(input.query, deps.embedder ?? {});
  if (!embedding) {
    // No embedder configured — degrade to recent notes so callers still get grounding.
    const notes = await store.listNotes({ limit: input.limit ?? 12, status: "active", topic: input.topic, noteTypes: input.noteTypes });
    return { notes, chunks: [], embedded: false };
  }
  const [notes, chunks] = await Promise.all([
    store.searchNotes(embedding, { limit: input.limit ?? 12, noteTypes: input.noteTypes, topic: input.topic }),
    store.searchSourceChunks(embedding, input.chunkLimit ?? 6),
  ]);
  return { notes, chunks, embedded: true };
}

export async function listKnowledgeNotes(query: ListNotesQuery = {}, deps: KnowledgeDeps = {}): Promise<KnowledgeNoteView[]> {
  const store = deps.store ?? defaultStore();
  return store.listNotes({ ...query, limit: Math.min(Math.max(query.limit ?? 50, 1), 200) });
}

export interface KnowledgeNoteDetail {
  note: KnowledgeNoteView;
  links: KnowledgeNoteLinkRow[];
}
export async function getKnowledgeNoteDetail(id: string, deps: KnowledgeDeps = {}): Promise<KnowledgeNoteDetail | null> {
  const store = deps.store ?? defaultStore();
  const note = await store.getNoteById(id);
  if (!note) return null;
  const links = await store.listLinksForNote(id);
  return { note, links };
}

export async function archiveKnowledgeNote(id: string, deps: KnowledgeDeps = {}): Promise<boolean> {
  const store = deps.store ?? defaultStore();
  return store.archiveNote(id, deps.now ?? new Date());
}

// ---------------------------------------------------------------- job

export async function enqueueKnowledgeCompileJob(
  input: { sourceId: string; triggeredBy?: string; idempotencyKey?: string },
  deps: KnowledgeDeps = {},
): Promise<unknown> {
  const enqueue = deps.enqueueJob ?? enqueueJob;
  return enqueue({
    queue: KNOWLEDGE_COMPILE_QUEUE,
    type: KNOWLEDGE_COMPILE_JOB_TYPE,
    payload: { sourceId: input.sourceId, triggeredBy: input.triggeredBy },
    priority: 5,
    maxAttempts: 2,
    idempotencyKey: input.idempotencyKey ?? `knowledge.compile:${input.sourceId}`,
    linkedModule: KNOWLEDGE_MODULE,
    linkedEntityType: "source",
    linkedEntityId: input.sourceId,
  });
}

/** A "source isn't ready yet" condition — the job should SKIP, not fail (no dead jobs). */
function isNotReadyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /is not approved|has no ingested chunks|not found/i.test(message);
}

export async function runKnowledgeCompileJobHandler(job: JobRow): Promise<Record<string, unknown>> {
  const payload = (job.payload ?? {}) as { sourceId?: string; triggeredBy?: string };
  if (!payload.sourceId) throw new Error("knowledge.compile job is missing sourceId");
  try {
    const result = await compileSource({ sourceId: payload.sourceId, triggeredBy: payload.triggeredBy });
    return { ...result };
  } catch (error) {
    // Auto-triggered on approval before intake produced chunks → skip cleanly instead of
    // burning retries. A real failure (provider/db) still throws so the queue can retry.
    if (isNotReadyError(error)) {
      return { sourceId: payload.sourceId, skipped: true, reason: error instanceof Error ? error.message : String(error) };
    }
    throw error;
  }
}

// ---------------------------------------------------------------- default store (DB)

// Columns to select for views (everything except the heavy 1536-float embedding).
const noteViewColumns = {
  id: knowledgeNotes.id,
  sourceId: knowledgeNotes.sourceId,
  sourceIds: knowledgeNotes.sourceIds,
  provenanceChunkIds: knowledgeNotes.provenanceChunkIds,
  noteType: knowledgeNotes.noteType,
  topic: knowledgeNotes.topic,
  area: knowledgeNotes.area,
  title: knowledgeNotes.title,
  content: knowledgeNotes.content,
  confidence: knowledgeNotes.confidence,
  trustLevel: knowledgeNotes.trustLevel,
  status: knowledgeNotes.status,
  supersededByNoteId: knowledgeNotes.supersededByNoteId,
  timesReinforced: knowledgeNotes.timesReinforced,
  bankSlugs: knowledgeNotes.bankSlugs,
  createdBy: knowledgeNotes.createdBy,
  lastCompiledAt: knowledgeNotes.lastCompiledAt,
  metadata: knowledgeNotes.metadata,
  createdAt: knowledgeNotes.createdAt,
  updatedAt: knowledgeNotes.updatedAt,
} as const;

function viewFromColumns(row: Record<string, unknown>, similarity?: number | null): KnowledgeNoteView {
  return { ...(row as unknown as Omit<KnowledgeNoteView, "similarity">), similarity: similarity ?? undefined };
}

export function defaultStore(db: Db = getDb()): KnowledgeStore {
  return {
    async getSource(id) {
      const rows = await db
        .select({
          id: sources.id,
          title: sources.title,
          sourceType: sources.sourceType,
          url: sources.url,
          trustLevel: sources.trustLevel,
          approvalStatus: sources.approvalStatus,
          status: sources.status,
        })
        .from(sources)
        .where(eq(sources.id, id))
        .limit(1);
      return rows[0] ?? null;
    },
    async listSourceChunks(sourceId, limit) {
      const rows = await db
        .select({ id: sourceChunks.id, chunkIndex: sourceChunks.chunkIndex, content: sourceChunks.content })
        .from(sourceChunks)
        .where(eq(sourceChunks.sourceId, sourceId))
        .orderBy(sourceChunks.chunkIndex)
        .limit(limit);
      return rows;
    },
    async insertNote(row) {
      await db.insert(knowledgeNotes).values(row);
    },
    async insertNoteLinks(rows) {
      if (rows.length) await db.insert(knowledgeNoteLinks).values(rows);
    },
    async reinforceNote({ noteId, addSourceId, addChunkIds, now }) {
      // Serialize concurrent reinforces of the SAME note with a row lock (SELECT ... FOR UPDATE) inside
      // a transaction — otherwise two overlapping compile jobs both read timesReinforced=N and both
      // write N+1 (lost increment), and one job's source/chunk provenance merge is clobbered.
      await db.transaction(async (tx) => {
        const rows = await tx
          .select({ sourceIds: knowledgeNotes.sourceIds, provenanceChunkIds: knowledgeNotes.provenanceChunkIds, timesReinforced: knowledgeNotes.timesReinforced })
          .from(knowledgeNotes)
          .where(eq(knowledgeNotes.id, noteId))
          .limit(1)
          .for("update");
        const existing = rows[0];
        if (!existing) return;
        const sourceIds = new Set(existing.sourceIds ?? []);
        if (addSourceId) sourceIds.add(addSourceId);
        const chunkIds = new Set(existing.provenanceChunkIds ?? []);
        for (const c of addChunkIds) chunkIds.add(c);
        await tx
          .update(knowledgeNotes)
          .set({
            sourceIds: [...sourceIds],
            provenanceChunkIds: [...chunkIds],
            timesReinforced: (existing.timesReinforced ?? 0) + 1,
            lastCompiledAt: now,
            updatedAt: now,
          })
          .where(eq(knowledgeNotes.id, noteId));
      });
    },
    async findSimilarNotes(embedding, limit) {
      const similarity = sql<number>`1 - (${cosineDistance(knowledgeNotes.embedding, embedding)})`;
      const rows = await db
        .select({ noteId: knowledgeNotes.id, topic: knowledgeNotes.topic, similarity })
        .from(knowledgeNotes)
        .where(and(eq(knowledgeNotes.status, "active"), isNotNull(knowledgeNotes.embedding)))
        .orderBy(desc(similarity))
        .limit(limit);
      return rows.map((r) => ({ noteId: r.noteId, topic: r.topic, similarity: Number(r.similarity) }));
    },
    async listNotes(query) {
      const conditions = [eq(knowledgeNotes.status, query.status ?? "active")];
      if (query.topic) conditions.push(eq(knowledgeNotes.topic, query.topic));
      if (query.sourceId) conditions.push(eq(knowledgeNotes.sourceId, query.sourceId));
      if (query.noteTypes?.length) conditions.push(inArray(knowledgeNotes.noteType, query.noteTypes));
      const rows = await db
        .select(noteViewColumns)
        .from(knowledgeNotes)
        .where(and(...conditions))
        .orderBy(desc(knowledgeNotes.timesReinforced), desc(knowledgeNotes.createdAt))
        .limit(query.limit ?? 50);
      return rows.map((r) => viewFromColumns(r));
    },
    async getNoteById(id) {
      const rows = await db.select(noteViewColumns).from(knowledgeNotes).where(eq(knowledgeNotes.id, id)).limit(1);
      return rows[0] ? viewFromColumns(rows[0]) : null;
    },
    async listLinksForNote(noteId) {
      return db
        .select()
        .from(knowledgeNoteLinks)
        .where(sql`${knowledgeNoteLinks.fromNoteId} = ${noteId} OR ${knowledgeNoteLinks.toNoteId} = ${noteId}`)
        .limit(200) as Promise<KnowledgeNoteLinkRow[]>;
    },
    async archiveNote(id, now) {
      const updated = await db
        .update(knowledgeNotes)
        .set({ status: "archived", updatedAt: now })
        .where(and(eq(knowledgeNotes.id, id), eq(knowledgeNotes.status, "active")))
        .returning({ id: knowledgeNotes.id });
      return updated.length > 0;
    },
    async searchNotes(embedding, input) {
      const similarity = sql<number>`1 - (${cosineDistance(knowledgeNotes.embedding, embedding)})`;
      const conditions = [eq(knowledgeNotes.status, "active"), isNotNull(knowledgeNotes.embedding)];
      if (input.topic) conditions.push(eq(knowledgeNotes.topic, input.topic));
      if (input.noteTypes?.length) conditions.push(inArray(knowledgeNotes.noteType, input.noteTypes));
      const rows = await db
        .select({ ...noteViewColumns, similarity })
        .from(knowledgeNotes)
        .where(and(...conditions))
        .orderBy(desc(similarity))
        .limit(input.limit);
      return rows.map(({ similarity: s, ...rest }) => viewFromColumns(rest, Number(s)));
    },
    async searchSourceChunks(embedding, limit) {
      const similarity = sql<number>`1 - (${cosineDistance(sourceChunks.embedding, embedding)})`;
      const rows = await db
        .select({ id: sourceChunks.id, sourceId: sourceChunks.sourceId, content: sourceChunks.content, similarity })
        .from(sourceChunks)
        .where(isNotNull(sourceChunks.embedding))
        .orderBy(desc(similarity))
        .limit(limit);
      return rows.map((r) => ({ id: r.id, sourceId: r.sourceId, content: r.content, similarity: Number(r.similarity) }));
    },
  };
}
