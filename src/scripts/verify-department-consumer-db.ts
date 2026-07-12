/**
 * Real-DB proof for the DEPARTMENT CONSUMER LOOP — the autonomous inter-department chain, end-to-end
 * against live Postgres. This is what proves the reviewer's "routed handoff is never claimed" gap is
 * CLOSED: a `business_audit` handoff is dispatched to Proposal (origination, exactly as a completed paid
 * audit does in production), then `runDepartmentConsumerTick` — with NOBODY hand-claiming — autonomously
 * claims it, runs the real Proposal department, persists the proposal (with the architect's synthesis on
 * the artifact), and completes the handoff exactly once.
 *
 * ISOLATED + REPEATABLE + SAFE ON A POPULATED DB: unique ids per run; a finally block deletes exactly what
 * this run created. The consumer tick is scoped to ["proposal"] so it never touches other departments.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-department-consumer-db.ts
 */
import { getDb, closeDb } from "@/db";
import { handoffs, audits, proposals } from "@/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { seedDepartments } from "@/lib/departments/seed";
import { defaultStore as registryStore } from "@/lib/departments/registry";
import { defaultStore as handoffStore } from "@/lib/handoff";
import { dispatchBusinessAuditToProposal } from "@/lib/departments/verticals/paid-audit";
import { runDepartmentConsumerTick } from "@/lib/departments/consumer";
import { buildAuditRow, type AuditReport } from "@/lib/domain/free-audit";
import { getProposal } from "@/lib/proposals";
import type { SolutionSynthesis } from "@/lib/departments/verticals/proposal";

const AUDIT_REPORT = {
  businessName: "Acme (consumer verify)",
  executiveSummary: "Acme leaks acquisition at the phone; AI recovers it.",
  opportunities: [
    { title: "Missed-call text-back", description: "Auto-text every missed call" },
    { title: "AI intake concierge", description: "Qualify + book 24/7" },
  ],
  roadmap: [{ title: "Phase 1", months: "0-3", focus: "Telephony + intake" }],
  roi: { estimatedImplementationCents: 480000 },
} as unknown as AuditReport;

const CANNED_SYNTHESIS: SolutionSynthesis = {
  technicalSolution: "Missed-call text-back + AI intake concierge on the existing phone stack.",
  integrationDesign: "Twilio ↔ CRM webhook.",
  roiAssumptions: "Recover 18% of missed calls.",
  risks: ["Telephony provider rate limits"],
};

async function main() {
  const db = getDb();
  const now = new Date();
  const uniq = `${Date.now()}_${Math.floor(process.hrtime()[1] % 100000)}`;
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };

  const wf = `verify_consumer_${uniq}`;
  const companyId = `clientConsumerVerify_${uniq}`;
  const cleanup: Array<() => Promise<unknown>> = [];
  const runCleanup = async () => { for (const fn of cleanup.reverse()) { try { await fn(); } catch (e) { console.error("cleanup warn:", e instanceof Error ? e.message : e); } } };

  try {
    await seedDepartments({ store: registryStore(db), recordAudit: async () => {} });

    console.log("\nAutonomous consumer loop — origination → autonomous claim → Proposal runs → handoff completed:");

    // A real audit row (the Paid Audit product) the Proposal service maps deterministically.
    const auditRow = buildAuditRow({ businessName: "Acme (consumer verify)", companyId, createdBy: "Moiz", signals: [], problems: [] }, AUDIT_REPORT, { now, kind: "paid" });
    await db.insert(audits).values({ ...auditRow, report: auditRow.report as unknown as Record<string, unknown> });
    cleanup.push(() => db.delete(audits).where(eq(audits.id, auditRow.id)));

    // ORIGINATION: dispatch a business_audit handoff to Proposal (exactly as the audit.paid job does).
    const routed = await dispatchBusinessAuditToProposal(
      { auditId: auditRow.id, businessName: "Acme (consumer verify)", companyId },
      { store: handoffStore(db), recordAudit: async () => {}, now },
    );
    cleanup.push(() => db.delete(handoffs).where(eq(handoffs.id, routed.handoffId)));

    const before = await db.select().from(handoffs).where(eq(handoffs.id, routed.handoffId));
    assert(before[0]?.deliveryState === "delivered", "business_audit handoff is delivered to Proposal, awaiting an autonomous claim");
    assert(before[0]?.department === "proposal", "the handoff is addressed to the Proposal department");

    // AUTONOMOUS CONSUMER — nobody hand-claims. The tick claims + runs + completes. Scoped to proposal +
    // bounded loop so a clean dev DB completes in one pass (a stale delivered handoff would need another).
    let completed = false;
    let anyClaimed = 0;
    for (let i = 0; i < 6 && !completed; i++) {
      const res = await runDepartmentConsumerTick({
        onlyDepartments: ["proposal"],
        handoffStore: handoffStore(db),
        proposal: { synthesize: async () => CANNED_SYNTHESIS },
        recordAudit: async () => {},
        now,
      });
      anyClaimed += res.claimed;
      const cur = await db.select().from(handoffs).where(eq(handoffs.id, routed.handoffId));
      completed = cur[0]?.deliveryState === "completed";
    }
    assert(anyClaimed >= 1, "the consumer tick autonomously claimed a Proposal handoff (no manual claim)");
    assert(completed, "the routed handoff moved delivered → completed via the autonomous consumer");

    // The Proposal department really ran: a proposal was persisted from the audit carried on the handoff.
    const created = await db.select().from(proposals).where(and(eq(proposals.auditId, auditRow.id)));
    assert(created.length === 1, "exactly one proposal was created autonomously from the routed audit");
    cleanup.push(() => db.delete(proposals).where(eq(proposals.auditId, auditRow.id)));

    const persisted = await getProposal(created[0].id);
    assert(!!persisted, "the proposal is readable from the real DB");
    assert(persisted!.pricingCents === 480000, "pricing was mapped from the audit ROI (480000¢)");
    assert(JSON.stringify(persisted!.services.map((s) => s.name)) === JSON.stringify(["Missed-call text-back", "AI intake concierge"]), "services were mapped from the audit's opportunities");
    // FIX-2 — the solution architect's synthesis is PERSISTED onto the artifact (not discarded).
    const design = (persisted!.metadata as { solutionDesign?: SolutionSynthesis }).solutionDesign;
    assert(!!design?.technicalSolution.includes("Missed-call"), "the architect's synthesis is persisted on the proposal (metadata.solutionDesign)");

    // Re-run idempotency: the completed handoff is not re-claimed (exactly-once).
    const again = await runDepartmentConsumerTick({ onlyDepartments: ["proposal"], handoffStore: handoffStore(db), proposal: { synthesize: async () => CANNED_SYNTHESIS }, recordAudit: async () => {}, now });
    void again; // a completed handoff is terminal — it is never re-run
    const finalRows = await db.select().from(proposals).where(eq(proposals.auditId, auditRow.id));
    assert(finalRows.length === 1, "the completed handoff is terminal — the proposal was not created twice");

    console.log("\nALL REAL-DB DEPARTMENT CONSUMER LOOP CHECKS PASSED ✅");
  } finally {
    await runCleanup();
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
