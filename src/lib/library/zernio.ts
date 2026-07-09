import type { ContentAssetRow, ScheduledPostRow } from "@/lib/domain/library";

/**
 * Zernio publisher client (https://docs.zernio.com). Provider for the Library's publisher layer.
 *
 * IMPORTANT: everything here is gated on ZERNIO_API_KEY + PUBLIC_BASE_URL. With neither set (local
 * dev) nothing fires — the OS falls back to the manual/deferred path. Zernio needs a PUBLIC url to
 * fetch our media and to deliver webhooks, so real posting only works once WOBBLE OS is deployed.
 *
 * fetchImpl is injectable so the adapter can be unit-tested without hitting the network.
 */

const DEFAULT_BASE = "https://zernio.com/api/v1";

export interface ZernioConfig {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function resolve(c: ZernioConfig = {}) {
  return {
    apiKey: c.apiKey ?? process.env.ZERNIO_API_KEY ?? "",
    baseUrl: c.baseUrl ?? DEFAULT_BASE,
    fetchImpl: c.fetchImpl ?? fetch,
  };
}

/** True when a Zernio API key is configured. Publishing stays manual/deferred until this is set. */
export function zernioConfigured(c: ZernioConfig = {}): boolean {
  return Boolean(resolve(c).apiKey);
}

async function zreq<T = Record<string, unknown>>(path: string, init: RequestInit, c: ZernioConfig = {}): Promise<T> {
  const { apiKey, baseUrl, fetchImpl } = resolve(c);
  if (!apiKey) throw new Error("ZERNIO_API_KEY is not set");
  const res = await fetchImpl(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = (json as { error?: string })?.error ?? text.slice(0, 200);
    throw new Error(`Zernio ${init.method ?? "GET"} ${path} -> ${res.status}: ${err}`);
  }
  return json as T;
}

export interface ZernioMediaItem {
  type: "image" | "video";
  url: string;
}
export interface ZernioPlatformTarget {
  platform: string;
  accountId: string;
}

export interface CreateZernioPostInput {
  content: string;
  mediaItems?: ZernioMediaItem[];
  platforms: ZernioPlatformTarget[];
  scheduledFor?: string; // ISO — Zernio holds the schedule and posts at this time
  publishNow?: boolean;
}

/** Create a post on Zernio (publish now, schedule, or draft). Returns the Zernio post id. */
export async function createZernioPost(input: CreateZernioPostInput, c: ZernioConfig = {}): Promise<{ id: string; raw: unknown }> {
  const body: Record<string, unknown> = { content: input.content, platforms: input.platforms };
  if (input.mediaItems?.length) body.mediaItems = input.mediaItems;
  if (input.publishNow) body.publishNow = true;
  else if (input.scheduledFor) body.scheduledFor = input.scheduledFor;
  const json = await zreq<{ post?: { _id?: string; id?: string }; _id?: string; id?: string }>("/posts", { method: "POST", body: JSON.stringify(body) }, c);
  const id = json.post?._id ?? json.post?.id ?? json._id ?? json.id ?? "";
  return { id, raw: json };
}

/** Delete/cancel a post on Zernio so a still-scheduled post never fires after we cancel here. */
export async function deleteZernioPost(id: string, c: ZernioConfig = {}): Promise<void> {
  await zreq(`/posts/${encodeURIComponent(id)}`, { method: "DELETE" }, c);
}

export async function listZernioPosts(query: { status?: string; limit?: number } = {}, c: ZernioConfig = {}): Promise<unknown[]> {
  const qs = new URLSearchParams();
  if (query.status) qs.set("status", query.status);
  if (query.limit) qs.set("limit", String(query.limit));
  const json = await zreq<{ posts?: unknown[] }>(`/posts${qs.toString() ? `?${qs}` : ""}`, { method: "GET" }, c);
  return json.posts ?? [];
}

/** Resolve the Zernio account id for a platform: env override first (ZERNIO_ACCOUNT_INSTAGRAM), else the accounts API. */
export async function resolveAccountId(platform: string, c: ZernioConfig = {}): Promise<string | null> {
  const envId = process.env[`ZERNIO_ACCOUNT_${platform.toUpperCase()}`];
  if (envId) return envId;
  try {
    const json = await zreq<{ accounts?: Array<{ id?: string; _id?: string; platform?: string }> }>("/accounts", { method: "GET" }, c);
    const match = (json.accounts ?? []).find((a) => a.platform === platform);
    return match?.id ?? match?._id ?? null;
  } catch {
    return null;
  }
}

function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
}

/** Build the public media URLs Zernio will fetch. Requires PUBLIC_BASE_URL (Zernio can't reach localhost). */
export function zernioMediaItems(asset: ContentAssetRow, baseUrl = publicBaseUrl()): ZernioMediaItem[] {
  const isVideo = asset.kind === "reel" || asset.kind === "video";
  return (asset.mediaRefs ?? []).map((m, i) => ({
    type: m.kind === "video" || isVideo ? "video" : "image",
    url: m.url && /^https?:\/\//.test(m.url) ? m.url : `${baseUrl}/api/library/assets/${asset.id}/media?i=${i}`,
  }));
}

/** Publish a post immediately via Zernio (used by the dispatch adapter). */
export async function zernioPublish(args: { post: ScheduledPostRow; asset: ContentAssetRow }, c: ZernioConfig = {}): Promise<{ publisherRef?: string; result?: Record<string, unknown> }> {
  const baseUrl = publicBaseUrl();
  if (!baseUrl) throw new Error("PUBLIC_BASE_URL not set — Zernio needs a public URL to fetch media");
  const accountId = await resolveAccountId(args.post.platform, c);
  if (!accountId) throw new Error(`no Zernio account configured for platform '${args.post.platform}'`);
  const created = await createZernioPost(
    {
      content: args.asset.caption ?? args.asset.title,
      mediaItems: zernioMediaItems(args.asset, baseUrl),
      platforms: [{ platform: args.post.platform, accountId }],
      publishNow: true,
    },
    c,
  );
  return { publisherRef: created.id || undefined, result: { zernio: created.raw } };
}

/** Push a post to Zernio's native scheduler (Zernio holds it + posts at scheduledFor). */
export async function zernioSchedule(args: { post: ScheduledPostRow; asset: ContentAssetRow }, c: ZernioConfig = {}): Promise<{ publisherRef?: string }> {
  const baseUrl = publicBaseUrl();
  if (!baseUrl) throw new Error("PUBLIC_BASE_URL not set — Zernio needs a public URL to fetch media");
  const accountId = await resolveAccountId(args.post.platform, c);
  if (!accountId) throw new Error(`no Zernio account configured for platform '${args.post.platform}'`);
  const created = await createZernioPost(
    {
      content: args.asset.caption ?? args.asset.title,
      mediaItems: zernioMediaItems(args.asset, baseUrl),
      platforms: [{ platform: args.post.platform, accountId }],
      scheduledFor: args.post.scheduledAt.toISOString(),
    },
    c,
  );
  return { publisherRef: created.id || undefined };
}
