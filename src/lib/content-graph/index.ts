import { enqueueJob } from "@/lib/jobs";
import type { EnqueueJobInput, JobRow } from "@/lib/domain/jobs";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { createContentPacket, listContentTracks, type CreateContentPacketServiceInput } from "@/lib/content";
import { getIntelligenceContextBlock, type IntelligenceContextBlock } from "@/lib/intelligence/context-block";
import { logOutputIntelligenceUsage } from "@/lib/intelligence";
import { getContentTrackPersonaName, type ContentTrackRow } from "@/lib/domain/content-command";
import { passesQualityGate } from "@/lib/domain/content-packet";
import { listMemoryRecords } from "@/lib/memory";
import { retrieveKnowledge } from "@/lib/knowledge";
import { recordAgentRun } from "@/lib/agents";
import { runTextProvider, type ProviderMessage } from "@/lib/providers";
import {
  CONTENT_GRAPH_AGENTS,
  CONTENT_GRAPH_JOB_TYPE,
  CONTENT_GRAPH_MODULE,
  CONTENT_GRAPH_QUEUE,
  CONTENT_GRAPH_ROLES,
  assembleContentPacketInput,
  buildCopyDraftPrompt,
  buildCopyRevisePrompt,
  buildEvidencePrompt,
  buildScorePrompt,
  buildStrategyPrompt,
  collectProvenance,
  contentScoreSchema,
  copyDraftSchema,
  copyRevisionSchema,
  creativeBriefSchema,
  evidencePackSchema,
  parseJsonObject,
  type ContentScore,
  type CreativeBrief,
  type GraphKnowledgeNote,
  type GraphSourceChunk,
  type GraphTrackContext,
} from "@/lib/domain/content-graph";

/**
 * Chunk 15 (evolution) — Multi-Agent Content Graph orchestrator.
 *
 * Strategy -> Research (grounded in the Knowledge Compiler + brand brain) -> Copywriting
 * (draft -> self-critique -> revise) -> Scoring/QA -> Assemble PACK. Five distinct agent_runs
 * per pack, each with its own model role, every claim carrying provenance (knowledge notes +
 * source chunks + sources). Visuals are NOT produced here — they come after pack approval
 * (Chunk 22). The single-call content-worker (content.generate) is left intact as a fallback.
 */

export interface ContentPacketCreationResult {
  packet: { id: string; qualityStatus: string };
  approval: { id: string } | null;
}

export interface NodeRunResult {
  text: string;
  runId?: string;
  cost?: number;
}

export interface ContentGraphDeps {
  getTrack?: (contentTrackId: string) => Promise<ContentTrackRow>;
  retrieveBrain?: () => Promise<Array<{ title: string; content: string }>>;
  retrieve?: (query: string) => Promise<{ notes: GraphKnowledgeNote[]; chunks: GraphSourceChunk[] }>;
  retrieveIntelligence?: () => Promise<IntelligenceContextBlock>;
  runNode?: (input: { role: string; module: string; messages: ProviderMessage[]; linkedEntityId: string }) => Promise<NodeRunResult>;
  recordAgentRun?: (input: Record<string, unknown>) => Promise<unknown>;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  createPacket?: (input: CreateContentPacketServiceInput) => Promise<ContentPacketCreationResult>;
  enqueueJob?: (input: EnqueueJobInput) => Promise<unknown>;
  now?: Date;
}

export interface RunContentGraphInput {
  contentTrackId: string;
  requestedBy: string;
  objective: string;
  platformFocus?: string[];
  formatFocus?: string[];
}

export interface ContentGraphResult {
  contentTrackId: string;
  packetId: string;
  approvalId: string | null;
  qualityStatus: string;
  agentRunCount: number;
  modelRunIds: string[];
  brief: CreativeBrief;
  scores: { predictedImpact: number; brandFit: number; platformFit: number };
  provenance: { insightIds: string[]; chunkIds: string[]; sourceIds: string[] };
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

async function defaultRunNode(input: { role: string; module: string; messages: ProviderMessage[]; linkedEntityId: string }): Promise<NodeRunResult> {
  const result = await runTextProvider({
    role: input.role,
    module: input.module,
    messages: input.messages,
    maxTokens: 1600,
    temperature: 0.6,
    linkedEntityType: "content_track",
    linkedEntityId: input.linkedEntityId,
  });
  return { text: result.text, runId: result.run?.id, cost: result.run?.estimatedCost ? Number(result.run.estimatedCost) : undefined };
}

async function defaultGetTrack(contentTrackId: string): Promise<ContentTrackRow> {
  const tracks = await listContentTracks({ status: "active", limit: 200 });
  const track = tracks.find((t) => t.id === contentTrackId);
  if (!track) throw new Error(`content track '${contentTrackId}' not found or not active`);
  return track;
}

async function defaultRetrieveBrain(): Promise<Array<{ title: string; content: string }>> {
  const records = await listMemoryRecords({ memoryTier: "core", status: "active", limit: 30 });
  return records.map((r) => ({ title: r.title, content: r.content }));
}

async function defaultRetrieve(query: string): Promise<{ notes: GraphKnowledgeNote[]; chunks: GraphSourceChunk[] }> {
  const result = await retrieveKnowledge({ query, limit: 12, chunkLimit: 6 });
  return {
    notes: result.notes.map((n) => ({ id: n.id, title: n.title, content: n.content, noteType: n.noteType, sourceIds: n.sourceIds, sourceId: n.sourceId })),
    chunks: result.chunks.map((c) => ({ id: c.id, sourceId: c.sourceId, content: c.content })),
  };
}

async function safeRecordAgentRun(deps: ContentGraphDeps, input: Record<string, unknown>): Promise<void> {
  try {
    await (deps.recordAgentRun ?? ((i: Record<string, unknown>) => recordAgentRun(i as never)))(input);
  } catch {
    /* logging must never fail the pack */
  }
}

/** Run the full content graph and produce ONE grounded, scored, gated content pack. */
export async function runContentGraph(input: RunContentGraphInput, deps: ContentGraphDeps = {}): Promise<ContentGraphResult> {
  const actor = input.requestedBy;
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const runNode = deps.runNode ?? defaultRunNode;
  const retrieve = deps.retrieve ?? defaultRetrieve;
  const track = await (deps.getTrack ?? defaultGetTrack)(input.contentTrackId);
  const trackCtx: GraphTrackContext = {
    personaName: getContentTrackPersonaName(track) ?? "WOBBLE",
    bannedPhrases: track.bannedPhrases ?? [],
  };
  const modelRunIds: string[] = [];

  await recordAudit({
    eventType: "content_graph.started",
    module: CONTENT_GRAPH_MODULE,
    entityType: "content_track",
    entityId: track.id,
    actor,
    metadata: { objective: input.objective },
  });

  try {
    // ---- Node 1: STRATEGY (creative brief) ----
    const [brain, stratKnowledge, intel] = await Promise.all([
      (deps.retrieveBrain ?? defaultRetrieveBrain)(),
      retrieve(input.objective),
      (deps.retrieveIntelligence ?? (() => getIntelligenceContextBlock("social_content")))(),
    ]);
    const strategyMessages = buildStrategyPrompt({
      objective: input.objective,
      track: trackCtx,
      platformFocus: input.platformFocus,
      formatFocus: input.formatFocus,
      brain,
      knowledgeTopics: [...new Set(stratKnowledge.notes.map((n) => n.title))],
    });
    // Fold live approved intelligence (competitor patterns, winning/failed hooks, trends) into the brief.
    const strategyText = await runNode({
      role: CONTENT_GRAPH_ROLES.strategy,
      module: CONTENT_GRAPH_MODULE,
      messages: intel.block ? [strategyMessages[0], { role: "system" as const, content: intel.block }, ...strategyMessages.slice(1)] : strategyMessages,
      linkedEntityId: track.id,
    });
    if (strategyText.runId) modelRunIds.push(strategyText.runId);
    const brief = parseJsonObject(strategyText.text, creativeBriefSchema);
    if (!brief) throw new Error("content-graph: strategist returned an unparseable brief");
    await safeRecordAgentRun(deps, { agentSlug: CONTENT_GRAPH_AGENTS.strategy, status: "succeeded", inputSummary: input.objective.slice(0, 300), outputSummary: `${brief.format} on ${brief.platform}: ${brief.angle}`.slice(0, 400), modelRunIds: strategyText.runId ? [strategyText.runId] : [] });

    // ---- Node 2: RESEARCH (grounded evidence for the chosen angle) ----
    const evidenceContext = await retrieve(`${brief.topic} ${brief.angle}`);
    const researchText = await runNode({
      role: CONTENT_GRAPH_ROLES.research,
      module: CONTENT_GRAPH_MODULE,
      messages: buildEvidencePrompt({ brief, notes: evidenceContext.notes, chunks: evidenceContext.chunks }),
      linkedEntityId: track.id,
    });
    if (researchText.runId) modelRunIds.push(researchText.runId);
    const evidence = parseJsonObject(researchText.text, evidencePackSchema);
    if (!evidence) throw new Error("content-graph: researcher returned an unparseable evidence pack");
    const provenance = collectProvenance(evidence.supportingPoints, evidenceContext.notes, evidenceContext.chunks);
    await safeRecordAgentRun(deps, {
      agentSlug: CONTENT_GRAPH_AGENTS.research,
      status: "succeeded",
      inputSummary: `${brief.topic} / ${brief.angle}`.slice(0, 300),
      outputSummary: `${evidence.supportingPoints.length} points, ${provenance.sourceIds.length} sources`,
      modelRunIds: researchText.runId ? [researchText.runId] : [],
      sourceIdsUsed: provenance.sourceIds,
      memoryIdsUsed: provenance.insightIds,
    });

    // ---- Node 3: COPYWRITER (draft) ----
    const draftText = await runNode({
      role: CONTENT_GRAPH_ROLES.copywriting,
      module: CONTENT_GRAPH_MODULE,
      messages: buildCopyDraftPrompt({ brief, evidence, track: trackCtx }),
      linkedEntityId: track.id,
    });
    if (draftText.runId) modelRunIds.push(draftText.runId);
    const draft = parseJsonObject(draftText.text, copyDraftSchema);
    if (!draft) throw new Error("content-graph: copywriter returned an unparseable draft");
    await safeRecordAgentRun(deps, { agentSlug: CONTENT_GRAPH_AGENTS.copywriting, status: "succeeded", inputSummary: "draft", outputSummary: draft.hook.slice(0, 200), modelRunIds: draftText.runId ? [draftText.runId] : [] });

    // ---- Node 4: COPYWRITER (self-critique -> revise) ----
    const reviseText = await runNode({
      role: CONTENT_GRAPH_ROLES.copywriting,
      module: CONTENT_GRAPH_MODULE,
      messages: buildCopyRevisePrompt({ draft, brief, track: trackCtx }),
      linkedEntityId: track.id,
    });
    if (reviseText.runId) modelRunIds.push(reviseText.runId);
    const revision = parseJsonObject(reviseText.text, copyRevisionSchema);
    const finalCopy = revision?.revised ?? draft;
    await safeRecordAgentRun(deps, { agentSlug: CONTENT_GRAPH_AGENTS.copywriting, status: "succeeded", inputSummary: "self-critique", outputSummary: `${revision?.issues.length ?? 0} issues fixed`, modelRunIds: reviseText.runId ? [reviseText.runId] : [] });

    // ---- Node 5: SCORING / QA ----
    const scoreText = await runNode({
      role: CONTENT_GRAPH_ROLES.scoring,
      module: CONTENT_GRAPH_MODULE,
      messages: buildScorePrompt({ copy: finalCopy, brief, hasEvidence: provenance.sourceIds.length > 0 }),
      linkedEntityId: track.id,
    });
    if (scoreText.runId) modelRunIds.push(scoreText.runId);
    const score: ContentScore | null = parseJsonObject(scoreText.text, contentScoreSchema);
    if (!score) throw new Error("content-graph: scoring agent returned an unparseable score");
    await safeRecordAgentRun(deps, { agentSlug: CONTENT_GRAPH_AGENTS.scoring, status: "succeeded", inputSummary: "score", outputSummary: `impact ${score.predictedImpact} / brand ${score.brandFit}`, modelRunIds: scoreText.runId ? [scoreText.runId] : [] });

    // ---- Assemble the PACK ----
    const packetInput = assembleContentPacketInput({ contentTrackId: track.id, brief, copy: finalCopy, evidence, score, provenance, createdBy: actor });
    const gatePassed = passesQualityGate(score.selfReview);
    const created = await (deps.createPacket ?? createContentPacket)({ ...packetInput, requestApproval: gatePassed });

    // Provenance: record which approved intelligence shaped this content packet.
    await logOutputIntelligenceUsage({ outputType: "content_packet", outputId: created.packet.id, itemIds: intel.itemIds, insightIds: intel.insightIds }).catch(() => {});

    await recordAudit({
      eventType: "content_graph.completed",
      module: CONTENT_GRAPH_MODULE,
      entityType: "content_packet",
      entityId: created.packet.id,
      actor,
      metadata: {
        agentRunCount: 5,
        qualityStatus: created.packet.qualityStatus,
        approvalId: created.approval?.id ?? null,
        insightIds: provenance.insightIds.length,
        sourceIds: provenance.sourceIds.length,
        modelRunIds,
      },
    });

    return {
      contentTrackId: track.id,
      packetId: created.packet.id,
      approvalId: created.approval?.id ?? null,
      qualityStatus: created.packet.qualityStatus,
      agentRunCount: 5,
      modelRunIds,
      brief,
      scores: { predictedImpact: score.predictedImpact, brandFit: score.brandFit, platformFit: score.platformFit },
      provenance,
    };
  } catch (error) {
    await recordAudit({
      eventType: "content_graph.failed",
      module: CONTENT_GRAPH_MODULE,
      entityType: "content_track",
      entityId: track.id,
      actor,
      metadata: { reason: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

// ---------------------------------------------------------------- job

export async function enqueueContentGraphJob(
  input: RunContentGraphInput & { idempotencyKey?: string },
  deps: ContentGraphDeps = {},
): Promise<unknown> {
  const enqueue = deps.enqueueJob ?? enqueueJob;
  return enqueue({
    queue: CONTENT_GRAPH_QUEUE,
    type: CONTENT_GRAPH_JOB_TYPE,
    payload: {
      contentTrackId: input.contentTrackId,
      requestedBy: input.requestedBy,
      objective: input.objective,
      platformFocus: input.platformFocus,
      formatFocus: input.formatFocus,
    },
    priority: 5,
    maxAttempts: 2,
    idempotencyKey: input.idempotencyKey,
    linkedModule: CONTENT_GRAPH_MODULE,
    linkedEntityType: "content_track",
    linkedEntityId: input.contentTrackId,
  });
}

export async function runContentGraphJobHandler(job: JobRow): Promise<Record<string, unknown>> {
  const payload = (job.payload ?? {}) as Partial<RunContentGraphInput>;
  if (!payload.contentTrackId || !payload.requestedBy || !payload.objective) {
    throw new Error("content.graph job requires contentTrackId, requestedBy, objective");
  }
  const result = await runContentGraph({
    contentTrackId: payload.contentTrackId,
    requestedBy: payload.requestedBy,
    objective: payload.objective,
    platformFocus: payload.platformFocus,
    formatFocus: payload.formatFocus,
  });
  return { ...result };
}
