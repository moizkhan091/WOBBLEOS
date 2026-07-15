import { z } from "zod";
import { newId } from "@/lib/ids";

/**
 * Content Library & Scheduler domain (pure, testable).
 *
 * The library holds publishable assets (imported content + approved packs). The scheduler
 * queues an asset to a platform at a time and dispatches it through a pluggable publisher.
 * All IO lives in src/lib/library.
 */

export const LIBRARY_MODULE = "library";

export const ASSET_KINDS = ["reel", "image", "carousel", "video", "story", "text"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_STATUSES = ["draft", "ready", "scheduled", "published", "archived"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const POST_PLATFORMS = ["instagram", "facebook", "linkedin", "x", "youtube", "tiktok"] as const;
export type PostPlatform = (typeof POST_PLATFORMS)[number];

export const POST_STATUSES = ["scheduled", "publishing", "published", "failed", "canceled"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/**
 * Publishers that a real adapter exists for. THIS LIST IS THE CONTRACT — a publisher may appear here
 * only if `defaultPublisherRegistry()` can produce an adapter for it.
 *
 * `ayrshare` and `n8n` were removed (WOB-UAT-006). No adapter for either has ever existed, yet both
 * were in this enum, so the API validated them, returned 201, and persisted the row — after which
 * `resolvePublisher` silently substituted the MANUAL adapter and `dispatchDuePosts` counted the post as
 * "deferred to a human" forever. No error, no `failed` status, no audit event, and the UI only renders
 * "Mark posted" for `publisher === "manual"`, so the founder could not even resolve it by hand. Work
 * disappeared into a state nothing could observe or recover.
 *
 * Three hand-maintained copies of this list had drifted apart: this enum, the registry, and the UI
 * dropdown. There is now ONE source of truth — `GET /api/library/publishers` derives availability from
 * the registry, and the UI renders that. Adding a publisher here without an adapter re-breaks it, and
 * `tests/library.test.ts` asserts enum ⊆ registry to stop exactly that.
 *
 * `manual` is not a degraded mode — it is a legitimate operating model: WOBBLE prepares the post, a
 * human fires it and marks it done. `zernio` is env-gated and reports as blocked without its key.
 */
export const PUBLISHERS = ["manual", "zernio"] as const;
export type Publisher = (typeof PUBLISHERS)[number];

export interface MediaRef {
  url?: string;
  path?: string;
  kind?: string;
  order?: number;
}

export interface ContentAssetRow {
  id: string;
  title: string;
  kind: string;
  caption: string | null;
  mediaRefs: MediaRef[];
  platforms: string[];
  tags: string[];
  ownerScope: string;
  ownerId: string | null;
  sourceType: string;
  sourcePacketId: string | null;
  status: string;
  createdBy: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduledPostRow {
  id: string;
  assetId: string;
  platform: string;
  scheduledAt: Date;
  status: string;
  publisher: string;
  publisherRef: string | null;
  publishedAt: Date | null;
  result: Record<string, unknown>;
  error: string | null;
  createdBy: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------- builders

export const createAssetSchema = z.object({
  title: z.string().trim().min(1),
  kind: z.enum(ASSET_KINDS).default("image"),
  caption: z.string().trim().min(1).optional(),
  mediaRefs: z.array(z.object({ url: z.string().trim().optional(), path: z.string().trim().optional(), kind: z.string().trim().optional(), order: z.number().int().optional() })).default([]),
  platforms: z.array(z.enum(POST_PLATFORMS)).default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
  ownerScope: z.string().trim().min(1).default("company"),
  ownerId: z.string().trim().min(1).optional(),
  sourceType: z.enum(["imported", "content_pack", "manual"]).default("imported"),
  sourcePacketId: z.string().trim().min(1).optional(),
  status: z.enum(ASSET_STATUSES).default("ready"),
  createdBy: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type CreateAssetInput = z.input<typeof createAssetSchema>;

export function buildContentAssetRow(input: CreateAssetInput, opts: { now?: Date; id?: string } = {}): ContentAssetRow {
  const p = createAssetSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("asset"),
    title: p.title,
    kind: p.kind,
    caption: p.caption ?? null,
    mediaRefs: p.mediaRefs,
    platforms: p.platforms,
    tags: p.tags,
    ownerScope: p.ownerScope,
    ownerId: p.ownerId ?? null,
    sourceType: p.sourceType,
    sourcePacketId: p.sourcePacketId ?? null,
    status: p.status,
    createdBy: p.createdBy ?? null,
    metadata: p.metadata,
    createdAt: now,
    updatedAt: now,
  };
}

export const schedulePostSchema = z.object({
  assetId: z.string().trim().min(1),
  platform: z.enum(POST_PLATFORMS),
  scheduledAt: z.coerce.date(),
  publisher: z.enum(PUBLISHERS).default("manual"),
  createdBy: z.string().trim().min(1).optional(),
});
export type SchedulePostInput = z.input<typeof schedulePostSchema>;

export function buildScheduledPostRow(input: SchedulePostInput, opts: { now?: Date; id?: string } = {}): ScheduledPostRow {
  const p = schedulePostSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("post"),
    assetId: p.assetId,
    platform: p.platform,
    scheduledAt: p.scheduledAt,
    status: "scheduled",
    publisher: p.publisher,
    publisherRef: null,
    publishedAt: null,
    result: {},
    error: null,
    createdBy: p.createdBy ?? null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------- status machine

const POST_TRANSITIONS: Record<PostStatus, PostStatus[]> = {
  scheduled: ["publishing", "canceled", "published", "failed"],
  publishing: ["published", "failed"],
  published: [],
  failed: ["scheduled", "publishing"], // allow retry
  canceled: ["scheduled"], // allow re-schedule
};

export function canTransitionPost(from: string, to: PostStatus): boolean {
  const allowed = POST_TRANSITIONS[from as PostStatus];
  return Array.isArray(allowed) && allowed.includes(to);
}

// ---------------------------------------------------------------- import from a content pack

export interface PackForImport {
  id: string;
  platform?: string | null;
  format?: string | null;
  hook?: string | null;
  caption?: string | null;
  carouselSlides?: Array<Record<string, unknown>> | null;
  createdBy?: string | null;
  /** The packet's approval status — a packet is promotable to the Library ONLY when `approved`. */
  approvalStatus?: string | null;
  /** Owner scoping carried onto the asset for tenant isolation (the source track's owner). */
  ownerScope?: string | null;
  ownerId?: string | null;
}

/** Map an approved Content Command pack into a library asset (media comes later from the studio). */
export function assetInputFromPacket(packet: PackForImport): CreateAssetInput {
  const kind: AssetKind = packet.format === "carousel" ? "carousel" : packet.format === "reel_script" ? "reel" : "image";
  const platform = packet.platform && (POST_PLATFORMS as readonly string[]).includes(packet.platform) ? [packet.platform as PostPlatform] : [];
  const captionParts = [packet.hook, packet.caption].filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return {
    title: (packet.hook || packet.caption || "Approved content pack").slice(0, 140),
    kind,
    caption: captionParts.join("\n\n") || undefined,
    platforms: platform,
    tags: ["from_content_command"],
    ownerScope: packet.ownerScope ?? "company",
    ownerId: packet.ownerId ?? undefined,
    sourceType: "content_pack",
    sourcePacketId: packet.id,
    status: "ready",
    createdBy: packet.createdBy ?? undefined,
  };
}

// ---------------------------------------------------------------- import from local folders
//
// The founder's content library ships as folders on disk:
//   images: <campaign>/ad_097__ai-creative-engine__mistake/{097.png, caption.txt}
//   reels:  <topic>/human-vs-ai/{reel.mp4, CAPTION.txt}
// Folder names encode structured metadata (id · product · angle) that the Content Director
// later uses to sequence the grid, so we parse it out instead of throwing it away.

export interface ParsedAdFolder {
  adId: string;
  seq: number | null;
  product: string;
  angle: string;
}

/** Parse `ad_097__ai-creative-engine__mistake` → { adId, seq, product, angle }. */
export function parseAdFolderName(name: string): ParsedAdFolder | null {
  const parts = name.split("__");
  if (parts.length < 3 || !/^ad_\d+$/i.test(parts[0])) return null;
  const adId = parts[0].toLowerCase();
  const seq = Number.parseInt(adId.replace(/^ad_/i, ""), 10);
  const angle = parts[parts.length - 1];
  const product = parts.slice(1, -1).join("__");
  return { adId, seq: Number.isFinite(seq) ? seq : null, product, angle };
}

function firstCaptionLine(caption: string | undefined, fallback: string): string {
  const line = (caption ?? "").split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0);
  return (line || fallback).slice(0, 140);
}

function humanize(slug: string): string {
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim() || "Untitled";
}

/** Stable dedupe key so re-running the importer never double-adds an asset. */
export function localImportKey(kind: "image" | "reel", folderPath: string): string {
  return `local:${kind}:${folderPath}`;
}

/** Build a library asset input from a local static image ad folder. */
export function assetInputFromLocalImage(args: { folderName: string; caption?: string; mediaPath: string; importKey: string }): CreateAssetInput {
  const parsed = parseAdFolderName(args.folderName);
  const product = parsed?.product ?? "wobble";
  const angle = parsed?.angle ?? "general";
  return {
    title: firstCaptionLine(args.caption, humanize(`${product} ${angle}`)),
    kind: "image",
    caption: args.caption?.trim() || undefined,
    mediaRefs: [{ path: args.mediaPath, kind: "image", order: 0 }],
    platforms: ["instagram", "linkedin"],
    tags: ["wobble-library", product, `angle:${angle}`],
    sourceType: "imported",
    status: "ready",
    metadata: { importKey: args.importKey, source: "social-library-upload", adId: parsed?.adId ?? null, seq: parsed?.seq ?? null, product, angle },
  };
}

// ---------------------------------------------------------------- feed planner (Content Director v1)
//
// "Plan my feed": sequence the library the way a content lead would — spread angles and products so
// the grid never repeats itself, interleave reels for format variety, and drop each post into a
// posting slot. v1 uses the metadata we already parsed (kind · angle · product); a later layer adds
// vision/color analysis. Pure + deterministic (times derive from an explicit startAt).

export interface PlannableAsset {
  id: string;
  title: string;
  kind: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface FeedPlanItem {
  assetId: string;
  title: string;
  kind: string;
  angle: string;
  product: string;
  order: number;
  scheduledAt: string; // ISO
  platform: string;
}

export interface FeedPlanOptions {
  startAt: Date;
  perDay?: number; // posts per day (default 1)
  hoursOfDay?: number[]; // local hours to post at (default [18])
  platform?: PostPlatform; // default instagram
  reelEvery?: number; // insert a reel roughly every N images (default 6)
}

function assetAngle(a: PlannableAsset): string {
  const m = a.metadata ?? {};
  if (typeof m.angle === "string" && m.angle) return m.angle;
  const tag = (a.tags ?? []).find((t) => t.startsWith("angle:"));
  return tag ? tag.slice(6) : "general";
}
function assetProduct(a: PlannableAsset): string {
  const m = a.metadata ?? {};
  if (typeof m.product === "string" && m.product) return m.product;
  if (typeof m.topic === "string" && m.topic) return m.topic;
  return "wobble";
}

/** Greedily order items so consecutive ones differ in angle AND product where possible. */
function spreadByVariety(items: PlannableAsset[]): PlannableAsset[] {
  const remaining: PlannableAsset[] = [...items];
  const out: PlannableAsset[] = [];
  let prev: PlannableAsset | null = null;
  while (remaining.length) {
    const p = prev;
    let idx: number = p ? remaining.findIndex((it) => assetAngle(it) !== assetAngle(p) && assetProduct(it) !== assetProduct(p)) : 0;
    if (idx === -1) idx = p ? remaining.findIndex((it) => assetProduct(it) !== assetProduct(p)) : 0;
    if (idx === -1) idx = 0;
    const pick: PlannableAsset = remaining.splice(idx, 1)[0];
    out.push(pick);
    prev = pick;
  }
  return out;
}

export function planFeed(assets: PlannableAsset[], opts: FeedPlanOptions): { items: FeedPlanItem[]; summary: string } {
  const perDay = Math.max(1, opts.perDay ?? 1);
  const hours = opts.hoursOfDay?.length ? opts.hoursOfDay : [18];
  const platform = opts.platform ?? "instagram";
  const reelEvery = Math.max(2, opts.reelEvery ?? 6);

  const isReel = (a: PlannableAsset) => a.kind === "reel" || a.kind === "video";
  const images = spreadByVariety(assets.filter((a) => !isReel(a)));
  const reels = spreadByVariety(assets.filter(isReel));

  // Merge: one reel roughly every `reelEvery` images; leftover reels trail at the end.
  const merged: PlannableAsset[] = [];
  let ri = 0;
  for (let i = 0; i < images.length; i++) {
    merged.push(images[i]);
    if ((i + 1) % reelEvery === 0 && ri < reels.length) merged.push(reels[ri++]);
  }
  while (ri < reels.length) merged.push(reels[ri++]);

  const items: FeedPlanItem[] = merged.map((a, k) => {
    const day = Math.floor(k / perDay);
    const hour = hours[k % perDay % hours.length];
    const d = new Date(opts.startAt);
    d.setDate(d.getDate() + day);
    d.setHours(hour, 0, 0, 0);
    return { assetId: a.id, title: a.title, kind: a.kind, angle: assetAngle(a), product: assetProduct(a), order: k, scheduledAt: d.toISOString(), platform };
  });

  const reelCount = merged.filter(isReel).length;
  const summary = `${items.length} posts sequenced — ${reelCount} reels interleaved for variety, angles + products spread so the grid never repeats. ${perDay}/day at ${hours.map((h) => `${h}:00`).join(", ")} starting ${opts.startAt.toDateString()}.`;
  return { items, summary };
}

/** Build a library asset input from a local reel folder. */
export function assetInputFromLocalReel(args: { topic: string; reelName: string; caption?: string; mediaPath: string; importKey: string }): CreateAssetInput {
  return {
    title: firstCaptionLine(args.caption, humanize(`${args.topic} ${args.reelName}`)),
    kind: "reel",
    caption: args.caption?.trim() || undefined,
    mediaRefs: [{ path: args.mediaPath, kind: "video", order: 0 }],
    platforms: ["instagram"],
    tags: ["wobble-library", args.topic, "reel"],
    sourceType: "imported",
    status: "ready",
    metadata: { importKey: args.importKey, source: "social-library-reels", topic: args.topic, reelName: args.reelName },
  };
}
