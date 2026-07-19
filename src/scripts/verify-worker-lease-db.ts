/**
 * Real-DB proof of the GENERAL job-queue EXECUTION LEASE (multi-worker safety — the deferred HIGH gap). Proves,
 * against live Postgres, that with ≥2 general workers a job cannot double-execute:
 *   1. atomic claim — two workers race for one pending job; exactly ONE claims it (FOR UPDATE SKIP LOCKED);
 *   2. LIVE-lease protection — reclaimStalled does NOT reclaim a job whose lease is still valid (a live worker
 *      renews it), so a long job is never re-handed to another worker mid-run;
 *   3. crash reclaim — once the lease EXPIRES (worker died, stopped renewing), reclaimStalled returns it to the
 *      queue for another worker;
 *   4. compare-and-set terminal write — a worker that LOST the lease cannot complete/override the job the new
 *      owner ran (no double side effect / no corrupted result).
 * ISOLATED (unique queue) + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-worker-lease-db.ts
 */
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { enqueueJob, defaultStore } from "@/lib/jobs";
import { newId } from "@/lib/ids";
import { eq } from "drizzle-orm";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const db = getDb();
  const store = defaultStore();
  const queue = `lease-proof-${newId("q").slice(-10)}`; // isolate this proof's jobs
  const A = "workerA-" + newId("w").slice(-6);
  const B = "workerB-" + newId("w").slice(-6);

  try {
    // 1. Two workers race for ONE pending job → exactly one claims it.
    await enqueueJob({ queue, type: "noop", payload: {} });
    const now = new Date();
    const [claimA, claimB] = await Promise.all([
      store.claimNext(queue, now, [], { owner: A, expiresAt: new Date(now.getTime() + 120_000) }),
      store.claimNext(queue, now, [], { owner: B, expiresAt: new Date(now.getTime() + 120_000) }),
    ]);
    const claimed = [claimA, claimB].filter(Boolean);
    assert(claimed.length === 1, `exactly one worker claims the pending job (got ${claimed.length})`);
    const jobId = claimed[0]!.id;
    const owner = claimA ? A : B;
    const loser = claimA ? B : A;

    // 2. LIVE lease → reclaimStalled must NOT reclaim it (a live worker's job is protected mid-run).
    const reclaimedLive = await store.reclaimStalled(new Date(now.getTime() - 10 * 60_000), now);
    const rowLive = (await db.select().from(jobs).where(eq(jobs.id, jobId)))[0];
    assert(rowLive.status === "active", "a job with a LIVE lease stays active (not reclaimed mid-run)");

    // 3. Lease EXPIRES (worker died) → reclaimStalled returns it to the queue.
    await db.update(jobs).set({ leaseExpiresAt: new Date(now.getTime() - 1000) }).where(eq(jobs.id, jobId));
    const reclaimed = await store.reclaimStalled(new Date(now.getTime() - 10 * 60_000), now);
    assert(reclaimed >= 1, "an EXPIRED-lease job is reclaimed (crash recovery)");
    const rowReclaimed = (await db.select().from(jobs).where(eq(jobs.id, jobId)))[0];
    assert(rowReclaimed.status === "pending" && rowReclaimed.leaseOwner === null, "reclaim returns it to 'pending' + clears the lease");

    // 4. New owner claims it; the OLD owner's late completion is a compare-and-set NO-OP (no double-complete).
    const claimNew = await store.claimNext(queue, now, [], { owner: B === loser ? B : loser, expiresAt: new Date(now.getTime() + 120_000) });
    assert(claimNew?.id === jobId, "the reclaimed job is re-claimable by another worker");
    const newOwner = claimNew!.leaseOwner!;
    await store.complete(jobId, { by: "ghost" }, now, owner); // the ORIGINAL owner lost the lease → must NOT apply
    const afterGhost = (await db.select().from(jobs).where(eq(jobs.id, jobId)))[0];
    assert(afterGhost.status === "active", "a worker that LOST the lease cannot complete the job (CAS no-op)");
    await store.complete(jobId, { by: "real" }, now, newOwner); // the CURRENT owner completes it
    const afterReal = (await db.select().from(jobs).where(eq(jobs.id, jobId)))[0];
    assert(afterReal.status === "completed", "the CURRENT lease owner completes it exactly once");
    assert((afterReal.result as { by?: string })?.by === "real", "the completion result is the real owner's, never the ghost's");

    console.log("✅ worker-lease DB proof passed — no double execution under multi-worker + crash reclaim");
  } finally {
    await db.delete(jobs).where(eq(jobs.queue, queue)).catch(() => {});
  }
  process.exit(0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
