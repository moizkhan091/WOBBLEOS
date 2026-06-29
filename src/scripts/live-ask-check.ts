import { eq } from "drizzle-orm";
import { askWobble } from "@/lib/ask";
import { closeDb, getDb, schema } from "@/db";
import { seedDatabase } from "@/db/seed-runner";

async function ensureLiveEvidence() {
  const db = getDb();
  const now = new Date();

  await db
    .insert(schema.sources)
    .values({
      id: "source_live_ask_wobble_check",
      title: "Live Ask WOBBLE Check Source",
      sourceType: "manual_test",
      url: null,
      trustLevel: "tier_2_approved_expert",
      approvalStatus: "approved",
      status: "active",
      discoveredBy: "Codex",
      addedBy: "Codex",
      approvedBy: "Moiz",
      approvedAt: now,
      metadata: { purpose: "live_ask_wobble_check" },
    })
    .onConflictDoUpdate({
      target: schema.sources.id,
      set: { approvalStatus: "approved", status: "active", updatedAt: now },
    });

  await db
    .insert(schema.sourceChunks)
    .values({
      id: "sourcechunk_live_ask_wobble_check_1",
      sourceId: "source_live_ask_wobble_check",
      chunkIndex: 0,
      content:
        "Live verification source: Ask WOBBLE must dynamically read approved source chunks, WOBBLE Brain, memory, and future operating data instead of relying on hardcoded prompts.",
      embedding: null,
      metadata: { purpose: "live_ask_wobble_check" },
    })
    .onConflictDoUpdate({
      target: schema.sourceChunks.id,
      set: {
        content:
          "Live verification source: Ask WOBBLE must dynamically read approved source chunks, WOBBLE Brain, memory, and future operating data instead of relying on hardcoded prompts.",
        updatedAt: now,
      },
    });
}

async function run() {
  await seedDatabase();
  await ensureLiveEvidence();

  const result = await askWobble({
    question: "According to the live verification source, what must Ask WOBBLE dynamically read?",
    founder: "Codex live check",
    sourceLimit: 5,
    sourceChunkLimit: 2,
    maxTokens: 220,
  });

  if (result.type !== "answer") {
    throw new Error(`expected answer result, got ${result.type}`);
  }

  const db = getDb();
  const [modelRun] = await db
    .select()
    .from(schema.modelRuns)
    .where(eq(schema.modelRuns.id, result.answer.modelRunId ?? ""))
    .limit(1);
  const [audit] = await db
    .select()
    .from(schema.auditLogs)
    .where(eq(schema.auditLogs.modelRunId, result.answer.modelRunId ?? ""))
    .limit(1);

  if (!modelRun || modelRun.status !== "success") {
    throw new Error("model_runs did not record a successful Ask WOBBLE call");
  }
  if (!audit || audit.eventType !== "ask.answered") {
    throw new Error("audit_logs did not record ask.answered for the live call");
  }

  console.log("ask_live_check=ok");
  console.log(`model_run_id=${modelRun.id}`);
  console.log(`provider=${modelRun.provider}`);
  console.log(`model=${modelRun.model}`);
  console.log(`estimated_cost=${modelRun.estimatedCost ?? "unknown"}`);
  console.log(`latency_ms=${modelRun.latencyMs ?? "unknown"}`);
  console.log(`confidence=${result.answer.confidence}`);
  console.log(`citations=${result.answer.citations.length}`);
  console.log(`answer_excerpt=${result.answer.answer.replace(/\s+/g, " ").slice(0, 260)}`);
}

run()
  .catch((error) => {
    console.error("ask_live_check=failed");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
