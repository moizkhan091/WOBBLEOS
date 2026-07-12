/**
 * Real-DB proof for the escalation runtime (Phase 3) against live Postgres: blocked department work
 * raises a real escalation → it is visible in the Command Centre queue → the founder resolves it with an
 * action → the transition is audited. Also proves the dead-letter → escalation sweep and dedup.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-department-escalation-db.ts
 */
import { getDb, closeDb } from "@/db";
import { departments, escalations, handoffs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createDepartment, defaultStore as registryStore } from "@/lib/departments/registry";
import { defaultBudgetStore } from "@/lib/departments/budget";
import { listEscalations, resolveEscalation, escalateDeadLetteredHandoffs, defaultStore as escStore } from "@/lib/departments/escalation";
import { runDepartment, DepartmentBudgetExhaustedError, type DepartmentPolicy } from "@/lib/departments/orchestrator";
import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import { buildHandoffRow } from "@/lib/domain/handoff-delivery";

async function main() {
  const db = getDb();
  const now = new Date();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const slug = `verify_esc_${Date.now()}`;
  const wf = `${slug}_wf`;
  const rdeps = { store: registryStore(db), recordAudit: async () => {} };

  // Temp active department with a tiny daily budget so a run is blocked immediately.
  await createDepartment({ slug, name: "Verify Escalation", purpose: "verify", status: "active", orchestratorAgentSlug: `${slug}_orch`, io: { acceptedHandoffSchemas: ["current_state_map"], inboundCapabilities: ["run"], outboundProducts: ["x"], downstreamConsumers: [] } as never, permissions: { authorizedMemoryScopes: ["company"], permittedDataClassifications: ["internal"], allowedTools: [], deniedTools: [] } as never, budget: { dailyCents: 10 } as never, governance: { requiredApprovals: [], escalationRules: [{ condition: "any", escalateTo: "founder_command_centre" }] } as never }, rdeps);

  const envelope = buildHandoffEnvelope({ workflowId: wf, department: slug, sourceAgent: "founder", destinationAgent: `${slug}_orch`, objective: "run", requestedAction: "run", expectedOutputSchema: "current_state_map", confidence: 0.8, authorizedMemoryScopes: ["company"], dataClassification: "internal" }, { now });
  const audits: string[] = [];
  const deps = { budgetStore: defaultBudgetStore(db), escalationStore: escStore(db), recordAudit: async (e: { eventType: string }) => void audits.push(e.eventType), now };
  const policy: DepartmentPolicy<null> = async () => ({ product: null, productSchema: "x" });

  // 1. Run with an estimate over the 10¢ cap → blocked + escalation raised.
  let threw = false;
  try {
    await runDepartment({ departmentSlug: slug, inbound: { envelope, receiverCtx: { clientWorkspaceId: null, grantedMemoryScopes: ["company"] } }, policy, budget: { estimatedCents: 100 } }, deps);
  } catch (e) { threw = e instanceof DepartmentBudgetExhaustedError; }
  assert(threw, "the over-budget run was BLOCKED (DepartmentBudgetExhaustedError)");
  assert(audits.includes("escalation.created"), "an escalation was created (audited)");

  // 2. Visible in the Command Centre queue.
  const open = await listEscalations({ departmentSlug: slug, status: "open" }, { store: escStore(db) });
  assert(open.length === 1 && open[0].reason === "budget_exhausted", "the escalation is visible as OPEN with reason budget_exhausted");
  assert(open[0].severity === "high" && open[0].assignee === "founder_command_centre", "severity + assignee are set");

  // 3. Founder resolves it with an action the workflow can read.
  assert(await resolveEscalation(open[0].id, { action: "resume", resolution: "budget raised — resume", resolvedBy: "Moiz" }, { store: escStore(db), recordAudit: async () => {}, now }), "founder resolved the escalation");
  const resolved = await listEscalations({ departmentSlug: slug, status: "resolved" }, { store: escStore(db) });
  assert(resolved.length === 1 && resolved[0].resolutionAction === "resume" && resolved[0].resolvedBy === "Moiz", "resolution recorded (action=resume, resolvedBy=Moiz)");

  // 4. Dead-letter → escalation sweep.
  const env2 = buildHandoffEnvelope({ workflowId: wf, department: slug, sourceAgent: "a", destinationAgent: "b", objective: "o", requestedAction: "r", expectedOutputSchema: "current_state_map", confidence: 0.8, authorizedMemoryScopes: ["company"], idempotencyKey: `${wf}:dl` }, { now });
  await db.insert(handoffs).values({ ...buildHandoffRow(env2, { now }), deliveryState: "dead_lettered", deadLetteredAt: now, failureReason: "provider timeout", envelope: env2 as unknown as Record<string, unknown> });
  const created = await escalateDeadLetteredHandoffs({ store: escStore(db), recordAudit: async () => {}, now, listDeadLettered: async () => [{ id: "h1", department: slug, workflowId: wf, taskId: "dl_task", clientWorkspaceId: null, sourceAgent: "a", failureReason: "provider timeout" }] });
  assert(created === 1, "the dead-letter sweep raised a dead_lettered escalation");
  const dl = await listEscalations({ departmentSlug: slug, reason: "dead_lettered" }, { store: escStore(db) });
  assert(dl.length === 1, "the dead_lettered escalation is visible");

  // Cleanup.
  await db.delete(escalations).where(eq(escalations.departmentSlug, slug));
  await db.delete(handoffs).where(eq(handoffs.workflowId, wf));
  await db.delete(departments).where(eq(departments.slug, slug));
  console.log("\nALL REAL-DB ESCALATION CHECKS PASSED ✅");
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
