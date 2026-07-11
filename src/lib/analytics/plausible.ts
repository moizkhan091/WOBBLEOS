// Website Analytics — a real, env-gated Plausible client. When PLAUSIBLE_API_KEY +
// PLAUSIBLE_SITE_ID are set it returns live traffic for the site; otherwise it reports
// `configured: false` with what's needed. We never fabricate traffic numbers.

export interface PlausibleConfig {
  apiKey?: string;
  siteId?: string;
  host?: string;
}

const DEFAULT_PLAUSIBLE_HOST = "https://plausible.io";

/**
 * Validate PLAUSIBLE_HOST before it becomes the base of every request URL. Parse it, require https
 * (http allowed only for localhost self-host), and reduce it to a clean origin so a stray path/query
 * or a non-http(s) scheme can't be smuggled into the outbound URL. Falls back to the default on junk.
 */
export function normalizePlausibleHost(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_PLAUSIBLE_HOST;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    console.error(`PLAUSIBLE_HOST is not a valid URL ('${trimmed}') — falling back to ${DEFAULT_PLAUSIBLE_HOST}`);
    return DEFAULT_PLAUSIBLE_HOST;
  }
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  const schemeOk = url.protocol === "https:" || (url.protocol === "http:" && isLocalhost);
  if (!schemeOk) {
    console.error(`PLAUSIBLE_HOST must be https (http only for localhost); got '${url.protocol}' — falling back to ${DEFAULT_PLAUSIBLE_HOST}`);
    return DEFAULT_PLAUSIBLE_HOST;
  }
  return url.origin; // scheme + host(+port) only — drops any path/query/fragment
}

export function readPlausibleConfig(env: Record<string, string | undefined> = process.env): PlausibleConfig {
  return {
    apiKey: env.PLAUSIBLE_API_KEY?.trim() || undefined,
    siteId: env.PLAUSIBLE_SITE_ID?.trim() || undefined,
    host: normalizePlausibleHost(env.PLAUSIBLE_HOST),
  };
}

export function plausibleConfigured(cfg: PlausibleConfig = readPlausibleConfig()): boolean {
  return Boolean(cfg.apiKey && cfg.siteId);
}

// Plausible's fixed date-range tokens. "custom" is intentionally excluded — it requires a `date`
// param we don't pass. Anything outside this set is rejected so a user-supplied `period` can't smuggle
// extra `&`-delimited query params into the Plausible API URL (parameter injection).
const PLAUSIBLE_PERIODS = new Set(["day", "7d", "30d", "month", "6mo", "12mo"]);

/** Normalize/allowlist a caller-supplied period; unknown values fall back to the safe default. */
export function normalizePlausiblePeriod(period: string | undefined): string {
  const p = (period ?? "").trim();
  return PLAUSIBLE_PERIODS.has(p) ? p : "30d";
}

export interface WebstatsResult {
  configured: boolean;
  needs?: string[];
  siteId?: string;
  period?: string;
  aggregate?: { visitors?: number; pageviews?: number; bounceRate?: number; visitDuration?: number };
  topPages?: Array<{ page: string; visitors?: number; pageviews?: number }>;
  topSources?: Array<{ source: string; visitors?: number }>;
  error?: string;
}

interface Deps {
  fetchImpl?: typeof fetch;
  config?: PlausibleConfig;
}

/** Fetch live traffic from Plausible. Honest: returns configured:false (never fake data) when unset. */
export async function getWebstats(period = "30d", deps: Deps = {}): Promise<WebstatsResult> {
  const cfg = deps.config ?? readPlausibleConfig();
  if (!plausibleConfigured(cfg)) {
    const needs: string[] = [];
    if (!cfg.apiKey) needs.push("PLAUSIBLE_API_KEY");
    if (!cfg.siteId) needs.push("PLAUSIBLE_SITE_ID");
    return { configured: false, needs };
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  const base = cfg.host ?? "https://plausible.io";
  const headers = { Authorization: `Bearer ${cfg.apiKey}` };
  // Allowlisted + encoded — never let the raw caller value reach the URL.
  const normalizedPeriod = normalizePlausiblePeriod(period);
  const safePeriod = encodeURIComponent(normalizedPeriod);
  const q = (path: string) => `${base}/api/v1/stats/${path}&site_id=${encodeURIComponent(cfg.siteId!)}`;

  try {
    const [aggRes, pagesRes, srcRes] = await Promise.all([
      fetchImpl(q(`aggregate?period=${safePeriod}&metrics=visitors,pageviews,bounce_rate,visit_duration`), { headers }),
      fetchImpl(q(`breakdown?period=${safePeriod}&property=event:page&limit=10&metrics=visitors,pageviews`), { headers }),
      fetchImpl(q(`breakdown?period=${safePeriod}&property=visit:source&limit=8&metrics=visitors`), { headers }),
    ]);
    if (!aggRes.ok) return { configured: true, error: `Plausible ${aggRes.status}: ${await aggRes.text().catch(() => aggRes.statusText)}` };
    const agg = (await aggRes.json()) as { results?: Record<string, { value?: number }> };
    const pages = pagesRes.ok ? ((await pagesRes.json()) as { results?: Array<Record<string, unknown>> }).results ?? [] : [];
    const sources = srcRes.ok ? ((await srcRes.json()) as { results?: Array<Record<string, unknown>> }).results ?? [] : [];
    return {
      configured: true,
      siteId: cfg.siteId,
      period: normalizedPeriod,
      aggregate: {
        visitors: agg.results?.visitors?.value,
        pageviews: agg.results?.pageviews?.value,
        bounceRate: agg.results?.bounce_rate?.value,
        visitDuration: agg.results?.visit_duration?.value,
      },
      topPages: pages.map((p) => ({ page: String(p.page ?? ""), visitors: Number(p.visitors ?? 0), pageviews: Number(p.pageviews ?? 0) })),
      topSources: sources.map((s) => ({ source: String(s.source ?? "Direct"), visitors: Number(s.visitors ?? 0) })),
    };
  } catch (error) {
    return { configured: true, error: error instanceof Error ? error.message : "unknown error" };
  }
}
