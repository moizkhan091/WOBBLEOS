/**
 * LIVE PROOF (WOB-UAT-023): content (carousel) → Design Intelligence → Media Production, against real UAT
 * Postgres. This script ONLY originates — it creates a real content track + a real carousel content packet,
 * then runs the REAL `runContentDepartment` (canned graph nodes, no LLM spend) which dispatches the durable
 * content→design_intelligence handoff. From there the LIVE workers own it: the general worker's consumer
 * tick claims the design handoff, produces a grounded brief and routes design_briefs → media_production,
 * whose consumer creates a real media job; worker-video then BLOCKS it truthfully (no FAL_KEY).
 *
 * The script prints the origination result + ids so a DB inspection can follow the autonomous chain.
 *
 * Run:  DATABASE_URL=postgres://…@127.0.0.1:15432/wobble_os npx tsx src/scripts/prove-design-chain.ts
 */
import { getDb, closeDb } from "@/db";
import { createContentTrack, createContentPacket } from "@/lib/content";
import { defaultStore as contentStore } from "@/lib/content";
import { defaultStore as handoffStore } from "@/lib/handoff";
import { defaultCheckpointStore } from "@/lib/graph-checkpoint";
import { defaultStore as registryStore } from "@/lib/departments/registry";
import { runContentDepartment } from "@/lib/departments/verticals/content";
import type { ContentPacketCreationResult } from "@/lib/content-graph";

// Canned graph nodes — a carousel strategy (a VISUAL format → must route to Design Intelligence).
const STRATEGY = JSON.stringify({ topic: "founder-led outbound", angle: "specificity beats volume", platform: "instagram", format: "carousel", targetAudience: "B2B founders", objective: "book calls", rationale: "fresh angle" });
const EVIDENCE = JSON.stringify({ supportingPoints: [{ point: "a specific observation earns the reply", noteIndexes: [0], chunkIndexes: [0] }], evidenceSummary: "grounded", claimRiskLevel: "low", proofRequired: false });
const DRAFT = JSON.stringify({ hook: "Your outbound is generic", mainCopy: "Say the one specific thing only you noticed.", caption: "Specificity beats volume.", cta: "DM 'AUDIT'", carouselSlides: [{ heading: "Slide 1", body: "Generic = ignored" }, { heading: "Slide 2", body: "Specific = reply" }, { heading: "Slide 3", body: "Here's how" }], designDirection: "Bold, high-contrast, WOBBLE dark palette, one idea per slide, heavy type." });
const REVISE = JSON.stringify({ issues: ["tighten"], revised: { hook: "Your outbound is generic — fix it", mainCopy: "Say the one specific thing only you noticed.", caption: "Specificity beats volume.", cta: "DM 'AUDIT'", carouselSlides: [{ heading: "Slide 1", body: "Generic = ignored" }, { heading: "Slide 2", body: "Specific = reply" }, { heading: "Slide 3", body: "Here's how" }], designDirection: "Bold, high-contrast, WOBBLE dark palette, one idea per slide, heavy type." } });
const SCORE = JSON.stringify({ selfReview: { usefulness: 8, originality: 8, brandFit: 8, clarity: 8, aggressionControl: 8, proofStrength: 8, postWorthiness: "pass" }, predictedImpact: 84, brandFit: 88, platformFit: 80, rationale: "strong" });
const NODES = [STRATEGY, EVIDENCE, DRAFT, REVISE, SCORE];

async function main() {
  const db = getDb();
  const now = new Date();
  const store = contentStore(db);
  const wf = `prove_design_${now.getTime()}`;

  // 1) A real content track (owner: company/internal). The builder assigns the id — capture it.
  const { track } = await createContentTrack(
    { label: "Design Proof Track", slug: `design-proof-${now.getTime()}`, ownerType: "company", voiceProfile: { personaName: "WOBBLE" } } as never,
    { store, recordAudit: async () => {} },
  );
  const trackId = track.id;
  console.log(`  ✓ content track created: ${trackId}`);

  // 2) Run the REAL content department. createPacket inserts a REAL carousel packet, so the design consumer
  //    reloads a genuine pack (its designDirection, format, slide count) rather than a handoff copy.
  let call = 0;
  const res = await runContentDepartment(
    { contentTrackId: trackId, requestedBy: "Moiz", objective: "book more calls", graphRunId: wf },
    {
      handoffStore: handoffStore(db),
      loadDepartment: async (slug) => registryStore(db).getDepartmentBySlug(slug),
      loadMembers: async (slug) => registryStore(db).listMembers(slug),
      graph: {
        getTrack: async () => (await store.getTrackById(trackId))!,
        retrieveBrain: async () => [{ title: "Brand", content: "premium, specific, no fluff" }],
        retrieve: async () => ({ notes: [{ id: "know_1", title: "Hook", content: "Open with a verifiable observation.", noteType: "hook_pattern", sourceIds: ["s1"], sourceId: "s1" }], chunks: [{ id: "c1", sourceId: "s1", content: "raw text" }] }),
        runNode: async () => ({ text: NODES[call++], runId: `mr_${call}` }),
        recordAgentRun: async () => ({}),
        recordAudit: async () => {},
        checkpointStore: defaultCheckpointStore(db),
        // The REAL packet insert — this is what makes the design consumer's reload meaningful.
        createPacket: async (input): Promise<ContentPacketCreationResult> => {
          const created = await createContentPacket({ ...(input as object), createdBy: "content_orchestrator" } as never, { store, recordAudit: async () => {} });
          return { packet: { id: created.packet.id, qualityStatus: created.packet.qualityStatus }, approval: null };
        },
      },
      recordAudit: async () => {},
      now,
    },
  );

  console.log(`  ✓ content department ran. routedTo: ${JSON.stringify(res.routedTo.map((r) => r.department))}`);
  console.log(`  ✓ product packetId: ${(res.product as { packetId?: string } | undefined)?.packetId}`);
  console.log(`  workflowId: ${wf}`);
  if (!res.routedTo.some((r) => r.department === "design_intelligence")) {
    throw new Error("FAIL: content did NOT route to design_intelligence");
  }
  console.log(`\n  Origination complete. The LIVE workers will now drain design_intelligence → media_production.`);
  console.log(`  Inspect: handoffs.department IN ('design_intelligence','media_production'); media_jobs.status`);
}

main()
  .then(() => closeDb())
  .catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
