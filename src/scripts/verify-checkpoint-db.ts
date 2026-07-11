/**
 * Real-database verification for graph checkpointing — exercises the ACTUAL defaultCheckpointStore
 * (Drizzle → Postgres), not an in-memory fake. Proves the durable guarantees the resumability feature
 * depends on: upsert idempotency, survival across a fresh store (process restart), concurrent-safe
 * writes, clear, and retention purge.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-checkpoint-db.ts
 */
import { closeDb } from "@/db";
import { defaultCheckpointStore } from "@/lib/graph-checkpoint";
import { buildGraphCheckpointRow } from "@/lib/domain/graph-checkpoint";

async function main() {
  const store = defaultCheckpointStore();
  const runId = `verify_${Date.now()}`;
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`FAIL: ${msg}`);
    console.log(`  ✓ ${msg}`);
  };

  await store.deleteCheckpoints(runId); // clean slate

  // 1. Persist two completed nodes.
  await store.upsertCheckpoint(buildGraphCheckpointRow({ graphRunId: runId, graph: "content_graph", nodeSlug: "strategy", nodeIndex: 0, schemaVersion: 1, outputText: "S1", modelRunIds: ["m1"] }));
  await store.upsertCheckpoint(buildGraphCheckpointRow({ graphRunId: runId, graph: "content_graph", nodeSlug: "research", nodeIndex: 1, schemaVersion: 1, outputText: "R1" }));
  assert((await store.listCheckpoints(runId)).length === 2, "two nodes persisted to Postgres");

  // 2. Upsert the same node (duplicate worker / retry) — updates in place, no duplicate row.
  await store.upsertCheckpoint(buildGraphCheckpointRow({ graphRunId: runId, graph: "content_graph", nodeSlug: "strategy", nodeIndex: 0, schemaVersion: 1, outputText: "S2", modelRunIds: ["m1", "m2"] }));
  let rows = await store.listCheckpoints(runId);
  assert(rows.length === 2, "upsert did NOT duplicate the node");
  assert(rows.find((r) => r.nodeSlug === "strategy")!.outputText === "S2", "upsert updated the row in place");

  // 3. Process restart: a brand-new store instance reads the durably-persisted rows.
  const store2 = defaultCheckpointStore();
  const afterRestart = await store2.listCheckpoints(runId);
  assert(afterRestart.length === 2, "checkpoints survive a fresh store instance (process/worker restart)");
  assert(afterRestart.find((r) => r.nodeSlug === "strategy")!.modelRunIds.join(",") === "m1,m2", "jsonb modelRunIds persisted durably");

  // 4. Concurrent duplicate writes of the SAME node race safely against the unique index.
  await Promise.all([
    store.upsertCheckpoint(buildGraphCheckpointRow({ graphRunId: runId, graph: "content_graph", nodeSlug: "draft", nodeIndex: 2, schemaVersion: 1, outputText: "D-a" })),
    store.upsertCheckpoint(buildGraphCheckpointRow({ graphRunId: runId, graph: "content_graph", nodeSlug: "draft", nodeIndex: 2, schemaVersion: 1, outputText: "D-b" })),
  ]);
  rows = await store.listCheckpoints(runId);
  assert(rows.filter((r) => r.nodeSlug === "draft").length === 1, "concurrent upserts of the same node -> exactly one row");

  // 5. Clear on success/cancel.
  const cleared = await store.deleteCheckpoints(runId);
  assert(cleared === 3, "clear removed all rows for the run");
  assert((await store.listCheckpoints(runId)).length === 0, "run is empty after clear");

  // 6. Retention purge reaps abandoned old runs.
  const oldRow = buildGraphCheckpointRow({ graphRunId: runId, graph: "content_graph", nodeSlug: "stale", nodeIndex: 0, schemaVersion: 1, outputText: "X" });
  oldRow.createdAt = new Date("2020-01-01T00:00:00Z");
  await store.upsertCheckpoint(oldRow);
  const purged = await store.deleteExpiredCheckpoints(new Date("2021-01-01T00:00:00Z"));
  assert(purged >= 1, "retention purge removed the stale row");
  await store.deleteCheckpoints(runId); // final cleanup

  console.log("\nALL REAL-DB CHECKPOINT CHECKS PASSED ✅");
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await closeDb();
    process.exit(1);
  });
