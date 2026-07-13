import { describe, expect, it } from "vitest";
import type { ContentTrackRow } from "@/lib/domain/content-command";
import {
  assembleContentPacketInput,
  collectProvenance,
  coerceFormat,
  coercePlatform,
  parseJsonObject,
  creativeBriefSchema,
  contentGraphIdempotencyKey,
  type ContentScore,
  type CopyDraft,
  type CreativeBrief,
  type EvidencePack,
} from "@/lib/domain/content-graph";
import { runContentGraph, enqueueContentGraphJob, type ContentGraphDeps, type ContentPacketCreationResult } from "@/lib/content-graph";

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
  const audits: Record<string, unknown>[] = [];
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
    recordAudit: async (e) => void audits.push(e as unknown as Record<string, unknown>),
    createPacket: async (input): Promise<ContentPacketCreationResult> => {
      capturedPacket = input as unknown as Record<string, unknown>;
      const passed = (input as { requestApproval?: boolean }).requestApproval === true;
      return { packet: { id: "pk_1", qualityStatus: passed ? "passed" : "failed" }, approval: passed ? { id: "ap_1" } : null };
    },
  };
  return { deps, agentRuns, audits, getPacket: () => capturedPacket };
}

describe("content-graph idempotency (double-click spend guard)", () => {
  const base = { contentTrackId: "ct1", objective: "book more calls" };

  it("same objective within the debounce window -> same key (deduped, no double spend)", () => {
    const t1 = new Date("2026-07-11T12:00:00Z");
    const t2 = new Date("2026-07-11T12:00:30Z"); // 30s later, same 2-min bucket
    expect(contentGraphIdempotencyKey(base, t1)).toBe(contentGraphIdempotencyKey(base, t2));
  });

  it("different objective -> different key; a later time bucket -> different key", () => {
    const t = new Date("2026-07-11T12:00:00Z");
    expect(contentGraphIdempotencyKey(base, t)).not.toBe(contentGraphIdempotencyKey({ ...base, objective: "grow followers" }, t));
    const later = new Date("2026-07-11T12:05:00Z"); // new bucket -> deliberate re-run allowed
    expect(contentGraphIdempotencyKey(base, t)).not.toBe(contentGraphIdempotencyKey(base, later));
  });

  it("enqueueContentGraphJob injects the default key when the caller omits one", async () => {
    const enqueued: Array<Record<string, unknown>> = [];
    const now = new Date("2026-07-11T12:00:00Z");
    await enqueueContentGraphJob(
      { contentTrackId: "ct1", requestedBy: "Moiz", objective: "book more calls" },
      { enqueueJob: async (i) => { enqueued.push(i as Record<string, unknown>); return {}; }, now },
    );
    expect(enqueued[0].idempotencyKey).toBe(contentGraphIdempotencyKey({ contentTrackId: "ct1", objective: "book more calls" }, now));
  });

  it("an explicit caller-provided key still wins", async () => {
    const enqueued: Array<Record<string, unknown>> = [];
    await enqueueContentGraphJob(
      { contentTrackId: "ct1", requestedBy: "Moiz", objective: "x", idempotencyKey: "explicit-123" },
      { enqueueJob: async (i) => { enqueued.push(i as Record<string, unknown>); return {}; } },
    );
    expect(enqueued[0].idempotencyKey).toBe("explicit-123");
  });
});

describe("runContentGraph", () => {
  it("emits a validated structured handoff between the distinct-agent hops (with lineage)", async () => {
    const { deps, audits } = makeDeps([STRATEGY, EVIDENCE, DRAFT, REVISE, SCORE]);
    await runContentGraph({ contentTrackId: "ct1", requestedBy: "Moiz", objective: "get more calls" }, deps);
    const handoffs = audits.filter((e) => e.eventType === "agent.handoff");
    const meta = (h: Record<string, unknown>) => h.metadata as Record<string, unknown>;
    // strategy→research→copywriting→scoring (draft+revise are the same copywriter agent = no hop).
    expect(handoffs.map((h) => `${meta(h).from}->${meta(h).to}`)).toEqual([
      "content_strategist->content_researcher",
      "content_researcher->content_copywriter",
      "content_copywriter->content_scorer",
    ]);
    expect(new Set(handoffs.map((h) => meta(h).correlationId)).size).toBe(1);
  });

  it("DRIVES each agent through the durable handoff backbone (delivered → claimed → completed)", async () => {
    const { deps } = makeDeps([STRATEGY, EVIDENCE, DRAFT, REVISE, SCORE]);
    // Minimal in-memory HandoffStore exercising insert + conditional (claim/complete) transitions.
    const byId = new Map<string, { id: string; workflowId: string; idempotencyKey: string; deliveryState: string }>();
    const byKey = new Map<string, string>();
    const handoffStore = {
      findByIdempotency: async (wf: string, key: string) => { const id = byKey.get(`${wf}::${key}`); return id ? byId.get(id) : null; },
      insert: async (row: { id: string; workflowId: string; idempotencyKey: string; deliveryState: string }) => { byId.set(row.id, { ...row }); byKey.set(`${row.workflowId}::${row.idempotencyKey}`, row.id); },
      getById: async (id: string) => byId.get(id) ?? null,
      transition: async (id: string, from: string, fields: { deliveryState?: string }) => { const r = byId.get(id); if (!r || r.deliveryState !== from) return false; Object.assign(r, fields); return true; },
      claimNext: async () => null, reclaimExpiredLeases: async () => 0, list: async () => [], countByState: async () => ({}), deleteExpired: async () => 0,
    claimNextForDepartment: async () => null,
    } as unknown as import("@/lib/handoff").HandoffStore;

    await runContentGraph({ contentTrackId: "ct1", requestedBy: "Moiz", objective: "get more calls" }, { ...deps, handoffStore });

    const states = [...byId.values()];
    // One durable handoff DRIVES each of the 4 distinct agents (strategy entry + research + copywriting + scoring).
    expect(states).toHaveLength(4);
    expect(states.every((s) => s.deliveryState === "completed")).toBe(true);
  });

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

  it("telemetry: records a FAILED agent_run for the node that broke (not just successes)", async () => {
    const { deps, agentRuns } = makeDeps([STRATEGY, EVIDENCE, "the model rambled again", REVISE, SCORE]);
    await expect(runContentGraph({ contentTrackId: "ct1", requestedBy: "Moiz", objective: "x" }, deps)).rejects.toThrow(/unparseable draft/);

    // strategy + research succeeded, then the copywriter draft node is recorded as FAILED.
    expect(agentRuns.map((r) => `${r.agentSlug}:${r.status}`)).toEqual([
      "content_strategist:succeeded",
      "content_researcher:succeeded",
      "content_copywriter:failed",
    ]);
    const failed = agentRuns[2];
    expect(failed.error).toMatch(/unparseable draft/);
  });

  it("telemetry: successful nodes carry cost + latency", async () => {
    const agentRuns: Record<string, unknown>[] = [];
    let call = 0;
    const nodeResponses = [STRATEGY, EVIDENCE, DRAFT, REVISE, SCORE];
    const deps: ContentGraphDeps = {
      getTrack: async () => track,
      retrieveBrain: async () => [{ title: "Brand", content: "premium" }],
      retrieve: async () => ({ notes: [], chunks: [] }),
      runNode: async () => ({ text: nodeResponses[call++], runId: `mr_${call}`, cost: 0.002 }),
      recordAgentRun: async (i) => void agentRuns.push(i),
      recordAudit: async () => {},
      createPacket: async (input): Promise<ContentPacketCreationResult> => ({ packet: { id: "pk_1", qualityStatus: "passed" }, approval: { id: "ap_1" } }),
    };
    await runContentGraph({ contentTrackId: "ct1", requestedBy: "Moiz", objective: "x" }, deps);

    expect(agentRuns).toHaveLength(5);
    for (const run of agentRuns) {
      expect(run.status).toBe("succeeded");
      expect(run.costEstimate).toBe(0.002);
      expect(typeof run.latencyMs).toBe("number");
      expect(run.latencyMs as number).toBeGreaterThanOrEqual(0);
    }
    // The scoring node also carries a 0..10 quality score derived from its own verdict.
    const scorer = agentRuns.find((r) => r.agentSlug === "content_scorer")!;
    expect(scorer.qualityScore).toBeCloseTo((82 + 88 + 75) / 30, 5);
  });
});

describe("runContentGraph — independent QA gate (approval release)", () => {
  it("opens the founder approval only when the gate RELEASES; the gate sees the real assembled pack + lineage", async () => {
    const { deps, getPacket } = makeDeps([STRATEGY, EVIDENCE, DRAFT, REVISE, SCORE]);
    let seen: { artifact: { scores: { predictedImpact: number; brandFit: number }; provenance: { sourceIds: string[] } }; ctx: { workflowId: string; taskId: string | null } } | null = null;
    const result = await runContentGraph(
      { contentTrackId: "ct1", requestedBy: "Moiz", objective: "get more calls" },
      { ...deps, qaGate: async (artifact, ctx) => { seen = { artifact, ctx }; return { released: true, verdict: "pass", reviewIds: ["qa_1", "qa_2"] }; } },
    );
    // the gate judged the REAL assembled pack (revised copy's score + grounded provenance) under this run's id
    expect(seen!.artifact.scores.predictedImpact).toBe(82);
    expect(seen!.artifact.provenance.sourceIds).toEqual(["s1"]);
    expect(seen!.ctx.workflowId).toBe("ct1"); // falls back to the track id when no graphRunId (prod passes the job id)
    // released → approval opened + outcome surfaced
    expect((getPacket() as { requestApproval?: boolean }).requestApproval).toBe(true);
    expect(result.approvalId).toBe("ap_1");
    expect(result.qa?.released).toBe(true);
  });

  it("BLOCKS the founder approval when the gate does not release (a QA-failed pack never becomes publishable)", async () => {
    const { deps, getPacket, audits } = makeDeps([STRATEGY, EVIDENCE, DRAFT, REVISE, SCORE]);
    const result = await runContentGraph(
      { contentTrackId: "ct1", requestedBy: "Moiz", objective: "get more calls" },
      { ...deps, qaGate: async () => ({ released: false, verdict: "revise", blockingBoardSlug: "content_brand_review", failedStages: ["copywriting"], escalationIds: ["esc_1"] }) },
    );
    // even though the graph's own quality gate passed, the independent gate withholds the approval
    expect((getPacket() as { requestApproval?: boolean }).requestApproval).toBe(false);
    expect(result.approvalId).toBeNull();
    expect(result.qa?.released).toBe(false);
    expect(result.qa?.blockingBoardSlug).toBe("content_brand_review");
    // the block is auditable (the founder-facing outcome is recorded)
    const completed = audits.find((e) => e.eventType === "content_graph.completed")!;
    expect((completed.metadata as { qaReleased: boolean }).qaReleased).toBe(false);
    expect((completed.metadata as { qaBlockingBoard: string }).qaBlockingBoard).toBe("content_brand_review");
  });

  it("no gate supplied → unchanged (approval driven by the graph quality gate alone)", async () => {
    const { deps, getPacket } = makeDeps([STRATEGY, EVIDENCE, DRAFT, REVISE, SCORE]);
    const result = await runContentGraph({ contentTrackId: "ct1", requestedBy: "Moiz", objective: "x" }, deps);
    expect((getPacket() as { requestApproval?: boolean }).requestApproval).toBe(true);
    expect(result.approvalId).toBe("ap_1");
    expect(result.qa).toBeUndefined();
  });

  it("injects the Context OS trusted-context block into the strategy prompt when the retrieval seam is wired", async () => {
    const { deps } = makeDeps([STRATEGY, EVIDENCE, DRAFT, REVISE, SCORE]);
    const seenMessages: string[] = [];
    const capturingRunNode: NonNullable<ContentGraphDeps["runNode"]> = async (input) => { seenMessages.push(...input.messages.map((m) => String(m.content))); return deps.runNode!(input); };
    await runContentGraph(
      { contentTrackId: "ct1", requestedBy: "Moiz", objective: "get more calls" },
      { ...deps, runNode: capturingRunNode, retrieveTrustedContext: async () => "APPROVED WOBBLE CONTEXT: - Pricing is $99/mo" },
    );
    expect(seenMessages.some((m) => m.includes("APPROVED WOBBLE CONTEXT"))).toBe(true); // a real generator retrieved approved scoped context
  });

  it("no trusted-context seam → the strategy prompt has no such block (default off)", async () => {
    const { deps } = makeDeps([STRATEGY, EVIDENCE, DRAFT, REVISE, SCORE]);
    const seenMessages: string[] = [];
    const capturingRunNode: NonNullable<ContentGraphDeps["runNode"]> = async (input) => { seenMessages.push(...input.messages.map((m) => String(m.content))); return deps.runNode!(input); };
    await runContentGraph({ contentTrackId: "ct1", requestedBy: "Moiz", objective: "x" }, { ...deps, runNode: capturingRunNode });
    expect(seenMessages.some((m) => m.includes("APPROVED WOBBLE CONTEXT"))).toBe(false);
  });
});
