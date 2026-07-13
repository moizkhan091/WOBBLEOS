/**
 * Continuous-research INGESTION ADAPTER REGISTRY. A source is collected by the FIRST applicable adapter. Two of the
 * adapters are fully UNBLOCKED (no external paid provider): `inline_text` (a manual note / pasted content / supplied
 * transcript is chunked directly) and `http_web` / `rss_feed` (a plain HTTP fetch + HTML/feed strip). The Apify
 * adapters are preferred for social + rich web WHEN a key is configured, but web ingestion no longer HARD-depends on
 * Apify. Every adapter is pure over an injectable `IngestionContext`, so proofs/tests inject deterministic fetchers.
 */

export interface SourceLike {
  sourceType?: string | null;
  url?: string | null;
  metadata?: Record<string, unknown> | null;
  extractedData?: unknown;
}

export interface IngestionContext {
  /** Plain HTTP text fetch (default: native fetch + HTML strip). Injected deterministically in proofs. */
  fetchText?: (url: string) => Promise<string>;
  /** Apify web scrape (optional; only used by the apify_web adapter when configured). */
  scrapeWebsite?: (url: string) => Promise<{ text: string }>;
  /** Apify social scrape (optional; only used by the apify_social adapter when configured). */
  scrapeInstagram?: (url: string, limit: number) => Promise<{ posts: Array<{ caption?: string | null }> }>;
  apifyConfigured?: boolean;
  /** Max chars a single chunk holds (default 1200) + max chunks (default 40). */
  chunkSize?: number;
  maxChunks?: number;
}

export interface IngestionAdapter {
  slug: string;
  applies(source: SourceLike): boolean;
  collect(source: SourceLike, ctx: IngestionContext): Promise<{ chunks: string[]; note?: string }>;
}

export function chunkText(text: string, size = 1200, max = 40): string[] {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  for (let i = 0; i < clean.length && chunks.length < max; i += size) chunks.push(clean.slice(i, i + size));
  return chunks;
}

/** Strip HTML/XML tags + scripts/styles to plain text (for the unblocked fetch adapters). */
export function stripHtml(html: string): string {
  return (html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull inline content a source already carries (manual note / pasted text / supplied transcript). */
export function inlineContentOf(source: SourceLike): string | null {
  const md = (source.metadata ?? {}) as Record<string, unknown>;
  for (const key of ["content", "rawText", "text", "body", "transcript", "note"]) {
    const v = md[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  if (typeof source.extractedData === "string" && source.extractedData.trim()) return source.extractedData;
  return null;
}

const isSocial = (s: SourceLike) => /instagram|tiktok|social|reel|carousel/i.test(`${s.sourceType ?? ""} ${s.url ?? ""}`);
const looksLikeFeed = (s: SourceLike) => (s.sourceType ?? "").includes("rss") || /\.(rss|xml)(\?|$)|\/feed\/?($|\?)|\/rss\/?($|\?)/i.test(s.url ?? "");

async function defaultFetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "WobbleOS-Ingest/1.0" }, redirect: "follow" });
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  return await res.text();
}

/** 1) INLINE TEXT — a source that already carries its content. Fully unblocked, no network. */
const inlineTextAdapter: IngestionAdapter = {
  slug: "inline_text",
  applies: (s) => inlineContentOf(s) !== null,
  collect: async (s, ctx) => ({ chunks: chunkText(inlineContentOf(s) ?? "", ctx.chunkSize, ctx.maxChunks), note: "inline content" }),
};

/** 2) RSS/ATOM FEED — plain HTTP fetch + regex item extraction. Unblocked. */
const rssFeedAdapter: IngestionAdapter = {
  slug: "rss_feed",
  applies: (s) => !!s.url && looksLikeFeed(s),
  collect: async (s, ctx) => {
    const fetchText = ctx.fetchText ?? defaultFetchText;
    const xml = await fetchText(s.url as string);
    const items = [...xml.matchAll(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi)].map((m) => m[0]);
    const parts: string[] = [];
    for (const item of items.slice(0, ctx.maxChunks ?? 40)) {
      const title = (item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "");
      const desc = (item.match(/<(?:description|summary|content)[^>]*>([\s\S]*?)<\/(?:description|summary|content)>/i)?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "");
      const text = stripHtml(`${title}. ${desc}`);
      if (text.trim()) parts.push(text);
    }
    // Fall back to a whole-document strip if there were no parseable items.
    return { chunks: parts.length ? parts.slice(0, ctx.maxChunks ?? 40) : chunkText(stripHtml(xml), ctx.chunkSize, ctx.maxChunks), note: `${items.length} feed items` };
  },
};

/** 3) APIFY SOCIAL — preferred for social handles when a key is configured. */
const apifySocialAdapter: IngestionAdapter = {
  slug: "apify_social",
  applies: (s) => !!s.url && isSocial(s),
  collect: async (s, ctx) => {
    if (!ctx.apifyConfigured || !ctx.scrapeInstagram) return { chunks: [], note: "apify not configured" };
    const ig = await ctx.scrapeInstagram(s.url as string, 12);
    return { chunks: ig.posts.map((p) => p.caption).filter((c): c is string => Boolean(c && c.trim())).slice(0, ctx.maxChunks ?? 40), note: "apify social" };
  },
};

/** 4) APIFY WEB — preferred rich web scrape when a key is configured. */
const apifyWebAdapter: IngestionAdapter = {
  slug: "apify_web",
  applies: (s) => !!s.url,
  collect: async (s, ctx) => {
    if (!ctx.apifyConfigured || !ctx.scrapeWebsite) return { chunks: [], note: "apify not configured" };
    const web = await ctx.scrapeWebsite(s.url as string);
    return { chunks: chunkText(web.text, ctx.chunkSize, ctx.maxChunks), note: "apify web" };
  },
};

/** 5) HTTP WEB — the UNBLOCKED web fallback (native fetch + HTML strip). Always applicable to any URL. */
const httpWebAdapter: IngestionAdapter = {
  slug: "http_web",
  applies: (s) => !!s.url,
  collect: async (s, ctx) => {
    const fetchText = ctx.fetchText ?? defaultFetchText;
    const html = await fetchText(s.url as string);
    return { chunks: chunkText(stripHtml(html), ctx.chunkSize, ctx.maxChunks), note: "http web" };
  },
};

/** Priority: inline (no network) → feed → apify social/web (if configured) → plain http fallback. */
export const INGESTION_ADAPTERS: IngestionAdapter[] = [
  inlineTextAdapter,
  rssFeedAdapter,
  apifySocialAdapter,
  apifyWebAdapter,
  httpWebAdapter,
];

/** Pick the first adapter that applies AND (for the apify adapters) is actually usable given the context. */
export function selectIngestionAdapter(source: SourceLike, ctx: IngestionContext): IngestionAdapter | null {
  for (const adapter of INGESTION_ADAPTERS) {
    if (!adapter.applies(source)) continue;
    // Skip the apify adapters when no key — the http_web fallback (later in the list) handles the URL instead.
    if ((adapter.slug === "apify_social" || adapter.slug === "apify_web") && !ctx.apifyConfigured) continue;
    return adapter;
  }
  return null;
}
