import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

/**
 * Shared Postgres/Drizzle client for WOBBLE OS.
 *
 * Local-first: this is the single real data path used by API routes and
 * workers. It is intentionally lazy so importing this module never throws
 * at build time or in tests that only exercise pure domain logic.
 */

let pool: Pool | undefined;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set. Configure it in .env before using the database.");
    }
    const num = (v: string | undefined, d: number) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : d;
    };
    pool = new Pool({
      connectionString,
      max: num(process.env.PG_POOL_MAX, 10),
      connectionTimeoutMillis: num(process.env.PG_CONNECT_TIMEOUT_MS, 10_000), // fail a stuck CONNECT fast (don't hang the poll loop)
      idleTimeoutMillis: num(process.env.PG_IDLE_TIMEOUT_MS, 30_000),
      // Bound a single stalled STATEMENT so a slow/locked DB surfaces as an error the worker loop retries,
      // instead of hanging forever with no restart signal (audit MED-4). Per-statement, not per-job — LLM
      // calls are not DB statements, so this never trips a legitimately long handler.
      statement_timeout: num(process.env.PG_STATEMENT_TIMEOUT_MS, 120_000),
    });
    // node-postgres emits 'error' on the POOL when the backend drops an IDLE pooled client — a routine
    // managed-Postgres idle timeout, a DB restart, or a network blip. Unhandled, this CRASHES the whole
    // process (every worker + the app), taking down job processing and the scheduler for one infra blip.
    // Log + swallow: the pool discards the bad client and the next query transparently gets a fresh one.
    pool.on("error", (err) => {
      console.error("[db] idle client error (recovered):", err instanceof Error ? err.message : err);
    });
  }
  return pool;
}

export function getDb() {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema });
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    dbInstance = undefined;
  }
}

export { schema };
export type Db = ReturnType<typeof getDb>;
