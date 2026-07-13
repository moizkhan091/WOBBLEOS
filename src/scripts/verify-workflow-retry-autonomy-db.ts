/**
 * Real-DB proof that Earned Autonomy is enforced at the WORKFLOW.RETRY action point (the dead-letter sweep) on
 * Postgres. Re-running an internal, idempotent workflow step is REVERSIBLE, so a scoped grant RELEASES it:
 *   - NO grant → a dead-lettered handoff ESCALATES to the founder (baseline; nothing auto-retried);
 *   - an earned `workflow.retry` grant (scope-matched) → the handoff AUTO-REDRIVES once (→ delivered) + a durable
 *     `autoRetriedAt` marker, and does NOT escalate;
 *   - BOUNDED: a handoff already auto-retried (marker set) that dead-letters AGAIN → ESCALATES (no 2nd auto-retry);
 *   - TENANT isolation: a grant scoped to client A does not auto-retry client B's handoff;
 *   - a REVOKED / EXPIRED grant → escalate (no auto-retry).
 *
 * ISOLATED + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-workflow-retry-autonomy-db.ts
 */
import { inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { handoffs, escalations, autonomyPolicies } from "@/db/schema";
import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import { buildHandoffRow } from "@/lib/domain/handoff-delivery";
import { escalateDeadLetteredHandoffs, defaultStore as escStore } from "@/lib/departments/escalation";
import { defaultStore as handoffStore } from "@/lib/handoff";
import { createAutonomyPolicy, revokeAutonomyPolicy } from "@/lib/autonomy";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const now = new Date();
  const clientA = `wfr_a_${uniq}`, clientB = `wfr_b_${uniq}`;
  const hstore = handoffStore(db);
  const handoffIds: string[] = [];
  const policyIds: string[] = [];

  // Seed a DEAD-LETTERED handoff for a client scope. Returns its id.
  const seedDead = async (clientId: string, tag: string, metadata: Record<string, unknown> = {}) => {
    const env = buildHandoffEnvelope({ workflowId: `wf_${tag}_${uniq}`, department: "paid_audit", sourceAgent: "a", destinationAgent: "b", objective: "x", requestedAction: "x", expectedOutputSchema: "current_state_map", confidence: 0.7, clientWorkspaceId: clientId, companyId: clientId, authorizedMemoryScopes: ["company"], idempotencyKey: `${tag}_${uniq}:in` }, { now });
    const row = { ...buildHandoffRow(env, { now }), deliveryState: "dead_lettered" as const, deadLetteredAt: now, failureReason: "provider timeout", metadata, envelope: env as unknown as Record<string, unknown> };
    await db.insert(handoffs).values(row as never);
    handoffIds.push(row.id);
    return row.id;
  };
  const grant = async (clientId: string, opts: { expired?: boolean } = {}) => {
    const p = await createAutonomyPolicy({ category: "workflow.retry", grantedLevel: "autonomous", approvedBy: "Moiz", clientId, maxRiskLevel: "low", ...(opts.expired ? { effectiveFrom: new Date(Date.now() - 2 * 86400_000), expiresAt: new Date(Date.now() - 86400_000) } : {}) }, { db });
    policyIds.push(p.id);
    return p;
  };
  // Run the sweep over ONE seeded handoff (injected list = the real autonomy/redrive/escalate logic on real rows).
  const sweep = async (id: string) => {
    const h = (await hstore.getById(id))!;
    return escalateDeadLetteredHandoffs({ store: escStore(db), recordAudit: async () => {}, now, enforceAutonomy: true, listDeadLettered: async () => [{ id: h.id, department: h.department, workflowId: h.workflowId, taskId: h.taskId, clientWorkspaceId: h.clientWorkspaceId, sourceAgent: h.sourceAgent, failureReason: h.failureReason, metadata: h.metadata }] });
  };
  const stateOf = async (id: string) => (await hstore.getById(id))?.deliveryState;
  const markerOf = async (id: string) => Boolean((await hstore.getById(id))?.metadata?.autoRetriedAt);

  try {
    // NO grant → escalate (baseline), handoff stays dead-lettered.
    const h1 = await seedDead(clientA, "nopolicy");
    const r1 = await sweep(h1);
    assert(r1.autoRetried === 0 && r1.escalated === 1 && (await stateOf(h1)) === "dead_lettered", "NO grant → the dead-lettered handoff ESCALATES (nothing auto-retried; never silent)");

    // Grant workflow.retry for client A → auto-redrive once (→ delivered), marker set, no escalation.
    const p = await grant(clientA);
    const h2 = await seedDead(clientA, "granted");
    const r2 = await sweep(h2);
    assert(r2.autoRetried === 1 && r2.escalated === 0 && (await stateOf(h2)) === "delivered" && (await markerOf(h2)), "an earned `workflow.retry` grant → the handoff AUTO-REDRIVES once (→ delivered) + durable marker, no escalation");

    // BOUNDED: a handoff already auto-retried (marker) that dead-letters again → escalate (no 2nd auto-retry).
    const h3 = await seedDead(clientA, "already", { autoRetriedAt: now.toISOString() });
    const r3 = await sweep(h3);
    assert(r3.autoRetried === 0 && r3.escalated === 1 && (await stateOf(h3)) === "dead_lettered", "BOUNDED: an already-auto-retried handoff that dead-letters again ESCALATES (no second auto-retry)");

    // TENANT isolation: client A's grant does not auto-retry client B's handoff.
    const h4 = await seedDead(clientB, "othertenant");
    const r4 = await sweep(h4);
    assert(r4.autoRetried === 0 && r4.escalated === 1 && (await stateOf(h4)) === "dead_lettered", "TENANT isolation: client A's grant does NOT auto-retry client B's handoff (it escalates)");

    // REVOKE → escalate.
    assert(await revokeAutonomyPolicy(p.id, "Moiz", { db }), "the grant was revoked");
    const h5 = await seedDead(clientA, "revoked");
    const r5 = await sweep(h5);
    assert(r5.autoRetried === 0 && r5.escalated === 1, "after REVOCATION the handoff ESCALATES (revoked grant does not auto-retry)");

    // EXPIRED → escalate.
    await grant(clientA, { expired: true });
    const h6 = await seedDead(clientA, "expired");
    const r6 = await sweep(h6);
    assert(r6.autoRetried === 0 && r6.escalated === 1, "an EXPIRED grant does not auto-retry (the handoff escalates)");

    console.log("\nALL REAL-DB WORKFLOW-RETRY AUTONOMY CHECKS PASSED ✅");
  } finally {
    if (handoffIds.length) {
      await db.delete(escalations).where(inArray(escalations.handoffId, handoffIds)).catch(() => {});
      await db.delete(handoffs).where(inArray(handoffs.id, handoffIds)).catch(() => {});
    }
    if (policyIds.length) await db.delete(autonomyPolicies).where(inArray(autonomyPolicies.id, policyIds)).catch(() => {});
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
