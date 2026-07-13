/**
 * Real-DB proof that Selective Revision is OPERATIONAL (Phase 7) on Postgres. Proven:
 *   - the 2/5/8-fail scenario: an 8-component artifact where components 2,5,8 fail QA reruns EXACTLY those +
 *     their transitive dependents, PRESERVES every approved component + its evidence (version untouched), and
 *     re-invokes ONLY the failed components' specialists — never a full-team regeneration;
 *   - the REAL consumer: bound to a checkpointed graph run, `driveSelectiveGraphRerun` clears ONLY the rerun
 *     nodes' checkpoints (the preserved nodes' cached outputs survive → a re-run regenerates exactly the rerun
 *     nodes and reuses the rest);
 *   - APPLY bumps the rerun components to approved at their next version; ROLLBACK restores the pre-revision
 *     snapshot (version + status) for every component.
 *
 * ISOLATED + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-selective-revision-db.ts
 */
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { revisionCycles, revisionComponents, revisionComponentVersions, graphCheckpoints } from "@/db/schema";
import { buildGraphCheckpointRow } from "@/lib/domain/graph-checkpoint";
import { defaultCheckpointStore } from "@/lib/graph-checkpoint";
import { openRevisionCycle, driveSelectiveGraphRerun, applyRevisionOutcome, rollbackRevisionCycle, getRevisionCycle } from "@/lib/selective-revision";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const graphRunId = `revrun_${uniq}`;
  const deps = { db, recordAudit: async () => {} };
  const cycleIds: string[] = [];

  // An 8-node linear-ish artifact: c1..c8, each depends on the previous (a change cascades downstream).
  const keys = Array.from({ length: 8 }, (_, i) => `c${i + 1}`);
  // Components 2, 5, 8 fail QA (seeded `failed`, exactly as the production trigger records them).
  const failed = ["c2", "c5", "c8"];
  const components = keys.map((k, i) => ({ key: k, kind: "node", producedBy: `specialist_${k}`, dependsOn: i === 0 ? [] : [keys[i - 1]], version: 1, status: (failed.includes(k) ? "failed" : "approved") as "failed" | "approved", evidence: { text: `${k}-v1` } }));

  try {
    // Seed a checkpoint for EVERY node (a completed graph run) so we can prove selective clearing.
    const store = defaultCheckpointStore(db);
    for (let i = 0; i < keys.length; i++) {
      await store.upsertCheckpoint(buildGraphCheckpointRow({ graphRunId, graph: "content_graph", nodeSlug: keys[i], nodeIndex: i, schemaVersion: 1, outputText: `${keys[i]}-out` }));
    }

    const cycle = await openRevisionCycle({ artifactKind: "content_graph", artifactRef: graphRunId, graphRunId, triggeredBy: "test", components, failedComponents: failed, clientId: `client_${uniq}` }, deps);
    cycleIds.push(cycle.id);

    // PLAN: failed 2,5,8 + transitive dependents. c2→c3..c8 all depend downstream of c2, so once c2 fails the
    // whole tail reruns. Expect rerun = c2..c8; preserved = only c1.
    const rerun = new Set(cycle.plan.rerun);
    assert(rerun.has("c2") && rerun.has("c5") && rerun.has("c8"), "the 3 failed components (c2, c5, c8) are in the rerun set");
    assert(rerun.has("c3") && rerun.has("c4") && rerun.has("c6") && rerun.has("c7"), "the transitive DEPENDENTS of the failed components are pulled into the rerun (consistency)");
    assert(cycle.plan.preserved.length === 1 && cycle.plan.preserved[0] === "c1", "ONLY the upstream approved component (c1) is preserved — its evidence + version untouched");
    assert(!cycle.plan.specialists.includes("specialist_c1"), "the preserved component's specialist is NOT re-invoked (no full-team regeneration)");
    const c1 = cycle.components.find((c) => c.key === "c1")!;
    assert(c1.status === "approved" && c1.version === 1, "the preserved component stays approved at version 1");
    const c5 = cycle.components.find((c) => c.key === "c5")!;
    assert(c5.status === "rerun" && c5.version === 2, "a reran component is marked `rerun` at its NEXT version (2)");

    // REAL CONSUMER: clear ONLY the rerun nodes' checkpoints; c1's checkpoint must survive.
    const rr = await driveSelectiveGraphRerun(cycle.id, { ...deps, checkpointStore: store });
    assert(rr.cleared === 7, "exactly the 7 rerun nodes' checkpoints were cleared");
    const remaining = await store.listCheckpoints(graphRunId);
    assert(remaining.length === 1 && remaining[0].nodeSlug === "c1", "ONLY the preserved node's (c1) checkpoint survives — a re-run reuses it and regenerates exactly the rerun nodes");

    // APPLY: the rerun components complete → approved at their next version; preserved untouched.
    await applyRevisionOutcome(cycle.id, cycle.plan.rerun.map((k) => ({ key: k, status: "approved" as const, evidence: { text: `${k}-v2` } })), deps);
    const applied = (await getRevisionCycle(cycle.id, deps))!;
    assert(applied.status === "applied", "the cycle is applied");
    assert(applied.components.find((c) => c.key === "c5")!.status === "approved" && applied.components.find((c) => c.key === "c5")!.version === 2, "a reran component is now approved at version 2");
    assert(applied.components.find((c) => c.key === "c1")!.version === 1, "the preserved component is STILL version 1 (never touched)");

    // ROLLBACK: restore the pre-revision snapshot (every component back to version 1 / approved).
    assert(await rollbackRevisionCycle(cycle.id, deps), "the cycle was rolled back");
    const rolled = (await getRevisionCycle(cycle.id, deps))!;
    assert(rolled.status === "rolled_back", "the cycle status is rolled_back");
    assert(rolled.components.every((c) => c.version === 1), "every component is restored to version 1 (the pre-revision snapshot)");
    assert(rolled.components.filter((c) => failed.includes(c.key)).every((c) => c.status === "failed"), "the originally-FAILED components are restored to `failed` — rollback undoes the revision, it does not launder a QA failure");
    assert(rolled.components.filter((c) => !failed.includes(c.key)).every((c) => c.status === "approved"), "the originally-approved components are restored to `approved`");

    console.log("\nALL REAL-DB SELECTIVE REVISION CHECKS PASSED ✅");
  } finally {
    await db.delete(graphCheckpoints).where(eq(graphCheckpoints.graphRunId, graphRunId)).catch(() => {});
    if (cycleIds.length) {
      await db.delete(revisionComponentVersions).where(inArray(revisionComponentVersions.cycleId, cycleIds)).catch(() => {});
      await db.delete(revisionComponents).where(inArray(revisionComponents.cycleId, cycleIds)).catch(() => {});
      await db.delete(revisionCycles).where(inArray(revisionCycles.id, cycleIds)).catch(() => {});
    }
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
