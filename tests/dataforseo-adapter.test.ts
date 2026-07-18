import { describe, expect, it, vi } from "vitest";
import {
  searchVolume,
  keywordIdeas,
  trendsExplore,
  computeTrendVelocity,
  DataForSeoNotConfiguredError,
  DataForSeoAccountError,
  DATAFORSEO_WORST_CASE,
} from "@/lib/dataforseo";
import { ProviderBudgetExceededError } from "@/lib/provider-budget";

/**
 * DataForSEO is a GOVERNED external provider (keyword demand / ideas / trends). Every call clears the kill
 * switch and the USD budget before spending, is truthfully blocked without a credential, and surfaces the
 * account-not-verified (40104) refusal as a typed error rather than a faked result. The $1 balance means the
 * budget stop ($0.30) must reject before any drain — these prove the guards fire and the parser is correct.
 */
const noKill = async () => [];

function fetchReturning(body: unknown) {
  return vi.fn(async () => ({ ok: true, json: async () => body }) as unknown as Response);
}

describe("DataForSEO adapter (governed)", () => {
  it("is truthfully BLOCKED without auth (never faked)", async () => {
    await expect(searchVolume({ keywords: ["ai receptionist"], item: "test" }, { auth: undefined })).rejects.toBeInstanceOf(
      DataForSeoNotConfiguredError,
    );
  });

  it("REJECTS on budget exceedance — the paid HTTP call is never made", async () => {
    const fetchImpl = vi.fn();
    await expect(
      searchVolume(
        { keywords: ["ai receptionist"], item: "topic-stats" },
        { auth: "x", fetchImpl: fetchImpl as unknown as typeof fetch, getSpent: async () => 0.3, loadKillSwitches: noKill },
      ),
    ).rejects.toBeInstanceOf(ProviderBudgetExceededError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("REJECTS when a provider kill switch is engaged — no HTTP call", async () => {
    const fetchImpl = vi.fn();
    await expect(
      trendsExplore(
        { keywords: ["ai receptionist"], item: "trend" },
        {
          auth: "x",
          fetchImpl: fetchImpl as unknown as typeof fetch,
          getSpent: async () => 0,
          loadKillSwitches: async () => [{ targetType: "provider", targetRef: "dataforseo", state: "disabled", reason: "freeze" }],
        },
      ),
    ).rejects.toThrow(/kill switch on provider:dataforseo/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("surfaces account-not-verified (40104) as DataForSeoAccountError — never a faked result", async () => {
    const body = { status_code: 40104, status_message: "Please verify your account before using the API.", cost: 0, tasks: [{ status_code: null, result: null }] };
    await expect(
      searchVolume(
        { keywords: ["ai receptionist"], item: "topic-stats" },
        { auth: "x", fetchImpl: fetchReturning(body) as unknown as typeof fetch, getSpent: async () => 0, loadKillSwitches: noKill },
      ),
    ).rejects.toBeInstanceOf(DataForSeoAccountError);
  });

  it("parses search-volume rows (budget clear)", async () => {
    const body = {
      status_code: 20000,
      cost: 0.0075,
      tasks: [
        {
          status_code: 20000,
          result: [
            { keyword: "ai receptionist", search_volume: 1300, competition: "LOW", competition_index: 12, cpc: 2.1, monthly_searches: [{ year: 2026, month: 6, search_volume: 1300 }] },
          ],
        },
      ],
    };
    const out = await searchVolume(
      { keywords: ["ai receptionist"], item: "topic-stats", locationName: "United States" },
      { auth: "x", fetchImpl: fetchReturning(body) as unknown as typeof fetch, getSpent: async () => 0, loadKillSwitches: noKill },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ keyword: "ai receptionist", searchVolume: 1300, competition: "LOW", cpc: 2.1 });
    expect(out[0].monthlySearches[0].searchVolume).toBe(1300);
  });

  it("parses keyword ideas from the Labs items shape", async () => {
    const body = {
      status_code: 20000,
      cost: 0.01,
      tasks: [{ status_code: 20000, result: [{ items: [{ keyword: "ai phone agent", keyword_info: { search_volume: 480, competition: "MEDIUM", cpc: 3.4 } }] }] }],
    };
    const out = await keywordIdeas(
      { seed: "ai receptionist", item: "topic-discovery" },
      { auth: "x", fetchImpl: fetchReturning(body) as unknown as typeof fetch, getSpent: async () => 0, loadKillSwitches: noKill },
    );
    expect(out).toEqual([{ keyword: "ai phone agent", searchVolume: 480, competition: "MEDIUM", cpc: 3.4 }]);
  });

  it("parses trends and computes rising velocity per keyword", async () => {
    const data = [
      { date_from: "2026-01-01", values: [10] },
      { date_from: "2026-02-01", values: [12] },
      { date_from: "2026-03-01", values: [40] },
      { date_from: "2026-04-01", values: [60] },
    ];
    const body = { status_code: 20000, cost: 0.001, tasks: [{ status_code: 20000, result: [{ items: [{ type: "google_trends_graph", data }] }] }] };
    const out = await trendsExplore(
      { keywords: ["ai receptionist"], item: "trend" },
      { auth: "x", fetchImpl: fetchReturning(body) as unknown as typeof fetch, getSpent: async () => 0, loadKillSwitches: noKill },
    );
    expect(out[0].keyword).toBe("ai receptionist");
    expect(out[0].latest).toBe(60);
    expect(out[0].peak).toBe(60);
    expect(out[0].velocity).toBeGreaterThan(0); // rising
  });

  it("computeTrendVelocity is positive for a rising series, negative for a cooling one", () => {
    const rising = [10, 12, 40, 60].map((v, i) => ({ date: String(i), value: v }));
    const cooling = [80, 60, 20, 5].map((v, i) => ({ date: String(i), value: v }));
    expect(computeTrendVelocity(rising)).toBeGreaterThan(0);
    expect(computeTrendVelocity(cooling)).toBeLessThan(0);
  });

  it("declares pessimistic worst-case bounds under the tiny balance", () => {
    expect(DATAFORSEO_WORST_CASE.search_volume).toBeLessThan(0.3);
    expect(DATAFORSEO_WORST_CASE.trends).toBeLessThanOrEqual(DATAFORSEO_WORST_CASE.search_volume);
  });
});
