import { describe, expect, it, vi } from "vitest";
import { googleSuggest, ddgSuggest, relatedKeywords, freeDemandSignal } from "@/lib/keyword-research";

/**
 * FREE keyword research (Google/DDG autocomplete) — the DataForSEO fallback. Real related queries, never
 * fabricated: a fetch failure returns empty. The demand signal rewards genuine, buyer-intent demand.
 */
function fetchReturning(body: unknown) {
  return vi.fn(async () => ({ ok: true, json: async () => body }) as unknown as Response);
}

describe("free keyword research", () => {
  it("googleSuggest parses the [seed,[suggestions]] shape", async () => {
    const f = fetchReturning(["ai receptionist", ["ai receptionist for small business", "ai receptionist for dentist"]]);
    const out = await googleSuggest("ai receptionist", { fetchImpl: f as unknown as typeof fetch });
    expect(out).toContain("ai receptionist for dentist");
    expect(out).toHaveLength(2);
  });

  it("ddgSuggest parses the list shape too", async () => {
    const f = fetchReturning(["n8n", ["n8n automation templates", "n8n vs make"]]);
    const out = await ddgSuggest("n8n", { fetchImpl: f as unknown as typeof fetch });
    expect(out).toContain("n8n vs make");
  });

  it("relatedKeywords merges both sources, dedups, and excludes the seed", async () => {
    const f = fetchReturning(["ai receptionist", ["ai receptionist", "AI Receptionist Software", "ai receptionist software"]]);
    const out = await relatedKeywords("ai receptionist", { fetchImpl: f as unknown as typeof fetch });
    expect(out).not.toContain("ai receptionist"); // the seed itself is excluded
    expect(out.filter((k) => k === "ai receptionist software")).toHaveLength(1); // deduped case-insensitively
  });

  it("freeDemandSignal is higher with buyer intent + many suggestions", async () => {
    const commercial = fetchReturning(["x", ["x software", "x for small business", "x pricing", "x best tool", "x near me", "x service", "x cost", "x for dentist", "x roi calculator"]]);
    const thin = fetchReturning(["y", ["y meaning"]]);
    const hot = await freeDemandSignal("x", { fetchImpl: commercial as unknown as typeof fetch });
    const cold = await freeDemandSignal("y", { fetchImpl: thin as unknown as typeof fetch });
    expect(hot.commercialIntent).toBe(true);
    expect(hot.signal).toBeGreaterThan(cold.signal);
    expect(hot.isSuggested).toBe(true);
  });

  it("degrades to empty on fetch failure — never fabricates", async () => {
    const boom = vi.fn(async () => { throw new Error("network down"); });
    expect(await googleSuggest("x", { fetchImpl: boom as unknown as typeof fetch })).toEqual([]);
    const sig = await freeDemandSignal("x", { fetchImpl: boom as unknown as typeof fetch });
    expect(sig.signal).toBe(0);
    expect(sig.isSuggested).toBe(false);
  });
});
