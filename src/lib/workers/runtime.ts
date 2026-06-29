import { processNextJob, type JobHandlerRegistry, type ProcessResult } from "@/lib/jobs";

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
  process?: (queue: string, registry: JobHandlerRegistry) => Promise<ProcessResult>;
  heartbeat?: (status: string, currentJobId?: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
}

export interface RunWorkerResult {
  processedCount: number;
}

export async function runWorker(opts: RunWorkerOptions): Promise<RunWorkerResult> {
  const run = opts.process ?? ((queue, registry) => processNextJob(queue, registry));
  const heartbeat = opts.heartbeat ?? (async () => undefined);
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const idleDelayMs = opts.idleDelayMs ?? 1000;

  let processedCount = 0;
  await heartbeat("online");

  while (!opts.shouldStop()) {
    const result = await run(opts.queue, opts.registry);
    if (result.processed) {
      processedCount += 1;
      await heartbeat("online", result.jobId);
    } else {
      await heartbeat("online");
      await sleep(idleDelayMs);
    }
  }

  await heartbeat("stopped");
  return { processedCount };
}
