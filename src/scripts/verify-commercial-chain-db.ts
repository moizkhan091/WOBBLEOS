/**
 * Real-DB proof for the COMMERCIAL CHAIN — the three commercial department verticals end-to-end against
 * live Postgres, deterministic services staying authoritative:
 *
 *   proposal_artifact → SALES & CRM (opportunity → won) → FINANCE (invoice drafted) →
 *   DELIVERY (project + kickoff milestones + tasks + assigned owner) → delivery health computed →
 *   a real risk ESCALATES (real escalation row) → completion routes to the Founder Command Centre.
 *
 * HARD RULE proven live: the LLM/judgment agents (canned here — no spend) NEVER perform the mutation. The
 * deterministic services do every write — moveOpportunityStage (won), createInvoice (draft), addProject +
 * addTask. The judgment only advises (rides on the product) and drives escalation.
 *
 * ISOLATED + REPEATABLE + SAFE ON A POPULATED DB: every id/workflow is unique per run; the three commercial
 * departments are flipped active (their original status restored in cleanup) + given a proof specialist
 * (deleted in cleanup); a finally block deletes exactly (and only) what this run created. Safe to run twice.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-commercial-chain-db.ts
 */
import { getDb, closeDb } from "@/db";
import { handoffs, invoices, projects, tasks, escalations, crmCompanies, crmOpportunities, crmStageHistory, departmentMembers } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { seedDepartments } from "@/lib/departments/seed";
import { defaultStore as registryStore, getDepartment, setDepartmentStatus, upsertMember } from "@/lib/departments/registry";
import { defaultStore as handoffStore } from "@/lib/handoff";
import { defaultStore as escalationStore } from "@/lib/departments/escalation";
import { addCompany, addOpportunity, getOpportunity } from "@/lib/crm";
import { listProjects } from "@/lib/projects";
import { runSalesCrmDepartment } from "@/lib/departments/verticals/sales-crm";
import { runFinanceDepartment } from "@/lib/departments/verticals/finance";
import { runDeliveryDepartment } from "@/lib/departments/verticals/delivery";

// The three commercial departments this proof exercises, with the specialist capability each needs.
const COMMERCIAL = [
  { slug: "sales_crm", ref: "verify_sales_specialist", capability: "advance_deal", memory: ["company", "offer"] },
  { slug: "finance", ref: "verify_finance_specialist", capability: "invoice", memory: ["company"] },
  { slug: "delivery", ref: "verify_delivery_specialist", capability: "run_project", memory: ["company", "client"] },
] as const;

async function main() {
  const db = getDb();
  const now = new Date();
  const uniq = `${Date.now()}_${Math.floor(process.hrtime()[1] % 100000)}`;
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const regDeps = { store: registryStore(db), recordAudit: async () => {} };

  const wfSc = `verify_comm_sc_${uniq}`;
  const wfFin = `verify_comm_fin_${uniq}`;
  const wfDel = `verify_comm_del_${uniq}`;
  const proposalId = `verify_prop_${uniq}`; // provenance only — the proposal_artifact is proven separately
  const cleanup: Array<() => Promise<unknown>> = [];
  const runCleanup = async () => { for (const fn of cleanup.reverse()) { try { await fn(); } catch (e) { console.error("cleanup warn:", e instanceof Error ? e.message : e); } } };

  try {
    await seedDepartments(regDeps);

    // Make the three commercial departments operational for the proof (idempotent; original status restored
    // in cleanup) and register a proof specialist for each so selectSpecialists finds a real team.
    for (const d of COMMERCIAL) {
      const original = (await getDepartment(d.slug, regDeps))?.status ?? "draft";
      cleanup.push(() => setDepartmentStatus(d.slug, original, "verify_cleanup", regDeps));
      await setDepartmentStatus(d.slug, "active", "verify", regDeps);
      await upsertMember({ departmentSlug: d.slug, memberType: "agent", memberRef: d.ref, role: "specialist", responsibility: "commercial specialist", priority: 5, capabilities: [d.capability], toolGrants: ["run_node"], memoryGrants: [...d.memory] }, regDeps);
      cleanup.push(() => db.delete(departmentMembers).where(and(eq(departmentMembers.departmentSlug, d.slug), eq(departmentMembers.memberRef, d.ref))));
    }

    // Real CRM company + opportunity — the accepted proposal's linked deal (ready to be won).
    const company = await addCompany({ name: `Acme Commercial ${uniq}`, createdBy: "Moiz" }, { recordAudit: async () => {}, now });
    cleanup.push(() => db.delete(crmCompanies).where(eq(crmCompanies.id, company.id)));
    const opp = await addOpportunity({ name: `Acme Commercial ${uniq} — AI OS`, companyId: company.id, stage: "negotiation", valueCents: 480000, serviceInterest: ["Missed-call text-back"], assignedOwner: "Ali", createdBy: "Moiz" }, { recordAudit: async () => {}, now });
    cleanup.push(() => db.delete(crmStageHistory).where(eq(crmStageHistory.opportunityId, opp.id)));
    cleanup.push(() => db.delete(crmOpportunities).where(eq(crmOpportunities.id, opp.id)));
    cleanup.push(() => db.delete(tasks).where(eq(tasks.opportunityId, opp.id)));
    cleanup.push(() => db.delete(projects).where(eq(projects.opportunityId, opp.id)));
    cleanup.push(() => db.delete(invoices).where(eq(invoices.opportunityId, opp.id)));
    cleanup.push(() => db.delete(escalations).where(inArray(escalations.workflowId, [wfSc, wfFin, wfDel])));
    cleanup.push(() => db.delete(handoffs).where(inArray(handoffs.workflowId, [wfSc, wfFin, wfDel])));

    // ── STEP 1 — Sales & CRM: accepted proposal → advance the deal to WON (deterministic), route on. ──
    console.log("\nStep 1 — Sales & CRM advances the accepted deal to won and routes to Delivery + Finance:");
    const sc = await runSalesCrmDepartment(
      { opportunityId: opp.id, proposalId, businessName: "Acme (verify)", companyId: company.id, requestedBy: "Moiz", workflowId: wfSc },
      { handoffStore: handoffStore(db), escalationStore: escalationStore(db), assessDeal: async () => ({ lossRisk: "low", riskFactors: [], nextBestAction: "Book kickoff within 48h", rationale: "Clear scope" }), crmDeps: { recordAudit: async () => {} }, recordAudit: async () => {}, now },
    );
    assert(sc.accepted, "Sales & CRM accepted the proposal_artifact handoff");
    assert((await getOpportunity(opp.id))?.stage === "won", "the opportunity was advanced to won (deterministic crm write)");
    assert(sc.routedTo.map((r) => r.department).sort().join(",") === "delivery,finance", "the won_deal was routed to Delivery + Finance");
    assert((await listProjects({ opportunityId: opp.id, limit: 1 })).length === 0, "no delivery project yet — Sales & CRM suppresses the auto-hook (Delivery owns creation)");

    // ── STEP 2 — Finance: won deal → draft the invoice (deterministic), revenue intelligence, route on. ──
    console.log("\nStep 2 — Finance drafts the invoice for the won deal and routes revenue intelligence to the founder:");
    const fin = await runFinanceDepartment(
      { opportunityId: opp.id, companyId: company.id, proposalId, businessName: "Acme (verify)", amountCents: 480000, description: "Acme AI OS engagement", requestedBy: "Moiz", workflowId: wfFin },
      { handoffStore: handoffStore(db), assessMargin: async () => ({ marginRisk: "low", overdueRisk: "low", notes: ["Healthy"] }), financeDeps: { recordAudit: async () => {} }, recordAudit: async () => {}, now },
    );
    assert(fin.accepted, "Finance accepted the won_deal handoff");
    assert(fin.product?.invoice?.totalCents === 480000, "a real draft invoice was created for the deal total (480000¢)");
    assert(fin.product?.invoice?.status === "draft", "the invoice is a founder-approvable draft (AI never moves money)");
    const invRows = await db.select().from(invoices).where(eq(invoices.opportunityId, opp.id));
    assert(invRows.length === 1, "exactly one invoice row exists for the deal");
    assert(fin.routedTo.map((r) => r.department).join(",") === "founder_command_centre", "Finance routed revenue intelligence to the Founder Command Centre");

    // ── STEP 3 — Delivery: won deal → project + milestones + tasks + owner; health; escalate a real risk. ──
    console.log("\nStep 3 — Delivery stands up the project (milestones + tasks + owner), computes health, escalates a real risk:");
    const del = await runDeliveryDepartment(
      { opportunityId: opp.id, companyId: company.id, proposalId, projectName: `Acme Commercial ${uniq} delivery`, servicesIncluded: ["Missed-call text-back"], owner: "Ali", teamMembers: ["Ali", "Haad"], requestedBy: "Moiz", workflowId: wfDel },
      { handoffStore: handoffStore(db), escalationStore: escalationStore(db), assessFeasibility: async () => ({ feasibility: "blocked", risks: ["Client has no telephony access yet"], dependencies: [] }), projectDeps: { recordAudit: async () => {} }, taskDeps: { recordAudit: async () => {} }, recordAudit: async () => {}, now },
    );
    assert(del.accepted, "Delivery accepted the won_deal handoff");
    const deliveryProjects = await listProjects({ opportunityId: opp.id, limit: 5 });
    assert(deliveryProjects.length === 1, "Delivery created exactly one project (the single authoritative creator)");
    assert(deliveryProjects[0].status === "onboarding", "the delivery project starts in onboarding");
    assert(deliveryProjects[0].owner === "Ali", "the project has an assigned responsible owner");
    assert(deliveryProjects[0].milestones.length === 2, "kickoff milestones were seeded");
    const delTasks = await db.select().from(tasks).where(eq(tasks.opportunityId, opp.id));
    assert(delTasks.length === 2 && delTasks.every((t) => t.assignedTo === "Ali"), "two kickoff tasks were created and assigned to the owner");
    assert(!!del.product?.health, `delivery health was computed from real signals (${del.product?.health})`);

    // The blocked feasibility raised a REAL escalation row (visible + resolvable in the Command Centre).
    const escRows = await db.select().from(escalations).where(eq(escalations.workflowId, wfDel));
    assert(escRows.length >= 1 && escRows.some((e) => e.departmentSlug === "delivery"), "a real escalation row was raised for the blocked delivery");

    // Completion feeds the Founder Command Centre (the human visibility hub) as a real durable handoff.
    // (Finance/Research revenue-recognition completion-feed is a scoped follow-up — see seed.ts delivery.)
    assert(del.routedTo.map((r) => r.department).join(",") === "founder_command_centre", "Delivery routed completion to the Founder Command Centre");
    const delRouted = (await db.select().from(handoffs).where(eq(handoffs.workflowId, wfDel))).filter((h) => h.department === "founder_command_centre");
    assert(delRouted.length === 1 && delRouted.every((h) => h.deliveryState === "delivered"), "the durable completion handoff is delivered to the founder hub");

    console.log("\nALL REAL-DB COMMERCIAL CHAIN CHECKS PASSED ✅");
  } finally {
    await runCleanup();
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
