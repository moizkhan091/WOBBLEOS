/**
 * Real-DB proof for truthful department health (Phase 3, Batch 6): gatherSignals derives REAL health
 * inputs from live handoffs + memberships + the agent registry + approvals + budget, computeDepartmentHealth
 * maps them to an honest status, and refreshDepartmentHealth persists it via the registry. Health is never
 * "healthy because the record exists".
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-department-health-db.ts
 */
import { getDb, closeDb } from "@/db";
import { handoffs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { seedDepartments } from "@/lib/departments/seed";
import { getDepartment, defaultStore as registryStore } from "@/lib/departments/registry";
import { gatherSignals, refreshDepartmentHealth, computeDepartmentHealth } from "@/lib/departments/health";
import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import { buildHandoffRow } from "@/lib/domain/handoff-delivery";

async function main() {
  const db = getDb();
  const now = new Date();
  const store = registryStore(db);
  const deps = { store, recordAudit: async () => {} };
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };

  await seedDepartments(deps);

  // 1. Real signal gathering for paid_audit (team from memberships; orchestrator from the agent registry).
  const paid = await getDepartment("paid_audit", deps);
  const signals = await gatherSignals(paid!, db);
  assert(signals.orchestratorRegistered, "orchestrator is registered on paid_audit");
  assert(signals.orchestratorActive, "orchestrator agent is active in the registry (registered this batch)");
  assert(signals.totalAgents === 6, `team size from department_members (6) — got ${signals.totalAgents}`);
  assert(signals.activeAgents === 6, "all 6 members active");

  // 2. With clean signals, paid_audit computes HEALTHY and persists it.
  const healthyResult = await refreshDepartmentHealth("paid_audit", deps);
  assert(healthyResult?.status === "healthy", `paid_audit is healthy with a full team + active orchestrator (got ${healthyResult?.status})`);
  assert((await getDepartment("paid_audit", deps))?.healthStatus === "healthy", "healthy status persisted to the registry");

  // 3. Inject a dead-lettered handoff → real gather flips paid_audit to a truthful FAILED.
  const wf = `verify_health_${Date.now()}`;
  const env = buildHandoffEnvelope({ workflowId: wf, department: "paid_audit", sourceAgent: "a", destinationAgent: "audit_report_writer", objective: "o", requestedAction: "r", expectedOutputSchema: "audit_report", confidence: 0.8, authorizedMemoryScopes: ["company"] }, { now });
  await db.insert(handoffs).values({ ...buildHandoffRow(env, { now }), deliveryState: "dead_lettered", deadLetteredAt: now, envelope: env as unknown as Record<string, unknown> });
  const failedResult = await refreshDepartmentHealth("paid_audit", deps);
  assert(failedResult?.status === "failed", `a dead-lettered handoff makes paid_audit truthfully FAILED (got ${failedResult?.status})`);
  assert(failedResult!.reasons.join().match(/dead-lettered/) !== null, "the reason names the dead-letter");

  // 4. A draft department is honestly `unknown` (not operational), even though its record exists.
  const draftHealth = computeDepartmentHealth("draft", { ...signals });
  assert(draftHealth.status === "unknown", "a draft department is unknown, never falsely healthy");

  // Cleanup the injected handoff; restore paid_audit health to healthy.
  await db.delete(handoffs).where(eq(handoffs.workflowId, wf));
  await refreshDepartmentHealth("paid_audit", deps);

  console.log("\nALL REAL-DB DEPARTMENT-HEALTH CHECKS PASSED ✅");
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
