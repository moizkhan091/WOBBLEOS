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
    pool = new Pool({ connectionString });
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
