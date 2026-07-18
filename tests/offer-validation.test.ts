import { describe, expect, it } from "vitest";
import {
  OFFER_VALIDATION_DIMENSIONS,
  computeOverallScore,
  decideVerdict,
  parseDimensionResult,
  type DimensionScore,
} from "@/lib/domain/offer-validation";
import { runOfferValidation, type OfferValidationStore } from "@/lib/offer-validation";
import type { OfferRow } from "@/lib/domain/offer";
import type { OfferValidationRunRow, OfferValidationDimensionRow } from "@/lib/domain/offer-validation";

const OFFER: OfferRow = {
  id: "offer_1", name: "AI Receptionist System", hypothesis: "SMBs lose leads to missed calls", status: "draft",
  audience: "Pakistani SMBs", promise: "Never miss a lead again", priceModel: "monthly retainer", priceCents: 0,
  currency: "USD", deliverables: ["24/7 AI receptionist", "WhatsApp follow-up"], experiments: [], score: 0,
  resultNotes: null, owner: null, createdBy: "Moiz", archivedAt: null, metadata: {}, createdAt: new Date(), updatedAt: new Date(),
} as unknown as OfferRow;

function memStore(initialRuns = 0): OfferValidationStore & { runs: OfferValidationRunRow[]; dims: OfferValidationDimensionRow[] } {
  const runs: OfferValidationRunRow[] = [];
  const dims: OfferValidationDimensionRow[] = [];
  let priorCount = initialRuns;
  return {
    runs, dims,
    async getOffer(id) { return id === OFFER.id ? OFFER : null; },
    async countRuns() { return priorCount + runs.length; },
    async insertRun(row) { runs.push(row); priorCount = 0; },
    async insertDimensions(rows) { dims.push(...rows); },
    async listRuns() { return runs; },
    async getDimensions(runId) { return dims.filter((d) => d.runId === runId); },
  };
}

describe("Offer Validation Lab — domain", () => {
  it("has exactly 11 dimension agents with unique slugs + agentSlugs", () => {
    expect(OFFER_VALIDATION_DIMENSIONS).toHaveLength(11);
    expect(new Set(OFFER_VALIDATION_DIMENSIONS.map((d) => d.slug)).size).toBe(11);
    expect(new Set(OFFER_VALIDATION_DIMENSIONS.map((d) => d.agentSlug)).size).toBe(11);
  });

  it("computeOverallScore is a weighted average, clamped, normalized by scored weights", () => {
    const all80: DimensionScore[] = OFFER_VALIDATION_DIMENSIONS.map((d) => ({ slug: d.slug, score: 80, rationale: "x" }));
    expect(computeOverallScore(all80)).toBe(80);
    // clamps out-of-range + ignores unknown dimensions
    expect(computeOverallScore([{ slug: "market_demand", score: 150, rationale: "x" }, { slug: "not_a_dim", score: 0, rationale: "x" }])).toBe(100);
    expect(computeOverallScore([])).toBe(0);
  });

  it("decideVerdict applies the go/pivot/kill thresholds", () => {
    expect(decideVerdict(70)).toBe("go");
    expect(decideVerdict(69)).toBe("pivot");
    expect(decideVerdict(45)).toBe("pivot");
    expect(decideVerdict(44)).toBe("kill");
  });

  it("parseDimensionResult accepts strict + fenced JSON, rejects garbage", () => {
    expect(parseDimensionResult("market_demand", '{"score": 72, "rationale": "solid"}').score).toBe(72);
    expect(parseDimensionResult("market_demand", 'Here you go:\n```json\n{"score": 60.6, "rationale": "ok", "evidenceRefs": ["https://x"]}\n```').score).toBe(61);
    expect(() => parseDimensionResult("market_demand", "no json here")).toThrow(/unparseable/);
  });
});

describe("Offer Validation Lab — service", () => {
  const provider = async (input: { messages: { content: unknown }[] }) => {
    // Score varies a bit by dimension name so weakest/strongest differ.
    const text = String(input.messages[1].content);
    const score = text.includes("Pricing") ? 40 : text.includes("Market Demand") ? 90 : 75;
    return { text: `{"score": ${score}, "rationale": "grounded reasoning", "evidenceRefs": []}` };
  };

  it("scores all 11 dimensions, rolls up a verdict, persists a versioned run", async () => {
    const store = memStore();
    const evidenceCalls: string[] = [];
    const res = await runOfferValidation(OFFER.id, {
      store,
      runProvider: provider,
      searchEvidence: async (i) => { evidenceCalls.push(i.query); return { query: i.query, answer: null, results: [{ title: "T", url: "https://x", content: "demand is rising", score: 0.9 }], creditsUsed: 1 }; },
      actor: "Moiz", now: new Date("2026-07-18T00:00:00Z"), recordAudit: async () => {},
    });
    expect(res.dimensions).toHaveLength(11);
    expect(store.runs).toHaveLength(1);
    expect(res.run.version).toBe(1);
    expect(res.run.evidenceCount).toBe(1);
    expect(evidenceCalls).toHaveLength(1); // exactly ONE governed evidence search, shared across dimensions
    expect(["go", "pivot", "kill"]).toContain(res.run.verdict);
    // pricing scored lowest → it should be the weakest in the summary
    expect(res.run.summary).toContain("pricing_viability");
  });

  it("versions re-validations (v2) instead of overwriting", async () => {
    const store = memStore(1); // pretend one prior run exists
    const res = await runOfferValidation(OFFER.id, { store, runProvider: provider, searchEvidence: null, actor: "Moiz", recordAudit: async () => {} });
    expect(res.run.version).toBe(2);
    expect(res.run.evidenceCount).toBe(0); // searchEvidence null → skipped, still validates
  });

  it("throws (never fabricates) when the offer does not exist", async () => {
    await expect(runOfferValidation("nope", { store: memStore(), runProvider: provider, searchEvidence: null, recordAudit: async () => {} })).rejects.toThrow(/not found/);
  });
});
