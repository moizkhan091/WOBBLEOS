import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { workerHeartbeats } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { getBuildId } from "@/lib/build/version";

/**
 * Chunk 07: Worker heartbeats.
 *
 * Canonical heartbeat lives in the `worker_heartbeats` table (read by the
 * Workers Health page, Chunk 20). We also write a small JSON file so the
 * existing `/api/health/worker` route keeps working. `isHeartbeatStale` lets
 * the health page flag offline workers.
 */

export type WorkerHeartbeatStatus = "online" | "stopped" | "stale" | "error";

export interface HeartbeatRow {
  id: string;
  workerName: string;
  workerType: string;
  status: string;
  currentJobId: string | null;
  heartbeatAt: Date;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface BuildHeartbeatInput {
  workerName: string;
  workerType: string;
  status: WorkerHeartbeatStatus | string;
  currentJobId?: string;
  now?: Date;
  /** Overridable for tests; defaults to the id stamped into this worker's image. */
  buildId?: string;
}

/**
 * Every heartbeat carries the worker's BUILD ID (WOB-UAT-026). This is what lets the app detect that a
 * worker is running different code from itself — the failure mode that a partial `--build app` rebuild
 * produces silently. It rides in `metadata` (already jsonb) so no migration is needed.
 */
export function buildHeartbeatRow(input: BuildHeartbeatInput): HeartbeatRow {
  const now = input.now ?? new Date();
  return {
    id: `heartbeat_${input.workerName}`,
    workerName: input.workerName,
    workerType: input.workerType,
    status: input.status,
    currentJobId: input.currentJobId ?? null,
    heartbeatAt: now,
    metadata: { buildId: input.buildId ?? getBuildId() },
    createdAt: now,
    updatedAt: now,
  };
}

export function isHeartbeatStale(heartbeatAt: Date, now: Date = new Date(), thresholdMs = 30_000): boolean {
  return now.getTime() - heartbeatAt.getTime() > thresholdMs;
}

/** Upsert the heartbeat row keyed by its deterministic id (one row per worker). */
export async function writeHeartbeat(input: BuildHeartbeatInput, db: Db = getDb()): Promise<HeartbeatRow> {
  const row = buildHeartbeatRow(input);
  await db
    .insert(workerHeartbeats)
    .values(row)
    .onConflictDoUpdate({
      target: workerHeartbeats.id,
      set: {
        status: row.status,
        currentJobId: row.currentJobId,
        heartbeatAt: row.heartbeatAt,
        // MUST be refreshed on every beat: a replaced container reuses the same heartbeat row id, so a
        // stale metadata.buildId here would report the OLD image forever and defeat the parity check.
        metadata: row.metadata,
        updatedAt: row.updatedAt,
      },
    });
  return row;
}

/**
 * Backwards-compatible file heartbeat for the existing /api/health/worker route.
 *
 * Also carries `buildId` (WOB-UAT-026): the file heartbeat is the ONE channel both workers write (the
 * media worker writes only a file, not the DB row), and readiness already reads it — so it is the only
 * place the app can see every worker's running code version.
 */
export async function writeHeartbeatFile(
  state: string,
  storageRoot: string = process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage"),
  fileName = "worker-heartbeat.json",
): Promise<void> {
  const heartbeatPath = path.join(storageRoot, "temp", fileName);
  await mkdir(path.dirname(heartbeatPath), { recursive: true });
  await writeFile(heartbeatPath, JSON.stringify({ state, at: new Date().toISOString(), buildId: getBuildId() }, null, 2));
}
