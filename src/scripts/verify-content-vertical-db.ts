/**
 * Real-DB proof for the Content DEPARTMENT vertical (Phase 3) end-to-end against live Postgres: trigger →
 * the department accepts a validated inbound handoff → the registry-loaded content graph runs, each of its
 * 4 distinct creative agents driven by a CLAIMED handoff through the durable runtime → the QA-gated content
 * pack is produced → routed to the Publishing department as a real durable handoff → telemetry recorded.
 *
 * Canned node runner + synthetic track/packet (no LLM spend, no content-track fixture needed); the HANDOFF
 * BACKBONE + department routing are exercised for real on live Postgres. ISOLATED + REPEATABLE (unique
 * workflow id + finally-cleanup) so it is safe to run repeatedly against a populated database.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-content-vertical-db.ts
 */
import { getDb, closeDb } from "@/db";
import { handoffs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { seedDepartments } from "@/lib/departments/seed";
import { defaultStore as registryStore } from "@/lib/departments/registry";
import { defaultStore as handoffStore } from "@/lib/handoff";
import { defaultCheckpointStore } from "@/lib/graph-checkpoint";
import type { ContentTrackRow } from "@/lib/domain/content-command";
import type { ContentPacketCreationResult } from "@/lib/content-graph";
import { runContentDepartment } from "@/lib/departments/verticals/content";

const STRATEGY = JSON.stringify({ topic: "cold email", angle: "specificity beats volume", platform: "instagram", format: "carousel", targetAudience: "founders", objective: "book calls", rationale: "fresh angle" });
const EVIDENCE = JSON.stringify({ supportingPoints: [{ point: "specific observation earns attention", noteIndexes: [0], chunkIndexes: [0] }], evidenceSummary: "grounded", claimRiskLevel: "low", proofRequired: false });
const DRAFT = JSON.stringify({ hook: "H1", mainCopy: "M1", caption: "C1", cta: "CTA1", carouselSlides: [{ heading: "h", body: "b" }], designDirection: "D1" });
const REVISE = JSON.stringify({ issues: ["weak hook"], revised: { hook: "H2", mainCopy: "M2", caption: "C2", cta: "CTA2", carouselSlides: [], designDirection: "D2" } });
const SCORE = JSON.stringify({ selfReview: { usefulness: 8, originality: 8, brandFit: 8, clarity: 8, aggressionControl: 8, proofStrength: 8, postWorthiness: "pass" }, predictedImpact: 82, brandFit: 88, platformFit: 75, rationale: "strong" });
const NODES = [STRATEGY, EVIDENCE, DRAFT, REVISE, SCORE];

const track = { id: "ct_verify", label: "WOBBLE IG", slug: "wobble-ig", voiceProfile: { personaName: "WOBBLE" }, metadata: {}, bannedPhrases: [] } as unknown as ContentTrackRow;

async function main() {
  const db = getDb();
  const now = new Date();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const wf = `verify_content_${Date.now()}`;

  try {
    await seedDepartments({ store: registryStore(db), recordAudit: async () => {} });

    let call = 0;
    const res = await runContentDepartment(
      { contentTrackId: "ct_verify", requestedBy: "Moiz", objective: "book more calls", graphRunId: wf },
      {
        handoffStore: handoffStore(db),
        graph: {
          getTrack: async () => track,
          retrieveBrain: async () => [{ title: "Brand", content: "premium, specific, no fluff" }],
          retrieve: async () => ({ notes: [{ id: "know_1", title: "Hook", content: "Open with a verifiable observation.", noteType: "hook_pattern", sourceIds: ["s1"], sourceId: "s1" }], chunks: [{ id: "c1", sourceId: "s1", content: "raw text" }] }),
          runNode: async () => ({ text: NODES[call++], runId: `mr_${call}` }),
          recordAgentRun: async () => ({}),
          recordAudit: async () => {},
          checkpointStore: defaultCheckpointStore(db),
          createPacket: async (): Promise<ContentPacketCreationResult> => ({ packet: { id: "pk_verify", qualityStatus: "passed" }, approval: { id: "ap_verify" } }),
        },
        recordAudit: async () => {},
        now,
      },
    );

    assert(res.accepted, "the Content department accepted the inbound trigger");
    assert(res.product?.qualityStatus === "passed", "the graph produced a QA-passed content pack");
    assert(res.routedTo.map((r) => r.department).includes("publishing"), "the content pack routed to Publishing");

    const rows = await db.select().from(handoffs).where(eq(handoffs.workflowId, wf));
    const contentNodes = rows.filter((r) => r.department === "content");
    assert(contentNodes.length === 4, `4 creative-agent node handoffs exist (got ${contentNodes.length})`);
    assert(contentNodes.every((r) => r.deliveryState === "completed"), "every creative-agent node handoff was claimed → completed");
    const routed = rows.filter((r) => r.department === "publishing");
    assert(routed.length === 1 && routed[0].deliveryState === "delivered", "one durable handoff delivered to Publishing, awaiting its claim");
    assert((routed[0].envelope as { expectedOutputSchema: string }).expectedOutputSchema === "content_pack", "the routed product schema is content_pack");

    console.log("\nALL REAL-DB CONTENT VERTICAL CHECKS PASSED ✅");
  } finally {
    await db.delete(handoffs).where(eq(handoffs.workflowId, wf));
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
