/**
 * Real-DB proof (Postgres) that the Media Studio pipeline is DURABLE + WORKER-DRIVEN + honest — everything except
 * the live fal.ai call:
 *   create (validated, budget-capped, idempotent) → worker CLAIMS with a lease → DETERMINISTIC provider succeeds
 *   (real outputs) → an UNCONFIGURED provider (no fal key) → BLOCKED (never faked) → a failing provider RETRIES to
 *   the attempt cap then DEAD-LETTERS (failed) → an expired lease is RECLAIMED (crash recovery) → cancel.
 *
 * ISOLATED + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-media-db.ts
 */
import { inArray, eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { mediaJobs, auditLogs } from "@/db/schema";
import { createMediaJob, dispatchOneMediaJob, dispatchMediaJobs, cancelMediaJob, defaultStore as mediaStore, deterministicMediaProvider, falMediaProvider, type MediaProvider } from "@/lib/media";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const store = mediaStore(db);
  const jobIds: string[] = [];
  const track = <T extends { job?: { id: string } }>(r: T): T => { if (r.job) jobIds.push(r.job.id); return r; };

  const boomProvider: MediaProvider = { slug: "boom", configured: () => true, generate: async () => { throw new Error("provider exploded"); } };

  try {
    // Validation + budget cap.
    const bad = await createMediaJob({ kind: "image", prompt: "x", estimatedCostCents: 500, budgetCapCents: 100, requestedBy: "Moiz" }, { store });
    assert(!bad.ok && (bad.errors ?? []).some((e) => /budget cap/.test(e)), "a request whose estimate exceeds the budget cap is REJECTED before any spend");
    const badKind = await createMediaJob({ kind: "hologram", prompt: "x", estimatedCostCents: 0, budgetCapCents: 100, requestedBy: "Moiz" }, { store });
    assert(!badKind.ok, "an invalid media kind is REJECTED");

    // Create + idempotency.
    const c1 = track(await createMediaJob({ kind: "image", prompt: `hero shot ${uniq}`, provider: "deterministic", estimatedCostCents: 10, budgetCapCents: 100, requestedBy: "Moiz", dedupeKey: `media_${uniq}` }, { store }));
    assert(c1.ok && c1.job!.status === "queued", "a valid request is created QUEUED");
    const c2 = await createMediaJob({ kind: "image", prompt: `hero shot ${uniq}`, provider: "deterministic", estimatedCostCents: 10, budgetCapCents: 100, requestedBy: "Moiz", dedupeKey: `media_${uniq}` }, { store });
    assert(c2.deduped === true && c2.job!.id === c1.job!.id, "IDEMPOTENT: a repeated create with the same dedupeKey returns the same job (no duplicate)");

    // Worker claims + the DETERMINISTIC provider succeeds → real outputs.
    const d1 = await dispatchOneMediaJob({ store, providers: { deterministic: deterministicMediaProvider }, leaseOwner: "w1" });
    assert(d1.claimed && d1.jobId === c1.job!.id && d1.status === "succeeded", "the worker CLAIMS the queued job and the deterministic provider SUCCEEDS");
    const done = await store.getById(c1.job!.id);
    assert(done!.status === "succeeded" && done!.outputRefs.length >= 1 && done!.leaseOwner === null, "the succeeded job has real output refs + its lease is released");

    // An UNCONFIGURED provider (fal, no key) → BLOCKED (never faked).
    const blk = track(await createMediaJob({ kind: "video", prompt: `reel ${uniq}`, provider: "fal", estimatedCostCents: 0, budgetCapCents: 100, requestedBy: "Moiz" }, { store }));
    assert(!falMediaProvider.configured(), "precondition: no FAL key configured in this environment");
    const d2 = await dispatchOneMediaJob({ store, leaseOwner: "w1" }); // default registry → fal unconfigured
    assert(d2.status === "blocked", "an UNCONFIGURED provider yields a BLOCKED job — never a fabricated success");
    const blocked = await store.getById(blk.job!.id);
    assert(blocked!.status === "blocked" && /not configured/.test(blocked!.error ?? "") && blocked!.outputRefs.length === 0, "the blocked job carries an honest reason + NO outputs");

    // A failing provider RETRIES to the cap then DEAD-LETTERS.
    const fj = track(await createMediaJob({ kind: "image", prompt: `flaky ${uniq}`, provider: "boom", estimatedCostCents: 0, budgetCapCents: 100, requestedBy: "Moiz", maxAttempts: 2 }, { store }));
    const r1 = await dispatchOneMediaJob({ store, providers: { boom: boomProvider }, leaseOwner: "w1" });
    assert(r1.status === "queued", "a provider error RETRIES (attempt 1 → back to queued, under the cap)");
    const r2 = await dispatchOneMediaJob({ store, providers: { boom: boomProvider }, leaseOwner: "w1" });
    assert(r2.status === "failed", "at the attempt cap the job DEAD-LETTERS (failed) — bounded retries");
    const failed = await store.getById(fj.job!.id);
    assert(failed!.status === "failed" && failed!.attempts === 2 && /exploded/.test(failed!.error ?? ""), "the failed job records the attempts + the provider error");

    // CRASH RECOVERY: a job stuck 'generating' with an EXPIRED lease is reclaimed to queued.
    const rj = track(await createMediaJob({ kind: "image", prompt: `stuck ${uniq}`, provider: "deterministic", estimatedCostCents: 0, budgetCapCents: 100, requestedBy: "Moiz" }, { store }));
    await store.update(rj.job!.id, { status: "generating", leaseOwner: "dead-worker", leaseExpiresAt: new Date(Date.now() - 60_000) });
    const reclaimed = await store.reclaimStale(new Date());
    assert(reclaimed >= 1, "reclaimStale returns the number of stale-lease jobs reclaimed");
    assert((await store.getById(rj.job!.id))!.status === "queued", "CRASH RECOVERY: the expired-lease 'generating' job is reclaimed to queued");
    // …and a subsequent worker tick completes it.
    const tick = await dispatchMediaJobs({ store, providers: { deterministic: deterministicMediaProvider }, limit: 5 });
    assert(tick.dispatched >= 1 && (await store.getById(rj.job!.id))!.status === "succeeded", "a worker tick then drives the reclaimed job to succeeded");

    // Cancel a queued job.
    const cj = track(await createMediaJob({ kind: "image", prompt: `cancel ${uniq}`, provider: "deterministic", estimatedCostCents: 0, budgetCapCents: 100, requestedBy: "Moiz" }, { store }));
    assert((await cancelMediaJob(cj.job!.id, { canceledBy: "Moiz" }, { store })).ok, "a queued job can be CANCELED by the founder");
    assert((await store.getById(cj.job!.id))!.status === "canceled", "the canceled job is terminal");

    console.log("\n✅ media DB proof passed");
  } finally {
    if (jobIds.length) {
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, jobIds));
      await db.delete(mediaJobs).where(inArray(mediaJobs.id, jobIds));
    }
    await closeDb();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
