// Website Analytics — a real, env-gated Plausible client. When PLAUSIBLE_API_KEY +
// PLAUSIBLE_SITE_ID are set it returns live traffic for the site; otherwise it reports
// `configured: false` with what's needed. We never fabricate traffic numbers.

export interface PlausibleConfig {
  apiKey?: string;
  siteId?: string;
  host?: string;
}

export function readPlausibleConfig(env: Record<string, string | undefined> = process.env): PlausibleConfig {
  return {
    apiKey: env.PLAUSIBLE_API_KEY?.trim() || undefined,
    siteId: env.PLAUSIBLE_SITE_ID?.trim() || undefined,
    host: env.PLAUSIBLE_HOST?.trim() || "https://plausible.io",
  };
}

export function plausibleConfigured(cfg: PlausibleConfig = readPlausibleConfig()): boolean {
  return Boolean(cfg.apiKey && cfg.siteId);
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
  const q = (path: string) => `${base}/api/v1/stats/${path}&site_id=${encodeURIComponent(cfg.siteId!)}`;

  try {
    const [aggRes, pagesRes, srcRes] = await Promise.all([
      fetchImpl(q(`aggregate?period=${period}&metrics=visitors,pageviews,bounce_rate,visit_duration`), { headers }),
      fetchImpl(q(`breakdown?period=${period}&property=event:page&limit=10&metrics=visitors,pageviews`), { headers }),
      fetchImpl(q(`breakdown?period=${period}&property=visit:source&limit=8&metrics=visitors`), { headers }),
    ]);
    if (!aggRes.ok) return { configured: true, error: `Plausible ${aggRes.status}: ${await aggRes.text().catch(() => aggRes.statusText)}` };
    const agg = (await aggRes.json()) as { results?: Record<string, { value?: number }> };
    const pages = pagesRes.ok ? ((await pagesRes.json()) as { results?: Array<Record<string, unknown>> }).results ?? [] : [];
    const sources = srcRes.ok ? ((await srcRes.json()) as { results?: Array<Record<string, unknown>> }).results ?? [] : [];
    return {
      configured: true,
      siteId: cfg.siteId,
      period,
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
