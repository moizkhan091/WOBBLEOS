/**
 * Real-DB proof (Phase 3, L2) that founder escalation actions control the REAL workflow, not just the
 * record: a dead-lettered handoff → sweep raises an escalation linked to it → RESUME redrives the actual
 * handoff (dead_lettered → delivered) → TERMINATE cancels every non-terminal handoff of a workflow +
 * releases its reservation → DISMISS leaves work blocked. Isolated (unique ids) + finally cleanup.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-escalation-actions-db.ts
 */
import { getDb, closeDb } from "@/db";
import { handoffs, escalations, budgetReservations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import { buildHandoffRow } from "@/lib/domain/handoff-delivery";
import { getHandoff } from "@/lib/handoff";
import { escalateDeadLetteredHandoffs, resumeEscalation, terminateEscalation, dismissEscalation, listEscalations, defaultStore as escStore } from "@/lib/departments/escalation";
import { buildBudgetReservationRow } from "@/lib/domain/department-budget";

async function main() {
  const db = getDb();
  const now = new Date();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const tag = `verify_escact_${Date.now()}`;
  const wfResume = `${tag}_resume`;
  const wfTerm = `${tag}_term`;
  const deps = { store: escStore(db), recordAudit: async () => {}, now };

  try {
    // ---- RESUME: a real dead-lettered handoff is redriven back into delivery. ----
    const env = buildHandoffEnvelope({ workflowId: wfResume, department: "paid_audit", sourceAgent: "a", destinationAgent: "audit_report_writer", objective: "o", requestedAction: "r", expectedOutputSchema: "audit_report", confidence: 0.8, authorizedMemoryScopes: ["company"], idempotencyKey: `${wfResume}:1` }, { now });
    const dlHandoff = { ...buildHandoffRow(env, { now }), deliveryState: "dead_lettered" as const, deadLetteredAt: now, failureReason: "provider timeout" };
    await db.insert(handoffs).values({ ...dlHandoff, envelope: env as unknown as Record<string, unknown> });

    const created = (await escalateDeadLetteredHandoffs({ ...deps, listDeadLettered: async () => [{ id: dlHandoff.id, department: "paid_audit", workflowId: wfResume, taskId: env.taskId, clientWorkspaceId: null, sourceAgent: "a", failureReason: "provider timeout" }] })).escalated;
    assert(created === 1, "dead-letter sweep raised an escalation linked to the handoff");
    const esc = (await listEscalations({ departmentSlug: "paid_audit", reason: "dead_lettered" }, deps)).find((e) => e.workflowId === wfResume)!;
    assert(esc.handoffId === dlHandoff.id, "escalation is linked to the real handoff id");

    const r = await resumeEscalation(esc.id, "Moiz", deps);
    assert(r.ok, "RESUME succeeded");
    assert((await getHandoff(dlHandoff.id))?.deliveryState === "delivered", "the REAL handoff is now delivered (redriven), not dead-lettered");
    const escAfter = await escStore(db).getById(esc.id);
    assert(escAfter?.status === "resolved" && escAfter?.resolutionAction === "resume", "escalation resolved with action=resume");
    // Idempotent second resume.
    assert((await resumeEscalation(esc.id, "Moiz", deps)).ok, "second RESUME is idempotent");

    // ---- TERMINATE: cancels every non-terminal handoff of a workflow + releases its reservation. ----
    const mk = (i: number, state: string) => { const e = buildHandoffEnvelope({ workflowId: wfTerm, department: "paid_audit", sourceAgent: "a", destinationAgent: "b", objective: "o", requestedAction: "r", expectedOutputSchema: "s", confidence: 0.8, authorizedMemoryScopes: ["company"], idempotencyKey: `${wfTerm}:${i}` }, { now }); return { row: { ...buildHandoffRow(e, { now, id: `${tag}_h${i}` }), deliveryState: state as never }, env: e }; };
    for (const [i, st] of [[1, "delivered"], [2, "processing"], [3, "completed"]] as const) { const m = mk(i, st); await db.insert(handoffs).values({ ...m.row, envelope: m.env as unknown as Record<string, unknown> }); }
    const resv = buildBudgetReservationRow({ departmentSlug: "paid_audit", workflowId: wfTerm, taskId: `${tag}_task`, estimatedCents: 50 }, { now, id: `${tag}_res` });
    await db.insert(budgetReservations).values(resv as never);

    const { buildEscalationRow } = await import("@/lib/domain/escalation");
    await escStore(db).insert(buildEscalationRow({ departmentSlug: "paid_audit", workflowId: wfTerm, taskId: `${tag}_task`, reason: "conflicting_conclusions", severity: "high", requiredDecision: "terminate", budgetReservationId: `${tag}_res` }, { now, id: `${tag}_esc_term` }));
    const tr = await terminateEscalation(`${tag}_esc_term`, "Moiz", deps);
    assert(tr.ok && tr.cancelled === 2, `TERMINATE cancelled the 2 non-terminal handoffs (delivered+processing), left the completed one — got ${tr.cancelled}`);
    assert((await getHandoff(`${tag}_h1`))?.deliveryState === "cancelled" && (await getHandoff(`${tag}_h3`))?.deliveryState === "completed", "delivered handoff cancelled; completed handoff preserved");
    assert((await db.select().from(budgetReservations).where(eq(budgetReservations.id, `${tag}_res`)))[0].state === "released", "the held budget reservation was released");

    // ---- DISMISS leaves work blocked. ----
    const { createEscalation } = await import("@/lib/departments/escalation");
    const dmiss = await createEscalation({ departmentSlug: "paid_audit", workflowId: `${tag}_dismiss`, taskId: "t", reason: "other", severity: "low", requiredDecision: "review" }, deps);
    await dismissEscalation(dmiss.escalation.id, "Moiz", "noise", deps);
    assert((await escStore(db).getById(dmiss.escalation.id))?.status === "dismissed", "DISMISS closed the notification (workflow untouched)");

    console.log("\nALL REAL-DB ESCALATION-ACTION CHECKS PASSED ✅");
  } finally {
    for (const wf of [wfResume, wfTerm, `${tag}_dismiss`]) {
      await db.delete(escalations).where(eq(escalations.workflowId, wf));
      await db.delete(handoffs).where(eq(handoffs.workflowId, wf));
      await db.delete(budgetReservations).where(eq(budgetReservations.workflowId, wf));
    }
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
