/**
 * FREE keyword research — no key, no budget. Google Autocomplete (Suggest) + DuckDuckGo autocomplete return
 * REAL related search queries people actually type (with intent modifiers: "for small business", "for dentist",
 * "roi calculator", "software"). This is the fallback for DataForSEO: it gives real demand SIGNALS + long-tail
 * expansion even when the paid provider is unavailable/unverified. Never fabricates — a fetch failure returns
 * empty, and the caller degrades gracefully.
 */

export const GOOGLE_SUGGEST_ENDPOINT = "https://suggestqueries.google.com/complete/search";
export const DDG_SUGGEST_ENDPOINT = "https://duckduckgo.com/ac/";

export interface KeywordResearchDeps {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Buyer-intent modifiers — their presence in autocomplete signals commercial demand, not just curiosity. */
const COMMERCIAL_INTENT = ["for business", "for small business", "software", "service", "cost", "price", "pricing", "near me", "best", "vs", "template", "tool", "how to", "for dentist", "for clinic", "for agency", "roi", "automation"];

async function fetchWithTimeout(url: string, deps: KeywordResearchDeps): Promise<Response | null> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), deps.timeoutMs ?? 12000);
  try {
    return await fetchImpl(url, { signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 (WOBBLE-OS keyword research)" } });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function extractSuggestions(json: unknown): string[] {
  // Google/DDG list shape: [seed, [suggestions...], ...]. DDG object shape: [{phrase}...].
  if (Array.isArray(json)) {
    const second = json[1];
    if (Array.isArray(second)) return second.map((s) => (typeof s === "string" ? s : String((s as { value?: string })?.value ?? ""))).filter(Boolean);
    // object-list shape
    if (json.every((x) => x && typeof x === "object" && "phrase" in (x as object))) return json.map((x) => String((x as { phrase?: string }).phrase ?? "")).filter(Boolean);
  }
  return [];
}

/** Google autocomplete suggestions for a seed (real queries that begin with / relate to it). */
export async function googleSuggest(seed: string, deps: KeywordResearchDeps = {}): Promise<string[]> {
  const q = encodeURIComponent(seed.trim());
  if (!q) return [];
  const resp = await fetchWithTimeout(`${GOOGLE_SUGGEST_ENDPOINT}?client=chrome&hl=en&q=${q}`, deps);
  if (!resp || !resp.ok) return [];
  try {
    return extractSuggestions(await resp.json());
  } catch {
    return [];
  }
}

/** DuckDuckGo autocomplete — a second free source (different index, catches what Google misses). */
export async function ddgSuggest(seed: string, deps: KeywordResearchDeps = {}): Promise<string[]> {
  const q = encodeURIComponent(seed.trim());
  if (!q) return [];
  const resp = await fetchWithTimeout(`${DDG_SUGGEST_ENDPOINT}?q=${q}&type=list`, deps);
  if (!resp || !resp.ok) return [];
  try {
    return extractSuggestions(await resp.json());
  } catch {
    return [];
  }
}

/** Merged, deduped related keywords across both free sources (lowercased, seed excluded). */
export async function relatedKeywords(seed: string, deps: KeywordResearchDeps = {}): Promise<string[]> {
  const [g, d] = await Promise.all([googleSuggest(seed, deps), ddgSuggest(seed, deps)]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...g, ...d]) {
    const k = s.trim().toLowerCase();
    if (!k || k === seed.trim().toLowerCase() || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export interface FreeDemandSignal {
  /** 0-100 proxy for demand when no paid volume is available. */
  signal: number;
  isSuggested: boolean; // the keyword itself is a real autocomplete query
  related: string[]; // real related queries (long-tail expansion)
  commercialIntent: boolean; // buyer-intent modifiers present
}

/**
 * A FREE 0-100 demand signal (proxy for search volume). Real queries that spawn many autocomplete variants
 * with buyer-intent modifiers indicate genuine, monetisable demand — the exact thing DataForSEO measures with
 * a number, approximated from what people actually type. Used as the demand fallback in topic scoring.
 */
export async function freeDemandSignal(keyword: string, deps: KeywordResearchDeps = {}): Promise<FreeDemandSignal> {
  const related = await relatedKeywords(keyword, deps);
  const isSuggested = related.length > 0;
  const commercialIntent = related.some((r) => COMMERCIAL_INTENT.some((m) => r.includes(m)));
  const signal = clamp(related.length * 8 + (commercialIntent ? 25 : 0) + (related.length >= 8 ? 20 : 0));
  return { signal, isSuggested, related, commercialIntent };
}
