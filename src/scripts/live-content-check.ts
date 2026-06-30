import { and, desc, eq, inArray } from "drizzle-orm";
import { closeDb, getDb, schema } from "@/db";
import { seedDatabase } from "@/db/seed-runner";
import { runContentGenerationJob } from "@/lib/content-worker";

async function ensureLiveContentEvidence() {
  const db = getDb();
  const now = new Date();

  await db
    .insert(schema.sources)
    .values({
      id: "source_live_content_worker_check",
      title: "Live Content Worker Check Source",
      sourceType: "manual_test",
      url: null,
      trustLevel: "tier_2_approved_expert",
      approvalStatus: "approved",
      status: "active",
      discoveredBy: "Codex",
      addedBy: "Codex",
      approvedBy: "Moiz",
      approvedAt: now,
      metadata: { purpose: "live_content_worker_check" },
    })
    .onConflictDoUpdate({
      target: schema.sources.id,
      set: { approvalStatus: "approved", status: "active", updatedAt: now },
    });

  await db
    .insert(schema.sourceChunks)
    .values({
      id: "sourcechunk_live_content_worker_check_1",
      sourceId: "source_live_content_worker_check",
      chunkIndex: 0,
      content:
        "Live content worker verification source: WOBBLE content should teach business owners that an AI operating system connects context, data, skills, routines, permissions, APIs, approvals, and cadence into one company-owned workflow layer instead of relying on random tool chaos.",
      embedding: null,
      metadata: { purpose: "live_content_worker_check" },
    })
    .onConflictDoUpdate({
      target: schema.sourceChunks.id,
      set: {
        content:
          "Live content worker verification source: WOBBLE content should teach business owners that an AI operating system connects context, data, skills, routines, permissions, APIs, approvals, and cadence into one company-owned workflow layer instead of relying on random tool chaos.",
        updatedAt: now,
      },
    });
}

async function run() {
  await seedDatabase();
  await ensureLiveContentEvidence();

  const result = await runContentGenerationJob({
    contentTrackId: "track_wobble_company",
    requestedBy: "Codex live content check",
    objective:
      "Create up to three concise LinkedIn text content packets explaining why a business needs an AI operating system instead of random AI tools. Use the live verification source and WOBBLE Brain. Keep it practical, specific, and operator-grade. At least one packet should be approval-ready if context is sufficient, and every packet must cite the provided source id in sourceIdsUsed.",
    platformFocus: ["linkedin"],
    formatFocus: ["text"],
    sourceLimit: 5,
    sourceChunkLimit: 2,
    memoryLimit: 6,
    maxPackets: 3,
    maxTokens: 2600,
    temperature: 0.3,
  });

  const db = getDb();
  const [modelRun] = await db
    .select()
    .from(schema.modelRuns)
    .where(eq(schema.modelRuns.id, result.modelRunId))
    .limit(1);

  if (!modelRun || modelRun.status !== "succeeded") {
    throw new Error("model_runs did not record a successful content strategy provider call");
  }

  const [audit] = await db
    .select()
    .from(schema.auditLogs)
    .where(
      and(
        eq(schema.auditLogs.modelRunId, result.modelRunId),
        eq(schema.auditLogs.eventType, "content_worker.completed"),
      ),
    )
    .limit(1);

  if (!audit) {
    throw new Error("audit_logs did not record content_worker.completed for the live call");
  }

  const packets = await db
    .select()
    .from(schema.contentPackets)
    .where(inArray(schema.contentPackets.id, result.packetIds));

  if (packets.length !== result.packetIds.length) {
    throw new Error("content_packets did not store all live generated packets");
  }

  const reviews = await db
    .select()
    .from(schema.qualityReviews)
    .where(inArray(schema.qualityReviews.entityId, result.packetIds));

  if (reviews.length !== result.packetIds.length) {
    throw new Error("quality_reviews did not store all live packet reviews");
  }

  const approvalRows = result.approvalIds.length
    ? await db.select().from(schema.approvals).where(inArray(schema.approvals.id, result.approvalIds))
    : [];

  if (result.approvalsCreated < 1 || approvalRows.length < 1) {
    throw new Error("live content worker did not produce any passing packet approval");
  }

  for (const packet of packets) {
    const packetApprovals = approvalRows.filter((approval) => approval.entityId === packet.id);
    if (packet.qualityStatus === "passed" && packetApprovals.length === 0) {
      throw new Error(`passing packet ${packet.id} did not create an approval`);
    }
    if (packet.qualityStatus !== "passed" && packetApprovals.length > 0) {
      throw new Error(`failed packet ${packet.id} should not create an approval`);
    }
  }

  const [latestContentRun] = await db
    .select()
    .from(schema.modelRuns)
    .where(and(eq(schema.modelRuns.role, "content_strategy"), eq(schema.modelRuns.module, "content")))
    .orderBy(desc(schema.modelRuns.createdAt))
    .limit(1);

  const firstPacket = packets[0];
  const passedPackets = packets.filter((packet) => packet.qualityStatus === "passed").length;
  const failedPackets = packets.filter((packet) => packet.qualityStatus !== "passed").length;

  console.log("content_live_check=ok");
  console.log(`model_run_id=${modelRun.id}`);
  console.log(`provider=${modelRun.provider}`);
  console.log(`model=${modelRun.model}`);
  console.log(`estimated_cost=${modelRun.estimatedCost ?? "unknown"}`);
  console.log(`latency_ms=${modelRun.latencyMs ?? "unknown"}`);
  console.log(`packets_created=${packets.length}`);
  console.log(`passed_packets=${passedPackets}`);
  console.log(`failed_packets=${failedPackets}`);
  console.log(`approvals_created=${result.approvalsCreated}`);
  console.log(`source_ids_used=${result.sourceIdsUsed.join(",")}`);
  console.log(`memory_chunks_used=${result.memoryChunkIdsUsed.length}`);
  console.log(`latest_content_run_id=${latestContentRun?.id ?? "none"}`);
  console.log(`first_hook_excerpt=${(firstPacket?.hook ?? "").replace(/\s+/g, " ").slice(0, 180)}`);
}

run()
  .catch((error) => {
    console.error("content_live_check=failed");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
