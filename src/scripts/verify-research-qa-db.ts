/**
 * Real-DB proof that the independent research_validation QA board GATES live research output on Postgres.
 *
 * The Research & Intelligence department runs for real (analyst + dreamer write insights/suggestions; only the
 * LLM is canned). The research_validation board then verifies each PROPOSED insight is SOURCED (real evidence
 * provenance) before the validated intelligence may PROPAGATE. Proven:
 *   - STRONG (insights cite real evidence) → PASS → released to the Founder Command Centre; an independent
 *     PASS qa_review is recorded (reviewer = research_validation_reviewer); no escalation.
 *   - WEAK (insights carry NO evidence) → non-pass → propagation BLOCKED (no founder handoff); a non-pass
 *     qa_review is recorded, the failed stage is `analyse`, and a real founder escalation is raised.
 *   - IDEMPOTENT: re-running the same unit of work reuses the review + does not duplicate the escalation.
 *   - the reviewer is INDEPENDENT (never an author) — the gate enforces it structurally.
 *
 * ISOLATED: a unique client id + workflow ids + finally-cleanup. Run twice cleanly.
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-research-qa-db.ts
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { approvals, escalations, handoffs, intelligenceInsights, intelligenceItems, intelligenceSuggestions, qaReviews } from "@/db/schema";
import { seedDepartments } from "@/lib/departments/seed";
import { defaultStore as registryStore } from "@/lib/departments/registry";
import { defaultStore as handoffStore } from "@/lib/handoff";
import { defaultStore as intelligenceStore, recordIntelligenceItem } from "@/lib/intelligence";
import { runIntelligenceAnalyst } from "@/lib/intelligence/analyst";
import { runDreamer } from "@/lib/intelligence/dreamer";
import { runResearchIntelligenceDepartment } from "@/lib/departments/verticals/research-intelligence";

const cannedDreamer = async () => ({ text: JSON.stringify({ suggestions: [{ suggestionType: "content_idea", title: "Observation-led carousel", rationale: "A rising pattern.", proposedAction: "Ship one this week.", evidenceInsightIds: [], evidenceItemIds: [], priority: "high", confidence: 0.7 }] }), run: { id: "canned_dreamer" } });

async function main() {
  const db = getDb();
  const now = new Date();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const clientId = `verify_rqa_${uniq}`;
  const wfPass = `verify_rqa_pass_${uniq}`;
  const wfBlock = `verify_rqa_block_${uniq}`;
  const wfIdem = `verify_rqa_idem_${uniq}`;
  const intel = { store: intelligenceStore(db), recordAudit: async () => {} };
  const suggestionIds: string[] = [];

  const run = (workflowId: string, cannedAnalyst: () => Promise<{ text: string; run: { id: string } }>) =>
    runResearchIntelligenceDepartment(
      { scope: "client", clientId, requestedBy: "Moiz", workflowId },
      {
        handoffStore: handoffStore(db),
        analyze: (i, d) => runIntelligenceAnalyst(i, { ...d, runProvider: cannedAnalyst }),
        dream: (i, d) => runDreamer(i, { ...d, runProvider: cannedDreamer }),
        intelligenceDeps: intel,
        qa: { deps: {} }, // enable the research_validation gate; DB-backed qa_reviews + escalation stores
        recordAudit: async () => {},
        now,
      },
    );

  try {
    await seedDepartments({ store: registryStore(db), recordAudit: async () => {} });
    // Seed 3 real, approved observations (isolated client scope). Capture an id to cite as real evidence.
    const itemIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { item } = await recordIntelligenceItem({ itemType: "competitor_post", scope: "client", clientId, title: `Rival post ${i}`, summary: `Observation ${i}: a specific hook drove engagement.`, approvalStatus: "approved" }, intel);
      itemIds.push(item.id);
    }
    const realEvidence = itemIds[0];

    // -------------------------------------------------- STRONG → released
    const strongAnalyst = async () => ({ text: JSON.stringify({ insights: [
      { insightType: "content_pattern", title: "Observation-led hooks win", summary: "Rivals open with a specific, verifiable observation.", recommendation: "Test observation-led hooks.", evidenceItemIds: [realEvidence], appliesToModules: ["content_command"], impactScore: 72, confidence: 0.7 },
      { insightType: "competitor_pattern", title: "Carousel cadence", summary: "Rivals ship carousels ~3x/week.", recommendation: "Match the cadence.", evidenceItemIds: [realEvidence], appliesToModules: ["social"], impactScore: 60, confidence: 0.6 },
    ] }), run: { id: "canned_analyst_strong" } });
    const strong = await run(wfPass, strongAnalyst);
    suggestionIds.push(...(strong.product?.suggestions.suggestionIds ?? []));
    assert(strong.accepted && strong.product?.analysis.proposedInsights === 2, "STRONG: the department produced 2 insights");
    assert(strong.routedTo.map((r) => r.department).includes("founder_command_centre"), "STRONG: the gate RELEASED — the validated intelligence propagated to the Founder Command Centre");
    const passReviews = await db.select().from(qaReviews).where(eq(qaReviews.workflowId, wfPass));
    assert(passReviews.length === 1 && passReviews[0].verdict === "pass" && passReviews[0].reviewerAgentSlug === "research_validation_reviewer", "STRONG: one PASS qa_review by the INDEPENDENT research_validation_reviewer");
    assert(passReviews[0].independent === true, "STRONG: the review is structurally independent (reviewer ∉ authors)");
    assert((await db.select().from(escalations).where(eq(escalations.workflowId, wfPass))).length === 0, "STRONG: no escalation for a released pack");

    // -------------------------------------------------- WEAK → propagation blocked + escalation
    const weakAnalyst = async () => ({ text: JSON.stringify({ insights: [
      { insightType: "content_pattern", title: "Ungrounded claim", summary: "A pattern with no cited evidence.", recommendation: "Do a thing.", evidenceItemIds: [], appliesToModules: ["content_command"], impactScore: 50, confidence: 0.5 },
      { insightType: "market_shift", title: "Another ungrounded claim", summary: "No provenance.", recommendation: "Do another thing.", evidenceItemIds: [], appliesToModules: ["seo"], impactScore: 40, confidence: 0.4 },
    ] }), run: { id: "canned_analyst_weak" } });
    const weak = await run(wfBlock, weakAnalyst);
    suggestionIds.push(...(weak.product?.suggestions.suggestionIds ?? []));
    assert(!weak.routedTo.map((r) => r.department).includes("founder_command_centre"), "WEAK: the gate BLOCKED — the ungrounded intelligence did NOT propagate");
    assert((await db.select().from(handoffs).where(and(eq(handoffs.workflowId, wfBlock), eq(handoffs.department, "founder_command_centre")))).length === 0, "WEAK: no founder handoff exists for the blocked run");
    const weakReviews = await db.select().from(qaReviews).where(eq(qaReviews.workflowId, wfBlock));
    assert(weakReviews.length === 1 && weakReviews[0].verdict !== "pass", `WEAK: a non-pass qa_review was recorded (got ${weakReviews[0]?.verdict})`);
    assert(((weakReviews[0].routingTarget as { failedStages?: string[] } | null)?.failedStages ?? []).includes("analyse"), "WEAK: the failed stage is `analyse` (the sourced criterion)");
    const weakEsc = await db.select().from(escalations).where(eq(escalations.workflowId, wfBlock));
    assert(weakEsc.length >= 1 && weakEsc.every((e) => e.departmentSlug === "research_intelligence"), "WEAK: a real founder escalation was raised on the research department");

    // -------------------------------------------------- IDEMPOTENT (gate-level, SAME unit of work)
    // A department RE-RUN is a NEW unit of work (fresh taskId) and legitimately produces a new review; the
    // gate's idempotency guarantee is per (workflow, task). Prove it directly: the SAME submission twice
    // reuses the review + raises no second escalation.
    const { runQaGate, buildResearchQaSubmission, RESEARCH_QA_BOARDS } = await import("@/lib/qa/gate");
    const sub = buildResearchQaSubmission({ analyzedItems: 3, proposedInsights: 2, insightsWithEvidence: 0, scouted: 0 }, { workflowId: wfIdem, taskId: "t1" });
    const d1 = await runQaGate({ boards: RESEARCH_QA_BOARDS, submission: sub }, {});
    const d2 = await runQaGate({ boards: RESEARCH_QA_BOARDS, submission: sub }, {});
    assert(d1.reviews[0].id === d2.reviews[0].id, "IDEMPOTENT: the SAME unit of work reuses the qa_review (no duplicate)");
    assert((await db.select().from(qaReviews).where(eq(qaReviews.workflowId, wfIdem))).length === 1, "IDEMPOTENT: exactly one qa_review row for the unit of work");
    assert((await db.select().from(escalations).where(eq(escalations.workflowId, wfIdem))).length <= 1, "IDEMPOTENT: the escalation was not duplicated");

    console.log("\nALL REAL-DB RESEARCH QA GATE CHECKS PASSED ✅");
  } finally {
    for (const wf of [wfPass, wfBlock, wfIdem]) {
      await db.delete(qaReviews).where(eq(qaReviews.workflowId, wf)).catch(() => {});
      await db.delete(escalations).where(eq(escalations.workflowId, wf)).catch(() => {});
      await db.delete(handoffs).where(eq(handoffs.workflowId, wf)).catch(() => {});
    }
    if (suggestionIds.length) await db.delete(approvals).where(inArray(approvals.entityId, suggestionIds)).catch(() => {});
    await db.delete(intelligenceSuggestions).where(eq(intelligenceSuggestions.clientId, clientId)).catch(() => {});
    await db.delete(intelligenceInsights).where(eq(intelligenceInsights.clientId, clientId)).catch(() => {});
    await db.delete(intelligenceItems).where(eq(intelligenceItems.clientId, clientId)).catch(() => {});
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
