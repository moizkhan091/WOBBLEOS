/**
 * Real-DB proof that a CONTENT INTELLIGENCE RUN gathers context, generates a topic bank, and records the run
 * on Postgres — the manual/scheduled trigger's shared core.
 *
 * Exercises the REAL orchestrator (runContentIntelligence) with a canned context-gatherer + the REAL
 * generateTopicBank driven by a canned strategist + canned enricher (no LLM/provider spend), and proves:
 *   - a run row is created running → completed, carrying the source + topic counts.
 *   - the generated topics are persisted and LINK BACK to the run id (intelligence_run_id).
 *   - a failed generation marks the run failed (with the error) and leaves no dangling "running" row.
 *
 * ISOLATED + REPEATABLE (finally-cleanup by run id). Run:  DATABASE_URL=... npx tsx src/scripts/verify-content-intelligence-db.ts
 */
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { contentTopics, contentIntelligenceRuns } from "@/db/schema";
import { runContentIntelligence, type GatheredContext } from "@/lib/content-intelligence";
import { generateTopicBank, type TopicEnricher, type TopicProvider } from "@/lib/content-topics";
import { listTopics } from "@/lib/content-topics";

const CANNED_TOPICS = JSON.stringify({
  topics: [
    { pillar: "buildable_automations", title: "Missed-call text-back in n8n", angle: "3-node flow", teachingJob: "Twilio → n8n → SMS; nodes + failure route", targetAudience: "clinics", rationale: "proven", funnelStage: "lead_gen", suggestedPlatform: "instagram", suggestedFormat: "carousel", freshness: "fresh", demandKeyword: "missed call text back", founderJobValue: 90, noveltyScore: 82, competitorGap: 75, proofAvailable: true },
    { pillar: "ai_for_operators", title: "AI reminder that cut no-shows", angle: "$0.03/call", teachingJob: "voice reminder; who acts", targetAudience: "operators", rationale: "topical", funnelStage: "awareness", suggestedPlatform: "instagram", suggestedFormat: "reel_script", freshness: "breaking", demandKeyword: "ai appointment reminder", founderJobValue: 86, noveltyScore: 88, competitorGap: 80, proofAvailable: true },
  ],
});

const cannedProvider: TopicProvider = async () => ({ text: CANNED_TOPICS });
const cannedEnricher: TopicEnricher = { async enrich(keywords) { const volumes = new Map<string, number | null>(); const velocities = new Map<string, number>(); for (const k of keywords) { volumes.set(k.toLowerCase(), 300); velocities.set(k.toLowerCase(), 0.2); } return { volumes, velocities }; } };

const gathered: GatheredContext = { sourceRefs: ["src_a", "src_b", "src_c"], knowledgeTopics: ["missed call text back"], brain: [{ title: "Positioning", content: "anti-agency" }] };

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const runIds: string[] = [];

  const topicDeps = { runProvider: cannedProvider, enricher: cannedEnricher, recordAudit: async () => {} };
  const deps = { gatherContext: async () => gathered, generate: generateTopicBank, topicDeps, recordAudit: async () => {} };

  try {
    // ---------------------------------------------------- happy path: run → completed, topics linked
    const res = await runContentIntelligence({ trigger: "manual", count: 2, requestedBy: "moiz" }, deps);
    runIds.push(res.runId);
    assert(res.topicCount === 2, `run generated 2 topics (got ${res.topicCount})`);
    assert(res.sourceCount === 3, `run recorded 3 active sources (got ${res.sourceCount})`);

    const runRow = (await db.select().from(contentIntelligenceRuns).where(eq(contentIntelligenceRuns.id, res.runId)))[0];
    assert(runRow?.status === "completed", "run row persisted as completed");
    assert(runRow?.finishedAt != null, "run row has a finishedAt");
    assert(Number(runRow?.topicCount) === 2 && Number(runRow?.sourceCount) === 3, "run row carries the counts");

    const linked = await listTopics({ intelligenceRunId: res.runId }, {});
    assert(linked.length === 2, "the generated topics are persisted");
    assert(linked.every((t) => t.intelligenceRunId === res.runId), "every topic links back to the run id");
    assert(linked.every((t) => t.demandVolume === 300 && t.status === "pending_review"), "topics enriched + pending_review");

    // ---------------------------------------------------- failure path: run marked failed, no dangling running
    let threw = false;
    try {
      const failRes = await runContentIntelligence(
        { trigger: "manual", requestedBy: "moiz" },
        { gatherContext: async () => gathered, generate: async () => { throw new Error("strategist boom"); }, recordAudit: async () => {} },
      );
      runIds.push(failRes.runId);
    } catch {
      threw = true;
    }
    assert(threw, "a failed generation rethrows");
    const failed = (await db.select().from(contentIntelligenceRuns).where(eq(contentIntelligenceRuns.status, "failed")));
    const mine = failed.filter((r) => r.requestedBy === "moiz");
    assert(mine.length >= 1 && mine.some((r) => r.error === "strategist boom"), "the failed run is recorded with its error (no dangling 'running' row)");
    for (const r of mine) runIds.push(r.id);

    console.log("\nALL REAL-DB CONTENT INTELLIGENCE CHECKS PASSED ✅");
  } finally {
    for (const rid of runIds) {
      await db.delete(contentTopics).where(eq(contentTopics.intelligenceRunId, rid));
      await db.delete(contentIntelligenceRuns).where(eq(contentIntelligenceRuns.id, rid));
    }
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
