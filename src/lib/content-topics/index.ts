import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { contentTopics } from "@/db/schema";
import { newId } from "@/lib/ids";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { runTextProvider, type ProviderChatMessage } from "@/lib/providers";
import { searchVolume, trendsExplore } from "@/lib/dataforseo";
import {
  buildTopicBankPrompt,
  buildContentTopicRow,
  parseTopicProposals,
  type ContentTopicRow,
  type ContentTopicStatus,
  type ContentTopicPillar,
  type TopicStats,
} from "@/lib/domain/content-topics";

/**
 * Topic Bank service — the strategist proposes topics, each ENRICHED with real search demand + trend velocity
 * from DataForSEO, scored deterministically, and landed `pending_review`. A founder reviews the bank (with the
 * stats in front of them) and approves the ones worth producing; an approved topic can then be PROMOTED into
 * the content graph. Nothing posts blindly. Provider + enricher + store + clock are injectable for unit tests.
 */

export const CONTENT_TOPICS_MODULE = "content";
export const CONTENT_STRATEGIST_AGENT = "content_strategist";

export interface ContentTopicStore {
  insertTopics(rows: ContentTopicRow[]): Promise<void>;
  listTopics(filter: { status?: ContentTopicStatus; pillar?: ContentTopicPillar; intelligenceRunId?: string; limit?: number }): Promise<ContentTopicRow[]>;
  getTopic(id: string): Promise<ContentTopicRow | null>;
  updateTopic(id: string, fields: Partial<ContentTopicRow>): Promise<void>;
  recentTitles(limit: number): Promise<string[]>;
}

/** Turns demand keywords into demand/velocity signals. Failures (account unverified, budget, no key) degrade
 *  gracefully to empty maps — topic generation never breaks on a provider hiccup; the ledger records the truth. */
export interface TopicEnricher {
  enrich(keywords: string[], item: string, locationName?: string): Promise<{ volumes: Map<string, number | null>; velocities: Map<string, number> }>;
}

export type TopicProvider = (input: { role: string; module: string; model?: string; messages: ProviderChatMessage[]; maxTokens?: number; temperature?: number }) => Promise<{ text: string }>;

export interface ContentTopicsDeps {
  store?: ContentTopicStore;
  runProvider?: TopicProvider;
  enricher?: TopicEnricher;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
  model?: string;
}

async function audit(deps: ContentTopicsDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

export interface GenerateTopicBankInput {
  objective: string;
  personaName?: string;
  count?: number;
  knowledgeTopics?: string[];
  brain?: Array<{ title: string; content: string }>;
  bannedPhrases?: string[];
  sourceRefs?: string[];
  /** DataForSEO location for demand/velocity (e.g. "United States" | "Pakistan"). */
  locationName?: string;
  intelligenceRunId?: string;
  requestedBy: string;
}

/** Generate a scored, review-gated topic bank. Returns rows sorted by overall score (best first). */
export async function generateTopicBank(input: GenerateTopicBankInput, deps: ContentTopicsDeps = {}): Promise<ContentTopicRow[]> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const model = deps.model ?? "anthropic/claude-sonnet-4.5";
  const runId = input.intelligenceRunId ?? newId("intelrun");
  const count = Math.min(Math.max(input.count ?? 8, 1), 20);

  const recentTopicTitles = await store.recentTitles(30);
  const { system, user } = buildTopicBankPrompt({
    objective: input.objective,
    personaName: input.personaName ?? "WOBBLE",
    count,
    knowledgeTopics: input.knowledgeTopics ?? [],
    brain: input.brain ?? [],
    recentTopicTitles,
    bannedPhrases: input.bannedPhrases,
  });

  const runProvider =
    deps.runProvider ??
    (async (i) => runTextProvider({ ...i, usageContext: { agentSlug: CONTENT_STRATEGIST_AGENT, module: CONTENT_TOPICS_MODULE } }));
  const r = await runProvider({
    role: "content_strategy",
    module: CONTENT_TOPICS_MODULE,
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: 4000,
    temperature: 0.5,
  });
  const proposals = parseTopicProposals(r.text);
  if (!proposals.length) {
    await audit(deps, { eventType: "content_topics.empty", module: CONTENT_TOPICS_MODULE, entityType: "intelligence_run", entityId: runId, actor: input.requestedBy, metadata: { objective: input.objective } });
    return [];
  }

  // Enrich demand keywords with REAL search demand + trend velocity (graceful if DataForSEO is unavailable).
  const enricher = deps.enricher ?? defaultTopicEnricher();
  const { volumes, velocities } = await enricher.enrich(
    proposals.map((p) => p.demandKeyword),
    `topic-bank:${runId}`,
    input.locationName,
  );

  const rows = proposals.map((p) => {
    const key = p.demandKeyword.trim().toLowerCase();
    const stats: TopicStats = {
      demandKeyword: p.demandKeyword,
      demandVolume: volumes.has(key) ? volumes.get(key) ?? null : null,
      trendVelocity: velocities.has(key) ? velocities.get(key) ?? null : null,
      competitorGap: p.competitorGap,
      founderJobValue: p.founderJobValue,
      noveltyScore: p.noveltyScore,
      proofAvailable: p.proofAvailable,
      freshness: p.freshness,
    };
    return buildContentTopicRow(
      { proposal: p, stats, sourceRefs: input.sourceRefs, intelligenceRunId: runId, createdByAgent: CONTENT_STRATEGIST_AGENT, model },
      { now },
    );
  });

  await store.insertTopics(rows);
  const enriched = rows.filter((x) => x.demandVolume != null).length;
  await audit(deps, {
    eventType: "content_topics.generated",
    module: CONTENT_TOPICS_MODULE,
    entityType: "intelligence_run",
    entityId: runId,
    actor: input.requestedBy,
    metadata: { count: rows.length, enriched, pillars: [...new Set(rows.map((x) => x.pillar))], topScore: Math.max(...rows.map((x) => x.overallScore)) },
  });
  return [...rows].sort((a, b) => b.overallScore - a.overallScore);
}

export interface ReviewTopicInput {
  topicId: string;
  decision: "approved" | "rejected";
  reviewedBy: string;
  notes?: string;
}

/** Human gate: pending_review → approved/rejected. Idempotent (a re-decide is a no-op), audited. */
export async function reviewTopic(input: ReviewTopicInput, deps: ContentTopicsDeps = {}): Promise<ContentTopicRow | null> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const topic = await store.getTopic(input.topicId);
  if (!topic) return null;
  if (topic.status !== "pending_review") return topic; // idempotent — already decided
  const fields: Partial<ContentTopicRow> = { status: input.decision, reviewedBy: input.reviewedBy, reviewedAt: now, reviewNotes: input.notes ?? null, updatedAt: now };
  await store.updateTopic(input.topicId, fields);
  await audit(deps, { eventType: `content_topics.${input.decision}`, module: CONTENT_TOPICS_MODULE, entityType: "content_topic", entityId: input.topicId, actor: input.reviewedBy, metadata: { pillar: topic.pillar, score: topic.overallScore } });
  return { ...topic, ...fields };
}

/** Mark an APPROVED topic as promoted into production (records the graph run/packet it became). */
export async function markTopicPromoted(topicId: string, refs: { graphRunId?: string; packetId?: string; actor: string }, deps: ContentTopicsDeps = {}): Promise<ContentTopicRow | null> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const topic = await store.getTopic(topicId);
  if (!topic) return null;
  if (topic.status !== "approved") return topic; // only an approved topic can be promoted
  const fields: Partial<ContentTopicRow> = { status: "promoted", promotedGraphRunId: refs.graphRunId ?? null, promotedPacketId: refs.packetId ?? null, updatedAt: now };
  await store.updateTopic(topicId, fields);
  await audit(deps, { eventType: "content_topics.promoted", module: CONTENT_TOPICS_MODULE, entityType: "content_topic", entityId: topicId, actor: refs.actor, metadata: { graphRunId: refs.graphRunId, packetId: refs.packetId } });
  return { ...topic, ...fields };
}

export type GraphEnqueuer = (input: { contentTrackId: string; requestedBy: string; objective: string; platformFocus?: string[]; formatFocus?: string[] }) => Promise<unknown>;

export interface PromoteTopicInput {
  topicId: string;
  contentTrackId: string;
  requestedBy: string;
}
export interface PromoteTopicResult {
  topic: ContentTopicRow | null;
  jobId: string | null;
}

/**
 * Promote an APPROVED topic into production: enqueue the content graph with the topic's full teaching context
 * as the objective, then mark the topic `promoted` (linking the graph run). This is the "a selected topic
 * picks up into production" step — only an approved topic produces; nothing bypasses the founder's pick.
 */
export async function promoteTopicToProduction(input: PromoteTopicInput, deps: ContentTopicsDeps & { enqueueGraph?: GraphEnqueuer } = {}): Promise<PromoteTopicResult> {
  const store = deps.store ?? defaultStore();
  const topic = await store.getTopic(input.topicId);
  if (!topic) return { topic: null, jobId: null };
  if (topic.status !== "approved") return { topic, jobId: null }; // only an approved topic produces
  const objective = `${topic.title} — angle: ${topic.angle}. Teaching job (the real mechanism to show): ${topic.teachingJob}. Pillar: ${topic.pillar}. Audience: ${topic.targetAudience}. Funnel intent: ${topic.funnelStage}.`;
  const enqueue = deps.enqueueGraph ?? (async (i) => (await import("@/lib/content-graph")).enqueueContentGraphJob(i));
  const res = (await enqueue({ contentTrackId: input.contentTrackId, requestedBy: input.requestedBy, objective, platformFocus: [topic.suggestedPlatform], formatFocus: [topic.suggestedFormat] })) as { job?: { id?: string } } | undefined;
  const jobId = res?.job?.id ?? null;
  const promoted = await markTopicPromoted(input.topicId, { graphRunId: jobId ?? undefined, actor: input.requestedBy }, { store, recordAudit: deps.recordAudit, now: deps.now });
  return { topic: promoted, jobId };
}

export async function listTopics(filter: { status?: ContentTopicStatus; pillar?: ContentTopicPillar; intelligenceRunId?: string; limit?: number } = {}, deps: ContentTopicsDeps = {}): Promise<ContentTopicRow[]> {
  return (deps.store ?? defaultStore()).listTopics(filter);
}

export async function getTopic(id: string, deps: ContentTopicsDeps = {}): Promise<ContentTopicRow | null> {
  return (deps.store ?? defaultStore()).getTopic(id);
}

/** Real DataForSEO enricher — one batched search-volume call + chunked trends; swallows provider errors. */
export function defaultTopicEnricher(): TopicEnricher {
  return {
    async enrich(keywords, item, locationName) {
      const volumes = new Map<string, number | null>();
      const velocities = new Map<string, number>();
      const uniq = [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))];
      if (!uniq.length) return { volumes, velocities };
      try {
        const vols = await searchVolume({ keywords: uniq, item, locationName });
        for (const v of vols) volumes.set(v.keyword.toLowerCase(), v.searchVolume);
      } catch (e) {
        console.warn(`[topic-bank] demand enrichment skipped: ${e instanceof Error ? e.message : String(e)}`);
      }
      try {
        for (let i = 0; i < uniq.length; i += 5) {
          const chunk = uniq.slice(i, i + 5);
          const tr = await trendsExplore({ keywords: chunk, item, locationName });
          for (const t of tr) velocities.set(t.keyword.toLowerCase(), t.velocity);
        }
      } catch (e) {
        console.warn(`[topic-bank] trend enrichment skipped: ${e instanceof Error ? e.message : String(e)}`);
      }
      return { volumes, velocities };
    },
  };
}

/** Drizzle returns the `numeric` trendVelocity column as a string — coerce it back to number|null so reads
 *  match ContentTopicRow honestly (all other numeric fields are integer columns → already numbers). */
function mapTopicRow(raw: Record<string, unknown>): ContentTopicRow {
  const tv = raw.trendVelocity;
  return { ...(raw as unknown as ContentTopicRow), trendVelocity: tv == null ? null : Number(tv) };
}

export function defaultStore(db: Db = getDb()): ContentTopicStore {
  return {
    async insertTopics(rows) {
      if (rows.length) await db.insert(contentTopics).values(rows as unknown as (typeof contentTopics.$inferInsert)[]);
    },
    async listTopics(filter) {
      const conds = [];
      if (filter.status) conds.push(eq(contentTopics.status, filter.status));
      if (filter.pillar) conds.push(eq(contentTopics.pillar, filter.pillar));
      if (filter.intelligenceRunId) conds.push(eq(contentTopics.intelligenceRunId, filter.intelligenceRunId));
      const base = db.select().from(contentTopics);
      const q = conds.length ? base.where(and(...conds)) : base;
      const r = await q.orderBy(desc(contentTopics.overallScore)).limit(Math.min(Math.max(filter.limit ?? 100, 1), 500));
      return (r as Record<string, unknown>[]).map(mapTopicRow);
    },
    async getTopic(id) {
      const r = await db.select().from(contentTopics).where(eq(contentTopics.id, id)).limit(1);
      return r[0] ? mapTopicRow(r[0] as Record<string, unknown>) : null;
    },
    async updateTopic(id, fields) {
      await db.update(contentTopics).set(fields as Partial<typeof contentTopics.$inferInsert>).where(eq(contentTopics.id, id));
    },
    async recentTitles(limit) {
      const r = await db
        .select({ title: contentTopics.title })
        .from(contentTopics)
        .where(inArray(contentTopics.status, ["approved", "promoted"]))
        .orderBy(desc(contentTopics.createdAt))
        .limit(Math.min(Math.max(limit, 1), 100));
      return r.map((x) => x.title as string);
    },
  };
}
