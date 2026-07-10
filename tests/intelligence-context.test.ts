import { describe, expect, it } from "vitest";
import { getIntelligenceContextBlock } from "@/lib/intelligence/context-block";
import type { IntelligenceStore } from "@/lib/intelligence";

// Minimal store returning approved items/insights for the retrieval bridge.
function store(items: unknown[], insights: unknown[]): IntelligenceStore {
  return {
    insertResearchTarget: async () => {}, listResearchTargets: async () => [],
    insertIntelligenceItem: async () => {}, listIntelligenceItems: async () => items as never,
    insertIntelligenceInsight: async () => {}, listIntelligenceInsights: async () => insights as never,
    insertIntelligenceSuggestion: async () => {}, insertExperiment: async () => {},
    recordOutputUsage: async () => {},
  } as unknown as IntelligenceStore;
}

describe("getIntelligenceContextBlock", () => {
  it("formats approved items + insights into a grounding block and returns their ids", async () => {
    const items = [{ id: "it_1", itemType: "competitor_reel", scope: "wobble", clientId: null, approvalStatus: "approved", freshnessStatus: "current", confidence: "0.8", collectedAt: new Date("2026-07-01"), title: "Reel A", summary: "hits 400k", extracted: { hook: "POV: never miss a call" } }];
    const insights = [{ id: "in_1", insightType: "competitor_pattern", scope: "wobble", clientId: null, approvalStatus: "approved", freshnessStatus: "current", confidence: "0.8", impactScore: 80, title: "POV reels win", summary: "POV format outperforms", recommendation: "make 2 POV reels/wk" }];
    const block = await getIntelligenceContextBlock("social_content", {}, { store: store(items, insights) });
    expect(block.hasIntelligence).toBe(true);
    expect(block.itemIds).toEqual(["it_1"]);
    expect(block.insightIds).toEqual(["in_1"]);
    expect(block.block).toContain("CURRENT WOBBLE INTELLIGENCE");
    expect(block.block).toContain("POV reels win");
    expect(block.block).toContain("never miss a call");
  });
  it("returns an empty block (not fake data) when there is no approved intelligence", async () => {
    const block = await getIntelligenceContextBlock("blog_seo", {}, { store: store([], []) });
    expect(block.hasIntelligence).toBe(false);
    expect(block.block).toBe("");
    expect(block.itemIds).toEqual([]);
  });
  it("degrades gracefully to empty when retrieval throws (never breaks a generation)", async () => {
    const throwing = { listIntelligenceItems: async () => { throw new Error("db down"); }, listIntelligenceInsights: async () => [] } as unknown as IntelligenceStore;
    const block = await getIntelligenceContextBlock("strategy", {}, { store: throwing });
    expect(block.hasIntelligence).toBe(false);
    expect(block.gaps.length).toBeGreaterThan(0);
  });
});
