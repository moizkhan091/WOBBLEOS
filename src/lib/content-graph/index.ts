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
import { runGraphNode, type GraphNodeSpec } from "@/lib/agents/node-telemetry";
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

/** Thin adapter: bind this graph's deps + module to the shared node-telemetry runner. */
function runNodeWithTelemetry<T>(
  deps: ContentGraphDeps,
  runNode: NonNullable<ContentGraphDeps["runNode"]>,
  spec: Omit<GraphNodeSpec<T>, "module">,
): Promise<{ parsed: T | null; run: NodeRunResult }> {
  return runGraphNode(runNode, (i) => safeRecordAgentRun(deps, i), { ...spec, module: CONTENT_GRAPH_MODULE });
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
    const { parsed: briefParsed, run: strategyRun } = await runNodeWithTelemetry(deps, runNode, {
      slug: CONTENT_GRAPH_AGENTS.strategy,
      role: CONTENT_GRAPH_ROLES.strategy,
      linkedEntityId: track.id,
      messages: intel.block ? [strategyMessages[0], { role: "system" as const, content: intel.block }, ...strategyMessages.slice(1)] : strategyMessages,
      parse: (t) => parseJsonObject(t, creativeBriefSchema),
      required: true,
      parseErr: "content-graph: strategist returned an unparseable brief",
      summarize: (brief) => ({ inputSummary: input.objective.slice(0, 300), outputSummary: `${brief!.format} on ${brief!.platform}: ${brief!.angle}`.slice(0, 400) }),
    });
    if (strategyRun.runId) modelRunIds.push(strategyRun.runId);
    const brief = briefParsed!;

    // ---- Node 2: RESEARCH (grounded evidence for the chosen angle) ----
    const evidenceContext = await retrieve(`${brief.topic} ${brief.angle}`);
    const { parsed: evidenceParsed, run: researchRun } = await runNodeWithTelemetry(deps, runNode, {
      slug: CONTENT_GRAPH_AGENTS.research,
      role: CONTENT_GRAPH_ROLES.research,
      linkedEntityId: track.id,
      messages: buildEvidencePrompt({ brief, notes: evidenceContext.notes, chunks: evidenceContext.chunks }),
      parse: (t) => parseJsonObject(t, evidencePackSchema),
      required: true,
      parseErr: "content-graph: researcher returned an unparseable evidence pack",
      summarize: (ev) => {
        const prov = collectProvenance(ev!.supportingPoints, evidenceContext.notes, evidenceContext.chunks);
        return { inputSummary: `${brief.topic} / ${brief.angle}`.slice(0, 300), outputSummary: `${ev!.supportingPoints.length} points, ${prov.sourceIds.length} sources`, sourceIdsUsed: prov.sourceIds, memoryIdsUsed: prov.insightIds };
      },
    });
    if (researchRun.runId) modelRunIds.push(researchRun.runId);
    const evidence = evidenceParsed!;
    const provenance = collectProvenance(evidence.supportingPoints, evidenceContext.notes, evidenceContext.chunks);

    // ---- Node 3: COPYWRITER (draft) ----
    const { parsed: draftParsed, run: draftRun } = await runNodeWithTelemetry(deps, runNode, {
      slug: CONTENT_GRAPH_AGENTS.copywriting,
      role: CONTENT_GRAPH_ROLES.copywriting,
      linkedEntityId: track.id,
      messages: buildCopyDraftPrompt({ brief, evidence, track: trackCtx }),
      parse: (t) => parseJsonObject(t, copyDraftSchema),
      required: true,
      parseErr: "content-graph: copywriter returned an unparseable draft",
      summarize: (d) => ({ inputSummary: "draft", outputSummary: d!.hook.slice(0, 200) }),
    });
    if (draftRun.runId) modelRunIds.push(draftRun.runId);
    const draft = draftParsed!;

    // ---- Node 4: COPYWRITER (self-critique -> revise) ----
    const { parsed: revision, run: reviseRun } = await runNodeWithTelemetry(deps, runNode, {
      slug: CONTENT_GRAPH_AGENTS.copywriting,
      role: CONTENT_GRAPH_ROLES.copywriting,
      linkedEntityId: track.id,
      messages: buildCopyRevisePrompt({ draft, brief, track: trackCtx }),
      parse: (t) => parseJsonObject(t, copyRevisionSchema),
      required: false, // an unparseable self-critique is tolerated: we keep the draft.
      parseErr: "",
      summarize: (rev) => ({ inputSummary: "self-critique", outputSummary: `${rev?.issues.length ?? 0} issues fixed` }),
    });
    if (reviseRun.runId) modelRunIds.push(reviseRun.runId);
    const finalCopy = revision?.revised ?? draft;

    // ---- Node 5: SCORING / QA ----
    const { parsed: scoreParsed, run: scoreRun } = await runNodeWithTelemetry(deps, runNode, {
      slug: CONTENT_GRAPH_AGENTS.scoring,
      role: CONTENT_GRAPH_ROLES.scoring,
      linkedEntityId: track.id,
      messages: buildScorePrompt({ copy: finalCopy, brief, hasEvidence: provenance.sourceIds.length > 0 }),
      parse: (t) => parseJsonObject(t, contentScoreSchema),
      required: true,
      parseErr: "content-graph: scoring agent returned an unparseable score",
      // qualityScore = the scorer's own average verdict mapped from 0..100 to the 0..10 telemetry scale.
      summarize: (sc) => ({ inputSummary: "score", outputSummary: `impact ${sc!.predictedImpact} / brand ${sc!.brandFit}`, qualityScore: Math.max(0, Math.min(10, (sc!.predictedImpact + sc!.brandFit + sc!.platformFit) / 30)) }),
    });
    if (scoreRun.runId) modelRunIds.push(scoreRun.runId);
    const score: ContentScore = scoreParsed!;

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
