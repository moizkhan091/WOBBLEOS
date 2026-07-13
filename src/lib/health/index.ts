import { sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";

/**
 * Liveness + readiness health for the isolated deploy. Readiness = the DB is reachable (a real `select 1`), so a
 * load balancer / docker healthcheck / the founder can tell "the app is up AND can serve" vs "up but degraded".
 * No auth (a health probe must be reachable by the orchestrator); it exposes NO business data — only up/down + a count.
 */
export interface HealthStatus {
  ok: boolean;
  status: "healthy" | "degraded";
  db: "up" | "down";
  dbLatencyMs: number | null;
  checkedAt: string;
}

export interface HealthDeps {
  pingDb?: () => Promise<void>;
  now?: () => Date;
}

export async function getHealthStatus(deps: HealthDeps = {}): Promise<HealthStatus> {
  const now = deps.now ?? (() => new Date());
  const checkedAt = now().toISOString();
  if (!deps.pingDb && !process.env.DATABASE_URL) {
    return { ok: false, status: "degraded", db: "down", dbLatencyMs: null, checkedAt };
  }
  const ping = deps.pingDb ?? (async () => { await (getDb() as Db).execute(sql`select 1`); });
  const start = now().getTime();
  try {
    await ping();
    return { ok: true, status: "healthy", db: "up", dbLatencyMs: Math.max(0, now().getTime() - start), checkedAt };
  } catch {
    return { ok: false, status: "degraded", db: "down", dbLatencyMs: null, checkedAt };
  }
}
