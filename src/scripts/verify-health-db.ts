/**
 * Real-DB proof (Postgres) that the health/readiness endpoint reflects REAL DB reachability:
 *   DB up → { ok:true, status:"healthy", db:"up" } with a real latency; an injected DB fault → degraded/down (503).
 *   This is what a load balancer / docker healthcheck polls to pull a degraded instance out of rotation.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-health-db.ts
 */
import { closeDb } from "@/db";
import { getHealthStatus } from "@/lib/health";

async function main() {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  try {
    // Real DB (DATABASE_URL is set) → healthy, db up, a measured latency, ok=true.
    const up = await getHealthStatus();
    assert(up.ok === true && up.status === "healthy" && up.db === "up", "with the real DB reachable, readiness is HEALTHY (db up)");
    assert(up.dbLatencyMs !== null && up.dbLatencyMs >= 0, "readiness reports a real DB ping latency (a genuine `select 1`, not a fake)");

    // Injected DB fault → degraded/down (the endpoint would return 503 so the orchestrator de-rotates it).
    const down = await getHealthStatus({ pingDb: async () => { throw new Error("connection refused"); } });
    assert(down.ok === false && down.status === "degraded" && down.db === "down" && down.dbLatencyMs === null, "a DB fault → DEGRADED (db down, ok=false) — the probe never fakes healthy");

    console.log("\n✅ health DB proof passed");
  } finally {
    await closeDb();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
