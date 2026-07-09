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
export const PUBLISHING_DISPATCH_JOB_TYPE = "publishing.dispatch";
export const PUBLISHING_QUEUE = "general";

export const ASSET_KINDS = ["reel", "image", "carousel", "video", "story", "text"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_STATUSES = ["draft", "ready", "scheduled", "published", "archived"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const POST_PLATFORMS = ["instagram", "facebook", "linkedin", "x", "youtube", "tiktok"] as const;
export type PostPlatform = (typeof POST_PLATFORMS)[number];

export const POST_STATUSES = ["scheduled", "publishing", "published", "failed", "canceled"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

// Provider-agnostic publishers. "manual" needs nothing (you post + mark done); the others are
// unified social APIs / n8n that connect the accounts once and post via one call.
export const PUBLISHERS = ["manual", "ayrshare", "zernio", "n8n"] as const;
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
    metadata: {},
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
    sourceType: "content_pack",
    sourcePacketId: packet.id,
    status: "ready",
    createdBy: packet.createdBy ?? undefined,
  };
}
