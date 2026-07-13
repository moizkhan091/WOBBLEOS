import { describe, expect, it } from "vitest";
import {
  buildGraphCheckpointRow,
  isCheckpointReusable,
  graphRunIdFrom,
  GRAPH_CHECKPOINT_SCHEMA_VERSION,
  type GraphCheckpointRow,
} from "@/lib/domain/graph-checkpoint";
import {
  loadCheckpointContext,
  clearGraphCheckpoints,
  purgeExpiredGraphCheckpoints,
  bindNodeCheckpoint,
  type GraphCheckpointStore,
} from "@/lib/graph-checkpoint";
import type { ContentTrackRow } from "@/lib/domain/content-command";
import { runContentGraph, type ContentGraphDeps, type ContentPacketCreationResult } from "@/lib/content-graph";

const now = new Date("2026-07-11T12:00:00Z");

// ---------------------------------------------------------------- in-memory store (models the DB)

function makeCheckpointStore() {
  const rows = new Map<string, GraphCheckpointRow>(); // key = graphRunId::nodeSlug (the UNIQUE constraint)
  const store: GraphCheckpointStore = {
    listCheckpoints: async (rid) => [...rows.values()].filter((r) => r.graphRunId === rid),
    // Upsert on (graphRunId, nodeSlug) — models ON CONFLICT DO UPDATE, so duplicate workers/retries can't dupe.
    upsertCheckpoint: async (row) => { rows.set(`${row.graphRunId}::${row.nodeSlug}`, row); },
    deleteCheckpoints: async (rid) => { let n = 0; for (const [k, r] of rows) if (r.graphRunId === rid) { rows.delete(k); n += 1; } return n; },
    deleteNodeCheckpoints: async (rid, slugs) => { let n = 0; for (const [k, r] of rows) if (r.graphRunId === rid && slugs.includes(r.nodeSlug)) { rows.delete(k); n += 1; } return n; },
    deleteExpiredCheckpoints: async (before) => { let n = 0; for (const [k, r] of rows) if (r.createdAt < before) { rows.delete(k); n += 1; } return n; },
  };
  return { store, rows };
}

describe("graph-checkpoint domain", () => {
  it("builds a row with sane defaults", () => {
    const row = buildGraphCheckpointRow({ graphRunId: "j1", graph: "content_graph", nodeSlug: "strategy", nodeIndex: 0, schemaVersion: 1, outputText: "{}" }, { now, id: "gckpt_1" });
    expect(row).toMatchObject({ id: "gckpt_1", graphRunId: "j1", nodeSlug: "strategy", status: "completed", schemaVersion: 1, output: null, modelRunIds: [] });
  });

  it("only reuses COMPLETED outputs at the CURRENT schema version", () => {
    expect(isCheckpointReusable({ status: "completed", schemaVersion: 1 }, 1)).toBe(true);
    expect(isCheckpointReusable({ status: "completed", schemaVersion: 1 }, 2)).toBe(false); // version bump invalidates
    expect(isCheckpointReusable({ status: "failed", schemaVersion: 1 }, 1)).toBe(false);
  });

  it("derives a stable run id (job id wins; deterministic fallback otherwise; never random)", () => {
    expect(graphRunIdFrom("job_9", "x")).toBe("job_9");
    expect(graphRunIdFrom(undefined, "ct1", "obj")).toBe("ct1::obj");
    expect(graphRunIdFrom(undefined)).toBeUndefined();
    // deterministic: same inputs -> same id
    expect(graphRunIdFrom(null, "a", "b")).toBe(graphRunIdFrom(null, "a", "b"));
  });
});

describe("graph-checkpoint service", () => {
  it("loadCheckpointContext offers only reusable checkpoints and skips stale/failed ones", async () => {
    const { store } = makeCheckpointStore();
    await store.upsertCheckpoint(buildGraphCheckpointRow({ graphRunId: "j1", graph: "content_graph", nodeSlug: "strategy", nodeIndex: 0, schemaVersion: 1, outputText: "OK" }, { now }));
    await store.upsertCheckpoint(buildGraphCheckpointRow({ graphRunId: "j1", graph: "content_graph", nodeSlug: "old", nodeIndex: 1, schemaVersion: 999, outputText: "STALE" }, { now }));
    await store.upsertCheckpoint(buildGraphCheckpointRow({ graphRunId: "j1", graph: "content_graph", nodeSlug: "boom", nodeIndex: 2, schemaVersion: 1, status: "failed", outputText: "" }, { now }));

    const ctx = await loadCheckpointContext({ graph: "content_graph", graphRunId: "j1", schemaVersion: 1 }, { store });
    expect([...ctx.cached.keys()]).toEqual(["strategy"]); // stale (version) + failed excluded
  });

  it("a read failure degrades gracefully (runs the graph fresh, no throw)", async () => {
    const brokenStore: GraphCheckpointStore = {
      listCheckpoints: async () => { throw new Error("db down"); },
      upsertCheckpoint: async () => {}, deleteCheckpoints: async () => 0, deleteNodeCheckpoints: async () => 0, deleteExpiredCheckpoints: async () => 0,
    };
    const ctx = await loadCheckpointContext({ graph: "content_graph", graphRunId: "j1", schemaVersion: 1 }, { store: brokenStore });
    expect(ctx.cached.size).toBe(0); // no cache, but did not throw
  });

  it("a save failure never throws (node just re-runs on resume)", async () => {
    const brokenStore: GraphCheckpointStore = {
      listCheckpoints: async () => [], upsertCheckpoint: async () => { throw new Error("write failed"); },
      deleteCheckpoints: async () => 0, deleteNodeCheckpoints: async () => 0, deleteExpiredCheckpoints: async () => 0,
    };
    const ctx = await loadCheckpointContext({ graph: "content_graph", graphRunId: "j1", schemaVersion: 1 }, { store: brokenStore });
    await expect(ctx.save({ nodeSlug: "strategy", nodeIndex: 0, outputText: "x" })).resolves.toBeUndefined();
  });

  it("clear + purge remove checkpoints", async () => {
    const { store, rows } = makeCheckpointStore();
    await store.upsertCheckpoint(buildGraphCheckpointRow({ graphRunId: "j1", graph: "content_graph", nodeSlug: "a", nodeIndex: 0, schemaVersion: 1, outputText: "x" }, { now }));
    await store.upsertCheckpoint(buildGraphCheckpointRow({ graphRunId: "j1", graph: "content_graph", nodeSlug: "b", nodeIndex: 1, schemaVersion: 1, outputText: "y" }, { now }));
    await clearGraphCheckpoints("j1", { store });
    expect(rows.size).toBe(0);

    await store.upsertCheckpoint(buildGraphCheckpointRow({ graphRunId: "j2", graph: "content_graph", nodeSlug: "a", nodeIndex: 0, schemaVersion: 1, outputText: "x" }, { now: new Date("2026-01-01T00:00:00Z") }));
    const purged = await purgeExpiredGraphCheckpoints(new Date("2026-06-01T00:00:00Z"), { store });
    expect(purged).toBe(1);
    expect(rows.size).toBe(0);
  });

  it("bindNodeCheckpoint keys by the node key, not the agent slug (draft/revise never collide)", async () => {
    const { store, rows } = makeCheckpointStore();
    const ctx = await loadCheckpointContext({ graph: "content_graph", graphRunId: "j1", schemaVersion: 1 }, { store });
    const draft = bindNodeCheckpoint(ctx, "draft", 2)!;
    const revise = bindNodeCheckpoint(ctx, "revise", 3)!;
    await draft.save!({ outputText: "DRAFT", output: null, modelRunIds: [] });
    await revise.save!({ outputText: "REVISE", output: null, modelRunIds: [] });
    expect(rows.size).toBe(2); // two distinct rows, no collision despite the shared copywriter slug
    expect([...rows.values()].map((r) => `${r.nodeSlug}=${r.outputText}`).sort()).toEqual(["draft=DRAFT", "revise=REVISE"]);
  });
});

// ---------------------------------------------------------------- resume via the real content graph

const track = { id: "ct1", label: "IG", slug: "ig", voiceProfile: { personaName: "WOBBLE" }, metadata: {}, bannedPhrases: [] } as unknown as ContentTrackRow;
const STRATEGY = JSON.stringify({ topic: "t", angle: "a", platform: "instagram", format: "carousel", targetAudience: "aud", objective: "o", rationale: "r" });
const EVIDENCE = JSON.stringify({ supportingPoints: [{ point: "p", noteIndexes: [], chunkIndexes: [] }], evidenceSummary: "s", claimRiskLevel: "low", proofRequired: false });
const DRAFT = JSON.stringify({ hook: "H1", mainCopy: "M", caption: "C", cta: "CTA", carouselSlides: [{ heading: "h", body: "b" }], designDirection: "D" });
const REVISE = JSON.stringify({ issues: ["x"], revised: { hook: "H2", mainCopy: "M2", caption: "C2", cta: "CTA2", carouselSlides: [], designDirection: "D2" } });
const SCORE = JSON.stringify({ selfReview: { usefulness: 8, originality: 8, brandFit: 8, clarity: 8, aggressionControl: 8, proofStrength: 8, postWorthiness: "pass" }, predictedImpact: 80, brandFit: 85, platformFit: 70, rationale: "r" });

function makeGraphDeps(store: GraphCheckpointStore, runNode: ContentGraphDeps["runNode"]) {
  const agentRuns: Record<string, unknown>[] = [];
  const deps: ContentGraphDeps = {
    getTrack: async () => track,
    retrieveBrain: async () => [{ title: "b", content: "c" }],
    retrieve: async () => ({ notes: [], chunks: [] }),
    runNode,
    recordAgentRun: async (i) => void agentRuns.push(i),
    recordAudit: async () => {},
    createPacket: async (): Promise<ContentPacketCreationResult> => ({ packet: { id: "pk_1", qualityStatus: "passed" }, approval: { id: "ap_1" } }),
    checkpointStore: store,
    now,
  };
  return { deps, agentRuns };
}

describe("content graph resumability (the core guarantee)", () => {
  it("late-node failure preserves completed nodes; retry does NOT re-run/charge them; success clears", async () => {
    const { store, rows } = makeCheckpointStore();
    const runId = "job_resume_1";

    // ---- Round 1: the SCORING node (5th) fails. Nodes 1-4 complete and checkpoint. ----
    const r1 = [STRATEGY, EVIDENCE, DRAFT, REVISE, "garbage score"];
    let i1 = 0;
    const calls1: number[] = [];
    const d1 = makeGraphDeps(store, async () => { calls1.push(i1); return { text: r1[i1++], runId: `r${i1}`, cost: 0.02 }; });
    await expect(runContentGraph({ contentTrackId: "ct1", requestedBy: "Moiz", objective: "o", graphRunId: runId }, d1.deps)).rejects.toThrow(/unparseable score/);

    expect(calls1.length).toBe(5); // all five nodes attempted
    // The four nodes BEFORE the failure are checkpointed; the failed scoring node is not.
    expect([...rows.values()].map((r) => r.nodeSlug).sort()).toEqual(["draft", "research", "revise", "strategy"]);

    // ---- Round 2 (retry, same job id): nodes 1-4 resume from checkpoint; ONLY scoring re-runs. ----
    const r2 = [SCORE];
    let i2 = 0;
    const calls2: number[] = [];
    const d2 = makeGraphDeps(store, async () => { calls2.push(i2); return { text: r2[i2++], runId: `s${i2}`, cost: 0.02 }; });
    const result = await runContentGraph({ contentTrackId: "ct1", requestedBy: "Moiz", objective: "o", graphRunId: runId }, d2.deps);

    expect(calls2.length).toBe(1); // ONLY the scoring node called the model — the paid nodes were NOT re-charged
    expect(result.packetId).toBe("pk_1");
    // The resumed nodes are still recorded in telemetry (as [resumed]) so the run is fully observable.
    expect(d2.agentRuns.filter((a) => String(a.outputSummary).startsWith("[resumed]"))).toHaveLength(4);
    // Success => checkpoints cleared.
    expect(rows.size).toBe(0);
  });

  it("a corrupted checkpoint is not trusted — the node re-runs fresh", async () => {
    const { store } = makeCheckpointStore();
    const runId = "job_corrupt";
    // Seed a CORRUPTED strategy checkpoint (unparseable text) at the current schema version.
    await store.upsertCheckpoint(buildGraphCheckpointRow({ graphRunId: runId, graph: "content_graph", nodeSlug: "strategy", nodeIndex: 0, schemaVersion: GRAPH_CHECKPOINT_SCHEMA_VERSION.content_graph, outputText: "}{ not json" }, { now }));

    let i = 0;
    const calls: number[] = [];
    const responses = [STRATEGY, EVIDENCE, DRAFT, REVISE, SCORE];
    const { deps } = makeGraphDeps(store, async () => { calls.push(i); return { text: responses[i++], runId: `r${i}` }; });
    const result = await runContentGraph({ contentTrackId: "ct1", requestedBy: "Moiz", objective: "o", graphRunId: runId }, deps);

    expect(result.packetId).toBe("pk_1");
    expect(calls.length).toBe(5); // corrupted strategy could NOT be reused -> all 5 nodes ran fresh
  });

  it("a schema-version mismatch invalidates the cache — the node re-runs", async () => {
    const { store } = makeCheckpointStore();
    const runId = "job_ver";
    // Valid strategy text, but from an OLD schema version.
    await store.upsertCheckpoint(buildGraphCheckpointRow({ graphRunId: runId, graph: "content_graph", nodeSlug: "strategy", nodeIndex: 0, schemaVersion: 999, outputText: STRATEGY }, { now }));

    let i = 0;
    const calls: number[] = [];
    const responses = [STRATEGY, EVIDENCE, DRAFT, REVISE, SCORE];
    const { deps } = makeGraphDeps(store, async () => { calls.push(i); return { text: responses[i++], runId: `r${i}` }; });
    await runContentGraph({ contentTrackId: "ct1", requestedBy: "Moiz", objective: "o", graphRunId: runId }, deps);
    expect(calls.length).toBe(5); // stale-version strategy ignored -> all ran
  });

  it("with no graphRunId, checkpointing is off (nothing persisted) — pure opt-in", async () => {
    const { store, rows } = makeCheckpointStore();
    let i = 0;
    const responses = [STRATEGY, EVIDENCE, DRAFT, REVISE, SCORE];
    const { deps } = makeGraphDeps(store, async () => ({ text: responses[i++], runId: `r${i}` }));
    await runContentGraph({ contentTrackId: "ct1", requestedBy: "Moiz", objective: "o" }, deps); // no graphRunId
    expect(rows.size).toBe(0); // nothing written when checkpointing is not requested
  });
});
