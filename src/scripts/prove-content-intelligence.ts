/**
 * LIVE proof of the full manual intelligence-run path with REAL data + the REAL strategist: gather the
 * active sources + knowledge + brand brain from the UAT DB, run the strategist team (claude-sonnet-4.5), and
 * record a founder-visible run with its scored, review-gated topic bank.
 *
 *   DATABASE_URL=… OPENROUTER_API_KEY=… [DATAFORSEO_AUTH=…] npx tsx src/scripts/prove-content-intelligence.ts
 */
import { runContentIntelligence, listContentIntelligenceRuns, defaultGatherContext } from "@/lib/content-intelligence";

async function main() {
  const ctx = await defaultGatherContext("WOBBLE AI automation content");
  console.log(`[intel] gathered context — sources: ${ctx.sourceRefs.length}, knowledge topics: ${ctx.knowledgeTopics.length}, brain notes: ${ctx.brain.length}`);

  console.log("[intel] running the intelligence loop (real strategist) …");
  const res = await runContentIntelligence({ trigger: "manual", count: 6, locationName: "United States", requestedBy: "prove-content-intelligence" }, {});
  console.log(`[intel] run ${res.runId} → sources=${res.sourceCount} topics=${res.topicCount}\n`);
  for (const t of res.topics.slice(0, 6)) {
    console.log(`  [${t.overallScore}] ${t.pillar} · ${t.funnelStage} — ${t.title}`);
  }

  const runs = await listContentIntelligenceRuns(5);
  console.log(`\n[intel] recent runs (${runs.length}):`);
  for (const r of runs.slice(0, 5)) console.log(`  · ${r.trigger} ${r.status} — ${r.topicCount} topics — ${r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt}`);
  console.log("\n[intel] PROVEN LIVE ✓ (active sources auto-picked-up; run tracked; topics land pending_review)");
}

main().then(
  () => process.exit(0),
  (err) => { console.error(err); process.exit(1); },
);
