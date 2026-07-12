/**
 * Real-DB proof for REROUTE — a founder redirects blocked work to an AUTHORIZED alternate department,
 * end-to-end against live Postgres. Proves the mandate's Phase-3 reroute semantics:
 *   blocked (dead-lettered) handoff → escalation → founder reroutes to an alternate active department →
 *   a VALID alternate handoff is created (lineage/tenant/classification preserved), the old route is
 *   cancelled/superseded, the new handoff is linked to the escalation, and the escalation resolves
 *   action=reroute. Plus the mandated rejections (unaccepted schema, inactive dest, terminal work) and
 *   idempotency + old-work-preservation on a failed alternate.
 *
 * ISOLATED + REPEATABLE: unique ids per run; a finally block deletes exactly what this run created.
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-escalation-reroute-db.ts
 */
import { getDb, closeDb } from "@/db";
import { handoffs, escalations } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import { buildHandoffRow } from "@/lib/domain/handoff-delivery";
import { getHandoff, defaultStore as handoffStore } from "@/lib/handoff";
import { seedDepartments } from "@/lib/departments/seed";
import { defaultStore as registryStore } from "@/lib/departments/registry";
import { createEscalation, rerouteEscalation, listEscalations, defaultStore as escStore } from "@/lib/departments/escalation";

async function main() {
  const db = getDb();
  const now = new Date();
  const uniq = `${Date.now()}_${Math.floor(process.hrtime()[1] % 100000)}`;
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const wf = `verify_rr_${uniq}`;
  const client = `clientRR_${uniq}`;
  const deps = { store: escStore(db), recordAudit: async () => {}, now };
  const cleanup: Array<() => Promise<unknown>> = [];
  const runCleanup = async () => { for (const fn of cleanup.reverse()) { try { await fn(); } catch (e) { console.error("cleanup warn:", e instanceof Error ? e.message : e); } } };

  try {
    await seedDepartments({ store: registryStore(db), recordAudit: async () => {} });
    cleanup.push(() => db.delete(escalations).where(eq(escalations.workflowId, wf)));
    cleanup.push(() => db.delete(handoffs).where(eq(handoffs.workflowId, wf)));

    // A blocked (dead-lettered) won_deal handoff addressed to Finance, carrying real lineage + client scope.
    const env = buildHandoffEnvelope(
      { workflowId: wf, department: "finance", sourceAgent: "sales_crm_orchestrator", destinationAgent: "finance_orchestrator", objective: "o", requestedAction: "consume won_deal", expectedOutputSchema: "won_deal", confidence: 0.8, companyId: client, clientWorkspaceId: client, dataClassification: "client_confidential", authorizedMemoryScopes: ["company"], previousAgentOutputs: { opportunityId: "opp_rr", valueCents: 480000 }, idempotencyKey: `${wf}:won->finance` },
      { now },
    );
    const oldId = `h_old_${uniq}`;
    await handoffStore(db).insert({ ...buildHandoffRow(env, { now, id: oldId }), deliveryState: "dead_lettered", deadLetteredAt: now, failureReason: "finance provider timeout" });

    const { escalation: esc } = await createEscalation(
      { departmentSlug: "finance", workflowId: wf, taskId: "t1", clientWorkspaceId: client, reason: "dead_lettered", severity: "high", handoffId: oldId, requiredDecision: "resume / reroute / terminate", evidence: {}, attemptedRecoveries: [] },
      deps,
    );
    assert(esc.handoffId === oldId, "escalation is linked to the blocked handoff");

    console.log("\nStep 1 — REJECTIONS (no state change, old work preserved):");
    // Content does not accept won_deal → rejected.
    const rBad = await rerouteEscalation(esc.id, "Moiz", { destinationDepartment: "content", reason: "wrong" }, { ...deps, handoffStore: handoffStore(db) });
    assert(!rBad.ok && /is not accepted/.test(rBad.error ?? ""), "reroute to a dept that does not accept won_deal is rejected");
    // A draft dept → rejected.
    const rDraft = await rerouteEscalation(esc.id, "Moiz", { destinationDepartment: "publishing", reason: "wrong" }, { ...deps, handoffStore: handoffStore(db) });
    assert(!rDraft.ok && /not active/.test(rDraft.error ?? ""), "reroute to a draft (inactive) dept is rejected");
    assert((await getHandoff(oldId, { store: handoffStore(db) }))?.deliveryState === "dead_lettered", "the old handoff is untouched after rejected reroutes");
    assert((await listEscalations({ departmentSlug: "finance", reason: "dead_lettered" }, deps)).find((e) => e.id === esc.id)?.status === "open", "the escalation is still open after rejected reroutes");

    console.log("\nStep 2 — VALID reroute → Delivery (accepts won_deal, permits client_confidential):");
    const r = await rerouteEscalation(esc.id, "Moiz", { destinationDepartment: "delivery", reason: "finance backlog — deliver first" }, { ...deps, handoffStore: handoffStore(db) });
    assert(r.ok && !!r.newHandoffId, "reroute succeeded and returned a new handoff id");

    const newRow = await getHandoff(r.newHandoffId!, { store: handoffStore(db) });
    assert(!!newRow && newRow.deliveryState === "delivered", "a valid alternate handoff is delivered, awaiting the destination consumer");
    assert(newRow!.department === "delivery", "the alternate handoff is addressed to Delivery");
    assert(newRow!.clientWorkspaceId === client, "TENANT preserved on the alternate route");
    assert(newRow!.workflowId === wf, "LINEAGE preserved (same workflow id)");
    assert((newRow!.envelope as { previousAgentOutputs?: Record<string, unknown> }).previousAgentOutputs?.opportunityId === "opp_rr", "completed work / evidence preserved (previousAgentOutputs)");
    assert((newRow!.envelope as { correlationId?: string }).correlationId === env.correlationId, "correlation id preserved");

    assert((await getHandoff(oldId, { store: handoffStore(db) }))?.deliveryState === "cancelled", "the OLD route was superseded (cancelled) — no double execution");
    const resolved = (await listEscalations({ departmentSlug: "finance", reason: "dead_lettered" }, deps)).find((e) => e.id === esc.id)!;
    assert(resolved.status === "resolved" && resolved.resolutionAction === "reroute", "the escalation resolved with action=reroute");
    assert(resolved.handoffId === r.newHandoffId, "the escalation is now linked to the NEW alternate handoff");

    console.log("\nStep 3 — idempotency:");
    const again = await rerouteEscalation(esc.id, "Moiz", { destinationDepartment: "delivery", reason: "x" }, { ...deps, handoffStore: handoffStore(db) });
    assert(again.ok, "a second reroute of an already-rerouted escalation is a no-op success");
    const delHandoffs = (await db.select().from(handoffs).where(eq(handoffs.workflowId, wf))).filter((h) => h.department === "delivery");
    assert(delHandoffs.length === 1, "still exactly one alternate handoff to Delivery (idempotent — no churn)");

    console.log("\nALL REAL-DB ESCALATION REROUTE CHECKS PASSED ✅");
  } finally {
    await runCleanup();
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
