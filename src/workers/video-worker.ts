import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { closeDb } from "@/db";
import { getBuildId } from "@/lib/build/version";
import { assertRuntimeConfig } from "@/lib/config/validate";
import { runMediaWorkerCycle } from "@/lib/media/worker";

const storageRoot = process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage");
const heartbeatPath = path.join(storageRoot, "temp", "video-worker-heartbeat.json");
const workerId = `media-worker-${process.pid}`;
const pollIntervalMs = Number(process.env.MEDIA_WORKER_POLL_MS ?? 5_000);
let stopping = false;

async function writeHeartbeat(state: string, detail: Record<string, unknown> = {}) {
  await mkdir(path.dirname(heartbeatPath), { recursive: true });
  // `buildId` lets /api/health/version catch this worker running different code from the app
  // (WOB-UAT-026) — a partial `--build app` rebuild leaves this container on the previous image.
  await writeFile(
    heartbeatPath,
    JSON.stringify({ state, at: new Date().toISOString(), workerId, buildId: getBuildId(), ...detail }, null, 2),
  );
  // Also write the worker_heartbeats DB row so the media worker appears on /api/workers alongside the general
  // worker (the file heartbeat only feeds /api/health/video-worker). Best-effort — never breaks the cycle.
  if (process.env.DATABASE_URL) {
    try {
      const { writeHeartbeat: writeDbHeartbeat } = await import("@/lib/workers/heartbeat");
      await writeDbHeartbeat({ workerName: "media", workerType: "video", status: state.startsWith("error") ? "error" : state });
    } catch (error) {
      console.error("[worker:media] DB heartbeat failed:", error instanceof Error ? error.message : error);
    }
  }
}

// Bounded graceful shutdown (audit MED-10): if a render outlives the deadline, self-exit before the
// container SIGKILLs mid-write. The media lease + stale-reclaim make the interrupted job re-claimable.
const SHUTDOWN_DEADLINE_MS = Number(process.env.WORKER_SHUTDOWN_DEADLINE_MS) || 25_000;
const requestStop = () => {
  if (stopping) return;
  stopping = true;
  const t = setTimeout(() => {
    console.error(`[worker:media] shutdown deadline (${SHUTDOWN_DEADLINE_MS}ms) exceeded — forcing exit`);
    process.exit(0);
  }, SHUTDOWN_DEADLINE_MS);
  t.unref?.();
};
process.on("SIGINT", requestStop);
process.on("SIGTERM", requestStop);

async function main() {
  if (!process.env.DATABASE_URL) {
    await writeHeartbeat("missing_database_url");
    throw new Error("DATABASE_URL is not set; media worker cannot process jobs");
  }
  assertRuntimeConfig(process.env, { context: "worker" });
  console.log(`[worker:media] starting as ${workerId}`);

  while (!stopping) {
    try {
      const result = await runMediaWorkerCycle({ leaseOwner: workerId });
      await writeHeartbeat("running", { lastCycle: result });
      if (result.dispatched || result.reclaimed) console.log("[worker:media] cycle", result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      await writeHeartbeat(`error:${message}`);
      console.error("[worker:media] cycle failed:", message);
    }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  await writeHeartbeat("stopped");
  await closeDb();
  console.log("[worker:media] stopped");
}

main().catch(async (error) => {
  await writeHeartbeat(`error:${error instanceof Error ? error.message : "unknown"}`).catch(() => {});
  console.error("[worker:media] fatal:", error);
  process.exit(1);
});
