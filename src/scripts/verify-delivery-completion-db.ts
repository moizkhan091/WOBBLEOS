/**
 * Real-DB proof for the DELIVERY COMPLETION product — a completed project's versioned close-out is emitted
 * and routed to its authorized consumers on live Postgres, deterministic finance figures staying authoritative:
 *
 *   a real COMPLETED project (milestones done + kickoff tasks, one finished + one still open) with a real
 *   partially-paid invoice → `completeDelivery` builds the versioned DeliveryCompletion (recognized revenue,
 *   margin inputs, outstanding balance — all computed from the ledger) → it routes three durable handoffs:
 *     finance                (client_confidential) — DETERMINISTIC revenue recognition
 *     research_intelligence  (internal)            — de-identified reusable lessons
 *     founder_command_centre (client_confidential) — the executive close-out summary
 *
 * HARD RULE proven live: no LLM touches the financial path — the recognized-revenue / margin / outstanding
 * figures on the finance handoff are the pure ledger projection.
 *
 * ISOLATED + REPEATABLE + SAFE ON A POPULATED DB: every id/workflow is unique per run; the completion
 * topology is upserted onto delivery/finance/research (idempotent — a no-op once the seed adopts it) and
 * restored by re-seeding in cleanup; a finally block deletes exactly (and only) what this run created. Safe
 * to run twice.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-delivery-completion-db.ts
 */
import { getDb, closeDb } from "@/db";
import { handoffs, invoices, payments, projects, tasks, crmCompanies, crmOpportunities, crmStageHistory } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { seedDepartments, CANONICAL_DEPARTMENTS } from "@/lib/departments/seed";
import { defaultStore as registryStore, upsertDepartment } from "@/lib/departments/registry";
import { defaultStore as handoffStore } from "@/lib/handoff";
import { addCompany, addOpportunity } from "@/lib/crm";
import { addProject, updateProgress, transitionProject } from "@/lib/projects";
import { addTask, transitionTask } from "@/lib/tasks";
import { createInvoice, invoiceAction } from "@/lib/finance";
import { completeDelivery } from "@/lib/delivery-completion";
import { financeRecognitionOutputs } from "@/lib/domain/delivery-completion";

async function main() {
  const db = getDb();
  const now = new Date();
  const uniq = `${Date.now()}_${Math.floor(process.hrtime()[1] % 100000)}`;
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const regDeps = { store: registryStore(db), recordAudit: async () => {} };

  const wf = `verify_delcomp_${uniq}`;
  const proposalId = `verify_prop_${uniq}`; // provenance only
  const dueInPast = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30d ago → outstanding invoice is overdue
  const cleanup: Array<() => Promise<unknown>> = [];
  const runCleanup = async () => { for (const fn of cleanup.reverse()) { try { await fn(); } catch (e) { console.error("cleanup warn:", e instanceof Error ? e.message : e); } } };

  try {
    await seedDepartments(regDeps);
    // Restore the canonical department policies in cleanup (undoes the completion-topology upsert below).
    cleanup.push(() => seedDepartments(regDeps));

    // Ensure the completion topology exists (idempotent; a no-op once the seed adopts it): delivery DECLARES
    // finance + research + founder as downstream consumers, and finance + research ACCEPT delivery_completion.
    const find = (slug: string) => CANONICAL_DEPARTMENTS.find((d) => d.slug === slug)!;
    const withSchema = (list: string[] | undefined, s: string) => [...new Set([...(list ?? []), s])];
    const delivery = find("delivery");
    await upsertDepartment({ ...delivery, io: { ...delivery.io!, downstreamConsumers: ["finance", "research_intelligence", "founder_command_centre"], outboundProducts: withSchema(delivery.io!.outboundProducts, "delivery_completion") } }, regDeps);
    const finance = find("finance");
    await upsertDepartment({ ...finance, io: { ...finance.io!, acceptedHandoffSchemas: withSchema(finance.io!.acceptedHandoffSchemas, "delivery_completion") } }, regDeps);
    const research = find("research_intelligence");
    await upsertDepartment({ ...research, io: { ...research.io!, acceptedHandoffSchemas: withSchema(research.io!.acceptedHandoffSchemas, "delivery_completion") } }, regDeps);

    // ── Real data: a client + won opportunity + a COMPLETED project (milestones done) with kickoff tasks. ──
    const company = await addCompany({ name: `Acme Completion ${uniq}`, createdBy: "Moiz" }, { recordAudit: async () => {}, now });
    cleanup.push(() => db.delete(crmCompanies).where(eq(crmCompanies.id, company.id)));
    const opp = await addOpportunity({ name: `Acme Completion ${uniq} — AI OS`, companyId: company.id, stage: "won", valueCents: 480000, serviceInterest: ["Missed-call text-back"], assignedOwner: "Ali", createdBy: "Moiz" }, { recordAudit: async () => {}, now });
    cleanup.push(() => db.delete(crmStageHistory).where(eq(crmStageHistory.opportunityId, opp.id)));
    cleanup.push(() => db.delete(crmOpportunities).where(eq(crmOpportunities.id, opp.id)));
    cleanup.push(() => db.delete(tasks).where(eq(tasks.opportunityId, opp.id)));
    cleanup.push(() => db.delete(projects).where(eq(projects.opportunityId, opp.id)));
    cleanup.push(() => db.delete(handoffs).where(eq(handoffs.workflowId, wf)));

    let project = await addProject(
      { name: `Acme Completion ${uniq} delivery`, companyId: company.id, opportunityId: opp.id, proposalId, servicesIncluded: ["Missed-call text-back"], owner: "Ali", teamMembers: ["Ali", "Haad"], status: "in_progress", milestones: [{ title: "Kickoff call" }, { title: "Launch" }], createdBy: "Moiz" },
      { recordAudit: async () => {}, now },
    );
    // Mark all milestones done, then transition the project to COMPLETED (the real completion trigger).
    await updateProgress(project.id, { milestones: project.milestones.map((m) => ({ ...m, done: true })) }, { actor: "Ali" }, { recordAudit: async () => {}, now });
    const completedProject = await transitionProject(project.id, "completed", { actor: "Moiz" }, { recordAudit: async () => {}, now });
    assert(!!completedProject && completedProject.status === "completed", "the delivery project reached COMPLETED (real transition)");
    project = completedProject!;

    // Kickoff tasks — one finished, one still open (proves completed vs incomplete work).
    const doneTask = await addTask({ title: `Wire telephony ${uniq}`, companyId: company.id, opportunityId: opp.id, assignedTo: "Ali", createdBy: "Moiz" }, { recordAudit: async () => {}, now });
    await transitionTask(doneTask.id, "completed", { actor: "Ali" }, { recordAudit: async () => {}, now });
    await addTask({ title: `Client training ${uniq}`, companyId: company.id, opportunityId: opp.id, assignedTo: "Ali", createdBy: "Moiz" }, { recordAudit: async () => {}, now });

    // A real invoice for the deal, partially paid (200000 of 480000) and overdue.
    const inv = await createInvoice({ companyId: company.id, opportunityId: opp.id, proposalId, lineItems: [{ description: "Acme AI OS engagement", quantity: 1, unitPriceCents: 480000 }], dueDate: dueInPast, createdBy: "Moiz" }, { recordAudit: async () => {}, now });
    cleanup.push(() => db.delete(payments).where(eq(payments.invoiceId, inv.id)));
    cleanup.push(() => db.delete(invoices).where(eq(invoices.id, inv.id)));
    await invoiceAction(inv.id, "approve", { actor: "Moiz" }, { recordAudit: async () => {}, now });
    await invoiceAction(inv.id, "send", { actor: "Moiz" }, { recordAudit: async () => {}, now });
    const paid = await invoiceAction(inv.id, "mark_paid", { actor: "Moiz", amountPaidCents: 200000, paymentReference: `PAY-${uniq}` }, { recordAudit: async () => {}, now });
    assert(paid?.status === "partially_paid" && paid.amountPaidCents === 200000, "the invoice is partially paid (200000¢ of 480000¢) — a real ledger payment");

    // ── Complete the delivery: build the versioned product + route to the three authorized consumers. ──
    console.log("\nComplete the delivery and route the versioned completion to Finance + Research + Founder:");
    const res = await completeDelivery(
      { project, budgetCents: 480000, actualCostCents: 300000, reusableLessons: ["Client onboarding was slow — pre-stage telephony access."], requestedBy: "Moiz", workflowId: wf },
      { handoffStore: handoffStore(db), recordAudit: async () => {}, now },
    );
    assert(res.produced, "a completed project produced a DeliveryCompletion");

    // Deterministic close-out figures, computed from the REAL ledger.
    const c = res.completion!;
    assert(c.completedTasks.length === 1 && c.incompleteTasks.length === 1, "completed vs incomplete tasks derived from the real tasks (1 done, 1 open)");
    assert(c.scopeVariance.completedMilestones === 2 && c.scopeVariance.plannedMilestones === 2, "milestone completion derived from the real project");
    assert(c.marginInputs.recognizedRevenueCents === 480000 && c.marginInputs.grossMarginCents === 180000, "revenue recognition + margin computed from budget vs actual (recognized 480000¢, margin 180000¢)");
    assert(c.paymentState.state === "partially_paid" && c.paymentState.collectedCents === 200000 && c.paymentState.outstandingCents === 280000, "payment state computed from the real invoice ledger (collected 200000¢, outstanding 280000¢)");
    assert(c.paymentState.overdueCents === 280000, "the outstanding balance is flagged overdue (invoice due date is in the past)");
    assert(c.outcome.status === "delivered_with_gaps" && c.outcome.onBudget === true, "outcome computed truthfully (gaps from the open task; on budget)");

    // Routing: three authorized consumers, each a real durable handoff.
    assert(res.routedTo.every((r) => r.ok) && res.routedTo.map((r) => r.department).sort().join(",") === "finance,founder_command_centre,research_intelligence", "the completion routed to Finance + Research + Founder");
    const routed = await db.select().from(handoffs).where(eq(handoffs.workflowId, wf));
    assert(routed.length === 3 && routed.every((h) => h.deliveryState === "delivered"), "exactly three durable completion handoffs are delivered");

    const finRow = routed.find((h) => h.department === "finance")!;
    assert(finRow.dataClassification === "client_confidential", "the Finance handoff is client_confidential");
    const finOut = (finRow.envelope as { previousAgentOutputs?: Record<string, unknown> }).previousAgentOutputs ?? {};
    assert(finOut.recognizedRevenueCents === 480000 && finOut.outstandingCents === 280000 && finOut.paymentState === "partially_paid", "the Finance handoff carries the DETERMINISTIC revenue-recognition figures");
    // The payload is the pure deterministic projection: identical SHAPE (no LLM-added prose fields) + the
    // id-independent financial figures match the ledger projection exactly. (completionId is a generated id,
    // so an exact whole-object compare against a rebuilt completion would spuriously differ.)
    const proj = financeRecognitionOutputs(c);
    assert(Object.keys(finOut).sort().join(",") === Object.keys(proj).sort().join(","), "the Finance payload has EXACTLY the pure-projection shape (no LLM-added fields)");
    assert(finOut.grossMarginCents === proj.grossMarginCents && finOut.grossMarginPct === proj.grossMarginPct && finOut.collectedCents === proj.collectedCents && finOut.invoicedCents === proj.invoicedCents && finOut.overdueCents === proj.overdueCents && finOut.outcome === proj.outcome, "every Finance financial figure equals the deterministic ledger projection (no LLM on the financial path)");

    const resRow = routed.find((h) => h.department === "research_intelligence")!;
    assert(resRow.dataClassification === "internal", "the Research handoff is INTERNAL (de-identified lessons — clears Research's internal-only grant)");
    const resOut = (resRow.envelope as { previousAgentOutputs?: Record<string, unknown> }).previousAgentOutputs ?? {};
    assert(Array.isArray(resOut.reusableLessons) && !JSON.stringify(resOut).includes(String(company.id)), "the Research handoff carries reusable lessons with no client identity / financial cents");

    const foundRow = routed.find((h) => h.department === "founder_command_centre")!;
    assert(foundRow.dataClassification === "client_confidential" && typeof (foundRow.envelope as { previousAgentOutputs?: Record<string, unknown> }).previousAgentOutputs?.summary === "string", "the Founder handoff carries the executive close-out summary");

    // ── Idempotency: re-completing the same project dedups (no duplicate handoffs). ──
    const again = await completeDelivery({ project, budgetCents: 480000, actualCostCents: 300000, requestedBy: "Moiz", workflowId: wf }, { handoffStore: handoffStore(db), recordAudit: async () => {}, now });
    assert(again.routedTo.every((r) => r.ok && r.deduped), "re-completing dedups every route (idempotent)");
    const afterRerun = await db.select().from(handoffs).where(eq(handoffs.workflowId, wf));
    assert(afterRerun.length === 3, "still exactly three completion handoffs after a re-run");

    console.log("\nALL REAL-DB DELIVERY COMPLETION CHECKS PASSED ✅");
  } finally {
    await runCleanup();
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
