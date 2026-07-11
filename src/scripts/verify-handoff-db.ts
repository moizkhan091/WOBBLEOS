/**
 * Real-database verification for the handoff runtime — exercises the ACTUAL defaultStore (Drizzle →
 * Postgres): dispatch (persist), idempotent dedup (unique index), claim under a lease (FOR UPDATE SKIP
 * LOCKED), conditional transition, expired-lease reclaim, dead-letter, redrive, and terminal purge.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-handoff-db.ts
 */
import { closeDb } from "@/db";
import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import {
  defaultStore,
  dispatchHandoff,
  claimNextHandoff,
  failHandoff,
  reclaimExpiredHandoffLeases,
  redriveHandoff,
  completeHandoff,
  purgeExpiredHandoffs,
} from "@/lib/handoff";

async function main() {
  const store = defaultStore();
  const wf = `verify_hf_${Date.now()}`;
  const silent = { store, recordAudit: async () => {} };
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };

  const env = buildHandoffEnvelope(
    { workflowId: wf, department: "paid_audit", sourceAgent: "orchestrator", destinationAgent: "audit_opportunity_finder", clientWorkspaceId: "clientA", authorizedMemoryScopes: ["company"], objective: "o", requestedAction: "r", expectedOutputSchema: "opportunity_set", confidence: 0.8 },
    { now: new Date(), taskId: `${wf}_t1` },
  );

  // 1. dispatch persists.
  const d1 = await dispatchHandoff(env, { clientWorkspaceId: "clientA", grantedMemoryScopes: ["company"] }, silent);
  assert(!d1.deduped && d1.handoff.deliveryState === "delivered", "dispatch persisted a delivered handoff");

  // 2. idempotent dedup (unique workflow+key) — a re-dispatch returns the same row, executes once.
  const d2 = await dispatchHandoff(env, { clientWorkspaceId: "clientA", grantedMemoryScopes: ["company"] }, silent);
  assert(d2.deduped && d2.handoff.id === d1.handoff.id, "re-dispatch deduped (executes once)");

  // 3. claim under a lease (FOR UPDATE SKIP LOCKED).
  const claimed = await claimNextHandoff("audit_opportunity_finder", "worker_1", silent);
  assert(claimed?.deliveryState === "processing" && claimed?.leaseOwner === "worker_1", "claimed under a lease (SKIP LOCKED)");

  // 4. a second claimer gets nothing (already leased).
  const none = await claimNextHandoff("audit_opportunity_finder", "worker_2", silent);
  assert(none === null, "no double-claim while leased");

  // 5. fail → retry (bounded); re-claimable after backoff window.
  const fail = await failHandoff(d1.handoff.id, "boom", silent);
  assert(fail?.next === "delivered", "fail retried (bounded)");

  // 6. expired-lease reclaim (crash recovery): re-claim, then reclaim with a far-future clock.
  await claimNextHandoff("audit_opportunity_finder", "worker_3", { store, recordAudit: async () => {}, now: new Date(Date.now() + 10 * 60_000) });
  const reclaimed = await reclaimExpiredHandoffLeases({ store, recordAudit: async () => {}, now: new Date(Date.now() + 60 * 60_000) });
  assert(reclaimed >= 1, "expired lease reclaimed (crashed consumer self-heals)");

  // 7. drive to dead-letter, then redrive.
  for (let i = 0; i < 6; i += 1) {
    await claimNextHandoff("audit_opportunity_finder", "w", { store, recordAudit: async () => {}, now: new Date(Date.now() + (i + 2) * 60 * 60_000) });
    await failHandoff(d1.handoff.id, `attempt ${i}`, { store, recordAudit: async () => {}, now: new Date(Date.now() + (i + 2) * 60 * 60_000 + 1000) });
  }
  const afterFails = await store.getById(d1.handoff.id);
  assert(afterFails?.deliveryState === "dead_lettered", "out of retries -> dead-lettered");
  assert(await redriveHandoff(d1.handoff.id, "Moiz", silent), "manual redrive succeeded");
  assert((await store.getById(d1.handoff.id))?.deliveryState === "delivered", "redrive resumed to delivered");

  // 8. complete + retention purge.
  await claimNextHandoff("audit_opportunity_finder", "w", { store, recordAudit: async () => {}, now: new Date(Date.now() + 999 * 60_000) });
  await completeHandoff(d1.handoff.id, { costEstimate: 0.02, latencyMs: 100, qualityScore: 9 }, silent);
  assert((await store.getById(d1.handoff.id))?.deliveryState === "completed", "completed with telemetry");
  const purged = await purgeExpiredHandoffs(new Date(Date.now() + 999 * 24 * 60 * 60_000), silent);
  assert(purged >= 1, "retention purge reaped the terminal handoff");

  console.log("\nALL REAL-DB HANDOFF CHECKS PASSED ✅");
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
