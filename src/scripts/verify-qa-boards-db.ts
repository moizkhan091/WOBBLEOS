/**
 * Real-DB proof for the QA Boards framework (Phase 4) against live Postgres. Proves, isolated + repeatably:
 *   1. an independent reviewer's verdict PERSISTS to `qa_reviews` and reads back with its evidence,
 *   2. a self-review (reviewer === author) is REJECTED — no row is written for it,
 *   3. a `revise` verdict records the EXACT failed stage in routing_target (completed stages preserved).
 *
 * DO NOT RUN THIS as part of a batch — the lead runs DB proofs serially. It uses RAW parameterized SQL
 * (not the drizzle schema symbol) so it compiles before the lead adds the `qa_reviews` table + migration;
 * it therefore requires that migration to be applied first. Everything is scoped by a unique run id and
 * cleaned up in `finally`.
 *
 * Run (AFTER the qa_reviews migration is applied):
 *   DATABASE_URL=... npx tsx src/scripts/verify-qa-boards-db.ts
 */
import { getPool, closeDb } from "@/db";
import { runQaReview, QaIndependenceError, createDbQaReviewStore } from "@/lib/qa";
import { paidAuditQaBoard, buildPaidAuditSubmission } from "@/lib/qa/boards";
import type { EscalationInput } from "@/lib/domain/escalation";
import type { PaidAuditResult } from "@/lib/paid-audit-graph";
import type { PaidAuditReport } from "@/lib/domain/paid-audit-graph";
import type { QaReview } from "@/lib/domain/qa-board";

// ---- minimal fixtures (real artifact shape) -------------------------------------------------------

const step = (s: string) => ({ step: s, detail: "d", tool: "t", pain: "p" });
const phase = (title: string) => ({ title, months: "1-3", focus: "f", objectives: ["o1", "o2"], deliverables: ["d1"], items: ["Opp 1"], expectedOutcome: "o" });
const REAL_SLUGS = ["speed-to-lead-system", "missed-call-text-back-system", "website-chat-booking-agent", "appointment-setter-system"];
function oppSet(n: number, grounded: number): PaidAuditReport["opportunities"] {
  return Array.from({ length: n }, (_, i) => ({ title: `Opp ${i + 1}`, area: "a", service: i < grounded ? REAL_SLUGS[i % REAL_SLUGS.length] : "", description: "d", howItWorks: "h", expectedOutcome: "e", impact: "high" as const, difficulty: "medium" as const, kpis: ["k"] }));
}
function strongReport(): PaidAuditReport {
  return {
    businessName: "Acme", industry: "hvac", executiveSummary: "x".repeat(240), situationSummary: "s",
    currentState: { situation: "s", acquisition: [step("ads"), step("intake")], delivery: [step("onboard"), step("build")], support: [step("retain")], bottlenecks: [{ area: "sales", pain: "slow", rootCause: "manual", severity: "high", businessImpact: "lost deals" }, { area: "ops", pain: "manual", rootCause: "none", severity: "medium", businessImpact: "hours" }], keyMetrics: [{ label: "leads", value: "100" }] },
    opportunities: oppSet(8, 4), prioritization: { quickWins: ["Opp 1", "Opp 2"], bigSwings: ["Opp 3"], rationale: "seq" },
    roadmap: [phase("P1"), phase("P2"), phase("P3")],
    roi: { estimatedMonthlyUpsideCents: 1_800_000, estimatedImplementationCents: 4_500_000, paybackMonths: 6, breakdown: [{ area: "sales", monthlyValueCents: 1_000_000 }] },
    risks: [{ risk: "adoption", mitigation: "training" }], successMetrics: ["m"], recommendedTechStack: ["n8n"], nextSteps: ["kickoff"], serviceCount: 4,
  };
}
const audit = (report: PaidAuditReport): PaidAuditResult => ({ auditId: "audit_1", agentRunCount: 5, modelRunIds: ["m1"], report });

// ---- raw-SQL qa_reviews store (no schema symbol; matches the migration SPEC) -----------------------

async function main() {
  const pool = getPool();
  const runId = `qa_verify_${Date.now()}`;
  const workflowId = `${runId}_wf`;
  // Exercise the SHIPPED DB store (createDbQaReviewStore) — not a parallel raw-SQL impl — so this proof
  // verifies the exact code the runtime uses.
  const store = createDbQaReviewStore();
  const escalations: EscalationInput[] = [];
  const deps = { store, now: new Date(), recordAudit: async () => {}, raiseEscalation: async (i: EscalationInput) => void escalations.push(i) };
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };

  try {
    // 1. Independent reviewer persists a verdict.
    const passReview = await runQaReview({ board: paidAuditQaBoard, submission: buildPaidAuditSubmission(audit(strongReport()), { workflowId, taskId: `${runId}_pass` }) }, deps);
    assert(passReview.independent === true, "review recorded as independent");
    const persisted = await store.getById(passReview.id);
    assert(persisted !== null, "the QA review persisted to qa_reviews");
    assert(persisted!.reviewerAgentSlug === "paid_audit_qa_reviewer", "the independent reviewer identity is recorded");
    assert(persisted!.evidence.length > 0, "evidence is retained on the persisted row");

    // 2. A self-review is rejected — nothing is written for it.
    let rejected = false;
    const before = (await pool.query(`select count(*)::int as n from qa_reviews where workflow_id = $1`, [workflowId])).rows[0].n as number;
    try {
      await runQaReview({ board: paidAuditQaBoard, submission: buildPaidAuditSubmission(audit(strongReport()), { workflowId, authorAgentSlug: paidAuditQaBoard.reviewerAgentSlug }) }, deps);
    } catch (e) { rejected = e instanceof QaIndependenceError; }
    const after = (await pool.query(`select count(*)::int as n from qa_reviews where workflow_id = $1`, [workflowId])).rows[0].n as number;
    assert(rejected, "a self-review (reviewer === author) was REJECTED");
    assert(after === before, "no qa_reviews row was written for the rejected self-review");

    // 3. A revise records the exact failed stage; completed stages preserved.
    const reviseReview = await runQaReview({ board: paidAuditQaBoard, submission: buildPaidAuditSubmission(audit({ ...strongReport(), opportunities: oppSet(5, 0) }), { workflowId, taskId: `${runId}_revise` }) }, deps);
    assert(reviseReview.verdict === "revise", "an under-delivered audit returns REVISE");
    const persistedRevise = await store.getById(reviseReview.id);
    assert(JSON.stringify(persistedRevise!.routingTarget!.failedStages) === JSON.stringify(["opportunity"]), "routing_target records the exact failed stage: opportunity");
    assert(persistedRevise!.routingTarget!.preservedStages.includes("report"), "completed stages (e.g. report) are preserved in routing_target");
    assert(escalations.some((e) => e.reason === "repeated_qa_failure"), "the revise surfaced to the Command Centre with the routing target");

    console.log("\nALL REAL-DB QA-BOARD CHECKS PASSED ✅");
  } finally {
    // Scoped cleanup.
    await pool.query(`delete from qa_reviews where workflow_id = $1`, [workflowId]).catch(() => {});
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
