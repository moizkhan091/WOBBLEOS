/**
 * Real-DB proof for the Proposal & Solution Design DEPARTMENT vertical + the commercial chain, end-to-end
 * against live Postgres. Two proven halves:
 *
 *   A. ROUTING + DEPARTMENT CLAIM PRIMITIVE — the real Paid Audit department routes a durable
 *      `business_audit` handoff to Proposal (delivered); `claimNextDepartmentHandoff("proposal", …)` claims
 *      it (delivered → processing). Proves the consumer primitive every downstream vertical relies on.
 *
 *   B. PROPOSAL VERTICAL + COMMERCIAL CHAIN — from a real audit (+ linked CRM company/opportunity): the
 *      Proposal department runs its solution architect (canned here — no spend) then the DETERMINISTIC
 *      createProposalFromAudit service maps the audit → a versioned proposal artifact. On founder ACCEPT the
 *      deterministic chain fires: invoice draft + opportunity→won + delivery project (via the CRM won-hook).
 *      LLMs never touch the financial writes — the architect only advises; services do every mutation.
 *
 * ISOLATED + REPEATABLE + SAFE ON A POPULATED DB: every id is unique per run, and a finally block deletes
 * exactly (and only) what this run created — so it is safe to run repeatedly against a database with data.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-proposal-vertical-db.ts
 */
import { getDb, closeDb } from "@/db";
import { handoffs, audits, proposals, invoices, projects, tasks, crmCompanies, crmOpportunities, crmStageHistory } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { seedDepartments } from "@/lib/departments/seed";
import { defaultStore as registryStore } from "@/lib/departments/registry";
import { defaultStore as handoffStore, claimNextDepartmentHandoff } from "@/lib/handoff";
import { runPaidAuditDepartment } from "@/lib/departments/verticals/paid-audit";
import { runProposalDepartment } from "@/lib/departments/verticals/proposal";
import { buildAuditRow, type AuditReport } from "@/lib/domain/free-audit";
import { addCompany, addOpportunity, getOpportunity } from "@/lib/crm";
import { getProposal, proposalAction } from "@/lib/proposals";
import { listProjects } from "@/lib/projects";

const CANNED_AUDIT: Record<string, string> = {
  audit_discovery: JSON.stringify({ situation: "x", acquisition: [], delivery: [], support: [], bottlenecks: [], keyMetrics: [] }),
  audit_opportunity: JSON.stringify({ opportunities: [{ title: "T", service: "missed-call-text-back-system", description: "d", impact: "high", difficulty: "low", kpis: ["k"] }] }),
  audit_prioritization: JSON.stringify({ quickWins: [], bigSwings: [], rationale: "r" }),
  audit_roadmap: JSON.stringify({ phases: [] }),
  audit_report: JSON.stringify({ executiveSummary: "E", situationSummary: "s", roi: { estimatedMonthlyUpsideCents: 1, estimatedImplementationCents: 1, paybackMonths: 1 }, risks: [], successMetrics: ["s"], recommendedTechStack: ["Wobble OS"], nextSteps: ["n"] }),
};

// A paid-audit-shaped report the Proposal service maps deterministically (services←opportunities, pricing←roi).
const AUDIT_REPORT = {
  businessName: "Acme (verify)",
  executiveSummary: "Acme leaks acquisition at the phone; AI recovers it.",
  opportunities: [
    { title: "Missed-call text-back", description: "Auto-text every missed call" },
    { title: "AI intake concierge", description: "Qualify + book 24/7" },
  ],
  roadmap: [{ title: "Phase 1 — Recover missed calls", months: "0-3", focus: "Telephony + intake" }],
  roi: { estimatedImplementationCents: 480000 },
} as unknown as AuditReport;

async function main() {
  const db = getDb();
  const now = new Date();
  const uniq = `${Date.now()}_${Math.floor(process.hrtime()[1] % 100000)}`;
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };

  const wfPaid = `verify_prop_paid_${uniq}`;
  const wfProp = `verify_prop_${uniq}`;
  const cleanup: Array<() => Promise<unknown>> = [];
  const runCleanup = async () => { for (const fn of cleanup.reverse()) { try { await fn(); } catch (e) { console.error("cleanup warn:", e instanceof Error ? e.message : e); } } };

  try {
    await seedDepartments({ store: registryStore(db), recordAudit: async () => {} });

    // ─────────────────────────────────────────────────────────────────────────────────────────────
    // PART A — routing + the department claim primitive.
    // ─────────────────────────────────────────────────────────────────────────────────────────────
    console.log("\nPart A — Paid Audit routes a business_audit handoff to Proposal; Proposal claims it:");
    cleanup.push(() => db.delete(handoffs).where(inArray(handoffs.workflowId, [wfPaid])));

    const paid = await runPaidAuditDepartment(
      { businessName: "Acme", intakeNotes: "x", requestedBy: "Moiz", companyId: "clientVerifyProp", graphRunId: wfPaid },
      {
        handoffStore: handoffStore(db),
        graph: { retrieveBrain: async () => [], runNode: async (i: { role: string }) => ({ text: CANNED_AUDIT[i.role], runId: `r_${i.role}` }), recordAgentRun: async () => ({}), persistAudit: async () => {}, recordAudit: async () => {} },
        recordAudit: async () => {},
        now,
      },
    );
    assert(paid.routedTo.map((r) => r.department).includes("proposal"), "Paid Audit routed the business audit to Proposal");

    const routed = (await db.select().from(handoffs).where(eq(handoffs.workflowId, wfPaid))).filter((r) => r.department === "proposal");
    assert(routed.length === 1 && routed[0].deliveryState === "delivered", "one durable handoff is delivered to Proposal, awaiting claim");

    const claimed = await claimNextDepartmentHandoff("proposal", "proposal_verify_worker", { store: handoffStore(db), recordAudit: async () => {}, now });
    assert(!!claimed && claimed.id === routed[0].id, "Proposal claimed the routed handoff via claimNextDepartmentHandoff");
    assert(claimed!.deliveryState === "processing", "the claimed handoff moved delivered → processing (real lease)");
    assert((claimed!.envelope as { expectedOutputSchema: string }).expectedOutputSchema === "business_audit", "the claimed product schema is business_audit");

    // ─────────────────────────────────────────────────────────────────────────────────────────────
    // PART B — the Proposal vertical + the deterministic commercial chain.
    // ─────────────────────────────────────────────────────────────────────────────────────────────
    console.log("\nPart B — Proposal vertical → founder accept → invoice + opportunity-won + delivery project:");

    // Real CRM company + opportunity (the audit's linked deal).
    const company = await addCompany({ name: `Acme Verify ${uniq}`, createdBy: "Moiz" }, { recordAudit: async () => {}, now });
    cleanup.push(() => db.delete(crmCompanies).where(eq(crmCompanies.id, company.id)));
    const opp = await addOpportunity({ name: `Acme Verify ${uniq} — AI OS`, companyId: company.id, valueCents: 480000, createdBy: "Moiz" }, { recordAudit: async () => {}, now });
    cleanup.push(() => db.delete(crmStageHistory).where(eq(crmStageHistory.opportunityId, opp.id)));
    cleanup.push(() => db.delete(crmOpportunities).where(eq(crmOpportunities.id, opp.id)));
    cleanup.push(() => db.delete(tasks).where(eq(tasks.opportunityId, opp.id)));
    cleanup.push(() => db.delete(projects).where(eq(projects.opportunityId, opp.id)));

    // Real audit row (the Paid Audit department's product) linked to that deal.
    const auditRow = buildAuditRow({ businessName: "Acme (verify)", companyId: company.id, opportunityId: opp.id, createdBy: "Moiz", signals: [], problems: [] }, AUDIT_REPORT, { now, kind: "paid" });
    await db.insert(audits).values({ ...auditRow, report: auditRow.report as unknown as Record<string, unknown> });
    cleanup.push(() => db.delete(audits).where(eq(audits.id, auditRow.id)));

    // Run the Proposal department against the REAL audit (canned architect; real DB proposal service).
    const propRes = await runProposalDepartment(
      { auditId: auditRow.id, businessName: "Acme (verify)", companyId: company.id, requestedBy: "Moiz", workflowId: wfProp },
      {
        handoffStore: handoffStore(db),
        synthesize: async () => ({ technicalSolution: "Missed-call text-back + AI intake concierge.", integrationDesign: "Twilio ↔ CRM webhook.", roiAssumptions: "Recover 18% of missed calls.", risks: ["Telephony limits"] }),
        recordAudit: async () => {},
        now,
      },
    );
    cleanup.push(() => db.delete(handoffs).where(inArray(handoffs.workflowId, [wfProp])));

    const proposalId = propRes.product!.proposal.id;
    cleanup.push(() => db.delete(invoices).where(eq(invoices.proposalId, proposalId)));
    cleanup.push(() => db.delete(proposals).where(eq(proposals.id, proposalId)));

    assert(propRes.accepted, "the Proposal department accepted the inbound audit handoff");
    assert(!!propRes.product?.synthesis.technicalSolution.includes("Missed-call"), "the solution architect's synthesis rode on the department product");

    const persisted = await getProposal(proposalId);
    assert(!!persisted, "the proposal was persisted to the real DB");
    assert(persisted!.auditId === auditRow.id, "the proposal is linked to the source audit");
    assert(JSON.stringify(persisted!.services.map((s) => s.name)) === JSON.stringify(["Missed-call text-back", "AI intake concierge"]), "services were mapped from the audit's opportunities");
    assert(persisted!.pricingCents === 480000, "pricing was mapped from the audit ROI (480000¢)");
    assert(persisted!.opportunityId === opp.id, "the proposal is linked to the CRM opportunity");
    assert(persisted!.status === "draft", "the proposal awaits founder approval (chain has NOT fired yet)");

    // No delivery project yet — accept is what fires the chain.
    assert((await listProjects({ opportunityId: opp.id, limit: 1 })).length === 0, "no delivery project exists before acceptance");

    // Founder-gated lifecycle → ACCEPT fires the deterministic commercial chain.
    await proposalAction(proposalId, "approve", { actor: "Moiz" }, { recordAudit: async () => {}, now });
    await proposalAction(proposalId, "send", { actor: "Moiz" }, { recordAudit: async () => {}, now });
    const accepted = await proposalAction(proposalId, "accept", { actor: "Moiz" }, { recordAudit: async () => {}, now });

    assert(accepted?.proposal.status === "accepted", "the proposal transitioned to accepted");
    assert(!!accepted?.invoiceId, "accept auto-drafted a real invoice");
    const inv = await db.select().from(invoices).where(eq(invoices.proposalId, proposalId));
    assert(inv.length === 1 && inv[0].totalCents === 480000, "the invoice row exists for the proposal total (480000¢)");

    const wonOpp = await getOpportunity(opp.id);
    assert(wonOpp?.stage === "won", "the linked opportunity advanced to won");
    const deliveryProjects = await listProjects({ opportunityId: opp.id, limit: 5 });
    assert(deliveryProjects.length === 1, "the CRM won-hook created exactly one delivery project");
    assert(deliveryProjects[0].status === "onboarding", "the delivery project starts in onboarding");

    console.log("\nALL REAL-DB PROPOSAL VERTICAL + COMMERCIAL CHAIN CHECKS PASSED ✅");
  } finally {
    await runCleanup();
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
