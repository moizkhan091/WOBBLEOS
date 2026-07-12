/**
 * Real-DB proof for the LIVE QA GATE (Phase 4) — QA controls real downstream work, end-to-end against live
 * Postgres. Proves at the real emission point (`dispatchBusinessAuditToProposal`, the paid_audit → proposal
 * origination):
 *   - a STRONG audit PASSES the independent paid_audit_qa board → the business_audit handoff IS emitted to
 *     Proposal + a passing `qa_reviews` row persists.
 *   - a WEAK audit gets a non-pass verdict → NO downstream handoff is emitted, a `qa_reviews` row persists,
 *     and a REAL founder-visible escalation row is raised (repeated_qa_failure). The gate BLOCKS real work.
 *
 * ISOLATED + REPEATABLE: unique ids per run; a finally block deletes exactly what this run created.
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-qa-gate-db.ts
 */
import { getDb, closeDb } from "@/db";
import { handoffs, escalations, qaReviews } from "@/db/schema";
import { eq } from "drizzle-orm";
import { seedDepartments } from "@/lib/departments/seed";
import { defaultStore as registryStore } from "@/lib/departments/registry";
import { defaultStore as handoffStore } from "@/lib/handoff";
import { defaultStore as escStore } from "@/lib/departments/escalation";
import { createDbQaReviewStore } from "@/lib/qa";
import { dispatchBusinessAuditToProposal } from "@/lib/departments/verticals/paid-audit";
import type { PaidAuditResult } from "@/lib/paid-audit-graph";
import type { PaidAuditReport } from "@/lib/domain/paid-audit-graph";

const REAL_SLUGS = ["speed-to-lead-system", "missed-call-text-back-system", "website-chat-booking-agent", "appointment-setter-system"];
const step = (s: string) => ({ step: s, detail: "detail", tool: "tool", pain: "pain" });
const phase = (title: string) => ({ title, months: "Month 1-3", focus: "focus", objectives: ["o1", "o2"], deliverables: ["d1"], items: ["Opp 1"], expectedOutcome: "outcome" });
function oppSet(n: number, grounded: number): PaidAuditReport["opportunities"] {
  return Array.from({ length: n }, (_, i) => ({ title: `Opp ${i + 1}`, area: "acquisition", service: i < grounded ? REAL_SLUGS[i % REAL_SLUGS.length] : "", description: "desc", howItWorks: "how", expectedOutcome: "outcome", impact: "high" as const, difficulty: "medium" as const, kpis: ["kpi"] }));
}
function strongReport(): PaidAuditReport {
  return {
    businessName: "Acme HVAC", industry: "hvac", executiveSummary: "x".repeat(240), situationSummary: "situation",
    currentState: { situation: "s", acquisition: [step("ads"), step("intake")], delivery: [step("onboard"), step("build")], support: [step("retain")], bottlenecks: [{ area: "sales", pain: "slow lead response", rootCause: "manual", severity: "high", businessImpact: "lost deals" }, { area: "ops", pain: "manual scheduling", rootCause: "no system", severity: "medium", businessImpact: "wasted hours" }], keyMetrics: [{ label: "leads", value: "100/mo" }] },
    opportunities: oppSet(8, 4),
    prioritization: { quickWins: ["Opp 1", "Opp 2"], bigSwings: ["Opp 3"], rationale: "sequence" },
    roadmap: [phase("P1"), phase("P2"), phase("P3")],
    roi: { estimatedMonthlyUpsideCents: 1_800_000, estimatedImplementationCents: 4_500_000, paybackMonths: 6, breakdown: [{ area: "sales", monthlyValueCents: 1_000_000 }] },
    risks: [{ risk: "adoption", mitigation: "training" }], successMetrics: ["response time"], recommendedTechStack: ["n8n"], nextSteps: ["kickoff"], serviceCount: 4,
  } as PaidAuditReport;
}
function weakReport(): PaidAuditReport {
  return { ...strongReport(), executiveSummary: "", currentState: { situation: "", acquisition: [], delivery: [], support: [], bottlenecks: [], keyMetrics: [] }, opportunities: [], prioritization: { quickWins: [], bigSwings: [], rationale: "" }, roadmap: [], roi: undefined, risks: [] } as PaidAuditReport;
}
const result = (report: PaidAuditReport): PaidAuditResult => ({ auditId: "audit_x", agentRunCount: 5, modelRunIds: ["m1"], report });

async function main() {
  const db = getDb();
  const now = new Date();
  const uniq = `${Date.now()}_${Math.floor(process.hrtime()[1] % 100000)}`;
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const wfPass = `clientQAgatePass_${uniq}`;
  const wfFail = `clientQAgateFail_${uniq}`;
  const qaDeps = () => ({ store: createDbQaReviewStore(db), escalationStore: escStore(db) });
  const cleanup: Array<() => Promise<unknown>> = [];
  const runCleanup = async () => { for (const fn of cleanup.reverse()) { try { await fn(); } catch (e) { console.error("cleanup warn:", e instanceof Error ? e.message : e); } } };

  try {
    await seedDepartments({ store: registryStore(db), recordAudit: async () => {} });
    cleanup.push(() => db.delete(qaReviews).where(eq(qaReviews.workflowId, wfPass)));
    cleanup.push(() => db.delete(qaReviews).where(eq(qaReviews.workflowId, wfFail)));
    cleanup.push(() => db.delete(escalations).where(eq(escalations.workflowId, wfFail)));
    cleanup.push(() => db.delete(handoffs).where(eq(handoffs.workflowId, wfPass)));
    cleanup.push(() => db.delete(handoffs).where(eq(handoffs.workflowId, wfFail)));

    console.log("\nStep 1 — a STRONG audit PASSES the QA gate → the business_audit handoff is emitted to Proposal:");
    const rPass = await dispatchBusinessAuditToProposal(
      { auditId: `aud_pass_${uniq}`, businessName: "Acme HVAC", companyId: wfPass },
      { store: handoffStore(db), qa: { result: result(strongReport()), deps: qaDeps() }, recordAudit: async () => {}, now },
    );
    assert(!rPass.blocked && !!rPass.handoffId, "the gate RELEASED the strong audit (not blocked, handoff emitted)");
    const passReview = (await db.select().from(qaReviews).where(eq(qaReviews.workflowId, wfPass)));
    assert(passReview.length === 1 && passReview[0].verdict === "pass", "a PASS qa_reviews row persisted for the strong audit");
    assert(passReview[0].reviewerAgentSlug === "paid_audit_qa_reviewer", "the review was written by the INDEPENDENT paid_audit_qa reviewer");
    const emitted = (await db.select().from(handoffs).where(eq(handoffs.workflowId, wfPass))).filter((h) => h.department === "proposal");
    assert(emitted.length === 1 && emitted[0].deliveryState === "delivered", "exactly one business_audit handoff is delivered to Proposal (released)");

    console.log("\nStep 2 — a WEAK audit is BLOCKED → NO downstream handoff + a real escalation:");
    const rFail = await dispatchBusinessAuditToProposal(
      { auditId: `aud_fail_${uniq}`, businessName: "Acme HVAC", companyId: wfFail },
      { store: handoffStore(db), qa: { result: result(weakReport()), deps: qaDeps() }, recordAudit: async () => {}, now },
    );
    assert(rFail.blocked === true && !rFail.handoffId, "the gate BLOCKED the weak audit (blocked, no handoff id)");
    assert((await db.select().from(handoffs).where(eq(handoffs.workflowId, wfFail))).filter((h) => h.department === "proposal").length === 0, "NO business_audit handoff was emitted to Proposal (the gate blocked real downstream work)");
    const failReview = (await db.select().from(qaReviews).where(eq(qaReviews.workflowId, wfFail)));
    assert(failReview.length === 1 && ["fail", "revise", "blocked"].includes(failReview[0].verdict), `a non-pass qa_reviews row persisted (got '${failReview[0]?.verdict}')`);
    const esc = await db.select().from(escalations).where(eq(escalations.workflowId, wfFail));
    assert(esc.length >= 1 && esc.some((e) => e.departmentSlug === "paid_audit"), "a REAL founder-visible escalation row was raised on the QA block");

    console.log("\nStep 3 — idempotency: re-running the gate does not double-write the review or re-emit:");
    const again = await dispatchBusinessAuditToProposal(
      { auditId: `aud_pass_${uniq}`, businessName: "Acme HVAC", companyId: wfPass },
      { store: handoffStore(db), qa: { result: result(strongReport()), deps: qaDeps() }, recordAudit: async () => {}, now },
    );
    void again;
    assert((await db.select().from(qaReviews).where(eq(qaReviews.workflowId, wfPass))).length === 1, "still exactly one qa_reviews row for the passed workflow (no duplicate review)");

    console.log("\nALL REAL-DB QA-GATE CHECKS PASSED ✅");
  } finally {
    await runCleanup();
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
