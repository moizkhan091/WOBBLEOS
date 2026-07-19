import { Client } from "pg";

/**
 * Scheduler singleton leadership (WOB-AUD-003).
 *
 * The general worker runs the cadence scheduler (`runScheduledTick`). If more than one general worker
 * is deployed (horizontal scaling), EACH would otherwise fire the same due automations, scouts, posts,
 * and maintenance — double-executing scheduled work. This module elects a single scheduler leader with
 * a Postgres SESSION-level advisory lock held on a DEDICATED connection:
 *
 *   - `pg_try_advisory_lock(key)` succeeds for exactly one worker fleet-wide; that worker is the leader.
 *   - The lock is held for the life of the dedicated connection. If the leader crashes, Postgres drops
 *     the connection and releases the lock automatically, so a follower's next `tryAcquire()` promotes it.
 *   - Followers still process jobs — they just don't run the scheduler tick.
 *
 * A dedicated `pg.Client` (not the shared pool) is used deliberately: advisory locks are per-session, and
 * a pooled connection could be handed to another query and lose the lock. Injectable client factory keeps
 * it unit-testable without a real database.
 */

export const SCHEDULER_ADVISORY_LOCK_KEY = 720414; // stable, app-wide key for the scheduler singleton

export interface LockClient {
  connect(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  end(): Promise<void>;
  /** pg.Client emits 'error' when its session drops; wiring it prevents an unhandled-error process crash. */
  on?(event: string, cb: (err: unknown) => void): void;
}

export interface SchedulerLock {
  /** True once this instance holds scheduler leadership. */
  isLeader(): boolean;
  /** Acquire leadership if not already held. Cheap no-op when already leader. Safe to call every tick. */
  tryAcquire(): Promise<boolean>;
  /** Release leadership + close the dedicated connection (call on shutdown). */
  release(): Promise<void>;
}

export interface SchedulerLockDeps {
  connectionString?: string;
  lockKey?: number;
  /** Injectable client factory (tests provide a fake). Defaults to a real dedicated pg.Client. */
  createClient?: (connectionString: string) => LockClient;
}

export function createSchedulerLock(deps: SchedulerLockDeps = {}): SchedulerLock {
  const key = deps.lockKey ?? SCHEDULER_ADVISORY_LOCK_KEY;
  const connectionString = deps.connectionString ?? process.env.DATABASE_URL;
  const factory = deps.createClient ?? ((cs: string) => new Client({ connectionString: cs }) as unknown as LockClient);

  let client: LockClient | null = null;
  let leader = false;

  return {
    isLeader: () => leader,

    async tryAcquire() {
      if (!connectionString) return false;
      try {
        if (leader && client) {
          // Already leader — RE-VALIDATE the session still holds the lock. A silently-dropped dedicated
          // connection (idle timeout / DB restart / network blip) releases the advisory lock server-side,
          // so a follower could acquire it while we still believe we're leader → split-brain double-firing
          // (audit MED-5). A cheap liveness probe: if it throws, we fall through to catch + re-acquire.
          await client.query("select 1");
          return true;
        }
        if (!client) {
          client = factory(connectionString);
          // Demote on a dropped session so we stop running the tick; also prevents an unhandled 'error' on
          // the dedicated client from crashing the process (mirrors the pool error handler).
          client.on?.("error", () => { leader = false; });
          await client.connect();
        }
        const res = await client.query("select pg_try_advisory_lock($1) as ok", [key]);
        leader = res.rows[0]?.ok === true;
        if (!leader) {
          // Not the leader — drop the idle connection so a later attempt opens a fresh one (and so we
          // never sit on a spare DB connection as a follower).
          await client.end().catch(() => {});
          client = null;
        }
        return leader;
      } catch {
        // Connection error — reset so the next tick retries cleanly.
        if (client) await client.end().catch(() => {});
        client = null;
        leader = false;
        return false;
      }
    },

    async release() {
      if (!client) return;
      try {
        if (leader) await client.query("select pg_advisory_unlock($1)", [key]).catch(() => {});
      } finally {
        await client.end().catch(() => {});
        client = null;
        leader = false;
      }
    },
  };
}
