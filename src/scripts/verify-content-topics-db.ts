/**
 * Real-DB proof that the TOPIC BANK persists, scores, and gates on Postgres.
 *
 * The intelligence run proposes content topics, enriches them with real demand/velocity, scores them
 * deterministically, and lands them pending_review; a founder reviews the bank and approves the ones worth
 * producing; an approved topic can then be promoted. This proof exercises the EXACT service
 * (generateTopicBank → reviewTopic → markTopicPromoted) against live Postgres with a CANNED strategist +
 * canned enricher (no LLM/provider spend), and proves:
 *
 *   - generate → N topics persisted pending_review, each scored (0-100) with the enriched demand/velocity
 *     round-tripping through the numeric column as real numbers.
 *   - the HUMAN GATE holds: a topic is promoted ONLY after it is approved; review is idempotent.
 *   - a rejected topic never becomes promotable.
 *
 * ISOLATED + REPEATABLE (unique run id + finally-cleanup). Run:  DATABASE_URL=... npx tsx src/scripts/verify-content-topics-db.ts
 */
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { contentTopics } from "@/db/schema";
import { generateTopicBank, reviewTopic, markTopicPromoted, listTopics, getTopic, type TopicEnricher, type TopicProvider } from "@/lib/content-topics";

const CANNED_TOPICS = JSON.stringify({
  topics: [
    { pillar: "buildable_automations", title: "Missed-call text-back in n8n", angle: "the 3-node flow", teachingJob: "Twilio webhook → n8n → SMS with booking link; show nodes + failure route", targetAudience: "clinic owners", rationale: "high job value, proven", funnelStage: "lead_gen", suggestedPlatform: "instagram", suggestedFormat: "carousel", freshness: "fresh", demandKeyword: "missed call text back", founderJobValue: 92, noveltyScore: 85, competitorGap: 78, proofAvailable: true },
    { pillar: "tool_stack_decisions", title: "n8n vs Make for WhatsApp", angle: "honest switching conditions", teachingJob: "compare cost, nodes, and when each wins for WhatsApp automation", targetAudience: "SMB founders", rationale: "decision content", funnelStage: "trust", suggestedPlatform: "linkedin", suggestedFormat: "carousel", freshness: "evergreen", demandKeyword: "n8n vs make", founderJobValue: 74, noveltyScore: 70, competitorGap: 60, proofAvailable: false },
    { pillar: "ai_for_operators", title: "AI voice reminder that cut no-shows", angle: "$0.03/call", teachingJob: "voice-agent appointment reminder; who acts, who ignores it", targetAudience: "operators", rationale: "topical", funnelStage: "awareness", suggestedPlatform: "instagram", suggestedFormat: "reel_script", freshness: "breaking", demandKeyword: "ai appointment reminder", founderJobValue: 88, noveltyScore: 90, competitorGap: 85, proofAvailable: true },
  ],
});

const cannedProvider: TopicProvider = async () => ({ text: CANNED_TOPICS });
const cannedEnricher: TopicEnricher = {
  async enrich(keywords) {
    const volumes = new Map<string, number | null>();
    const velocities = new Map<string, number>();
    for (const k of keywords) { volumes.set(k.toLowerCase(), 500); velocities.set(k.toLowerCase(), 0.3); }
    return { volumes, velocities };
  },
};

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const runId = `verify_topics_${Date.now()}`;
  const deps = { store: undefined, runProvider: cannedProvider, enricher: cannedEnricher, recordAudit: async () => {} };

  try {
    // ---------------------------------------------------- generate → persisted pending_review + scored + enriched
    const rows = await generateTopicBank({ objective: "grow WOBBLE", count: 3, intelligenceRunId: runId, requestedBy: "verify" }, deps);
    assert(rows.length === 3, `generate persisted 3 topics (got ${rows.length})`);
    assert(rows.every((r) => r.status === "pending_review"), "every topic landed pending_review");
    assert(rows.every((r) => r.overallScore > 0 && r.overallScore <= 100), "every topic carries a 0-100 score");
    assert(rows[0].overallScore >= rows[rows.length - 1].overallScore, "topics are returned best-score-first");

    // round-trip through the DB: numeric velocity comes back as a real number, demand as an int
    const persisted = await listTopics({ intelligenceRunId: runId }, deps);
    assert(persisted.length === 3, "listTopics reads all three back from Postgres");
    assert(persisted.every((r) => r.demandVolume === 500), "demand (integer) round-tripped");
    assert(persisted.every((r) => typeof r.trendVelocity === "number" && r.trendVelocity === 0.3), "trend velocity (numeric) round-tripped as a NUMBER (not a string)");

    // anti-popularity: the high founder-job/novelty/breaking topic outranks the middling tool-decision one
    const byPillar = Object.fromEntries(persisted.map((r) => [r.pillar, r.overallScore]));
    assert(byPillar["ai_for_operators"] > byPillar["tool_stack_decisions"], "substance (job+novelty+fresh) outscores the middling topic");

    // ---------------------------------------------------- human gate: promote ONLY after approval
    const target = persisted.find((r) => r.pillar === "buildable_automations")!;
    const notYet = await markTopicPromoted(target.id, { actor: "moiz", graphRunId: "g1" }, deps);
    assert(notYet?.status === "pending_review", "a pending topic cannot be promoted (human gate holds)");

    const approved = await reviewTopic({ topicId: target.id, decision: "approved", reviewedBy: "moiz" }, deps);
    assert(approved?.status === "approved", "founder approval moves the topic to approved");
    const readApproved = await getTopic(target.id, deps);
    assert(readApproved?.status === "approved" && readApproved?.reviewedBy === "moiz", "approval persisted with reviewer");

    // idempotent: a second decision is a no-op
    const again = await reviewTopic({ topicId: target.id, decision: "rejected", reviewedBy: "moiz" }, deps);
    assert(again?.status === "approved", "review is idempotent — a re-decide does not flip an already-decided topic");

    const promoted = await markTopicPromoted(target.id, { actor: "moiz", graphRunId: "g1", packetId: "p1" }, deps);
    assert(promoted?.status === "promoted" && promoted?.promotedPacketId === "p1", "an approved topic promotes and records its packet");

    // ---------------------------------------------------- a rejected topic never becomes promotable
    const reject = persisted.find((r) => r.pillar === "tool_stack_decisions")!;
    await reviewTopic({ topicId: reject.id, decision: "rejected", reviewedBy: "moiz" }, deps);
    const cantPromote = await markTopicPromoted(reject.id, { actor: "moiz" }, deps);
    assert(cantPromote?.status === "rejected", "a rejected topic can never be promoted");

    console.log("\nALL REAL-DB TOPIC BANK CHECKS PASSED ✅");
  } finally {
    await db.delete(contentTopics).where(eq(contentTopics.intelligenceRunId, runId));
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
