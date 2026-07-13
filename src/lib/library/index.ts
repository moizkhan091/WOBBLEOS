import { and, desc, eq, lte, sql } from "drizzle-orm";
import { contentAssets, scheduledPosts } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { getContentPacketDetail } from "@/lib/content";
import {
  LIBRARY_MODULE,
  assetInputFromPacket,
  buildContentAssetRow,
  buildScheduledPostRow,
  canTransitionPost,
  planFeed,
  type ContentAssetRow,
  type CreateAssetInput,
  type FeedPlanItem,
  type FeedPlanOptions,
  type PackForImport,
  type PostPlatform,
  type ScheduledPostRow,
  type SchedulePostInput,
} from "@/lib/domain/library";
import { enqueueJob } from "@/lib/jobs";
import type { EnqueueJobInput, JobRow } from "@/lib/domain/jobs";
import { zernioConfigured, zernioPublish } from "@/lib/library/zernio";

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

/** Zernio adapter — posts through the unified Zernio API. Only active when ZERNIO_API_KEY is set. */
export const zernioPublisher: PublisherAdapter = {
  slug: "zernio",
  async publish({ post, asset }) {
    return zernioPublish({ post, asset });
  },
};

export function resolvePublisher(name: string, registry: Record<string, PublisherAdapter>): PublisherAdapter {
  return registry[name] ?? manualPublisher;
}

/** The live publisher registry, env-gated: Zernio joins only when its API key is configured. */
export function defaultPublisherRegistry(): Record<string, PublisherAdapter> {
  return zernioConfigured() ? { manual: manualPublisher, zernio: zernioPublisher } : { manual: manualPublisher };
}

// ---------------------------------------------------------------- store + deps

export interface LibraryStore {
  insertAsset(row: ContentAssetRow): Promise<void>;
  listAssets(query: { status?: string; kind?: string; ownerScope?: string; ownerId?: string; limit: number }): Promise<ContentAssetRow[]>;
  getAssetById(id: string): Promise<ContentAssetRow | null>;
  updateAsset(id: string, fields: Partial<ContentAssetRow>): Promise<void>;
  findAssetByPacketId(packetId: string): Promise<ContentAssetRow | null>;
  /** Optional: dedupe local-folder imports by their stable importKey (stored in metadata). */
  findAssetByImportKey?(key: string): Promise<ContentAssetRow | null>;
  insertScheduledPost(row: ScheduledPostRow): Promise<void>;
  listScheduledPosts(query: { status?: string; platform?: string; limit: number }): Promise<ScheduledPostRow[]>;
  getScheduledPostById(id: string): Promise<ScheduledPostRow | null>;
  updateScheduledPost(id: string, fields: Partial<ScheduledPostRow>): Promise<void>;
  deleteScheduledPost(id: string): Promise<void>;
  listDuePosts(now: Date, limit: number): Promise<ScheduledPostRow[]>;
  listPostsByAsset(assetId: string): Promise<ScheduledPostRow[]>;
  /** Optional: latest post for an asset on a specific platform (per-platform posting state). */
  findPostByAssetAndPlatform?(assetId: string, platform: string): Promise<ScheduledPostRow | null>;
  /** Optional: find a post by its external provider id (for webhook reconciliation). */
  findPostByPublisherRef?(publisherRef: string): Promise<ScheduledPostRow | null>;
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
    approvalStatus: (p.approvalStatus as string) ?? null,
    // Content is track-scoped: carry the source track so the imported asset is isolated to its owner.
    ownerScope: p.contentTrackId ? "content_track" : "company",
    ownerId: (p.contentTrackId as string) ?? null,
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

export async function listContentAssets(query: { status?: string; kind?: string; ownerScope?: string; ownerId?: string; limit?: number } = {}, deps: LibraryDeps = {}): Promise<ContentAssetRow[]> {
  const store = deps.store ?? defaultStore();
  // ownerScope/ownerId scope the read to a single tenant/track owner — a caller scoped to one owner never
  // sees another owner's assets (tenant isolation on the Library).
  return store.listAssets({ status: query.status, kind: query.kind, ownerScope: query.ownerScope, ownerId: query.ownerId, limit: Math.min(Math.max(query.limit ?? 100, 1), 500) });
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

/**
 * Import an APPROVED Content Command pack into the library (idempotent per packet). Two hard guards:
 *  - IDEMPOTENCY: a re-run for the same packet returns the existing asset (never a duplicate).
 *  - APPROVAL: only an `approved` packet may become a publishable Library asset — a pending/rejected/draft
 *    (incl. a QA-failed) packet is refused (returns null). The founder approval is the promotion gate; a
 *    packet that never cleared QA + approval can never reach the Library / scheduled-posts / publishing path.
 */
export async function importFromContentPacket(packetId: string, deps: LibraryDeps = {}): Promise<ContentAssetRow | null> {
  const store = deps.store ?? defaultStore();
  const existing = await store.findAssetByPacketId(packetId);
  if (existing) return existing; // already imported — don't duplicate
  const packet = await (deps.getPacketForImport ?? defaultGetPacketForImport)(packetId);
  if (!packet) return null;
  // UNAPPROVED CONTENT CANNOT PUBLISH. When the approval status is known, it MUST be `approved`.
  if (packet.approvalStatus !== undefined && packet.approvalStatus !== null && packet.approvalStatus !== "approved") return null;
  return addContentAsset(assetInputFromPacket(packet), deps);
}

// ---------------------------------------------------------------- scheduling

export async function schedulePost(input: SchedulePostInput, deps: LibraryDeps & { scheduleRemote?: (args: { post: ScheduledPostRow; asset: ContentAssetRow }) => Promise<{ publisherRef?: string } | void> } = {}): Promise<ScheduledPostRow> {
  const store = deps.store ?? defaultStore();
  const asset = await store.getAssetById(input.assetId);
  if (!asset) throw new Error(`content asset '${input.assetId}' not found`);
  if (asset.status === "archived") throw new Error("cannot schedule an archived asset");
  // IDEMPOTENCY: a retry (or a double-click) must NOT create a SECOND live post for the same asset+platform.
  // If an active (scheduled/publishing) post already exists for this asset on this platform, return it.
  if (store.findPostByAssetAndPlatform) {
    const active = await store.findPostByAssetAndPlatform(input.assetId, input.platform);
    if (active && (active.status === "scheduled" || active.status === "publishing")) return active;
  }
  const row = buildScheduledPostRow(input, { now: deps.now });
  const now = deps.now ?? new Date();
  // Local-first: always persist the schedule before touching the provider, so we ALWAYS have a
  // cancelable record and never orphan a post on Zernio that we can't see. Then best-effort hand it to
  // the provider's own scheduler (so it posts even if our server is down at the due time) and store the
  // ref. If the remote push fails, we keep the local row — dispatchDuePosts publishes it at due time as
  // a fallback. A post with a publisherRef is owned by the provider and is NOT re-dispatched locally
  // (that would double-post).
  await store.insertScheduledPost(row);
  await store.updateAsset(asset.id, { status: "scheduled", updatedAt: now });
  if (row.publisher !== "manual" && deps.scheduleRemote) {
    try {
      const r = await deps.scheduleRemote({ post: row, asset });
      if (r?.publisherRef) {
        row.publisherRef = r.publisherRef;
        await store.updateScheduledPost(row.id, { publisherRef: r.publisherRef, updatedAt: now });
      }
    } catch (error) {
      // Best-effort: keep the local schedule; it will be dispatched locally at due time.
      console.error("zernio pre-schedule failed; will dispatch locally at due time:", error instanceof Error ? error.message : error);
    }
  }
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

/**
 * Cancel a scheduled post. If it was pushed to an external provider (Zernio), the caller-supplied
 * cancelRemote hook also kills it on that provider's side, so it can't post later after we cancel here.
 */
export async function cancelScheduledPost(id: string, deps: LibraryDeps & { cancelRemote?: (post: ScheduledPostRow) => Promise<void> } = {}): Promise<boolean> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const post = await store.getScheduledPostById(id);
  if (!post || !canTransitionPost(post.status, "canceled")) return false;
  if (post.publisher !== "manual" && post.publisherRef && deps.cancelRemote) {
    await deps.cancelRemote(post); // e.g. DELETE the scheduled post on Zernio so it never fires
  }
  await store.updateScheduledPost(id, { status: "canceled", updatedAt: now });
  await recomputeAssetStatus(post.assetId, store, now);
  return true;
}

/** Remove a post record entirely (a mistaken mark, a stale entry). Keeps asset status honest. */
export async function deleteScheduledPost(id: string, deps: LibraryDeps & { deleteRemote?: (post: ScheduledPostRow) => Promise<void> } = {}): Promise<boolean> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const post = await store.getScheduledPostById(id);
  if (!post) return false;
  if (post.publisher !== "manual" && post.publisherRef && post.status === "scheduled" && deps.deleteRemote) {
    await deps.deleteRemote(post); // a still-scheduled provider post must be removed there too
  }
  await store.deleteScheduledPost(id);
  await recomputeAssetStatus(post.assetId, store, now);
  await (deps.recordAudit ?? defaultRecordAudit)({
    eventType: "library.post_removed",
    module: LIBRARY_MODULE,
    entityType: "scheduled_post",
    entityId: id,
    actor: "system",
    metadata: { assetId: post.assetId, platform: post.platform, wasStatus: post.status },
  });
  return true;
}

/** Derive an asset's status from its posts: published > scheduled > ready. */
async function recomputeAssetStatus(assetId: string, store: LibraryStore, now: Date): Promise<void> {
  const asset = await store.getAssetById(assetId);
  if (!asset || asset.status === "archived") return;
  const mine = await store.listPostsByAsset(assetId);
  const status = mine.some((p) => p.status === "published") ? "published" : mine.some((p) => p.status === "scheduled" || p.status === "publishing") ? "scheduled" : "ready";
  if (status !== asset.status) await store.updateAsset(assetId, { status, updatedAt: now });
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

/**
 * Mark an asset as POSTED on a specific platform (the founder posted it manually and confirms).
 * Per-platform: marking Instagram does not touch LinkedIn. Idempotent — re-confirming a platform
 * already marked published returns the existing record. Creates a published manual post row if the
 * asset was never scheduled to that platform.
 */
export async function markAssetPostedOnPlatform(
  assetId: string,
  platform: PostPlatform,
  input: { actor?: string; publisherRef?: string } = {},
  deps: LibraryDeps = {},
): Promise<ScheduledPostRow> {
  const store = deps.store ?? defaultStore();
  const asset = await store.getAssetById(assetId);
  if (!asset) throw new Error(`content asset '${assetId}' not found`);
  const now = deps.now ?? new Date();
  const existing = store.findPostByAssetAndPlatform ? await store.findPostByAssetAndPlatform(assetId, platform) : null;

  let post: ScheduledPostRow;
  if (existing && existing.status === "published") {
    post = existing; // already marked for this platform — idempotent
  } else if (existing && canTransitionPost(existing.status, "published")) {
    await store.updateScheduledPost(existing.id, { status: "published", publishedAt: now, publisherRef: input.publisherRef ?? existing.publisherRef, updatedAt: now });
    post = { ...existing, status: "published", publishedAt: now, publisherRef: input.publisherRef ?? existing.publisherRef, updatedAt: now };
  } else {
    const row = buildScheduledPostRow({ assetId, platform, scheduledAt: now, publisher: "manual" }, { now });
    row.status = "published";
    row.publishedAt = now;
    row.publisherRef = input.publisherRef ?? null;
    try {
      await store.insertScheduledPost(row);
      post = row;
    } catch (error) {
      // Lost a concurrent mark-posted race: the partial unique index (asset+platform WHERE published)
      // rejected this second insert. Re-read the winner's published row and return it (idempotent)
      // instead of failing or creating a duplicate.
      const raced = store.findPostByAssetAndPlatform ? await store.findPostByAssetAndPlatform(assetId, platform) : null;
      if (raced && raced.status === "published") post = raced;
      else throw error;
    }
  }

  await store.updateAsset(assetId, { status: "published", updatedAt: now });
  await (deps.recordAudit ?? defaultRecordAudit)({
    eventType: "library.post_marked_manually",
    module: LIBRARY_MODULE,
    entityType: "scheduled_post",
    entityId: post.id,
    actor: input.actor ?? "system",
    metadata: { assetId, platform, manual: true },
  });
  return post;
}

/**
 * Fire all due posts through their publisher. Manual posts are left for the human to confirm.
 * EARNED AUTONOMY: when `enforceAutonomy` is on (the live scheduler enables it), an auto-publisher post fires
 * autonomously ONLY when the earned-autonomy policy for `content.publish` resolves to `autonomous` for that
 * asset; otherwise it is HELD (`heldForConfirm`) for a founder confirm — the OS never silently auto-posts to an
 * external audience without an earned, condition-matched grant. Default off so direct callers (and the existing
 * content-publishing proof) keep the pre-enforcement behaviour.
 */
export async function dispatchDuePosts(deps: LibraryDeps & { enforceAutonomy?: boolean } = {}): Promise<{ dispatched: number; deferred: number; failed: number; heldForConfirm: number }> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const registry = deps.publishers ?? defaultPublisherRegistry();
  const due = await store.listDuePosts(now, 100);
  let dispatched = 0;
  let deferred = 0;
  let failed = 0;
  let heldForConfirm = 0;
  const autonomyGrants = deps.enforceAutonomy ? (await import("@/lib/autonomy")).mayActAutonomously : null;
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
    // Earned-autonomy gate: publishing to an external audience is a medium-risk, public action. It fires
    // autonomously ONLY when the founder has granted an explicit, condition-matched `content.publish` policy
    // (scoped to the track, maxRiskLevel ≥ medium); with no grant it defaults to HELD for a founder confirm.
    // `qaPassed` is derived from real provenance — only pack-sourced content cleared the content QA gate, so
    // manually imported/uploaded assets are un-QA'd → hard-capped at confirm (held) regardless of any policy.
    if (autonomyGrants && !(await autonomyGrants({ category: "content.publish", clientId: (asset.ownerScope === "content_track" ? asset.ownerId : null), reversible: true, riskLevel: "medium", qaPassed: asset.sourceType === "content_pack" }, { now }))) {
      heldForConfirm += 1; // stays scheduled — the founder confirms + marks it posted
      continue;
    }
    if (post.publisherRef) {
      // Already handed to the provider's own scheduler at schedule time (has a publisherRef). The
      // provider owns the timing and the webhook reconciles status — re-publishing here would
      // DOUBLE-POST. Leave it scheduled; the Zernio webhook moves it to published/failed.
      deferred += 1;
      continue;
    }
    try {
      await store.updateScheduledPost(post.id, { status: "publishing", updatedAt: now });
      const res = await publisher.publish({ post, asset });
      await store.updateScheduledPost(post.id, { status: "published", publishedAt: now, publisherRef: res.publisherRef ?? null, result: res.result ?? {}, updatedAt: now });
      await store.updateAsset(post.assetId, { status: "published", updatedAt: now });
      // Best-effort audit — a logging failure must NEVER flip a real publish back to failed.
      await (deps.recordAudit ?? defaultRecordAudit)({
        eventType: "library.post_published",
        module: LIBRARY_MODULE,
        entityType: "scheduled_post",
        entityId: post.id,
        actor: "publisher",
        metadata: { assetId: post.assetId, platform: post.platform, publisher: post.publisher, publisherRef: res.publisherRef ?? null },
      }).catch(() => {});
      dispatched += 1;
    } catch (error) {
      await store.updateScheduledPost(post.id, { status: "failed", error: error instanceof Error ? error.message : String(error), updatedAt: now });
      failed += 1;
    }
  }
  return { dispatched, deferred, failed, heldForConfirm };
}

/**
 * Reconcile a Zernio webhook event against our local post (found by publisher_ref = Zernio post id).
 * This is how a scheduled post AUTO-MOVES to Posted (or Failed/Cancelled) — no polling. Idempotent:
 * safe to apply the same event twice (at-least-once delivery).
 */
export interface ZernioPostEvent {
  event: string; // post.published | post.failed | post.partial | post.cancelled | ...
  post: {
    id: string;
    status?: string;
    publishedAt?: string;
    platforms?: Array<{ platform: string; status: string; platformPostId?: string; publishedUrl?: string; error?: string }>;
  };
}

export async function applyZernioPostEvent(event: ZernioPostEvent, deps: LibraryDeps = {}): Promise<{ updated: boolean; postId?: string }> {
  const store = deps.store ?? defaultStore();
  const ref = event.post?.id;
  if (!ref || !store.findPostByPublisherRef) return { updated: false };
  const local = await store.findPostByPublisherRef(ref);
  if (!local) return { updated: false };
  const now = deps.now ?? new Date();
  const plat = event.post.platforms?.find((p) => p.platform === local.platform) ?? event.post.platforms?.[0];

  if (event.event === "post.published" || event.event === "post.partial") {
    if (local.status !== "published") {
      await store.updateScheduledPost(local.id, {
        status: "published",
        publishedAt: event.post.publishedAt ? new Date(event.post.publishedAt) : now,
        result: { ...local.result, zernio: event.post, publishedUrl: plat?.publishedUrl, platformPostId: plat?.platformPostId },
        updatedAt: now,
      });
      await recomputeAssetStatus(local.assetId, store, now);
    }
    return { updated: true, postId: local.id };
  }
  if (event.event === "post.failed") {
    if (local.status !== "failed" && local.status !== "published") {
      await store.updateScheduledPost(local.id, { status: "failed", error: (event.post.platforms ?? []).map((p) => p.error).filter(Boolean).join("; ") || "publish failed", updatedAt: now });
      await recomputeAssetStatus(local.assetId, store, now);
    }
    return { updated: true, postId: local.id };
  }
  if (event.event === "post.cancelled") {
    if (local.status !== "canceled" && local.status !== "published") {
      await store.updateScheduledPost(local.id, { status: "canceled", updatedAt: now });
      await recomputeAssetStatus(local.assetId, store, now);
    }
    return { updated: true, postId: local.id };
  }
  return { updated: false, postId: local.id };
}

// ---------------------------------------------------------------- feed planning (Content Director)

/** Plan a posting sequence over the un-actioned library (status ready/draft). Read-only. */
export async function planFeedForLibrary(opts: Omit<FeedPlanOptions, "startAt"> & { startAt: Date; limit?: number }, deps: LibraryDeps = {}): Promise<{ items: FeedPlanItem[]; summary: string }> {
  const store = deps.store ?? defaultStore();
  const all = await store.listAssets({ limit: opts.limit ?? 500 });
  const plannable = all.filter((a) => a.status === "ready" || a.status === "draft");
  return planFeed(
    plannable.map((a) => ({ id: a.id, title: a.title, kind: a.kind, tags: a.tags, metadata: a.metadata })),
    opts,
  );
}

/** Schedule every item in an approved plan (manual publisher — the founder approved the plan). */
export async function applyFeedPlan(
  items: Array<{ assetId: string; scheduledAt: string; platform: string }>,
  input: { createdBy?: string } = {},
  deps: LibraryDeps = {},
): Promise<{ scheduled: number; errors: string[] }> {
  let scheduled = 0;
  const errors: string[] = [];
  for (const it of items) {
    try {
      await schedulePost({ assetId: it.assetId, platform: it.platform as PostPlatform, scheduledAt: new Date(it.scheduledAt), publisher: "manual", createdBy: input.createdBy }, deps);
      scheduled += 1;
    } catch (error) {
      errors.push(`${it.assetId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { scheduled, errors };
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
      if (query.ownerScope) conditions.push(eq(contentAssets.ownerScope, query.ownerScope));
      if (query.ownerId) conditions.push(eq(contentAssets.ownerId, query.ownerId));
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
    async findAssetByImportKey(key) {
      const rows = await db.select().from(contentAssets).where(sql`${contentAssets.metadata} ->> 'importKey' = ${key}`).limit(1);
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
    async deleteScheduledPost(id) {
      await db.delete(scheduledPosts).where(eq(scheduledPosts.id, id));
    },
    async listPostsByAsset(assetId) {
      const rows = await db.select().from(scheduledPosts).where(eq(scheduledPosts.assetId, assetId)).orderBy(desc(scheduledPosts.createdAt));
      return rows as ScheduledPostRow[];
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
    async findPostByAssetAndPlatform(assetId, platform) {
      const rows = await db
        .select()
        .from(scheduledPosts)
        .where(and(eq(scheduledPosts.assetId, assetId), eq(scheduledPosts.platform, platform)))
        .orderBy(desc(scheduledPosts.createdAt))
        .limit(1);
      return (rows[0] as ScheduledPostRow) ?? null;
    },
    async findPostByPublisherRef(publisherRef) {
      const rows = await db.select().from(scheduledPosts).where(eq(scheduledPosts.publisherRef, publisherRef)).orderBy(desc(scheduledPosts.createdAt)).limit(1);
      return (rows[0] as ScheduledPostRow) ?? null;
    },
  };
}
