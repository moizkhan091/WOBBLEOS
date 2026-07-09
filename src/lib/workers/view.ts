import { desc } from "drizzle-orm";
import { workerHeartbeats } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { isHeartbeatStale } from "@/lib/workers/heartbeat";
import { listJobs } from "@/lib/jobs";

/** Workers overview — live heartbeats (online/stale) + a job-queue summary. Read-only. */

export interface WorkerView {
  id: string;
  workerName: string;
  workerType: string;
  status: string;
  live: boolean;
  currentJobId: string | null;
  heartbeatAt: Date;
  lastSeenSecondsAgo: number;
}

export interface WorkersOverview {
  workers: WorkerView[];
  online: number;
  stale: number;
  queue: { total: number; byStatus: Record<string, number>; byQueue: Record<string, number> };
}

export async function getWorkersOverview(deps: { db?: Db; now?: Date } = {}): Promise<WorkersOverview> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const rows = await db.select().from(workerHeartbeats).orderBy(desc(workerHeartbeats.heartbeatAt)).limit(100);
  const workers: WorkerView[] = rows.map((r) => {
    const live = !isHeartbeatStale(r.heartbeatAt, now);
    return {
      id: r.id,
      workerName: r.workerName,
      workerType: r.workerType,
      status: r.status,
      live,
      currentJobId: r.currentJobId,
      heartbeatAt: r.heartbeatAt,
      lastSeenSecondsAgo: Math.max(0, Math.round((now.getTime() - r.heartbeatAt.getTime()) / 1000)),
    };
  });

  const recent = await listJobs({ limit: 200 }, db);
  const byStatus: Record<string, number> = {};
  const byQueue: Record<string, number> = {};
  for (const j of recent) {
    byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
    byQueue[j.queue] = (byQueue[j.queue] ?? 0) + 1;
  }

  return {
    workers,
    online: workers.filter((w) => w.live).length,
    stale: workers.filter((w) => !w.live).length,
    queue: { total: recent.length, byStatus, byQueue },
  };
}
