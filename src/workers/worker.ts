import { runWorker } from "@/lib/workers/runtime";
import { generalRegistry } from "@/lib/workers/registry";
import { writeHeartbeat, writeHeartbeatFile } from "@/lib/workers/heartbeat";
import { runScheduledTick } from "@/lib/scheduler";
import { createSchedulerLock } from "@/lib/scheduler/leader";
import { assertRuntimeConfig } from "@/lib/config/validate";
import { closeDb } from "@/db";

/**
 * Chunk 07: General worker entrypoint (`npm run worker`).
 *
 * Runs OUTSIDE Next.js as its own Node process. It polls the `general` queue,
 * runs registered job handlers via the runtime loop, writes heartbeats (DB +
 * file), and shuts down cleanly on SIGINT/SIGTERM.
 */

const WORKER_NAME = "general";
const WORKER_TYPE = "general";

// Bounded graceful-shutdown window: finish the current job if it returns promptly, but if a handler hangs
// past the deadline, force-exit ourselves BEFORE the container's SIGKILL lands mid-write (audit MED-10). The
// stale-claim reclaim makes an interrupted job re-claimable, so a clean self-exit beats a SIGKILL.
const SHUTDOWN_DEADLINE_MS = Number(process.env.WORKER_SHUTDOWN_DEADLINE_MS) || 25_000;
let stopping = false;
const requestStop = () => {
  if (stopping) return;
  stopping = true;
  const t = setTimeout(() => {
    console.error(`[worker] shutdown deadline (${SHUTDOWN_DEADLINE_MS}ms) exceeded — forcing exit`);
    process.exit(0);
  }, SHUTDOWN_DEADLINE_MS);
  t.unref?.();
};
process.on("SIGINT", requestStop);
process.on("SIGTERM", requestStop);

async function heartbeat(status: string, currentJobId?: string): Promise<void> {
  await writeHeartbeatFile(status);
  if (process.env.DATABASE_URL) {
    try {
      await writeHeartbeat({ workerName: WORKER_NAME, workerType: WORKER_TYPE, status, currentJobId });
    } catch (error) {
      console.error("failed to write DB heartbeat:", error instanceof Error ? error.message : error);
    }
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    await writeHeartbeatFile("missing_database_url");
    console.error("DATABASE_URL is not set; worker cannot process jobs.");
    process.exit(1);
    return;
  }

  // Fail fast on missing critical config in production (WOB-AUD-017).
  assertRuntimeConfig(process.env, { context: "worker" });

  console.log(`[worker:${WORKER_NAME}] starting`);

  // THE SCHEDULER — fires all due cadence work (automations, research scouts, scheduled posts,
  // daily maintenance) every 60s. Without this, every "runs on its own" feature is inert.
  //
  // SINGLETON: exactly ONE general worker fleet-wide runs the tick, elected via a Postgres advisory
  // lock (see scheduler/leader.ts). Scaling `worker` adds job consumers WITHOUT double-firing cadence
  // work. A follower promotes itself if the current leader dies (its lock auto-releases).
  const schedulerLock = createSchedulerLock();
  const becameLeader = await schedulerLock.tryAcquire();
  console.log(`[worker:${WORKER_NAME}] scheduler leadership: ${becameLeader ? "LEADER (running the tick)" : "follower (job consumer only)"}`);

  let lastMaintenance = 0;
  let ticking = false;
  const SCHEDULE_INTERVAL_MS = 60_000;
  const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60_000;
  const scheduleTimer = setInterval(() => {
    // Re-check/attempt leadership each tick (promotes a follower if the previous leader died), then only
    // the leader runs the tick. `ticking` guards against overlapping ticks on a slow cycle.
    if (ticking) return;
    ticking = true;
    schedulerLock
      .tryAcquire()
      .then(async (isLeader) => {
        if (!isLeader) return;
        const runMaintenance = Date.now() - lastMaintenance >= MAINTENANCE_INTERVAL_MS;
        if (runMaintenance) lastMaintenance = Date.now();
        // runDepartmentConsumers: drive the autonomous inter-department chain (claim + run routed handoffs).
        const r = await runScheduledTick({ runMaintenance, runDepartmentConsumers: true });
        if (r.automationsFired || r.scoutsEnqueued || r.postsDispatched || r.departmentHandoffsConsumed || r.maintenanceRan) console.log(`[scheduler] fired`, r);
      })
      .catch((e) => console.error("[scheduler] tick failed:", e instanceof Error ? e.message : e))
      .finally(() => { ticking = false; });
  }, SCHEDULE_INTERVAL_MS);
  scheduleTimer.unref?.();

  const { processedCount } = await runWorker({
    queue: WORKER_NAME,
    registry: generalRegistry,
    shouldStop: () => stopping,
    heartbeat,
  });

  clearInterval(scheduleTimer);
  await schedulerLock.release();
  await closeDb();
  console.log(`[worker:${WORKER_NAME}] stopped after processing ${processedCount} job(s)`);
  process.exit(0);
}

main().catch(async (error) => {
  await writeHeartbeatFile(`error:${error instanceof Error ? error.message : "unknown"}`);
  console.error("[worker] fatal:", error);
  process.exit(1);
});
