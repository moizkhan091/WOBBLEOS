/**
 * Real-DB proof for the Department Orchestrator framework (Phase 3, Batch 4): runDepartment loads a real
 * department + its members from the registry, accepts a validated inbound handoff, runs a policy, and
 * ROUTES the product to a declared downstream department as a real, durable handoff in live Postgres —
 * addressed to the destination, memory-scoped to its grant, with lineage + audit.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-department-orchestrator-db.ts
 */
import { getDb, closeDb } from "@/db";
import { handoffs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { seedDepartments } from "@/lib/departments/seed";
import { defaultStore as registryStore } from "@/lib/departments/registry";
import { defaultStore as handoffStore } from "@/lib/handoff";
import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import { runDepartment, type DepartmentPolicy } from "@/lib/departments/orchestrator";

async function main() {
  const db = getDb();
  const now = new Date();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const wf = `verify_orch_${Date.now()}`;

  await seedDepartments({ store: registryStore(db), recordAudit: async () => {} });

  const envelope = buildHandoffEnvelope(
    { workflowId: wf, department: "paid_audit", sourceAgent: "orchestrator", destinationAgent: "paid_audit_orchestrator", objective: "run audit", requestedAction: "audit", expectedOutputSchema: "current_state_map", confidence: 0.8, clientWorkspaceId: "clientOrch", authorizedMemoryScopes: ["company", "research", "brand"], dataClassification: "client_confidential" },
    { now },
  );
  const policy: DepartmentPolicy<{ auditId: string }> = async (api) => {
    // Prove the scoped API works against real registry data.
    const specialists = api.selectSpecialists({ capability: "discovery" });
    if (!specialists.length) throw new Error("no discovery specialist found in the registry");
    api.authorizeMember(specialists[0], { tools: ["run_node"], memoryScopes: ["company"] });
    return { product: { auditId: "audit_x" }, productSchema: "business_audit", outputs: { summary: "done" }, telemetry: { costEstimate: 0.2, latencyMs: 4200, qualityScore: 8.6 }, confidence: 0.8 };
  };

  const res = await runDepartment(
    { departmentSlug: "paid_audit", inbound: { envelope, receiverCtx: { clientWorkspaceId: "clientOrch", grantedMemoryScopes: ["company", "research", "offer", "brand"] } }, policy },
    { handoffStore: handoffStore(db), recordAudit: async () => {}, now },
  );

  assert(res.accepted, "paid_audit accepted the inbound handoff (registry-loaded)");
  assert(res.product?.auditId === "audit_x", "policy produced the department product");
  assert(res.routedTo.map((r) => r.department).includes("proposal"), "product routed to the declared downstream (proposal)");
  assert(res.telemetry.qualityScore === 8.6 && res.telemetry.confidence === 0.8, "run telemetry recorded");

  // The routed handoff is real and durable in Postgres, addressed + scoped to proposal.
  const routed = (await db.select().from(handoffs).where(eq(handoffs.workflowId, wf))).find((h) => h.department === "proposal");
  assert(!!routed, "a durable handoff to proposal exists in Postgres");
  assert(routed!.deliveryState === "delivered", "routed handoff is delivered (awaiting the proposal department to claim it)");
  const env = routed!.envelope as { expectedOutputSchema: string; authorizedMemoryScopes: string[]; causationId: string | null };
  assert(env.expectedOutputSchema === "business_audit", "routed handoff carries the product schema");
  // Narrowed to inbound ∩ proposal's grant: inbound [company,research,brand] ∩ proposal [company,offer,research]
  // → [company,research]. The inbound 'brand' scope is DROPPED (routing never widens, and here it narrows).
  assert(JSON.stringify(env.authorizedMemoryScopes) === JSON.stringify(["company", "research"]), "routed memory scope narrowed to inbound ∩ proposal's grant — inbound 'brand' dropped");
  assert(env.causationId === envelope.taskId, "lineage intact (causation = the inbound task)");

  await db.delete(handoffs).where(eq(handoffs.workflowId, wf));
  console.log("\nALL REAL-DB DEPARTMENT-ORCHESTRATOR CHECKS PASSED ✅");
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
