import { processNextJob, reclaimStalledJobs, type JobHandlerRegistry, type ProcessResult } from "@/lib/jobs";

/**
 * Chunk 07: Worker runtime loop (pure orchestration; injectable for tests).
 *
 * runWorker polls a queue: claim+run the next job (via processNextJob), update
 * the heartbeat, and idle-sleep when there is nothing to do. It stops cleanly
 * when `shouldStop()` becomes true (driven by SIGINT/SIGTERM in the entrypoint)
 * and writes a final "stopped" heartbeat. `process`, `heartbeat`, and `sleep`
 * are injectable so the loop can be tested without a DB or real timers.
 */

export interface RunWorkerOptions {
  queue: string;
  registry: JobHandlerRegistry;
  shouldStop: () => boolean;
  idleDelayMs?: number;
  /** Unique lease-owner token for this worker process — enables the multi-worker execution lease on each claim. */
  leaseOwner?: string;
  process?: (queue: string, registry: JobHandlerRegistry) => Promise<ProcessResult>;
  heartbeat?: (status: string, currentJobId?: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  /** Reclaim jobs stranded by crashed workers. Defaults to reclaimStalledJobs; runs every ~30 idle cycles. */
  reclaimStalled?: () => Promise<number>;
  reclaimEveryIdleCycles?: number;
}

export interface RunWorkerResult {
  processedCount: number;
}

export async function runWorker(opts: RunWorkerOptions): Promise<RunWorkerResult> {
  const run = opts.process ?? ((queue, registry) => processNextJob(queue, registry, opts.leaseOwner ? { leaseOwner: opts.leaseOwner } : {}));
  const heartbeat = opts.heartbeat ?? (async () => undefined);
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const idleDelayMs = opts.idleDelayMs ?? 1000;
  const reclaim = opts.reclaimStalled ?? (() => reclaimStalledJobs());
  const reclaimEvery = opts.reclaimEveryIdleCycles ?? 30;

  let processedCount = 0;
  let idleCycles = 0;
  await heartbeat("online");

  while (!opts.shouldStop()) {
    try {
      const result = await run(opts.queue, opts.registry);
      if (result.processed) {
        processedCount += 1;
        await heartbeat("online", result.jobId);
      } else {
        idleCycles += 1;
        // Periodically rescue jobs stranded by a crashed worker (cheap no-op UPDATE when none).
        if (idleCycles % reclaimEvery === 0) await reclaim().catch(() => 0);
        await heartbeat("online");
        await sleep(idleDelayMs);
      }
    } catch (err) {
      // A transient error in claim / kill-switch load / complete must NOT terminate the loop and exit the
      // process (audit HIGH-3). Log, write an error heartbeat, back off, and keep polling — the in-flight
      // job stays active/reclaimable for a retry rather than the whole worker dying on one blip.
      console.error("[worker] poll iteration failed (continuing):", err instanceof Error ? err.message : err);
      await heartbeat("error").catch(() => undefined);
      await sleep(idleDelayMs).catch(() => undefined);
    }
  }

  await heartbeat("stopped");
  return { processedCount };
}
