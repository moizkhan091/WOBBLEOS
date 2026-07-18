import { describe, expect, it } from "vitest";
import {
  runContentIntelligence,
  type ContentIntelligenceStore,
  type ContentIntelligenceDeps,
  type GatheredContext,
} from "@/lib/content-intelligence";
import { buildIntelligenceRunRow, intelligenceCadenceKey, DEFAULT_INTELLIGENCE_OBJECTIVE, type ContentIntelligenceRunRow } from "@/lib/domain/content-intelligence";
import type { ContentTopicRow } from "@/lib/domain/content-topics";

/**
 * Content Intelligence orchestrator — gathers the ACTIVE sources each run and asks the strategist team for a
 * fresh topic bank, recording a founder-visible run. These prove the run lifecycle (running → completed with
 * counts), the failure path (run marked failed, error recorded, rethrown), and the daily cadence key.
 */

function memStore(): ContentIntelligenceStore & { runs: ContentIntelligenceRunRow[] } {
  const runs: ContentIntelligenceRunRow[] = [];
  return {
    runs,
    async insertRun(r) { runs.push(r); },
    async updateRun(id, fields) { const i = runs.findIndex((x) => x.id === id); if (i >= 0) runs[i] = { ...runs[i], ...fields }; },
    async getRun(id) { return runs.find((x) => x.id === id) ?? null; },
    async listRuns(limit) { return runs.slice(0, limit); },
  };
}

const gathered: GatheredContext = { sourceRefs: ["src_1", "src_2", "src_3"], knowledgeTopics: ["missed call text back", "n8n"], brain: [{ title: "Positioning", content: "anti-agency" }] };

function fakeTopic(id: string): ContentTopicRow {
  return { id, pillar: "buildable_automations", title: id, angle: "", teachingJob: "", targetAudience: "", rationale: "", funnelStage: "awareness", suggestedPlatform: "instagram", suggestedFormat: "carousel", freshness: "fresh", demandKeyword: null, demandVolume: null, trendVelocity: null, competitorGap: 0, founderJobValue: 0, noveltyScore: 0, proofAvailable: false, overallScore: 50, scoreBreakdown: { founderJobValue: 0, noveltyScore: 0, competitorGap: 0, demand: 0, trendVelocity: 50, proofAvailable: 0, freshness: 75 }, sourceRefs: [], status: "pending_review", reviewedBy: null, reviewedAt: null, reviewNotes: null, intelligenceRunId: null, promotedGraphRunId: null, promotedPacketId: null, createdByAgent: null, model: null, metadata: {}, createdAt: new Date(), updatedAt: new Date() };
}

describe("content intelligence run lifecycle", () => {
  it("gathers active sources, generates a topic bank, and completes the run with counts", async () => {
    const store = memStore();
    let genInput: unknown = null;
    const deps: ContentIntelligenceDeps = {
      store,
      gatherContext: async () => gathered,
      generate: async (input) => { genInput = input; return [fakeTopic("t1"), fakeTopic("t2")]; },
      recordAudit: async () => {},
    };
    const res = await runContentIntelligence({ trigger: "manual", requestedBy: "moiz" }, deps);
    expect(res.sourceCount).toBe(3);
    expect(res.topicCount).toBe(2);
    // the generator received the gathered context + the run id (so topics link back to the run)
    expect((genInput as { sourceRefs: string[] }).sourceRefs).toEqual(["src_1", "src_2", "src_3"]);
    expect((genInput as { intelligenceRunId: string }).intelligenceRunId).toBe(res.runId);
    // the run row is completed with the counts
    const run = store.runs[0];
    expect(run.status).toBe("completed");
    expect(run.sourceCount).toBe(3);
    expect(run.topicCount).toBe(2);
    expect(run.finishedAt).not.toBeNull();
  });

  it("uses the standing objective when none is supplied", async () => {
    const store = memStore();
    let seenObjective = "";
    await runContentIntelligence(
      { trigger: "scheduled", requestedBy: "scheduler" },
      { store, gatherContext: async (o) => { seenObjective = o; return gathered; }, generate: async () => [], recordAudit: async () => {} },
    );
    expect(seenObjective).toBe(DEFAULT_INTELLIGENCE_OBJECTIVE);
    expect(store.runs[0].trigger).toBe("scheduled");
  });

  it("marks the run FAILED (with the error) and rethrows when generation fails", async () => {
    const store = memStore();
    const boom = new Error("strategist unparseable");
    await expect(
      runContentIntelligence(
        { trigger: "manual", requestedBy: "moiz" },
        { store, gatherContext: async () => gathered, generate: async () => { throw boom; }, recordAudit: async () => {} },
      ),
    ).rejects.toThrow("strategist unparseable");
    const run = store.runs[0];
    expect(run.status).toBe("failed");
    expect(run.error).toBe("strategist unparseable");
    expect(run.finishedAt).not.toBeNull();
  });
});

describe("intelligence cadence + row", () => {
  it("cadence key is stable within a UTC day, distinct across days", () => {
    const d1 = new Date("2026-07-18T02:00:00Z");
    const d2 = new Date("2026-07-18T23:59:00Z");
    const d3 = new Date("2026-07-19T00:01:00Z");
    expect(intelligenceCadenceKey(d1)).toBe(intelligenceCadenceKey(d2));
    expect(intelligenceCadenceKey(d1)).not.toBe(intelligenceCadenceKey(d3));
    expect(intelligenceCadenceKey(d1)).toContain("content.intelligence:2026-07-18");
  });

  it("a new run row starts running with zero counts", () => {
    const row = buildIntelligenceRunRow({ trigger: "manual", objective: "x", requestedBy: "moiz" });
    expect(row.status).toBe("running");
    expect(row.sourceCount).toBe(0);
    expect(row.topicCount).toBe(0);
    expect(row.finishedAt).toBeNull();
  });
});
