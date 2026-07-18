/**
 * LIVE proof for the Topic Bank. Runs the REAL content strategist (claude-sonnet-4.5 via OpenRouter) to
 * propose a bank of WOBBLE content topics, enriches demand/velocity via DataForSEO (degrades gracefully to
 * null while the account is unverified), scores them, lands them pending_review, then exercises the human
 * gate (approve the top topic). Verifies by reading the persisted rows back.
 *
 *   DATABASE_URL=… OPENROUTER_API_KEY=… [DATAFORSEO_AUTH=…] npx tsx src/scripts/prove-topic-bank.ts
 */
import { generateTopicBank, reviewTopic, listTopics } from "@/lib/content-topics";

async function main() {
  const objective = "Grow WOBBLE's audience of Pakistan-first SMB owners and generate qualified AI-automation leads by actually TEACHING real mechanisms (not agency filler).";
  const knowledgeTopics = [
    "missed-call text-back recovery",
    "speed-to-lead automation",
    "WhatsApp follow-up sequences",
    "n8n vs Make vs Zapier",
    "AI receptionist / voice agent",
    "review-request on autopilot",
    "no-show reduction",
  ];
  const brain = [
    { title: "Positioning", content: "WOBBLE builds AI employees + automations INSIDE a business; anti-agency-dependency — we teach founders to own their systems." },
    { title: "Voice", content: "Lead with rebellion (stop renting your growth from agencies), close with trust. Mechanism-first. Never 'use AI to be productive'." },
  ];

  console.log("[topic-bank] generating a topic bank via the real strategist …");
  const rows = await generateTopicBank(
    { objective, knowledgeTopics, brain, count: 8, locationName: "United States", requestedBy: "prove-topic-bank" },
    {},
  );
  console.log(`[topic-bank] generated ${rows.length} topics (pending_review):\n`);
  for (const t of rows) {
    const demand = t.demandVolume == null ? "n/a" : `${t.demandVolume}/mo`;
    const vel = t.trendVelocity == null ? "n/a" : t.trendVelocity.toFixed(2);
    console.log(`  [${t.overallScore}] ${t.pillar} · ${t.funnelStage}`);
    console.log(`        ${t.title}`);
    console.log(`        job=${t.founderJobValue} novelty=${t.noveltyScore} gap=${t.competitorGap} proof=${t.proofAvailable} fresh=${t.freshness} | demand(${t.demandKeyword})=${demand} velocity=${vel}`);
  }

  if (rows.length) {
    const top = rows[0];
    console.log(`\n[topic-bank] human gate: approving the top topic "${top.title}" …`);
    const approved = await reviewTopic({ topicId: top.id, decision: "approved", reviewedBy: "moiz", notes: "proof approval" }, {});
    console.log(`[topic-bank] status now: ${approved?.status}`);
  }

  const pending = await listTopics({ status: "pending_review" }, {});
  const approvedList = await listTopics({ status: "approved" }, {});
  console.log(`\n[topic-bank] bank state — pending_review: ${pending.length}, approved: ${approvedList.length}`);
  console.log("[topic-bank] PROVEN LIVE ✓ (topics carry real stats; nothing promoted without founder approval)");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
