import { loadEngagedSwitches, assertNotKilled } from "@/lib/security-governance/enforcement";
import { assertProviderAllowance, recordExternalSpend, withExternalProviderSlot, type ProviderBudgetDeps } from "@/lib/provider-budget";
import type { KillSwitchRow } from "@/lib/domain/security-governance";

/**
 * Tavily web-search adapter — a GOVERNED external provider. Every search passes the same controls as any
 * paid call: provider kill switch → budget allowance (credits) → max-1 concurrency, then records the
 * actual credits to the durable ledger. A basic search costs ~1 credit, an advanced ~2; we budget on the
 * pessimistic bound. The key is read from the environment (UAT secrets), never logged.
 */

export const TAVILY_ENDPOINT = "https://api.tavily.com/search";
export const TAVILY_PROVIDER = "tavily";

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string | null;
}

export interface TavilySearchInput {
  query: string;
  /** The named acceptance/ledger item this search advances — required (no spend without a reason). */
  item: string;
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
  includeAnswer?: boolean;
  actor?: string;
}

export interface TavilySearchOutput {
  query: string;
  answer: string | null;
  results: TavilyResult[];
  creditsUsed: number;
}

export interface TavilyDeps extends ProviderBudgetDeps {
  fetchImpl?: typeof fetch;
  apiKey?: string;
  loadKillSwitches?: () => Promise<KillSwitchRow[]>;
  now?: Date;
}

export class TavilyNotConfiguredError extends Error {
  readonly name = "TavilyNotConfiguredError";
  constructor() {
    super("Tavily is not configured (TAVILY_API_KEY absent) — search is blocked, never faked");
  }
}

/** basic → 1 credit, advanced → 2 credits (Tavily pricing). The pessimistic bound gates cumulative spend. */
function worstCaseCredits(depth: "basic" | "advanced"): number {
  return depth === "advanced" ? 2 : 1;
}

export async function tavilySearch(input: TavilySearchInput, deps: TavilyDeps = {}): Promise<TavilySearchOutput> {
  const apiKey = deps.apiKey ?? process.env.TAVILY_API_KEY;
  if (!apiKey) throw new TavilyNotConfiguredError();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const depth = input.searchDepth ?? "basic";

  // Governance BEFORE the paid call.
  const switches: KillSwitchRow[] = deps.loadKillSwitches ? await deps.loadKillSwitches() : await loadEngagedSwitches();
  assertNotKilled(switches, "provider", TAVILY_PROVIDER);
  const worst = worstCaseCredits(depth);
  try {
    await assertProviderAllowance(TAVILY_PROVIDER, worst, deps);
  } catch (e) {
    await recordExternalSpend({ provider: TAVILY_PROVIDER, item: input.item, estimatedMaxCost: worst, actualCost: 0, unit: "credits", result: "rejected_budget", actor: input.actor }, deps).catch(() => {});
    throw e;
  }

  return withExternalProviderSlot(async () => {
    const started = Date.now();
    let out: TavilySearchOutput;
    try {
      const resp = await fetchImpl(TAVILY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: input.query,
          search_depth: depth,
          max_results: Math.min(Math.max(input.maxResults ?? 5, 1), 10),
          include_answer: input.includeAnswer ?? true,
        }),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Tavily search failed (${resp.status}): ${body.slice(0, 200)}`);
      }
      const json = (await resp.json()) as { answer?: string | null; results?: Array<{ title?: string; url?: string; content?: string; score?: number; published_date?: string | null }> };
      out = {
        query: input.query,
        answer: json.answer ?? null,
        results: (json.results ?? []).map((r) => ({ title: r.title ?? "", url: r.url ?? "", content: r.content ?? "", score: r.score ?? 0, publishedDate: r.published_date ?? null })),
        creditsUsed: worst, // Tavily bills per search by depth; record the depth's credit cost
      };
    } catch (err) {
      await recordExternalSpend({ provider: TAVILY_PROVIDER, item: input.item, estimatedMaxCost: worst, actualCost: 0, unit: "credits", latencyMs: Date.now() - started, result: "failed", actor: input.actor, metadata: { error: err instanceof Error ? err.message : String(err) } }, deps).catch(() => {});
      throw err;
    }
    await recordExternalSpend({ provider: TAVILY_PROVIDER, item: input.item, estimatedMaxCost: worst, actualCost: out.creditsUsed, unit: "credits", latencyMs: Date.now() - started, result: "succeeded", actor: input.actor, metadata: { results: out.results.length, depth } }, deps).catch(() => {});
    return out;
  }, deps);
}
