import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { workerHeartbeats } from "@/db/schema";
import { getDb, type Db } from "@/db";

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
}

export function buildHeartbeatRow(input: BuildHeartbeatInput): HeartbeatRow {
  const now = input.now ?? new Date();
  return {
    id: `heartbeat_${input.workerName}`,
    workerName: input.workerName,
    workerType: input.workerType,
    status: input.status,
    currentJobId: input.currentJobId ?? null,
    heartbeatAt: now,
    metadata: {},
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
        updatedAt: row.updatedAt,
      },
    });
  return row;
}

/** Backwards-compatible file heartbeat for the existing /api/health/worker route. */
export async function writeHeartbeatFile(
  state: string,
  storageRoot: string = process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage"),
): Promise<void> {
  const heartbeatPath = path.join(storageRoot, "temp", "worker-heartbeat.json");
  await mkdir(path.dirname(heartbeatPath), { recursive: true });
  await writeFile(heartbeatPath, JSON.stringify({ state, at: new Date().toISOString() }, null, 2));
}
