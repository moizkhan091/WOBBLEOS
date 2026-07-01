import { enqueueJob } from "@/lib/jobs";
import type { EnqueueJobInput, JobRow } from "@/lib/domain/jobs";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  createContentPacket,
  listContentTracks,
  type CreateContentPacketServiceInput,
} from "@/lib/content";
import type { ContentTrackRow } from "@/lib/domain/content-command";
import { listMemoryRecords, retrieveMemoryContext } from "@/lib/memory";
import { listApprovedSourcesForJobs, listSourceChunks } from "@/lib/sources";
import { runTextProvider, type ProviderMessage } from "@/lib/providers";
import {
  CONTENT_GENERATE_JOB_TYPE,
  CONTENT_GENERATION_MODULE,
  CONTENT_GENERATION_QUEUE,
  CONTENT_PROVIDER_MODULE,
  CONTENT_STRATEGY_ROLE,
  assertContentGenerationContext,
  buildContentGenerationPrompt,
  contentGenerationRequestSchema,
  parseContentWorkerModelOutput,
  type ContentGenerationRequest,
  type ContentWorkerBrainRecord,
  type ContentWorkerMemoryChunk,
  type ContentWorkerSourceRef,
  type ParsedContentGenerationRequest,
} from "@/lib/domain/content-worker";
import { gradeContentExcellence, type ContentDraft, type ExcellenceRules } from "@/lib/domain/content-excellence";
import { loadApprovedSkill } from "@/lib/prompt-skills";

export interface RunProviderInput {
  role: string;
  module: string;
  messages: ProviderMessage[];
  temperature?: number;
  maxTokens?: number;
  linkedEntityType?: string;
  linkedEntityId?: string;
}

export interface ContentGenerationDeps {
  loadSkill?: (slug: string) => Promise<{ promptBody: string; rules: string[] } | null>;
  getContentTrack?: (contentTrackId: string) => Promise<ContentTrackRow>;
  retrieveBrain?: () => Promise<ContentWorkerBrainRecord[]>;
  retrieveMemory?: (query: string, request: ParsedContentGenerationRequest) => Promise<ContentWorkerMemoryChunk[]>;
  retrieveSources?: (request: ParsedContentGenerationRequest) => Promise<ContentWorkerSourceRef[]>;
  runProvider?: (input: RunProviderInput) => Promise<{ text: string; run: { id: string } }>;
  /**
   * Chunk 17 objective Content Excellence Gate. When provided, a draft must pass
   * it to be enqueued for approval. Default (undefined) preserves prior behavior
   * so existing callers/tests are unaffected; the live job handler enables it.
   */
  excellenceGate?: (draft: ContentDraft, rules?: Partial<ExcellenceRules>) => { passed: boolean };
  createPacket?: (input: CreateContentPacketServiceInput) => Promise<ContentPacketCreationResult>;
  enqueueJob?: (input: EnqueueJobInput) => Promise<ContentGenerationEnqueueResult>;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

export interface ContentPacketCreationResult {
  packet: { id: string; qualityStatus: string };
  approval: { id: string } | null;
}

export interface ContentGenerationEnqueueResult {
  job: {
    id: string;
    queue: string;
    type: string;
    payload?: Record<string, unknown>;
    linkedModule?: string | null;
  };
  deduped: boolean;
}

export interface ContentGenerationRunResult {
  contentTrackId: string;
  modelRunId: string;
  createdPackets: number;
  approvalsCreated: number;
  failedDrafts: number;
  packetIds: string[];
  approvalIds: string[];
  sourceIdsUsed: string[];
  memoryChunkIdsUsed: string[];
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

// Chunk 34: load the latest APPROVED content_generation skill from the registry.
// Safe fallback: returns null (built-in prompt) when no DB or no approved skill.
async function defaultLoadSkill(slug: string): Promise<{ promptBody: string; rules: string[] } | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const skill = await loadApprovedSkill(slug);
    return skill ? { promptBody: skill.promptBody, rules: skill.rules } : null;
  } catch {
    return null;
  }
}

export async function enqueueContentGenerationJob(
  input: ContentGenerationRequest,
  deps: ContentGenerationDeps = {},
): Promise<ContentGenerationEnqueueResult> {
  const parsed = contentGenerationRequestSchema.parse(input);
  const enqueue = deps.enqueueJob ?? enqueueJob;

  return enqueue({
    queue: CONTENT_GENERATION_QUEUE,
    type: CONTENT_GENERATE_JOB_TYPE,
    payload: {
      contentTrackId: parsed.contentTrackId,
      requestedBy: parsed.requestedBy,
      objective: parsed.objective,
      platformFocus: parsed.platformFocus,
      formatFocus: parsed.formatFocus,
      sourceLimit: parsed.sourceLimit,
      sourceChunkLimit: parsed.sourceChunkLimit,
      memoryLimit: parsed.memoryLimit,
      maxPackets: parsed.maxPackets,
      maxTokens: parsed.maxTokens,
      temperature: parsed.temperature,
    },
    priority: 5,
    maxAttempts: 2,
    idempotencyKey: parsed.idempotencyKey,
    linkedModule: CONTENT_GENERATION_MODULE,
    linkedEntityType: "content_track",
    linkedEntityId: parsed.contentTrackId,
  });
}

export async function runContentGenerationJob(
  input: ContentGenerationRequest,
  deps: ContentGenerationDeps = {},
): Promise<ContentGenerationRunResult> {
  const parsed = contentGenerationRequestSchema.parse(input);
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  await recordAudit({
    eventType: "content_worker.started",
    module: CONTENT_GENERATION_MODULE,
    entityType: "content_track",
    entityId: parsed.contentTrackId,
    actor: parsed.requestedBy,
    metadata: { objective: parsed.objective, maxPackets: parsed.maxPackets },
  });

  try {
    const [track, brain, memory, sources] = await Promise.all([
      (deps.getContentTrack ?? defaultGetContentTrack)(parsed.contentTrackId),
      (deps.retrieveBrain ?? defaultRetrieveBrain)(),
      (deps.retrieveMemory ?? defaultRetrieveMemory)(contentQuery(parsed), parsed),
      (deps.retrieveSources ?? defaultRetrieveSources)(parsed),
    ]);

    assertContentGenerationContext({ brain, sources });
    const skill = (await (deps.loadSkill ?? defaultLoadSkill)("content_generation")) ?? undefined;
    const prompt = buildContentGenerationPrompt({ request: parsed, track, brain, memory, sources, skill });
    const provider = deps.runProvider ?? defaultRunProvider;
    const providerResult = await provider({
      role: CONTENT_STRATEGY_ROLE,
      module: CONTENT_PROVIDER_MODULE,
      messages: prompt.messages,
      maxTokens: parsed.maxTokens ?? 1800,
      temperature: parsed.temperature ?? 0.7,
      linkedEntityType: "content_track",
      linkedEntityId: track.id,
    });

    const output = parseContentWorkerModelOutput(providerResult.text);
    const candidates = parsed.maxPackets ? output.packets.slice(0, parsed.maxPackets) : output.packets;
    const createPacket = deps.createPacket ?? createContentPacket;
    const packetIds: string[] = [];
    const approvalIds: string[] = [];
    let failedDrafts = 0;

    // Data-driven (rule #3 auto-pickup): the gate's banned/do-not-say list comes
    // from the founder-editable track, NOT hardcoded. Add a phrase to the track
    // and the very next run enforces it with no code change.
    const gateRules: Partial<ExcellenceRules> = { bannedPhrases: track.bannedPhrases ?? [] };

    for (const candidate of candidates) {
      // Chunk 17: the objective Content Excellence Gate decides approval
      // eligibility. Default (no gate dep) keeps prior behavior; the live job
      // handler enables it so weak/blocked drafts are still stored but NEVER
      // enqueued for approval.
      const gatePassed = deps.excellenceGate ? deps.excellenceGate(toExcellenceDraft(candidate), gateRules).passed : true;
      const result = await createPacket({
        ...candidate,
        contentTrackId: track.id,
        createdBy: parsed.requestedBy,
        requestApproval: gatePassed,
      });
      packetIds.push(result.packet.id);
      if (result.approval) approvalIds.push(result.approval.id);
      if (result.packet.qualityStatus !== "passed") failedDrafts += 1;
    }

    const runResult: ContentGenerationRunResult = {
      contentTrackId: track.id,
      modelRunId: providerResult.run.id,
      createdPackets: packetIds.length,
      approvalsCreated: approvalIds.length,
      failedDrafts,
      packetIds,
      approvalIds,
      sourceIdsUsed: prompt.sourceIds,
      memoryChunkIdsUsed: prompt.memoryChunkIds,
    };

    await recordAudit({
      eventType: "content_worker.completed",
      module: CONTENT_GENERATION_MODULE,
      entityType: "content_track",
      entityId: track.id,
      actor: parsed.requestedBy,
      modelRunId: providerResult.run.id,
      metadata: {
        createdPackets: runResult.createdPackets,
        approvalsCreated: runResult.approvalsCreated,
        failedDrafts: runResult.failedDrafts,
        sourceIdsUsed: runResult.sourceIdsUsed,
        memoryChunkIdsUsed: runResult.memoryChunkIdsUsed,
        completedAt: now.toISOString(),
      },
    });

    return runResult;
  } catch (error) {
    await recordAudit({
      eventType: "content_worker.failed",
      module: CONTENT_GENERATION_MODULE,
      entityType: "content_track",
      entityId: parsed.contentTrackId,
      actor: parsed.requestedBy,
      metadata: { reason: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

export async function runContentGenerateJobHandler(job: JobRow): Promise<Record<string, unknown>> {
  // Production path: enforce the objective Content Excellence Gate so weak or
  // blocked drafts never reach the founder approval queue.
  const result = await runContentGenerationJob(job.payload as ContentGenerationRequest, {
    excellenceGate: (draft, rules) => ({ passed: gradeContentExcellence(draft, rules).passed }),
  });
  return { ...result };
}

/** Map a generated content candidate into the Excellence Gate's draft shape (defensive). */
function toExcellenceDraft(input: unknown): ContentDraft {
  const c = (input ?? {}) as Record<string, unknown>;
  const slides = Array.isArray(c.carouselSlides)
    ? (c.carouselSlides as unknown[]).map((s) => (typeof s === "string" ? s : JSON.stringify(s)))
    : undefined;
  const sourceIds = Array.isArray(c.sourceIdsUsed) ? (c.sourceIdsUsed as unknown[]) : [];
  const evidence = typeof c.evidenceSummary === "string" ? c.evidenceSummary : "";
  const risk = c.claimRiskLevel;
  return {
    hook: typeof c.hook === "string" ? c.hook : "",
    mainCopy: typeof c.mainCopy === "string" ? c.mainCopy : "",
    caption: typeof c.caption === "string" ? c.caption : "",
    cta: typeof c.cta === "string" ? c.cta : "",
    slides,
    platform: typeof c.platform === "string" ? c.platform : undefined,
    format: typeof c.format === "string" ? c.format : undefined,
    claimRiskLevel: risk === "medium" || risk === "high" ? risk : "low",
    proofRequired: c.proofRequired === true,
    hasSources: sourceIds.length > 0,
    hasEvidence: evidence.trim().length > 0,
  };
}

async function defaultGetContentTrack(contentTrackId: string): Promise<ContentTrackRow> {
  const tracks = await listContentTracks({ status: "active", limit: 200 });
  const track = tracks.find((item) => item.id === contentTrackId);
  if (!track) throw new Error(`content track '${contentTrackId}' not found or not active`);
  return track;
}

async function defaultRetrieveBrain(): Promise<ContentWorkerBrainRecord[]> {
  const records = await listMemoryRecords({ memoryTier: "core", status: "active", limit: 50 });
  return records.map((record) => ({
    slug: record.slug,
    title: record.title,
    area: record.area,
    content: record.content,
  }));
}

function contentQuery(request: ParsedContentGenerationRequest): string {
  return [
    request.objective,
    request.platformFocus.join(" "),
    request.formatFocus.join(" "),
    "WOBBLE content strategy AI OS approved research",
  ]
    .filter(Boolean)
    .join(" ");
}

async function defaultRetrieveMemory(
  query: string,
  request: ParsedContentGenerationRequest,
): Promise<ContentWorkerMemoryChunk[]> {
  const chunks = await retrieveMemoryContext({
    query,
    queryMode: "current",
    tiers: ["core", "working"],
    limit: request.memoryLimit ?? 8,
  });
  return chunks.map((chunk) => ({
    id: chunk.id,
    content: chunk.content,
    trustLevel: chunk.trustLevel,
    tags: chunk.tags,
  }));
}

async function defaultRetrieveSources(request: ParsedContentGenerationRequest): Promise<ContentWorkerSourceRef[]> {
  const sources = await listApprovedSourcesForJobs({ limit: request.sourceLimit ?? 8 });
  const chunkRows = await Promise.all(
    sources.map((source) => listSourceChunks(source.id, { limit: request.sourceChunkLimit ?? 3 })),
  );

  return sources.map((source, index) => ({
    id: source.id,
    title: source.title,
    sourceType: source.sourceType,
    trustLevel: source.trustLevel,
    chunks: chunkRows[index].map((chunk) => ({ id: chunk.id, content: chunk.content })),
  }));
}

async function defaultRunProvider(input: RunProviderInput): Promise<{ text: string; run: { id: string } }> {
  const result = await runTextProvider(input);
  return { text: result.text, run: { id: result.run.id } };
}
