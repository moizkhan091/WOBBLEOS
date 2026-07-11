import { runWorker } from "@/lib/workers/runtime";
import { generalRegistry } from "@/lib/workers/registry";
import { writeHeartbeat, writeHeartbeatFile } from "@/lib/workers/heartbeat";
import { runScheduledTick } from "@/lib/scheduler";
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

let stopping = false;
const requestStop = () => {
  stopping = true;
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

  console.log(`[worker:${WORKER_NAME}] starting`);

  // THE SCHEDULER — fires all due cadence work (automations, research scouts, scheduled posts,
  // daily maintenance) every 60s. Without this, every "runs on its own" feature is inert.
  let lastMaintenance = 0;
  const SCHEDULE_INTERVAL_MS = 60_000;
  const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60_000;
  const scheduleTimer = setInterval(() => {
    const runMaintenance = Date.now() - lastMaintenance >= MAINTENANCE_INTERVAL_MS;
    if (runMaintenance) lastMaintenance = Date.now();
    runScheduledTick({ runMaintenance })
      .then((r) => { if (r.automationsFired || r.scoutsEnqueued || r.postsDispatched || r.maintenanceRan) console.log(`[scheduler] fired`, r); })
      .catch((e) => console.error("[scheduler] tick failed:", e instanceof Error ? e.message : e));
  }, SCHEDULE_INTERVAL_MS);
  scheduleTimer.unref?.();

  const { processedCount } = await runWorker({
    queue: WORKER_NAME,
    registry: generalRegistry,
    shouldStop: () => stopping,
    heartbeat,
  });

  clearInterval(scheduleTimer);
  await closeDb();
  console.log(`[worker:${WORKER_NAME}] stopped after processing ${processedCount} job(s)`);
  process.exit(0);
}

main().catch(async (error) => {
  await writeHeartbeatFile(`error:${error instanceof Error ? error.message : "unknown"}`);
  console.error("[worker] fatal:", error);
  process.exit(1);
});
