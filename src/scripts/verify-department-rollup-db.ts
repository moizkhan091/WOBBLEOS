/**
 * Real-DB proof for the department roll-up (Phase 3): the single-table GROUP BY aggregation of the live
 * handoff backbone (per department: state counts, in-flight/completed/stuck, spend, weighted quality)
 * against live Postgres. This is what /api/departments serves.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-department-rollup-db.ts
 */
import { getDb, closeDb } from "@/db";
import { handoffs as handoffsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import { buildHandoffRow } from "@/lib/domain/handoff-delivery";
import { getDepartmentRollups } from "@/lib/departments";

async function main() {
  const db = getDb();
  const now = new Date();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const tag = `verify_dept_${Date.now()}`;

  const mk = (department: string, state: string, id: string, cost: number | null, quality: number | null) => {
    const env = buildHandoffEnvelope({ workflowId: tag, department, sourceAgent: "a", destinationAgent: "b", objective: "o", requestedAction: "r", expectedOutputSchema: "s", confidence: 0.8, authorizedMemoryScopes: ["company"], idempotencyKey: id }, { now, taskId: id });
    const row = buildHandoffRow(env, { now, id });
    return { ...row, deliveryState: state as typeof row.deliveryState, costEstimate: cost === null ? null : String(cost), qualityScore: quality === null ? null : String(quality), envelope: env as unknown as Record<string, unknown> };
  };

  // Seed: a made-up department "verify_alpha" (2 completed + 1 dead-lettered) so we can assert exact rollup.
  const dept = `${tag}_alpha`;
  await db.insert(handoffsTable).values([
    mk(dept, "completed", `${tag}_1`, 0.10, 8),
    mk(dept, "completed", `${tag}_2`, 0.30, 9),
    mk(dept, "dead_lettered", `${tag}_3`, 0, null),
  ] as never);

  const rollups = await getDepartmentRollups();
  const alpha = rollups.find((d) => d.department === dept);
  assert(!!alpha, "the seeded department appears in the roll-up");
  assert(alpha!.handoffs.total === 3, "handoff total = 3");
  assert(alpha!.handoffs.completed === 2, "completed = 2");
  assert(alpha!.handoffs.stuck === 1, "stuck (dead-lettered) = 1");
  assert(Math.abs(alpha!.cost.totalEstimate - 0.4) < 1e-6, `total cost estimate = 0.4 (got ${alpha!.cost.totalEstimate})`);
  assert(alpha!.quality.avg === 8.5 && alpha!.quality.samples === 2, "weighted quality avg = 8.5 over 2 samples (nulls excluded)");
  assert(alpha!.lastActivityAt !== null, "lastActivityAt is populated");

  // Cleanup.
  await db.delete(handoffsTable).where(eq(handoffsTable.workflowId, tag));

  console.log("\nALL REAL-DB DEPARTMENT-ROLLUP CHECKS PASSED ✅");
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
