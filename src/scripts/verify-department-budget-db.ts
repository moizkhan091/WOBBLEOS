/**
 * Real-DB proof for the department budget runtime (Phase 3) against live Postgres — including the
 * CONCURRENCY RACE: two jobs firing at once cannot both spend the same remaining budget (the per-department
 * FOR UPDATE lock serializes them). Also proves settle, retry-no-double-charge, block-before-provider,
 * founder override, and reservation expiry.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-department-budget-db.ts
 */
import { getDb, closeDb } from "@/db";
import { budgetReservations, departments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createDepartment, defaultStore as registryStore } from "@/lib/departments/registry";
import { reserveBudget, settleBudget, expireStaleReservations, defaultBudgetStore } from "@/lib/departments/budget";
import { buildBudgetReservationRow } from "@/lib/domain/department-budget";

async function main() {
  const db = getDb();
  const now = new Date();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const slug = `verify_budget_${Date.now()}`;
  const rdeps = { store: registryStore(db), recordAudit: async () => {} };
  const deps = { store: registryStore(db), budgetStore: defaultBudgetStore(db), recordAudit: async () => {}, now };

  // Department with a daily cap of 100¢, high concurrency (so the race is a BUDGET race, not a concurrency one).
  await createDepartment({ slug, name: "Verify Budget", purpose: "verify", status: "active", budget: { dailyCents: 100 } as never, limits: { concurrencyLimit: 50, timeoutMs: 60000, retryPolicy: { maxRetries: 2, backoffMs: 1000 } } }, rdeps);

  // 1. Reserve → settle.
  const r1 = await reserveBudget({ departmentSlug: slug, workflowId: "wf", taskId: "t1", estimatedCents: 40, estimatedTokens: 100 }, deps);
  assert(r1.ok && !!r1.reservation, "reserved 40¢");
  assert(await settleBudget(r1.reservation!.id, { actualCents: 25, actualTokens: 90 }, deps), "settled against actual 25¢");

  // 2. Retry the SAME unit → deduped, no double-charge.
  const r1b = await reserveBudget({ departmentSlug: slug, workflowId: "wf", taskId: "t1", estimatedCents: 40 }, deps);
  assert(r1b.deduped && r1b.reservation!.id === r1.reservation!.id, "retry reuses the reservation (no double-charge)");

  // 3. THE RACE: daily used = 25 (settled). Two concurrent 60¢ reservations — only ONE fits (25+60=85 ok;
  //    both would be 25+120=145 > 100). The FOR UPDATE lock must let exactly one through.
  const [a, b] = await Promise.all([
    reserveBudget({ departmentSlug: slug, workflowId: "wf", taskId: "race_a", estimatedCents: 60 }, deps),
    reserveBudget({ departmentSlug: slug, workflowId: "wf", taskId: "race_b", estimatedCents: 60 }, deps),
  ]);
  const succeeded = [a, b].filter((r) => r.ok).length;
  assert(succeeded === 1, `exactly ONE concurrent 60¢ reservation succeeded (no double-spend) — got ${succeeded}`);
  assert([a, b].some((r) => !r.ok && r.evaluation.blockedBy === "daily_cents"), "the loser was blocked on daily_cents");

  // 4. Block before the provider call: a 200¢ request is refused with no row.
  const blocked = await reserveBudget({ departmentSlug: slug, workflowId: "wf", taskId: "big", estimatedCents: 200 }, deps);
  assert(!blocked.ok && blocked.reservation === null, "an over-cap request is BLOCKED with no reservation row");

  // 5. Founder override reserves past the block, recorded.
  const ov = await reserveBudget({ departmentSlug: slug, workflowId: "wf", taskId: "override", estimatedCents: 200, overrideBy: "Moiz" }, deps);
  assert(ov.ok && ov.overridden && ov.reservation!.overrideBy === "Moiz", "founder override reserves past the block (overrideBy recorded)");

  // 6. Expiry releases an abandoned hold.
  const stale = buildBudgetReservationRow({ departmentSlug: slug, workflowId: "wf", taskId: "stale", estimatedCents: 10 }, { now: new Date(now.getTime() - 60 * 60_000), ttlMs: 60_000 });
  await db.insert(budgetReservations).values(stale as never);
  const expired = await expireStaleReservations(deps);
  assert(expired >= 1, "expireStaleReservations released the abandoned hold");

  // Cleanup.
  await db.delete(budgetReservations).where(eq(budgetReservations.departmentSlug, slug));
  await db.delete(departments).where(eq(departments.slug, slug));
  console.log("\nALL REAL-DB DEPARTMENT-BUDGET CHECKS PASSED ✅");
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
