import type { WobbleService } from "@/lib/domain/free-audit";

/**
 * Apify scraper client — pulls a prospect's website + social signals to feed the audit's Doc 1 pitch.
 *
 * Gated on APIFY_API_KEY (like Zernio): with no key it's inert and the caller falls back to
 * founder-entered data. Runs Apify actors synchronously via run-sync-get-dataset-items. fetchImpl is
 * injectable so request-building + parsing are unit-tested without hitting the network / spending.
 */

const APIFY_BASE = "https://api.apify.com/v2";
// Well-known Apify actors (overridable via env for account-specific ones).
const WEBSITE_ACTOR = () => process.env.APIFY_WEBSITE_ACTOR || "apify~website-content-crawler";
const INSTAGRAM_ACTOR = () => process.env.APIFY_INSTAGRAM_ACTOR || "apify~instagram-scraper";

export interface ApifyConfig {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function cfg(c: ApifyConfig = {}) {
  return { apiKey: c.apiKey ?? process.env.APIFY_API_KEY ?? "", baseUrl: c.baseUrl ?? APIFY_BASE, fetchImpl: c.fetchImpl ?? fetch };
}

/** True when an Apify token is configured. Scraping is skipped (founder-entered fallback) until set. */
export function apifyConfigured(c: ApifyConfig = {}): boolean {
  return Boolean(cfg(c).apiKey);
}

/** Run an Apify actor synchronously and return its dataset items. */
export async function runApifyActor<T = Record<string, unknown>>(actorId: string, input: Record<string, unknown>, c: ApifyConfig = {}): Promise<T[]> {
  const { apiKey, baseUrl, fetchImpl } = cfg(c);
  if (!apiKey) throw new Error("APIFY_API_KEY is not set");
  const res = await fetchImpl(`${baseUrl}/acts/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Apify ${actorId} -> ${res.status}: ${text.slice(0, 200)}`);
  try {
    const json = JSON.parse(text);
    return Array.isArray(json) ? (json as T[]) : [];
  } catch {
    return [];
  }
}

export interface WebsiteSignals {
  url: string;
  title: string;
  text: string; // concatenated page text (trimmed)
  pages: number;
}

/** Scrape a prospect's website into a compact text signal. */
export async function scrapeWebsite(url: string, c: ApifyConfig = {}): Promise<WebsiteSignals> {
  const items = await runApifyActor<{ url?: string; title?: string; text?: string; markdown?: string }>(
    WEBSITE_ACTOR(),
    { startUrls: [{ url }], maxCrawlPages: 8, crawlerType: "cheerio" },
    c,
  );
  const text = items.map((i) => i.text || i.markdown || "").join("\n\n").slice(0, 12000);
  return { url, title: items[0]?.title ?? url, text, pages: items.length };
}

export interface SocialPost {
  caption: string;
  likes?: number;
  comments?: number;
  url?: string;
  timestamp?: string;
}
export interface InstagramSignals {
  handle: string;
  followers?: number;
  bio?: string;
  posts: SocialPost[];
}

/** Scrape recent Instagram posts + profile for a handle/URL. */
export async function scrapeInstagram(handleOrUrl: string, limit = 24, c: ApifyConfig = {}): Promise<InstagramSignals> {
  const handle = handleOrUrl.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/+$/, "").replace(/^@/, "");
  const items = await runApifyActor<{ caption?: string; likesCount?: number; commentsCount?: number; url?: string; timestamp?: string; ownerFullName?: string; followersCount?: number; biography?: string }>(
    INSTAGRAM_ACTOR(),
    { username: [handle], resultsLimit: limit },
    c,
  );
  const first = items[0] ?? {};
  return {
    handle,
    followers: first.followersCount,
    bio: first.biography,
    posts: items.map((i) => ({ caption: i.caption ?? "", likes: i.likesCount, comments: i.commentsCount, url: i.url, timestamp: i.timestamp })),
  };
}

export interface BusinessSignals {
  website?: WebsiteSignals;
  instagram?: InstagramSignals;
  scraped: boolean;
}

/** Aggregate whatever signals we can pull for a prospect (best-effort — failures degrade gracefully). */
export async function scrapeBusinessSignals(input: { website?: string; instagram?: string }, c: ApifyConfig = {}): Promise<BusinessSignals> {
  if (!apifyConfigured(c)) return { scraped: false };
  const out: BusinessSignals = { scraped: true };
  if (input.website) {
    try {
      out.website = await scrapeWebsite(input.website, c);
    } catch {
      /* degrade */
    }
  }
  if (input.instagram) {
    try {
      out.instagram = await scrapeInstagram(input.instagram, 24, c);
    } catch {
      /* degrade */
    }
  }
  return out;
}

/** Compact the scraped signals into a text block for an LLM prompt (bounded). */
export function summarizeSignals(sig: BusinessSignals): string {
  if (!sig.scraped) return "";
  const parts: string[] = [];
  if (sig.website) parts.push(`WEBSITE (${sig.website.pages} pages): ${sig.website.title}\n${sig.website.text.slice(0, 4000)}`);
  if (sig.instagram) {
    const p = sig.instagram;
    parts.push(`INSTAGRAM @${p.handle}${p.followers ? ` (${p.followers} followers)` : ""}: ${p.bio ?? ""}\nRecent posts:\n${p.posts.slice(0, 12).map((x) => `- ${x.caption.slice(0, 160)} [${x.likes ?? 0} likes]`).join("\n")}`);
  }
  return parts.join("\n\n");
}

// (re-exported so the pitch engine can reference the catalog type without a second import)
export type { WobbleService };
