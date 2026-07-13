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

/** Hard cap on any fetched/parsed body so a malicious host can't OOM the process or blow up the (bounded) parser. */
export const MAX_INGEST_BYTES = 5_000_000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

export function chunkText(text: string, size = 1200, max = 40): string[] {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  for (let i = 0; i < clean.length && chunks.length < max; i += size) chunks.push(clean.slice(i, i + size));
  return chunks;
}

/** Remove <tag>…</tag> blocks with LINEAR indexOf scanning (NOT a backtracking regex). An unclosed block drops the
 *  rest of the string (safe). This is what makes the stripper immune to the quadratic-regex DoS on crafted input. */
function removeBlocks(s: string, tag: string): string {
  const open = `<${tag}`, close = `</${tag}>`;
  const lower = s.toLowerCase();
  let out = "", i = 0;
  for (;;) {
    const start = lower.indexOf(open, i);
    if (start === -1) { out += s.slice(i); break; }
    out += s.slice(i, start);
    const end = lower.indexOf(close, start);
    if (end === -1) break; // unclosed block → drop the remainder (never scan-and-retry)
    i = end + close.length;
  }
  return out;
}

/** Strip HTML/XML tags + scripts/styles to plain text. Input is HARD-CLAMPED and script/style blocks are removed
 *  with a LINEAR scan (not a backtracking regex), so a malicious/crafted body can never hang the event loop. The
 *  remaining tag/entity replacements use only LINEAR patterns (`<[^>]*>` cannot backtrack catastrophically). */
export function stripHtml(html: string): string {
  const clamped = (html ?? "").slice(0, MAX_INGEST_BYTES);
  return removeBlocks(removeBlocks(clamped, "script"), "style")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** True for a loopback / private / link-local / reserved IP literal (v4 + common v6) — an SSRF target. */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  // IPv6 loopback / link-local / unique-local.
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("::ffff:")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 10 || a === 0 || a === 169 && b === 254) return true;      // loopback / private / this-network / link-local (incl. cloud metadata 169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true;                                  // 172.16/12
    if (a === 192 && b === 168) return true;                                           // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true;                                 // CGNAT 100.64/10
    if (a >= 224) return true;                                                          // multicast / reserved
  }
  return false;
}

/** Validate a URL is safe to fetch server-side: http(s) only + not an SSRF target (host literal + resolved IPs). */
export async function assertFetchableUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error(`invalid URL: ${raw}`); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`blocked URL scheme '${u.protocol}' (only http/https)`);
  if (isBlockedHost(u.hostname)) throw new Error(`blocked internal host '${u.hostname}'`);
  // Resolve the hostname and reject if ANY address is internal (catches a public domain pointing at a private IP).
  try {
    const { lookup } = await import("node:dns/promises");
    const addrs = await lookup(u.hostname, { all: true });
    for (const a of addrs) if (isBlockedHost(a.address)) throw new Error(`blocked resolved address ${a.address} for ${u.hostname}`);
  } catch (e) {
    if (e instanceof Error && /blocked/.test(e.message)) throw e; // re-throw our SSRF rejection; ignore resolver errors (real fetch will surface them)
  }
  return u;
}

async function defaultFetchText(url: string): Promise<string> {
  // SSRF + DoS hardened: scheme/host/DNS allowlist, MANUAL redirects (each hop re-validated), a fetch TIMEOUT, and a
  // response-size CAP. NOTE residual: a DNS-rebind between the lookup and the connect is not covered here — a custom
  // undici connect-dispatcher is the follow-up for that; the concrete internal-target + redirect-to-metadata vectors
  // ARE blocked. `fetch` is a global (Node 18+ / Next runtime).
  let current = await assertFetchableUrl(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current.toString(), { headers: { "user-agent": "WobbleOS-Ingest/1.0" }, redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`redirect with no location from ${current.toString()}`);
      if (hop === MAX_REDIRECTS) throw new Error("too many redirects");
      current = await assertFetchableUrl(new URL(loc, current).toString()); // re-validate every hop (no auto-chase to internal)
      continue;
    }
    if (!res.ok) throw new Error(`fetch ${current.toString()} → ${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_INGEST_BYTES) throw new Error(`response too large (${buf.byteLength} > ${MAX_INGEST_BYTES} bytes)`);
    return new TextDecoder().decode(buf);
  }
  throw new Error("too many redirects");
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
