import { describe, expect, it, vi } from "vitest";
import { tavilySearch, TavilyNotConfiguredError } from "@/lib/tavily";
import { apifyRunActor, ApifyNotConfiguredError } from "@/lib/apify";
import { ProviderBudgetExceededError } from "@/lib/provider-budget";

/**
 * Tavily + Apify are GOVERNED external providers: every call clears the kill switch and the budget before
 * spending, and is truthfully blocked (never faked) without a credential. These prove the guards fire —
 * the paid HTTP call is never made on a rejection.
 */
describe("Tavily search adapter (governed)", () => {
  const okFetch = vi.fn(async () => ({ ok: true, json: async () => ({ answer: "AI OS demand is rising", results: [{ title: "T", url: "https://x", content: "c", score: 0.9 }] }) }) as unknown as Response);

  it("is truthfully BLOCKED without a key (never faked)", async () => {
    await expect(tavilySearch({ query: "x", item: "test" }, { apiKey: undefined })).rejects.toBeInstanceOf(TavilyNotConfiguredError);
  });

  it("REJECTS on budget exceedance — the paid HTTP call is never made", async () => {
    const fetchImpl = vi.fn();
    await expect(
      tavilySearch({ query: "x", item: "offer-lab" }, { apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, getSpent: async () => 380, loadKillSwitches: async () => [] }),
    ).rejects.toBeInstanceOf(ProviderBudgetExceededError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("REJECTS when a provider kill switch is engaged — no HTTP call", async () => {
    const fetchImpl = vi.fn();
    await expect(
      tavilySearch({ query: "x", item: "offer-lab" }, { apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, getSpent: async () => 0, loadKillSwitches: async () => [{ targetType: "provider", targetRef: "tavily", state: "disabled", reason: "freeze" }] }),
    ).rejects.toThrow(/kill switch on provider:tavily/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("runs a governed search and returns parsed results (budget clear)", async () => {
    const out = await tavilySearch({ query: "AI OS demand", item: "offer-lab", maxResults: 3 }, { apiKey: "k", fetchImpl: okFetch as unknown as typeof fetch, getSpent: async () => 0, loadKillSwitches: async () => [] });
    expect(out.results).toHaveLength(1);
    expect(out.results[0].url).toBe("https://x");
    expect(out.creditsUsed).toBe(1); // basic depth = 1 credit
    expect(okFetch).toHaveBeenCalledOnce();
  });
});

describe("Apify actor-run adapter (governed)", () => {
  it("is truthfully BLOCKED without a token", async () => {
    await expect(apifyRunActor({ actorId: "apify/rag-web-browser", input: {}, maxItems: 5, item: "test" }, { token: undefined })).rejects.toBeInstanceOf(ApifyNotConfiguredError);
  });

  it("REJECTS on budget exceedance — no actor run", async () => {
    const fetchImpl = vi.fn();
    await expect(
      apifyRunActor({ actorId: "apify/rag-web-browser", input: {}, maxItems: 5, item: "research" }, { token: "t", fetchImpl: fetchImpl as unknown as typeof fetch, getSpent: async () => 1.0, loadKillSwitches: async () => [] }),
    ).rejects.toBeInstanceOf(ProviderBudgetExceededError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("HARD-caps items at 5 even if more are requested/returned", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ i }));
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => many }) as unknown as Response);
    const out = await apifyRunActor({ actorId: "apify/rag-web-browser", input: { q: "x" }, maxItems: 20, item: "research" }, { token: "t", fetchImpl: fetchImpl as unknown as typeof fetch, getSpent: async () => 0, loadKillSwitches: async () => [] });
    expect(out.itemCount).toBe(5); // capped despite 20 returned
  });
});
