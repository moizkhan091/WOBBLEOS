import { loadEngagedSwitches, assertNotKilled } from "@/lib/security-governance/enforcement";
import { assertProviderAllowance, recordExternalSpend, withExternalProviderSlot, type ProviderBudgetDeps } from "@/lib/provider-budget";
import type { KillSwitchRow } from "@/lib/domain/security-governance";

/**
 * DataForSEO adapter — a GOVERNED external provider for keyword demand, keyword ideas, and Google Trends
 * velocity. Every call passes the same controls as any paid provider: kill switch → USD budget allowance →
 * max-1 concurrency, then records the ACTUAL cost (DataForSEO returns it per request) to the durable ledger.
 * The account balance is tiny ($1), so the budget stop is set well under it and worst-case bounds gate
 * cumulative spend. Basic auth (base64 "login:password") is read from the environment, never logged.
 *
 * NOTE: DataForSEO data endpoints require the account to be VERIFIED in the DataForSEO panel first. Until
 * then they return status 40104 — this adapter surfaces that as a clear DataForSeoAccountError (records a
 * zero-cost failure), never a faked result.
 */

export const DATAFORSEO_BASE = "https://api.dataforseo.com/v3";
export const DATAFORSEO_PROVIDER = "dataforseo";

/** Worst-case USD per call (pessimistic — gates cumulative spend against the stop threshold). */
export const DATAFORSEO_WORST_CASE = {
  search_volume: 0.05,
  keyword_ideas: 0.03,
  trends: 0.01,
} as const;

export interface DataForSeoDeps extends ProviderBudgetDeps {
  fetchImpl?: typeof fetch;
  /** base64 of "login:password" for HTTP Basic auth. Defaults to process.env.DATAFORSEO_AUTH. */
  auth?: string;
  loadKillSwitches?: () => Promise<KillSwitchRow[]>;
}

export class DataForSeoNotConfiguredError extends Error {
  readonly name = "DataForSeoNotConfiguredError";
  constructor() {
    super("DataForSEO is not configured (DATAFORSEO_AUTH absent) — keyword/trend data is blocked, never faked");
  }
}

/** Raised when DataForSEO refuses the call (e.g. 40104 account-not-verified, or a task-level error). */
export class DataForSeoAccountError extends Error {
  readonly name = "DataForSeoAccountError";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface DfsEnvelope {
  status_code: number;
  status_message: string;
  cost?: number;
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    cost?: number;
    result?: unknown[] | null;
  }>;
}

interface GovernedCallInput {
  path: string;
  taskPayload: unknown;
  worstCase: number;
  /** The named acceptance/ledger item this call advances — required (no spend without a reason). */
  item: string;
  actor?: string;
  metadata?: Record<string, unknown>;
}

/** The single governed POST every DataForSEO function routes through. Returns the first task's result array. */
async function governedCall(input: GovernedCallInput, deps: DataForSeoDeps): Promise<{ result: unknown[]; cost: number }> {
  const auth = deps.auth ?? process.env.DATAFORSEO_AUTH;
  if (!auth) throw new DataForSeoNotConfiguredError();
  const fetchImpl = deps.fetchImpl ?? fetch;

  // Governance BEFORE the paid call.
  const switches: KillSwitchRow[] = deps.loadKillSwitches ? await deps.loadKillSwitches() : await loadEngagedSwitches();
  assertNotKilled(switches, "provider", DATAFORSEO_PROVIDER);
  try {
    await assertProviderAllowance(DATAFORSEO_PROVIDER, input.worstCase, deps);
  } catch (e) {
    await recordExternalSpend({ provider: DATAFORSEO_PROVIDER, item: input.item, estimatedMaxCost: input.worstCase, actualCost: 0, unit: "usd", result: "rejected_budget", actor: input.actor }, deps).catch(() => {});
    throw e;
  }

  return withExternalProviderSlot(async () => {
    const started = Date.now();
    try {
      const resp = await fetchImpl(`${DATAFORSEO_BASE}${input.path}`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify(input.taskPayload),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`DataForSEO ${input.path} failed (${resp.status}): ${body.slice(0, 200)}`);
      }
      const json = (await resp.json()) as DfsEnvelope;
      const cost = Number(json.cost ?? 0);
      const task = (json.tasks ?? [])[0];
      const taskStatus = task?.status_code ?? 0;
      // DataForSEO returns HTTP 200 even for account/task errors — the real status is in the JSON body.
      if (json.status_code >= 40000 || (taskStatus && taskStatus >= 40000)) {
        const status = taskStatus >= 40000 ? taskStatus : json.status_code;
        const message = task?.status_message ?? json.status_message ?? "unknown DataForSEO error";
        await recordExternalSpend({ provider: DATAFORSEO_PROVIDER, item: input.item, estimatedMaxCost: input.worstCase, actualCost: cost, unit: "usd", latencyMs: Date.now() - started, result: "failed", actor: input.actor, metadata: { path: input.path, status, message } }, deps).catch(() => {});
        throw new DataForSeoAccountError(`DataForSEO ${input.path}: ${status} ${message}`, status);
      }
      const result = (task?.result ?? []) as unknown[];
      await recordExternalSpend({ provider: DATAFORSEO_PROVIDER, item: input.item, estimatedMaxCost: input.worstCase, actualCost: cost, unit: "usd", latencyMs: Date.now() - started, result: "succeeded", actor: input.actor, metadata: { path: input.path, ...(input.metadata ?? {}) } }, deps).catch(() => {});
      return { result, cost };
    } catch (err) {
      if (err instanceof DataForSeoAccountError) throw err;
      await recordExternalSpend({ provider: DATAFORSEO_PROVIDER, item: input.item, estimatedMaxCost: input.worstCase, actualCost: 0, unit: "usd", latencyMs: Date.now() - started, result: "failed", actor: input.actor, metadata: { path: input.path, error: err instanceof Error ? err.message : String(err) } }, deps).catch(() => {});
      throw err;
    }
  }, deps);
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── Search volume (Google Ads keyword demand) ─────────────────────────────────────────────────────────

export interface KeywordVolume {
  keyword: string;
  searchVolume: number | null;
  competition: string | null;
  competitionIndex: number | null;
  cpc: number | null;
  monthlySearches: { year: number; month: number; searchVolume: number }[];
}

export interface SearchVolumeInput {
  keywords: string[];
  item: string;
  /** e.g. "United States" | "Pakistan". Omitted = worldwide. */
  locationName?: string;
  /** default "English". */
  languageName?: string;
  actor?: string;
}

function mapKeywordVolume(row: Record<string, unknown>): KeywordVolume {
  const monthly = Array.isArray(row?.monthly_searches) ? (row.monthly_searches as Record<string, unknown>[]) : [];
  return {
    keyword: String(row?.keyword ?? ""),
    searchVolume: num(row?.search_volume),
    competition: (row?.competition as string) ?? null,
    competitionIndex: num(row?.competition_index),
    cpc: num(row?.cpc),
    monthlySearches: monthly.map((m) => ({ year: Number(m?.year ?? 0), month: Number(m?.month ?? 0), searchVolume: Number(m?.search_volume ?? 0) })),
  };
}

/** Real Google search demand for a list of keywords (Google Ads data). */
export async function searchVolume(input: SearchVolumeInput, deps: DataForSeoDeps = {}): Promise<KeywordVolume[]> {
  const keywords = input.keywords.map((k) => k.trim()).filter(Boolean).slice(0, 700);
  if (!keywords.length) return [];
  const task: Record<string, unknown> = { keywords, language_name: input.languageName ?? "English" };
  if (input.locationName) task.location_name = input.locationName;
  const { result } = await governedCall(
    { path: "/keywords_data/google_ads/search_volume/live", taskPayload: [task], worstCase: DATAFORSEO_WORST_CASE.search_volume, item: input.item, actor: input.actor, metadata: { keywords: keywords.length } },
    deps,
  );
  return (result as Record<string, unknown>[]).map(mapKeywordVolume);
}

// ── Keyword ideas (DataForSEO Labs) ───────────────────────────────────────────────────────────────────

export interface KeywordIdea {
  keyword: string;
  searchVolume: number | null;
  competition: string | null;
  cpc: number | null;
}

export interface KeywordIdeasInput {
  seed: string;
  item: string;
  limit?: number;
  /** Labs endpoints REQUIRE a location. Defaults to "United States". */
  locationName?: string;
  languageName?: string;
  actor?: string;
}

/** Related keyword ideas around a seed, each with demand — for topic discovery + white-space. */
export async function keywordIdeas(input: KeywordIdeasInput, deps: DataForSeoDeps = {}): Promise<KeywordIdea[]> {
  const seed = input.seed.trim();
  if (!seed) return [];
  const task: Record<string, unknown> = {
    keywords: [seed],
    location_name: input.locationName ?? "United States",
    language_name: input.languageName ?? "English",
    limit: Math.min(Math.max(input.limit ?? 50, 1), 200),
  };
  const { result } = await governedCall(
    { path: "/dataforseo_labs/google/keyword_ideas/live", taskPayload: [task], worstCase: DATAFORSEO_WORST_CASE.keyword_ideas, item: input.item, actor: input.actor, metadata: { seed } },
    deps,
  );
  const first = (result?.[0] ?? {}) as { items?: Record<string, unknown>[] };
  const items = Array.isArray(first.items) ? first.items : [];
  return items.map((it) => {
    const info = (it?.keyword_info ?? {}) as Record<string, unknown>;
    return { keyword: String(it?.keyword ?? ""), searchVolume: num(info?.search_volume), competition: (info?.competition as string) ?? null, cpc: num(info?.cpc) };
  });
}

// ── Google Trends (velocity signal) ───────────────────────────────────────────────────────────────────

export interface TrendPoint {
  date: string;
  value: number;
}

export interface KeywordTrend {
  keyword: string;
  interestOverTime: TrendPoint[];
  /** Fractional momentum: recent-window avg vs prior-window avg. >0 rising, <0 cooling. */
  velocity: number;
  latest: number;
  peak: number;
}

export interface TrendsInput {
  keywords: string[];
  item: string;
  locationName?: string;
  /** e.g. "past_12_months" (default), "past_90_days". */
  timeRange?: string;
  actor?: string;
}

/** Recent-window average vs the prior window — the "trend velocity" momentum signal. */
export function computeTrendVelocity(series: TrendPoint[]): number {
  if (series.length < 4) return 0;
  const q = Math.max(1, Math.floor(series.length / 4));
  const recent = series.slice(-q);
  const prior = series.slice(-2 * q, -q);
  const avg = (a: TrendPoint[]) => (a.length ? a.reduce((s, p) => s + p.value, 0) / a.length : 0);
  const pr = avg(prior);
  const rc = avg(recent);
  if (pr === 0) return rc > 0 ? 1 : 0;
  return (rc - pr) / pr;
}

/** Google Trends interest-over-time + a computed velocity, for up to 5 keywords. */
export async function trendsExplore(input: TrendsInput, deps: DataForSeoDeps = {}): Promise<KeywordTrend[]> {
  const keywords = input.keywords.map((k) => k.trim()).filter(Boolean).slice(0, 5);
  if (!keywords.length) return [];
  const task: Record<string, unknown> = { keywords, time_range: input.timeRange ?? "past_12_months" };
  if (input.locationName) task.location_name = input.locationName;
  const { result } = await governedCall(
    { path: "/keywords_data/google_trends/explore/live", taskPayload: [task], worstCase: DATAFORSEO_WORST_CASE.trends, item: input.item, actor: input.actor, metadata: { keywords: keywords.length } },
    deps,
  );
  const first = (result?.[0] ?? {}) as { items?: Record<string, unknown>[] };
  const items = Array.isArray(first.items) ? first.items : [];
  const graph = items.find((it) => it?.type === "google_trends_graph") ?? items[0];
  const data = Array.isArray(graph?.data) ? (graph!.data as Record<string, unknown>[]) : [];
  return keywords.map((keyword, idx) => {
    const series: TrendPoint[] = data
      .map((d) => ({ date: String(d?.date_from ?? d?.timestamp ?? ""), value: Number((Array.isArray(d?.values) ? (d.values as unknown[])[idx] : 0) ?? 0) }))
      .filter((p) => Number.isFinite(p.value));
    const latest = series.length ? series[series.length - 1].value : 0;
    const peak = series.reduce((m, p) => Math.max(m, p.value), 0);
    return { keyword, interestOverTime: series, velocity: computeTrendVelocity(series), latest, peak };
  });
}
