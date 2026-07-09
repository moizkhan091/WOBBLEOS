import { describe, expect, it } from "vitest";
import type { ContentTrackRow } from "@/lib/domain/content-command";
import {
  assembleContentPacketInput,
  collectProvenance,
  coerceFormat,
  coercePlatform,
  parseJsonObject,
  creativeBriefSchema,
  type ContentScore,
  type CopyDraft,
  type CreativeBrief,
  type EvidencePack,
} from "@/lib/domain/content-graph";
import { runContentGraph, type ContentGraphDeps, type ContentPacketCreationResult } from "@/lib/content-graph";

// ---------------------------------------------------------------- domain

describe("parseJsonObject", () => {
  it("parses a schema-valid object (with ```json fences)", () => {
    const brief = parseJsonObject('```json\n{"topic":"t","angle":"a","platform":"instagram","format":"carousel","targetAudience":"aud","objective":"o","rationale":"r"}\n```', creativeBriefSchema);
    expect(brief?.platform).toBe("instagram");
  });
  it("returns null on invalid JSON and on schema mismatch", () => {
    expect(parseJsonObject("not json", creativeBriefSchema)).toBeNull();
    expect(parseJsonObject('{"topic":"t"}', creativeBriefSchema)).toBeNull();
  });
});

describe("collectProvenance", () => {
  const notes = [
    { id: "know_1", title: "T1", content: "C1", noteType: "insight", sourceIds: ["s1"], sourceId: "s1" },
    { id: "know_2", title: "T2", content: "C2", noteType: "claim", sourceIds: ["s2"], sourceId: "s2" },
  ];
  const chunks = [{ id: "c1", sourceId: "s1", content: "x" }];
  it("maps cited indexes to ids and gathers the sources behind them", () => {
    const p = collectProvenance(
      [
        { point: "p1", noteIndexes: [0, 0], chunkIndexes: [0] },
        { point: "p2", noteIndexes: [1], chunkIndexes: [] },
      ],
      notes,
      chunks,
    );
    expect(p.insightIds).toEqual(["know_1", "know_2"]);
    expect(p.chunkIds).toEqual(["c1"]);
    expect(p.sourceIds.sort()).toEqual(["s1", "s2"]);
  });
});

describe("assembleContentPacketInput", () => {
  const brief: CreativeBrief = { topic: "t", angle: "a", platform: "instagram", format: "carousel", targetAudience: "aud", objective: "o", rationale: "r" };
  const copy: CopyDraft = { hook: "H", mainCopy: "M", caption: "C", cta: "CTA", carouselSlides: [{ heading: "h", body: "b" }], designDirection: "D" };
  const score: ContentScore = { selfReview: { usefulness: 8, originality: 8, brandFit: 8, clarity: 8, aggressionControl: 8, proofStrength: 8, postWorthiness: "pass" }, predictedImpact: 80, brandFit: 85, platformFit: 70, rationale: "r" };

  it("downgrades claim risk to low when there is no grounded source (satisfies the packet guard)", () => {
    const evidence: EvidencePack = { supportingPoints: [], evidenceSummary: "", claimRiskLevel: "high", proofRequired: true };
    const out = assembleContentPacketInput({ contentTrackId: "ct1", brief, copy, evidence, score, provenance: { insightIds: [], chunkIds: [], sourceIds: [] }, createdBy: "Moiz" });
    expect(out.claimRiskLevel).toBe("low");
    expect(out.proofRequired).toBe(false);
  });

  it("keeps evidence risk + carries provenance when grounded", () => {
    const evidence: EvidencePack = { supportingPoints: [], evidenceSummary: "solid", claimRiskLevel: "medium", proofRequired: true };
    const out = assembleContentPacketInput({ contentTrackId: "ct1", brief, copy, evidence, score, provenance: { insightIds: ["know_1"], chunkIds: ["c1"], sourceIds: ["s1"] }, createdBy: "Moiz" });
    expect(out.claimRiskLevel).toBe("medium");
    expect(out.insightIdsUsed).toEqual(["know_1"]);
    expect(out.sourceIdsUsed).toEqual(["s1"]);
  });

  it("coerces unknown platform/format onto the allowed enums", () => {
    expect(coercePlatform("myspace")).toBe("instagram");
    expect(coerceFormat("hologram")).toBe("carousel");
  });
});

// ---------------------------------------------------------------- orchestrator

const track = {
  id: "ct1",
  label: "WOBBLE IG",
  slug: "wobble-ig",
  voiceProfile: { personaName: "WOBBLE" },
  metadata: {},
  bannedPhrases: ["synergy"],
} as unknown as ContentTrackRow;

const STRATEGY = JSON.stringify({ topic: "cold email", angle: "specificity beats volume", platform: "instagram", format: "carousel", targetAudience: "founders", objective: "book calls", rationale: "fresh angle" });
const EVIDENCE = JSON.stringify({ supportingPoints: [{ point: "specific observation earns attention", noteIndexes: [0], chunkIndexes: [0] }], evidenceSummary: "grounded in teardown", claimRiskLevel: "low", proofRequired: false });
const DRAFT = JSON.stringify({ hook: "H1", mainCopy: "M1", caption: "C1", cta: "CTA1", carouselSlides: [{ heading: "h", body: "b" }], designDirection: "D1" });
const REVISE = JSON.stringify({ issues: ["weak hook"], revised: { hook: "H2", mainCopy: "M2", caption: "C2", cta: "CTA2", carouselSlides: [], designDirection: "D2" } });
const SCORE = JSON.stringify({ selfReview: { usefulness: 8, originality: 8, brandFit: 8, clarity: 8, aggressionControl: 8, proofStrength: 8, postWorthiness: "pass" }, predictedImpact: 82, brandFit: 88, platformFit: 75, rationale: "strong" });

function makeDeps(nodeResponses: string[]) {
  let call = 0;
  const agentRuns: Record<string, unknown>[] = [];
  let capturedPacket: Record<string, unknown> | null = null;
  const deps: ContentGraphDeps = {
    getTrack: async () => track,
    retrieveBrain: async () => [{ title: "Brand", content: "premium, specific, no fluff" }],
    retrieve: async () => ({
      notes: [{ id: "know_1", title: "Specific observation hook", content: "Open with a verifiable observation.", noteType: "hook_pattern", sourceIds: ["s1"], sourceId: "s1" }],
      chunks: [{ id: "c1", sourceId: "s1", content: "raw teardown text" }],
    }),
    runNode: async () => ({ text: nodeResponses[call++], runId: `mr_${call}` }),
    recordAgentRun: async (i) => void agentRuns.push(i),
    recordAudit: async () => {},
    createPacket: async (input): Promise<ContentPacketCreationResult> => {
      capturedPacket = input as unknown as Record<string, unknown>;
      const passed = (input as { requestApproval?: boolean }).requestApproval === true;
      return { packet: { id: "pk_1", qualityStatus: passed ? "passed" : "failed" }, approval: passed ? { id: "ap_1" } : null };
    },
  };
  return { deps, agentRuns, getPacket: () => capturedPacket };
}

describe("runContentGraph", () => {
  it("runs a 5-agent grounded graph and assembles an approvable pack", async () => {
    const { deps, agentRuns, getPacket } = makeDeps([STRATEGY, EVIDENCE, DRAFT, REVISE, SCORE]);
    const result = await runContentGraph({ contentTrackId: "ct1", requestedBy: "Moiz", objective: "get more calls" }, deps);

    expect(result.agentRunCount).toBe(5);
    expect(result.packetId).toBe("pk_1");
    expect(result.qualityStatus).toBe("passed");
    expect(result.approvalId).toBe("ap_1");
    expect(result.modelRunIds).toHaveLength(5);
    expect(result.provenance.sourceIds).toEqual(["s1"]);

    // the TEAM is visible: 5 agent_runs across 4 distinct creative roles
    expect(agentRuns).toHaveLength(5);
    expect(agentRuns.map((r) => r.agentSlug)).toEqual([
      "content_strategist",
      "content_researcher",
      "content_copywriter",
      "content_copywriter",
      "content_scorer",
    ]);

    // the pack used the REVISED copy + carried real provenance
    const packet = getPacket()!;
    expect(packet.hook).toBe("H2");
    expect(packet.insightIdsUsed).toEqual(["know_1"]);
    expect(packet.memoryChunksUsed).toEqual(["c1"]);
    expect(packet.sourceIdsUsed).toEqual(["s1"]);
    expect((packet.selfReview as { postWorthiness: string }).postWorthiness).toBe("pass");
    expect(packet.requestApproval).toBe(true);
  });

  it("falls back to the draft when the self-critique output is unparseable (resilient)", async () => {
    const { deps, getPacket } = makeDeps([STRATEGY, EVIDENCE, DRAFT, "the model rambled", SCORE]);
    const result = await runContentGraph({ contentTrackId: "ct1", requestedBy: "Ali", objective: "x" }, deps);
    expect(result.agentRunCount).toBe(5);
    expect(getPacket()!.hook).toBe("H1"); // draft copy survived
  });

  it("fails loudly if a required node returns unparseable output", async () => {
    const { deps } = makeDeps(["garbage brief", EVIDENCE, DRAFT, REVISE, SCORE]);
    await expect(runContentGraph({ contentTrackId: "ct1", requestedBy: "Moiz", objective: "x" }, deps)).rejects.toThrow(/unparseable brief/);
  });
});
