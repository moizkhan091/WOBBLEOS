/**
 * Real-DB proof that the INDEPENDENT content QA gate GATES LIVE PUBLISHING on Postgres.
 *
 * The production content trigger (`content.graph` job) runs the multi-agent graph and, at the end, decides
 * whether to open a FOUNDER PUBLISH-APPROVAL — the single gateway to the Library + scheduled-posts publishing
 * pipeline. This proof exercises the EXACT production gate (`liveContentQaGate`: content_quality +
 * content_brand boards, DB-backed qa_reviews + escalations) end-to-end through `runContentGraph` with the
 * REAL `createContentPacket`, and proves:
 *
 *   - STRONG pack (grounded, on-brand)  → gate RELEASES → a real founder approval row is opened; two PASS
 *                                          qa_reviews recorded; no escalation.
 *   - WEAK pack (ungrounded, off-brand) → gate BLOCKS → NO founder approval is opened (the pack can never
 *                                          reach the Library / scheduled-posts pipeline); a FAIL qa_review is
 *                                          recorded and a real founder escalation is raised.
 *   - IDEMPOTENT: re-running the same unit of work reuses the qa_reviews + does not duplicate the escalation.
 *
 * The graph's OWN quality gate passes for BOTH packs (qualityStatus is self-review-driven), so a blocked
 * approval is attributable ONLY to the independent QA boards — proving the gate, not the graph, holds the
 * pack. Canned node runner (no LLM spend); the boards + gate + approval + escalation run for real on live
 * Postgres. ISOLATED + REPEATABLE (unique ids + finally-cleanup).
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-content-gate-db.ts
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { approvals, contentPackets, contentTracks, contentVersions, escalations, graphCheckpoints, handoffs, qaReviews, qualityReviews } from "@/db/schema";
import { createContentTrack } from "@/lib/content";
import { defaultStore as handoffStore } from "@/lib/handoff";
import { defaultCheckpointStore } from "@/lib/graph-checkpoint";
import { runContentGraph, type ContentGraphResult } from "@/lib/content-graph";
import { liveContentQaGate } from "@/lib/workers/registry";
import type { ContentTrackRow } from "@/lib/domain/content-command";

const STRATEGY = JSON.stringify({ topic: "cold email", angle: "specificity beats volume", platform: "instagram", format: "carousel", targetAudience: "founders", objective: "book calls", rationale: "fresh angle" });
const DRAFT = JSON.stringify({ hook: "H1", mainCopy: "M1", caption: "C1", cta: "CTA1", carouselSlides: [{ heading: "h", body: "b" }], designDirection: "D1" });
const REVISE = JSON.stringify({ issues: ["weak hook"], revised: { hook: "H2", mainCopy: "M2", caption: "C2", cta: "CTA2", carouselSlides: [], designDirection: "D2" } });

// STRONG: grounded evidence + high scores → both boards pass.
const EVIDENCE_STRONG = JSON.stringify({ supportingPoints: [{ point: "specific observation earns attention", noteIndexes: [0], chunkIndexes: [0] }], evidenceSummary: "grounded in teardown", claimRiskLevel: "low", proofRequired: false });
const SCORE_STRONG = JSON.stringify({ selfReview: { usefulness: 8, originality: 8, brandFit: 8, clarity: 8, aggressionControl: 8, proofStrength: 8, postWorthiness: "pass" }, predictedImpact: 82, brandFit: 88, platformFit: 75, rationale: "strong" });
// WEAK: no grounded evidence + low impact/brand → boards fail (self-review still passes the GRAPH gate).
const EVIDENCE_WEAK = JSON.stringify({ supportingPoints: [], evidenceSummary: "none", claimRiskLevel: "low", proofRequired: false });
const SCORE_WEAK = JSON.stringify({ selfReview: { usefulness: 8, originality: 8, brandFit: 8, clarity: 8, aggressionControl: 8, proofStrength: 8, postWorthiness: "pass" }, predictedImpact: 30, brandFit: 30, platformFit: 75, rationale: "thin" });

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const stamp = Date.now();
  const trackId = `ct_gate_${stamp}`;
  const wfStrong = `verify_content_gate_strong_${stamp}`;
  const wfWeak = `verify_content_gate_weak_${stamp}`;
  const packetIds: string[] = [];

  // A real, active, approval-required content track (createContentPacket reads it from the store).
  const { track } = await createContentTrack({ slug: trackId, label: "Gate Proof Track", ownerType: "company", approvalRequired: true }, { recordAudit: async () => {} });

  const runGraph = (workflowId: string, nodes: string[], grounded: boolean) => {
    let call = 0;
    return runContentGraph(
      { contentTrackId: track.id, requestedBy: "Moiz", objective: "book more calls", graphRunId: workflowId },
      {
        getTrack: async () => track as ContentTrackRow,
        retrieveBrain: async () => [{ title: "Brand", content: "premium, specific, no fluff" }],
        retrieve: async () => (grounded
          ? { notes: [{ id: "know_1", title: "Hook", content: "Open with a verifiable observation.", noteType: "hook_pattern", sourceIds: ["s1"], sourceId: "s1" }], chunks: [{ id: "c1", sourceId: "s1", content: "raw text" }] }
          : { notes: [], chunks: [] }),
        runNode: async () => ({ text: nodes[call++], runId: `mr_${call}` }),
        recordAgentRun: async () => ({}),
        recordAudit: async () => {},
        handoffStore: handoffStore(db),
        checkpointStore: defaultCheckpointStore(db),
        qaGate: liveContentQaGate, // the EXACT production gate (DB-backed boards + escalation)
      },
    );
  };

  const approvalFor = async (packetId: string) => db.select().from(approvals).where(and(eq(approvals.entityType, "content_packet"), eq(approvals.entityId, packetId)));
  const reviewsFor = async (wf: string) => db.select().from(qaReviews).where(eq(qaReviews.workflowId, wf));
  const escalationsFor = async (wf: string) => db.select().from(escalations).where(eq(escalations.workflowId, wf));

  try {
    // -------------------------------------------------- STRONG: released → approval opened
    const strong: ContentGraphResult = await runGraph(wfStrong, [STRATEGY, EVIDENCE_STRONG, DRAFT, REVISE, SCORE_STRONG], true);
    packetIds.push(strong.packetId);
    assert(strong.qualityStatus === "passed", "STRONG: the graph's own quality gate passed the pack");
    assert(strong.qa?.released === true, "STRONG: the independent QA gate RELEASED the pack (both boards passed)");
    assert(strong.approvalId !== null, "STRONG: a real founder publish-approval was opened");
    assert((await approvalFor(strong.packetId)).length === 1, "STRONG: exactly one approval row persisted for the packet");
    const strongReviews = await reviewsFor(wfStrong);
    assert(strongReviews.length === 2 && strongReviews.every((r) => r.verdict === "pass"), `STRONG: two PASS qa_reviews recorded (got ${strongReviews.map((r) => r.verdict).join(",")})`);
    assert((await escalationsFor(wfStrong)).length === 0, "STRONG: no escalation was raised for a released pack");

    // -------------------------------------------------- WEAK: blocked → NO approval + escalation
    const weak: ContentGraphResult = await runGraph(wfWeak, [STRATEGY, EVIDENCE_WEAK, DRAFT, REVISE, SCORE_WEAK], false);
    packetIds.push(weak.packetId);
    assert(weak.qualityStatus === "passed", "WEAK: the graph's OWN quality gate still passed (isolates the QA gate as the blocker)");
    assert(weak.qa?.released === false, "WEAK: the independent QA gate BLOCKED the pack");
    assert(weak.approvalId === null, "WEAK: NO founder approval was opened (the pack can never reach the publishing pipeline)");
    assert((await approvalFor(weak.packetId)).length === 0, "WEAK: no approval row exists for the blocked packet");
    const weakReviews = await reviewsFor(wfWeak);
    assert(weakReviews.some((r) => r.verdict !== "pass"), `WEAK: a non-pass qa_review was recorded (got ${weakReviews.map((r) => r.verdict).join(",")})`);
    const weakEsc = await escalationsFor(wfWeak);
    assert(weakEsc.length >= 1 && weakEsc.every((e) => e.departmentSlug === "content"), "WEAK: a real founder escalation was raised on the content department");

    // -------------------------------------------------- IDEMPOTENT: re-run reuses reviews, no dup escalation
    const weakReviewCount = weakReviews.length;
    const weakEscCount = weakEsc.length;
    const weak2 = await runGraph(wfWeak, [STRATEGY, EVIDENCE_WEAK, DRAFT, REVISE, SCORE_WEAK], false);
    packetIds.push(weak2.packetId);
    assert(weak2.qa?.released === false, "IDEMPOTENT: the re-run is still blocked");
    assert((await reviewsFor(wfWeak)).length === weakReviewCount, "IDEMPOTENT: re-running reused the qa_reviews (no duplicate review rows)");
    assert((await escalationsFor(wfWeak)).length === weakEscCount, "IDEMPOTENT: the founder escalation was not duplicated (open-dedup)");

    console.log("\nALL REAL-DB CONTENT GATE CHECKS PASSED ✅");
  } finally {
    // Cleanup in FK-safe order.
    for (const wf of [wfStrong, wfWeak]) {
      await db.delete(qaReviews).where(eq(qaReviews.workflowId, wf));
      await db.delete(escalations).where(eq(escalations.workflowId, wf));
      await db.delete(graphCheckpoints).where(eq(graphCheckpoints.graphRunId, wf));
      await db.delete(handoffs).where(eq(handoffs.workflowId, wf));
    }
    if (packetIds.length) {
      await db.delete(approvals).where(and(eq(approvals.entityType, "content_packet"), inArray(approvals.entityId, packetIds)));
      await db.delete(qualityReviews).where(inArray(qualityReviews.entityId, packetIds));
      await db.delete(contentVersions).where(inArray(contentVersions.contentPacketId, packetIds));
      await db.delete(contentPackets).where(inArray(contentPackets.id, packetIds));
    }
    await db.delete(contentTracks).where(eq(contentTracks.id, trackId));
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
