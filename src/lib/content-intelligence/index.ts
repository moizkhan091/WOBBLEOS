import { desc, eq } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { contentIntelligenceRuns } from "@/db/schema";
import type { JobRow } from "@/lib/domain/jobs";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { enqueueJob, type EnqueueResult } from "@/lib/jobs";
import { listApprovedSourcesForJobs } from "@/lib/sources";
import { retrieveKnowledge } from "@/lib/knowledge";
import { listMemoryRecords } from "@/lib/memory";
import { generateTopicBank, type ContentTopicsDeps } from "@/lib/content-topics";
import type { ContentTopicRow } from "@/lib/domain/content-topics";
import {
  buildIntelligenceRunRow,
  intelligenceCadenceKey,
  DEFAULT_INTELLIGENCE_OBJECTIVE,
  CONTENT_INTELLIGENCE_JOB_TYPE,
  CONTENT_INTELLIGENCE_QUEUE,
  CONTENT_INTELLIGENCE_MODULE,
  CONTENT_INTELLIGENCE_AGENT,
  type ContentIntelligenceRunRow,
  type IntelligenceRunTrigger,
} from "@/lib/domain/content-intelligence";

/**
 * Content Intelligence orchestrator — the standing loop that turns the founder's ACTIVE sources into a scored,
 * review-gated topic bank. Every run re-reads the active source set (so add/drop/remove auto-picks-up), pulls
 * knowledge + brand brain, and runs the strategist team via generateTopicBank. Runnable MANUALLY (enqueue a
 * durable job) or on a daily CADENCE — both land the same governed run. Store + context-gatherer + topic
 * generator are injectable for unit tests.
 */

export interface GatheredContext {
  sourceRefs: string[];
  knowledgeTopics: string[];
  brain: Array<{ title: string; content: string }>;
}

export interface ContentIntelligenceStore {
  insertRun(row: ContentIntelligenceRunRow): Promise<void>;
  updateRun(id: string, fields: Partial<ContentIntelligenceRunRow>): Promise<void>;
  getRun(id: string): Promise<ContentIntelligenceRunRow | null>;
  listRuns(limit: number): Promise<ContentIntelligenceRunRow[]>;
}

export interface ContentIntelligenceDeps {
  store?: ContentIntelligenceStore;
  /** Gather the ACTIVE sources + knowledge + brain for this objective. Injectable for tests. */
  gatherContext?: (objective: string) => Promise<GatheredContext>;
  /** The topic generator (defaults to the real generateTopicBank). Injectable for tests. */
  generate?: (input: Parameters<typeof generateTopicBank>[0], deps?: ContentTopicsDeps) => Promise<ContentTopicRow[]>;
  topicDeps?: ContentTopicsDeps;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
  model?: string;
}

async function audit(deps: ContentIntelligenceDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

export interface RunContentIntelligenceInput {
  objective?: string;
  trigger: IntelligenceRunTrigger;
  count?: number;
  locationName?: string;
  requestedBy: string;
}

export interface ContentIntelligenceResult {
  runId: string;
  sourceCount: number;
  topicCount: number;
  topics: ContentTopicRow[];
}

/** Run the intelligence loop: gather active sources → generate a scored topic bank → record the run. */
export async function runContentIntelligence(input: RunContentIntelligenceInput, deps: ContentIntelligenceDeps = {}): Promise<ContentIntelligenceResult> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const objective = input.objective?.trim() || DEFAULT_INTELLIGENCE_OBJECTIVE;
  const model = deps.model ?? "anthropic/claude-sonnet-4.5";

  const run = buildIntelligenceRunRow({ trigger: input.trigger, objective, model, requestedBy: input.requestedBy }, { now });
  await store.insertRun(run);
  await audit(deps, { eventType: "content_intelligence.started", module: CONTENT_INTELLIGENCE_MODULE, entityType: "intelligence_run", entityId: run.id, actor: input.requestedBy, metadata: { trigger: input.trigger } });

  try {
    const context = await (deps.gatherContext ?? defaultGatherContext)(objective);
    const generate = deps.generate ?? generateTopicBank;
    const topics = await generate(
      {
        objective,
        knowledgeTopics: context.knowledgeTopics,
        brain: context.brain,
        sourceRefs: context.sourceRefs,
        count: input.count,
        locationName: input.locationName,
        intelligenceRunId: run.id,
        requestedBy: input.requestedBy,
      },
      deps.topicDeps,
    );

    const finishedAt = deps.now ?? new Date();
    await store.updateRun(run.id, { status: "completed", sourceCount: context.sourceRefs.length, topicCount: topics.length, finishedAt });
    await audit(deps, { eventType: "content_intelligence.completed", module: CONTENT_INTELLIGENCE_MODULE, entityType: "intelligence_run", entityId: run.id, actor: input.requestedBy, metadata: { sourceCount: context.sourceRefs.length, topicCount: topics.length } });
    return { runId: run.id, sourceCount: context.sourceRefs.length, topicCount: topics.length, topics };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await store.updateRun(run.id, { status: "failed", error: message, finishedAt: deps.now ?? new Date() });
    await audit(deps, { eventType: "content_intelligence.failed", module: CONTENT_INTELLIGENCE_MODULE, entityType: "intelligence_run", entityId: run.id, actor: input.requestedBy, metadata: { error: message } });
    throw err;
  }
}

/** The real context gatherer: active sources (auto-picked-up each run) + knowledge notes + core brand brain. */
export async function defaultGatherContext(objective: string): Promise<GatheredContext> {
  const [sources, knowledge, brain] = await Promise.all([
    listApprovedSourcesForJobs({ limit: 50 }).catch(() => []),
    retrieveKnowledge({ query: objective, limit: 20, chunkLimit: 0 }).catch(() => ({ notes: [] as Array<{ title: string }> })),
    listMemoryRecords({ memoryTier: "core", status: "active", limit: 20 }).catch(() => [] as Array<{ title: string; content: string }>),
  ]);
  return {
    sourceRefs: sources.map((s) => s.id),
    knowledgeTopics: [...new Set((knowledge.notes ?? []).map((n) => n.title).filter(Boolean))],
    brain: brain.map((r) => ({ title: r.title, content: r.content })),
  };
}

// ── Triggers: manual job + daily cadence ──────────────────────────────────────────────────────────────

export interface EnqueueIntelligenceInput {
  objective?: string;
  trigger?: IntelligenceRunTrigger;
  count?: number;
  locationName?: string;
  requestedBy: string;
  idempotencyKey?: string;
}

/** Enqueue a durable content-intelligence run (the MANUAL trigger, and how the cadence fires it). */
export async function enqueueContentIntelligenceJob(input: EnqueueIntelligenceInput, deps: { now?: Date } = {}): Promise<EnqueueResult> {
  return enqueueJob(
    {
      queue: CONTENT_INTELLIGENCE_QUEUE,
      type: CONTENT_INTELLIGENCE_JOB_TYPE,
      payload: { objective: input.objective, trigger: input.trigger ?? "manual", count: input.count, locationName: input.locationName, requestedBy: input.requestedBy },
      idempotencyKey: input.idempotencyKey,
      linkedModule: CONTENT_INTELLIGENCE_MODULE,
    },
    { now: deps.now },
  );
}

/** Durable-job handler for a content-intelligence run. */
export async function runContentIntelligenceJobHandler(job: JobRow): Promise<Record<string, unknown>> {
  const p = (job.payload ?? {}) as Partial<RunContentIntelligenceInput>;
  const result = await runContentIntelligence(
    {
      objective: p.objective,
      trigger: (p.trigger as IntelligenceRunTrigger) ?? "manual",
      count: p.count,
      locationName: p.locationName,
      requestedBy: p.requestedBy ?? CONTENT_INTELLIGENCE_AGENT,
    },
    {},
  );
  return { runId: result.runId, sourceCount: result.sourceCount, topicCount: result.topicCount };
}

export async function listContentIntelligenceRuns(limit = 20, deps: ContentIntelligenceDeps = {}): Promise<ContentIntelligenceRunRow[]> {
  return (deps.store ?? defaultStore()).listRuns(limit);
}

export { intelligenceCadenceKey };

export function defaultStore(db: Db = getDb()): ContentIntelligenceStore {
  return {
    async insertRun(row) {
      await db.insert(contentIntelligenceRuns).values(row as unknown as typeof contentIntelligenceRuns.$inferInsert);
    },
    async updateRun(id, fields) {
      await db.update(contentIntelligenceRuns).set(fields as Partial<typeof contentIntelligenceRuns.$inferInsert>).where(eq(contentIntelligenceRuns.id, id));
    },
    async getRun(id) {
      const r = await db.select().from(contentIntelligenceRuns).where(eq(contentIntelligenceRuns.id, id)).limit(1);
      return (r[0] as unknown as ContentIntelligenceRunRow) ?? null;
    },
    async listRuns(limit) {
      const r = await db.select().from(contentIntelligenceRuns).orderBy(desc(contentIntelligenceRuns.createdAt)).limit(Math.min(Math.max(limit, 1), 100));
      return r as unknown as ContentIntelligenceRunRow[];
    },
  };
}
