import { describe, expect, it } from "vitest";
import { runIntelligenceAnalyst } from "@/lib/intelligence/analyst";
import type { IntelligenceStore } from "@/lib/intelligence";

function storeWithItems(items: Array<{ id: string } & Record<string, unknown>>): { store: IntelligenceStore; insights: unknown[] } {
  const insights: unknown[] = [];
  const store = {
    listIntelligenceItems: async () => items as never,
    insertIntelligenceInsight: async (row: unknown) => { insights.push(row); },
  } as unknown as IntelligenceStore;
  return { store, insights };
}

describe("runIntelligenceAnalyst", () => {
  it("no-ops with fewer than 2 observations", async () => {
    const { store } = storeWithItems([{ id: "a" }]);
    const res = await runIntelligenceAnalyst({}, { store, recordAudit: async () => {} });
    expect(res.proposedInsights).toBe(0);
    expect(res.note).toContain("Not enough");
  });

  it("proposes pending insights and keeps only real evidence ids", async () => {
    const items = [
      { id: "it_1", itemType: "competitor_reel", platform: "instagram", actorName: "rival", title: "POV reel", summary: "480k views", extracted: { hook: "never miss a call" }, metrics: { views: 480000 } },
      { id: "it_2", itemType: "competitor_post", platform: "instagram", actorName: "rival", title: "carousel", summary: "proof post", extracted: {}, metrics: {} },
    ];
    const { store, insights } = storeWithItems(items);
    const res = await runIntelligenceAnalyst({}, {
      store, recordAudit: async () => {},
      runProvider: async () => ({ text: JSON.stringify({ insights: [
        { insightType: "competitor_pattern", title: "POV reels win", summary: "POV format + call hook works", recommendation: "test 2 POV reels", evidenceItemIds: ["it_1", "ghost_id"], appliesToModules: ["content_command", "social"], impactScore: 82, confidence: 0.8 },
      ] }), run: { id: "run_1" } }),
    });
    expect(res.proposedInsights).toBe(1);
    const created = insights[0] as { approvalStatus: string; evidenceItemIds: string[]; createdByAgent: string };
    expect(created.approvalStatus).toBe("pending");
    expect(created.createdByAgent).toBe("intelligence_analyst");
    expect(created.evidenceItemIds).toEqual(["it_1"]); // ghost_id dropped (not a real item)
  });

  it("CONTEXT OS: injects the scope's approved trusted-context block (separate from the untrusted observations) when the seam is wired", async () => {
    const items = [{ id: "it_1", itemType: "competitor_reel", title: "x", summary: "y", extracted: {}, metrics: {} }, { id: "it_2", itemType: "competitor_post", title: "z", summary: "w", extracted: {}, metrics: {} }];
    const { store } = storeWithItems(items);
    let seen: string[] = [];
    await runIntelligenceAnalyst({ scope: "wobble" }, {
      store, recordAudit: async () => {},
      retrieveTrustedContext: async () => "APPROVED WOBBLE CONTEXT: - We only serve service businesses",
      runProvider: async (i) => { seen = i.messages.map((m) => String(m.content)); return { text: JSON.stringify({ insights: [] }), run: { id: "r" } }; },
    });
    // the trusted block is present AND it is a distinct system message (not folded into the untrusted-data fence)
    expect(seen.some((m) => m.includes("APPROVED WOBBLE CONTEXT"))).toBe(true);
    expect(seen.some((m) => m.includes("APPROVED WOBBLE CONTEXT") && m.includes("UNTRUSTED_OBSERVED_DATA"))).toBe(false);
  });

  it("CONTEXT OS: no retrieval seam → no trusted-context block (default off)", async () => {
    const { store } = storeWithItems([{ id: "a", title: "t", summary: "s", extracted: {}, metrics: {} }, { id: "b", title: "t2", summary: "s2", extracted: {}, metrics: {} }]);
    let seen: string[] = [];
    await runIntelligenceAnalyst({}, { store, recordAudit: async () => {}, runProvider: async (i) => { seen = i.messages.map((m) => String(m.content)); return { text: JSON.stringify({ insights: [] }), run: { id: "r" } }; } });
    expect(seen.some((m) => m.includes("APPROVED"))).toBe(false);
  });

  it("throws on unparseable model output", async () => {
    const { store } = storeWithItems([{ id: "a" }, { id: "b" }]);
    await expect(runIntelligenceAnalyst({}, { store, recordAudit: async () => {}, runProvider: async () => ({ text: "not json", run: { id: "r" } }) })).rejects.toThrow();
  });
});
