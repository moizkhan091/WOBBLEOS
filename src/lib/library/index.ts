import { and, desc, eq, lte } from "drizzle-orm";
import { contentAssets, scheduledPosts } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { getContentPacketDetail } from "@/lib/content";
import {
  LIBRARY_MODULE,
  PUBLISHING_DISPATCH_JOB_TYPE,
  PUBLISHING_QUEUE,
  assetInputFromPacket,
  buildContentAssetRow,
  buildScheduledPostRow,
  canTransitionPost,
  type ContentAssetRow,
  type CreateAssetInput,
  type PackForImport,
  type ScheduledPostRow,
  type SchedulePostInput,
} from "@/lib/domain/library";
import { enqueueJob } from "@/lib/jobs";
import type { EnqueueJobInput, JobRow } from "@/lib/domain/jobs";

/**
 * Content Library & Scheduler service (IO). Provider-agnostic: the actual delivery to a
 * platform is a pluggable PublisherAdapter (manual / n8n / a unified social API), so nothing
 * here is locked to one vendor. v1 ships the "manual" publisher (prep the post, you fire it +
 * mark done) — real API adapters plug in when their credentials are set.
 */

// ---------------------------------------------------------------- publisher abstraction

export interface PublishResult {
  publisherRef?: string;
  result?: Record<string, unknown>;
  /** manual publishers can't auto-post — the human posts and marks it done. */
  deferredToHuman?: boolean;
}
export interface PublisherAdapter {
  slug: string;
  publish(input: { post: ScheduledPostRow; asset: ContentAssetRow }): Promise<PublishResult>;
}

/** The always-available publisher: prepares the post, leaves it for a human to fire + confirm. */
export const manualPublisher: PublisherAdapter = {
  slug: "manual",
  async publish() {
    return { deferredToHuman: true };
  },
};

export function resolvePublisher(name: string, registry: Record<string, PublisherAdapter>): PublisherAdapter {
  return registry[name] ?? manualPublisher;
}

// ---------------------------------------------------------------- store + deps

export interface LibraryStore {
  insertAsset(row: ContentAssetRow): Promise<void>;
  listAssets(query: { status?: string; kind?: string; limit: number }): Promise<ContentAssetRow[]>;
  getAssetById(id: string): Promise<ContentAssetRow | null>;
  updateAsset(id: string, fields: Partial<ContentAssetRow>): Promise<void>;
  findAssetByPacketId(packetId: string): Promise<ContentAssetRow | null>;
  insertScheduledPost(row: ScheduledPostRow): Promise<void>;
  listScheduledPosts(query: { status?: string; platform?: string; limit: number }): Promise<ScheduledPostRow[]>;
  getScheduledPostById(id: string): Promise<ScheduledPostRow | null>;
  updateScheduledPost(id: string, fields: Partial<ScheduledPostRow>): Promise<void>;
  listDuePosts(now: Date, limit: number): Promise<ScheduledPostRow[]>;
}

export interface LibraryDeps {
  store?: LibraryStore;
  getPacketForImport?: (packetId: string) => Promise<PackForImport | null>;
  publishers?: Record<string, PublisherAdapter>;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  enqueueJob?: (input: EnqueueJobInput) => Promise<unknown>;
  now?: Date;
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

async function defaultGetPacketForImport(packetId: string): Promise<PackForImport | null> {
  const detail = await getContentPacketDetail(packetId);
  const p = detail?.packet as unknown as Record<string, unknown> | undefined;
  if (!p) return null;
  return {
    id: String(p.id),
    platform: (p.platform as string) ?? null,
    format: (p.format as string) ?? null,
    hook: (p.hook as string) ?? null,
    caption: (p.caption as string) ?? null,
    carouselSlides: (p.carouselSlides as Array<Record<string, unknown>>) ?? null,
    createdBy: (p.createdBy as string) ?? null,
  };
}

// ---------------------------------------------------------------- library

export async function addContentAsset(input: CreateAssetInput, deps: LibraryDeps = {}): Promise<ContentAssetRow> {
  const store = deps.store ?? defaultStore();
  const row = buildContentAssetRow(input, { now: deps.now });
  await store.insertAsset(row);
  await (deps.recordAudit ?? defaultRecordAudit)({
    eventType: "library.asset_added",
    module: LIBRARY_MODULE,
    entityType: "content_asset",
    entityId: row.id,
    actor: row.createdBy ?? "system",
    metadata: { kind: row.kind, sourceType: row.sourceType },
  });
  return row;
}

export async function listContentAssets(query: { status?: string; kind?: string; limit?: number } = {}, deps: LibraryDeps = {}): Promise<ContentAssetRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listAssets({ status: query.status, kind: query.kind, limit: Math.min(Math.max(query.limit ?? 100, 1), 500) });
}

export async function getContentAsset(id: string, deps: LibraryDeps = {}): Promise<ContentAssetRow | null> {
  const store = deps.store ?? defaultStore();
  return store.getAssetById(id);
}

export async function archiveContentAsset(id: string, deps: LibraryDeps = {}): Promise<boolean> {
  const store = deps.store ?? defaultStore();
  const asset = await store.getAssetById(id);
  if (!asset || asset.status === "archived") return false;
  await store.updateAsset(id, { status: "archived", updatedAt: deps.now ?? new Date() });
  return true;
}

/** Import an approved Content Command pack into the library (idempotent per packet). */
export async function importFromContentPacket(packetId: string, deps: LibraryDeps = {}): Promise<ContentAssetRow | null> {
  const store = deps.store ?? defaultStore();
  const existing = await store.findAssetByPacketId(packetId);
  if (existing) return existing; // already imported — don't duplicate
  const packet = await (deps.getPacketForImport ?? defaultGetPacketForImport)(packetId);
  if (!packet) return null;
  return addContentAsset(assetInputFromPacket(packet), deps);
}

// ---------------------------------------------------------------- scheduling

export async function schedulePost(input: SchedulePostInput, deps: LibraryDeps = {}): Promise<ScheduledPostRow> {
  const store = deps.store ?? defaultStore();
  const asset = await store.getAssetById(input.assetId);
  if (!asset) throw new Error(`content asset '${input.assetId}' not found`);
  if (asset.status === "archived") throw new Error("cannot schedule an archived asset");
  const row = buildScheduledPostRow(input, { now: deps.now });
  await store.insertScheduledPost(row);
  await store.updateAsset(asset.id, { status: "scheduled", updatedAt: deps.now ?? new Date() });
  await (deps.recordAudit ?? defaultRecordAudit)({
    eventType: "library.post_scheduled",
    module: LIBRARY_MODULE,
    entityType: "scheduled_post",
    entityId: row.id,
    actor: row.createdBy ?? "system",
    metadata: { assetId: row.assetId, platform: row.platform, scheduledAt: row.scheduledAt.toISOString(), publisher: row.publisher },
  });
  return row;
}

export async function listScheduledPosts(query: { status?: string; platform?: string; limit?: number } = {}, deps: LibraryDeps = {}): Promise<ScheduledPostRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listScheduledPosts({ status: query.status, platform: query.platform, limit: Math.min(Math.max(query.limit ?? 100, 1), 500) });
}

export async function cancelScheduledPost(id: string, deps: LibraryDeps = {}): Promise<boolean> {
  const store = deps.store ?? defaultStore();
  const post = await store.getScheduledPostById(id);
  if (!post || !canTransitionPost(post.status, "canceled")) return false;
  await store.updateScheduledPost(id, { status: "canceled", updatedAt: deps.now ?? new Date() });
  return true;
}

/** Mark a MANUAL post as published (the founder posted it themselves and confirmed). */
export async function markPostPublished(id: string, input: { publisherRef?: string; actor?: string } = {}, deps: LibraryDeps = {}): Promise<boolean> {
  const store = deps.store ?? defaultStore();
  const post = await store.getScheduledPostById(id);
  if (!post || !canTransitionPost(post.status, "published")) return false;
  const now = deps.now ?? new Date();
  await store.updateScheduledPost(id, { status: "published", publishedAt: now, publisherRef: input.publisherRef ?? post.publisherRef, updatedAt: now });
  await store.updateAsset(post.assetId, { status: "published", updatedAt: now });
  await (deps.recordAudit ?? defaultRecordAudit)({
    eventType: "library.post_published",
    module: LIBRARY_MODULE,
    entityType: "scheduled_post",
    entityId: id,
    actor: input.actor ?? "system",
    metadata: { assetId: post.assetId, platform: post.platform, manual: post.publisher === "manual" },
  });
  return true;
}

/** Fire all due posts through their publisher. Manual posts are left for the human to confirm. */
export async function dispatchDuePosts(deps: LibraryDeps = {}): Promise<{ dispatched: number; deferred: number; failed: number }> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const registry = deps.publishers ?? { manual: manualPublisher };
  const due = await store.listDuePosts(now, 100);
  let dispatched = 0;
  let deferred = 0;
  let failed = 0;
  for (const post of due) {
    const asset = await store.getAssetById(post.assetId);
    if (!asset) {
      await store.updateScheduledPost(post.id, { status: "failed", error: "asset not found", updatedAt: now });
      failed += 1;
      continue;
    }
    const publisher = resolvePublisher(post.publisher, registry);
    if (publisher.slug === "manual") {
      deferred += 1; // leave scheduled; the founder posts + marks done
      continue;
    }
    try {
      await store.updateScheduledPost(post.id, { status: "publishing", updatedAt: now });
      const res = await publisher.publish({ post, asset });
      await store.updateScheduledPost(post.id, { status: "published", publishedAt: now, publisherRef: res.publisherRef ?? null, result: res.result ?? {}, updatedAt: now });
      await store.updateAsset(post.assetId, { status: "published", updatedAt: now });
      dispatched += 1;
    } catch (error) {
      await store.updateScheduledPost(post.id, { status: "failed", error: error instanceof Error ? error.message : String(error), updatedAt: now });
      failed += 1;
    }
  }
  return { dispatched, deferred, failed };
}

export async function enqueuePublishingDispatchJob(deps: LibraryDeps = {}): Promise<unknown> {
  const enqueue = deps.enqueueJob ?? enqueueJob;
  return enqueue({ queue: PUBLISHING_QUEUE, type: PUBLISHING_DISPATCH_JOB_TYPE, payload: {}, priority: 6, maxAttempts: 1, linkedModule: LIBRARY_MODULE });
}

export async function runPublishingDispatchJobHandler(_job: JobRow): Promise<Record<string, unknown>> {
  const result = await dispatchDuePosts();
  return { ...result };
}

export async function runLibraryImportJobHandler(job: JobRow): Promise<Record<string, unknown>> {
  const packetId = (job.payload as { packetId?: string } | undefined)?.packetId;
  if (!packetId) throw new Error("library.import job is missing packetId");
  const asset = await importFromContentPacket(packetId);
  return { imported: Boolean(asset), assetId: asset?.id ?? null, packetId };
}

// ---------------------------------------------------------------- default store (DB)

export function defaultStore(db: Db = getDb()): LibraryStore {
  return {
    async insertAsset(row) {
      await db.insert(contentAssets).values(row);
    },
    async listAssets(query) {
      const conditions = [];
      if (query.status) conditions.push(eq(contentAssets.status, query.status));
      if (query.kind) conditions.push(eq(contentAssets.kind, query.kind));
      const base = db.select().from(contentAssets);
      const rows = await (conditions.length ? base.where(and(...conditions)) : base).orderBy(desc(contentAssets.createdAt)).limit(query.limit);
      return rows as ContentAssetRow[];
    },
    async getAssetById(id) {
      const rows = await db.select().from(contentAssets).where(eq(contentAssets.id, id)).limit(1);
      return (rows[0] as ContentAssetRow) ?? null;
    },
    async updateAsset(id, fields) {
      await db.update(contentAssets).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() }).where(eq(contentAssets.id, id));
    },
    async findAssetByPacketId(packetId) {
      const rows = await db.select().from(contentAssets).where(eq(contentAssets.sourcePacketId, packetId)).limit(1);
      return (rows[0] as ContentAssetRow) ?? null;
    },
    async insertScheduledPost(row) {
      await db.insert(scheduledPosts).values(row);
    },
    async listScheduledPosts(query) {
      const conditions = [];
      if (query.status) conditions.push(eq(scheduledPosts.status, query.status));
      if (query.platform) conditions.push(eq(scheduledPosts.platform, query.platform));
      const base = db.select().from(scheduledPosts);
      const rows = await (conditions.length ? base.where(and(...conditions)) : base).orderBy(scheduledPosts.scheduledAt).limit(query.limit);
      return rows as ScheduledPostRow[];
    },
    async getScheduledPostById(id) {
      const rows = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, id)).limit(1);
      return (rows[0] as ScheduledPostRow) ?? null;
    },
    async updateScheduledPost(id, fields) {
      await db.update(scheduledPosts).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() }).where(eq(scheduledPosts.id, id));
    },
    async listDuePosts(now, limit) {
      const rows = await db
        .select()
        .from(scheduledPosts)
        .where(and(eq(scheduledPosts.status, "scheduled"), lte(scheduledPosts.scheduledAt, now)))
        .orderBy(scheduledPosts.scheduledAt)
        .limit(limit);
      return rows as ScheduledPostRow[];
    },
  };
}
