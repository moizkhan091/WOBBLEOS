import { describe, expect, it } from "vitest";
import { createSchedulerLock, SCHEDULER_ADVISORY_LOCK_KEY, type LockClient } from "@/lib/scheduler/leader";

/**
 * Proves the scheduler singleton (WOB-AUD-003): a shared advisory-lock "server" grants the lock to
 * exactly one client at a time; a second worker cannot become leader while the first holds it; and a
 * follower is promoted once the leader releases (mirrors a leader crash dropping its connection).
 */

/** In-memory stand-in for Postgres advisory locks keyed by lock id. One holder at a time. */
function makeFakeLockServer() {
  const held = new Set<number>();
  return {
    held,
    createClient(): LockClient {
      let myLocks = new Set<number>();
      let ended = false;
      return {
        async connect() {},
        async query(sql: string, params?: unknown[]) {
          const key = Number((params ?? [])[0]);
          if (ended) throw new Error("client ended");
          if (sql.includes("pg_try_advisory_lock")) {
            if (held.has(key)) return { rows: [{ ok: false }] };
            held.add(key);
            myLocks.add(key);
            return { rows: [{ ok: true }] };
          }
          if (sql.includes("pg_advisory_unlock")) {
            if (myLocks.has(key)) { held.delete(key); myLocks.delete(key); }
            return { rows: [{ ok: true }] };
          }
          return { rows: [] };
        },
        async end() {
          // Dropping the connection releases every lock it held (Postgres session semantics).
          ended = true;
          for (const k of myLocks) held.delete(k);
          myLocks = new Set();
        },
      };
    },
  };
}

describe("scheduler leader election", () => {
  it("grants leadership to exactly one worker; the second stays a follower", async () => {
    const server = makeFakeLockServer();
    const a = createSchedulerLock({ connectionString: "x", createClient: () => server.createClient() });
    const b = createSchedulerLock({ connectionString: "x", createClient: () => server.createClient() });

    expect(await a.tryAcquire()).toBe(true);
    expect(await b.tryAcquire()).toBe(false);
    expect(a.isLeader()).toBe(true);
    expect(b.isLeader()).toBe(false);
    // Re-attempting is a cheap no-op for the leader and still denied for the follower.
    expect(await a.tryAcquire()).toBe(true);
    expect(await b.tryAcquire()).toBe(false);
  });

  it("promotes a follower after the leader releases (failover)", async () => {
    const server = makeFakeLockServer();
    const a = createSchedulerLock({ connectionString: "x", createClient: () => server.createClient() });
    const b = createSchedulerLock({ connectionString: "x", createClient: () => server.createClient() });

    expect(await a.tryAcquire()).toBe(true);
    expect(await b.tryAcquire()).toBe(false);

    await a.release(); // leader steps down (or crashes → connection dropped)
    expect(a.isLeader()).toBe(false);

    expect(await b.tryAcquire()).toBe(true); // follower is promoted
    expect(b.isLeader()).toBe(true);
    expect(server.held.has(SCHEDULER_ADVISORY_LOCK_KEY)).toBe(true);
  });

  it("without a DATABASE_URL there is no leader (no crash)", async () => {
    const lock = createSchedulerLock({ connectionString: undefined });
    expect(await lock.tryAcquire()).toBe(false);
    expect(lock.isLeader()).toBe(false);
    await lock.release(); // safe no-op
  });
});
