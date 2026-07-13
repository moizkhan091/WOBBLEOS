import { describe, expect, it } from "vitest";
import { runDreamer } from "@/lib/intelligence/dreamer";
import type { IntelligenceStore } from "@/lib/intelligence";
import type { ApprovalStore } from "@/lib/approvals";

function makeDeps(insights: unknown[], items: unknown[]) {
  const suggestions: unknown[] = [];
  const store = {
    listIntelligenceItems: async () => items as never,
    listIntelligenceInsights: async () => insights as never,
    insertIntelligenceSuggestion: async (row: unknown) => { suggestions.push(row); },
  } as unknown as IntelligenceStore;
  const approvalStore = {
    insert: async () => {},
  } as unknown as ApprovalStore;
  return { store, approvalStore, suggestions };
}

describe("runDreamer", () => {
  it("no-ops with no intelligence", async () => {
    const { store, approvalStore } = makeDeps([], []);
    const res = await runDreamer({}, { store, approvalStore, recordAudit: async () => {} });
    expect(res.proposed).toBe(0);
    expect(res.note).toContain("No intelligence");
  });

  it("proposes pending suggestions grounded in evidence ids", async () => {
    const insights = [{ id: "in_1", insightType: "competitor_pattern", scope: "wobble", clientId: null, approvalStatus: "approved", freshnessStatus: "current", confidence: "0.8", impactScore: 80, title: "POV reels win", summary: "POV format wins", recommendation: "make POV reels" }];
    const items = [{ id: "it_1", itemType: "competitor_reel", scope: "wobble", approvalStatus: "approved", title: "reel", summary: "480k" }];
    const { store, approvalStore, suggestions } = makeDeps(insights, items);
    const res = await runDreamer({}, {
      store, approvalStore, recordAudit: async () => {},
      runProvider: async () => ({ text: JSON.stringify({ suggestions: [
        { suggestionType: "content_experiment", title: "Test 2 POV reels this week", rationale: "POV pattern is winning for rivals", proposedAction: "Script + shoot 2 POV reels", evidenceInsightIds: ["in_1", "ghost"], evidenceItemIds: ["it_1"], priority: "high", confidence: 0.8 },
      ] }), run: { id: "run_1" } }),
    });
    expect(res.proposed).toBe(1);
    const s = suggestions[0] as { approvalStatus: string; createdByAgent: string; evidenceInsightIds: string[] };
    expect(s.approvalStatus).toBe("pending");
    expect(s.createdByAgent).toBe("dreamer");
    expect(s.evidenceInsightIds).toEqual(["in_1"]); // ghost dropped
  });

  it("CONTEXT OS: injects the scope's approved trusted-context block as a distinct system message (separate from the untrusted EVIDENCE)", async () => {
    const insights = [{ id: "in_1", insightType: "competitor_pattern", scope: "wobble", clientId: null, approvalStatus: "approved", freshnessStatus: "current", confidence: "0.8", impactScore: 80, title: "t", summary: "s", recommendation: "r" }];
    const items = [{ id: "it_1", itemType: "competitor_reel", scope: "wobble", approvalStatus: "approved", title: "reel", summary: "480k" }];
    const { store, approvalStore } = makeDeps(insights, items);
    let seen: string[] = [];
    await runDreamer({ scope: "wobble" }, {
      store, approvalStore, recordAudit: async () => {},
      retrieveTrustedContext: async () => "APPROVED WOBBLE CONTEXT: - We never do discounting",
      runProvider: async (i) => { seen = i.messages.map((m) => String(m.content)); return { text: JSON.stringify({ suggestions: [] }), run: { id: "r" } }; },
    });
    expect(seen.some((m) => m.includes("APPROVED WOBBLE CONTEXT"))).toBe(true);
    // trusted facts and the untrusted EVIDENCE fence are NOT in the same message (no conflation)
    expect(seen.some((m) => m.includes("APPROVED WOBBLE CONTEXT") && m.includes("EVIDENCE"))).toBe(false);
  });

  it("CONTEXT OS: no retrieval seam → no trusted-context block (default off)", async () => {
    const insights = [{ id: "in_1", insightType: "competitor_pattern", scope: "wobble", clientId: null, approvalStatus: "approved", freshnessStatus: "current", confidence: "0.8", impactScore: 80, title: "t", summary: "s", recommendation: "r" }];
    const items = [{ id: "it_1", itemType: "competitor_reel", scope: "wobble", approvalStatus: "approved", title: "reel", summary: "480k" }];
    const { store, approvalStore } = makeDeps(insights, items);
    let seen: string[] = [];
    await runDreamer({}, { store, approvalStore, recordAudit: async () => {}, runProvider: async (i) => { seen = i.messages.map((m) => String(m.content)); return { text: JSON.stringify({ suggestions: [] }), run: { id: "r" } }; } });
    expect(seen.some((m) => m.includes("APPROVED"))).toBe(false);
  });
});
