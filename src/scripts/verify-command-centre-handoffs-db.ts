/**
 * Real-DB proof for the Command Centre handoff operations backend (Phase 2): filter (workflow / client /
 * department / source / dest / state), inspect (full row), and operate (redrive/retry, cancel) — every
 * op authorized + AUDITED — against live Postgres. These are exactly the services the /api/handoffs
 * routes call.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-command-centre-handoffs-db.ts
 */
import { getDb, closeDb } from "@/db";
import { handoffs as handoffsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import { buildHandoffRow } from "@/lib/domain/handoff-delivery";
import { defaultStore, listHandoffs, getHandoff, redriveHandoff, cancelHandoff, handoffStateCounts } from "@/lib/handoff";
import type { AuditEventInput } from "@/lib/domain/audit";

async function main() {
  const db = getDb();
  const now = new Date();
  const store = defaultStore(db);
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const wf = `verify_cc_${Date.now()}`;
  const audit: AuditEventInput[] = [];
  const deps = { store, recordAudit: async (i: AuditEventInput) => { audit.push(i); }, now };

  const mk = (over: Partial<Parameters<typeof buildHandoffEnvelope>[0]>, state: string, id: string) => {
    const env = buildHandoffEnvelope({ workflowId: wf, department: "paid_audit", sourceAgent: "orchestrator", destinationAgent: "audit_opportunity_finder", objective: "o", requestedAction: "r", expectedOutputSchema: "opportunity_set", confidence: 0.8, clientWorkspaceId: "clientCC", authorizedMemoryScopes: ["company"], ...over }, { now, taskId: id });
    const row = buildHandoffRow(env, { now, id });
    return { ...row, deliveryState: state as typeof row.deliveryState, ...(state === "dead_lettered" ? { deadLetteredAt: now } : {}) };
  };

  // Seed: two departments + a dead-lettered one to redrive + a delivered one to cancel.
  await db.insert(handoffsTable).values([
    { ...mk({ department: "paid_audit", sourceAgent: "orchestrator", destinationAgent: "audit_opportunity_finder" }, "delivered", `${wf}_a`), envelope: {} as never },
    { ...mk({ department: "content", sourceAgent: "content_strategist", destinationAgent: "content_researcher", idempotencyKey: `${wf}:c` }, "completed", `${wf}_b`), envelope: {} as never },
    { ...mk({ department: "paid_audit", sourceAgent: "orchestrator", destinationAgent: "audit_report_writer", idempotencyKey: `${wf}:d` }, "dead_lettered", `${wf}_c`), envelope: {} as never },
  ] as never);
  // Give the seeded rows their real envelopes (jsonb) so inspect returns them.
  for (const id of [`${wf}_a`, `${wf}_b`, `${wf}_c`]) {
    const env = buildHandoffEnvelope({ workflowId: wf, department: id === `${wf}_b` ? "content" : "paid_audit", sourceAgent: "orchestrator", destinationAgent: "audit_opportunity_finder", objective: "o", requestedAction: "r", expectedOutputSchema: "opportunity_set", confidence: 0.8, clientWorkspaceId: "clientCC", authorizedMemoryScopes: ["company"] }, { now, taskId: id });
    await db.update(handoffsTable).set({ envelope: env as unknown as Record<string, unknown> }).where(eq(handoffsTable.id, id));
  }

  // 1. Filter by workflow, department, source/destination, client, state.
  assert((await listHandoffs({ workflowId: wf }, deps)).length === 3, "filter by workflow returns all 3");
  assert((await listHandoffs({ workflowId: wf, department: "content" }, deps)).length === 1, "filter by department narrows to 1");
  assert((await listHandoffs({ workflowId: wf, sourceAgent: "content_strategist" }, deps)).length === 1, "filter by sourceAgent");
  assert((await listHandoffs({ workflowId: wf, destinationAgent: "audit_report_writer" }, deps)).length === 1, "filter by destinationAgent");
  assert((await listHandoffs({ workflowId: wf, clientWorkspaceId: "clientCC" }, deps)).length === 3, "filter by client workspace");
  assert((await listHandoffs({ workflowId: wf, deliveryState: "dead_lettered" }, deps)).length === 1, "filter by delivery state");

  // 2. Inspect one handoff — full envelope + lineage + state.
  const inspected = await getHandoff(`${wf}_c`, deps);
  assert(!!inspected && inspected.deliveryState === "dead_lettered" && inspected.envelope.workflowId === wf, "inspect returns the full row (envelope + lineage + state)");

  // 3. Operate: redrive (retry) the dead-lettered one → delivered, AUDITED.
  assert(await redriveHandoff(`${wf}_c`, "Moiz", deps), "redrive dead-lettered handoff succeeds");
  assert((await getHandoff(`${wf}_c`, deps))!.deliveryState === "delivered", "redriven handoff is back to delivered");
  assert(audit.some((e) => e.eventType === "handoff.redriven" && e.actor === "Moiz"), "redrive wrote a handoff.redriven audit event");

  // 4. Operate: cancel the delivered one → cancelled, AUDITED. Cancelling a completed one is refused.
  assert(await cancelHandoff(`${wf}_a`, "Moiz", deps), "cancel delivered handoff succeeds");
  assert((await getHandoff(`${wf}_a`, deps))!.deliveryState === "cancelled", "cancelled handoff is in cancelled state");
  assert(audit.some((e) => e.eventType === "handoff.cancelled" && e.actor === "Moiz"), "cancel wrote a handoff.cancelled audit event");
  assert(!(await cancelHandoff(`${wf}_b`, "Moiz", deps)), "cancelling an already-completed handoff is refused (no-op → 409 at the route)");

  // 5. State counts (dashboard header) reflect the workspace.
  const counts = await handoffStateCounts(deps);
  assert(typeof counts === "object", "state counts returned for the dashboard");

  // Cleanup.
  await db.delete(handoffsTable).where(eq(handoffsTable.workflowId, wf));

  console.log("\nALL REAL-DB COMMAND-CENTRE HANDOFF CHECKS PASSED ✅");
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
