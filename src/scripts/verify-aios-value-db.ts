/**
 * Real-DB proof that AIOS Value / KPI is DURABLE on live Postgres (Doctrine 9).
 *
 * Persists a curated task inventory through the DB-backed `task_inventory` store, then computes the value
 * snapshot from the persisted rows and proves:
 *   - an empty scope yields HONEST NULLS (no zeros pretending to be results);
 *   - inventoried work drives real KPIs (hours saved / month, automation %), evidence-tiered to the WEAKEST
 *     input so a founder-estimate is never dressed up as a measured actual;
 *   - scope filtering is real (department vs company) and founder-owned savings roll up separately;
 *   - upsert is idempotent by id (editing an item overwrites, never duplicates).
 *
 * ISOLATED: a unique department + finally-cleanup, safe against a populated database.
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-aios-value-db.ts
 */
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { taskInventory } from "@/db/schema";
import { addTaskToInventory, getAiosValueSnapshot, createDbTaskInventoryStore } from "@/lib/aios-value";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const stamp = Date.now();
  const dept = `ops_${stamp}`; // unique department → isolates this run
  const store = createDbTaskInventoryStore(db);
  const ids: string[] = [];

  try {
    // ---- empty scope → honest nulls ----
    const empty = await getAiosValueSnapshot({ type: "department", id: dept }, { store, orgMetrics: async () => ({ headcount: null, revenueCents: null, revenuePeriodMonths: 1, revenueEvidenceTier: null, automationCostCentsPerMonth: null, automationCostEvidenceTier: null, founderHourlyRateCents: null, founderHourlyRateEvidenceTier: null, founders: ["moiz"] }) });
    assert(empty.isEmpty && empty.taskCount === 0, "an empty scope reports isEmpty with zero tasks");
    assert(empty.kpis.every((k) => k.value === null), "every KPI is NULL for an empty inventory (no zeros pretending to be results)");

    // ---- inventory two real tasks (one founder-owned, automated; one measured-actual) ----
    const t1 = await addTaskToInventory({
      task: "Draft weekly client report", owner: "moiz", department: dept, frequency: { per: "week", count: 1 },
      baselineMinutes: 120, currentMinutes: 10, humanReviewMinutes: 5, automationState: "automated",
      evidenceSource: "measured-actual", confidence: "high", completedCount: 4,
    }, { store });
    const t2 = await addTaskToInventory({
      task: "Manually reconcile invoices", owner: "ali", department: dept, frequency: { per: "month", count: 1 },
      baselineMinutes: 60, currentMinutes: 60, humanReviewMinutes: 0, automationState: "manual",
      evidenceSource: "founder-estimate", confidence: "low",
    }, { store });
    ids.push(t1.id, t2.id);

    // persisted durably
    const persisted = await db.select().from(taskInventory).where(eq(taskInventory.department, dept));
    assert(persisted.length === 2, "both inventory items are persisted in task_inventory");
    assert(persisted.find((r) => r.id === t1.id)?.automationState === "automated", "the automated task round-trips its state");

    // ---- snapshot reflects the persisted inventory ----
    const snap = await getAiosValueSnapshot({ type: "department", id: dept }, { store, orgMetrics: async () => ({ headcount: 3, revenueCents: null, revenuePeriodMonths: 1, revenueEvidenceTier: null, automationCostCentsPerMonth: null, automationCostEvidenceTier: null, founderHourlyRateCents: null, founderHourlyRateEvidenceTier: null, founders: ["moiz"] }) });
    assert(!snap.isEmpty && snap.taskCount === 2, "the snapshot reads exactly the two persisted tasks");

    const hoursSaved = snap.kpis.find((k) => k.key === "hours_saved_total")!;
    // t1: (120-10-5)=105 min/occ × (30/7) occ/mo ≈ 450 min; t2: (60-60-0)=0 → total ≈ 450 min ≈ 7.5 h
    assert(hoursSaved.value !== null && Math.abs(hoursSaved.value - 7.5) < 0.1, `hours-saved/month computed from the real inventory (got ${hoursSaved.value})`);
    // weakest evidence across the two tasks is founder-estimate → the aggregate is flagged an estimate
    assert(hoursSaved.evidenceTier === "founder-estimate" && hoursSaved.isEstimate === true, "the aggregate is tiered to the WEAKEST input (founder-estimate) and flagged isEstimate");

    const founderHours = snap.kpis.find((k) => k.key === "founder_hours_saved")!;
    assert(founderHours.value !== null && Math.abs(founderHours.value - 7.5) < 0.1 && founderHours.evidenceTier === "measured-actual", "founder-owned savings roll up separately at their OWN (stronger) tier");

    const autoPct = snap.kpis.find((k) => k.key === "automation_pct")!;
    // occurrences: t1 automated ≈4.29/mo, t2 manual 1/mo → automation share ≈ 4.29/5.29 ≈ 0.81
    assert(autoPct.value !== null && autoPct.value > 0.75 && autoPct.value < 0.86, `automation % is volume-weighted from real occurrences (got ${autoPct.value})`);

    // ---- upsert idempotency (edit t2's current minutes by id) ----
    await addTaskToInventory({
      task: "Manually reconcile invoices", owner: "ali", department: dept, frequency: { per: "month", count: 1 },
      baselineMinutes: 60, currentMinutes: 20, humanReviewMinutes: 0, automationState: "augmented",
      evidenceSource: "founder-estimate", confidence: "low",
    }, { store: { ...store, upsertTask: (item) => store.upsertTask({ ...item, id: t2.id }) } });
    const after = await db.select().from(taskInventory).where(eq(taskInventory.department, dept));
    assert(after.length === 2, "editing an item by id overwrites (no duplicate row)");
    assert(Number(after.find((r) => r.id === t2.id)?.currentMinutes) === 20, "the edit is persisted (current minutes updated)");

    console.log("\nALL REAL-DB AIOS VALUE CHECKS PASSED ✅");
  } finally {
    if (ids.length) await db.delete(taskInventory).where(inArray(taskInventory.id, ids));
    await db.delete(taskInventory).where(eq(taskInventory.department, dept));
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
