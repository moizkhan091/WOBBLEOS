/**
 * LIVE PROOF (WOB-UAT-025): the Publishing consumer promotes an APPROVED content pack into the publishable
 * library, and truthfully HOLDS an unapproved one. Originates against real UAT Postgres:
 *  1) create a real content packet, APPROVE it, and dispatch a content_pack handoff to publishing;
 *  2) create a second real packet left as DRAFT, dispatch it to publishing.
 * The LIVE worker's consumer tick then claims both: the approved one becomes a library asset
 * (`publishing.pack_imported`); the draft one is held (`publishing.held_for_approval`) with NO asset.
 *
 * Run:  DATABASE_URL=postgres://…@127.0.0.1:15432/wobble_os npx tsx src/scripts/prove-publishing.ts
 */
import { getDb, closeDb } from "@/db";
import { createContentTrack, createContentPacket, defaultStore as contentStore } from "@/lib/content";
import { defaultStore as handoffStore } from "@/lib/handoff";
import { dispatchHandoff } from "@/lib/handoff";
import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import { contentPackets } from "@/db/schema";
import { eq } from "drizzle-orm";

async function routeToPublishing(packetId: string, wf: string, now: Date) {
  const env = buildHandoffEnvelope(
    { workflowId: wf, department: "publishing", sourceAgent: "content_orchestrator", destinationAgent: "publishing_orchestrator", destinationCapability: "publish", objective: "Publish the pack", requestedAction: "consume content_pack", expectedOutputSchema: "content_pack", dataClassification: "internal", authorizedMemoryScopes: ["content"], previousAgentOutputs: { packetId }, idempotencyKey: `${wf}:route:content->publishing` },
    { now },
  );
  await dispatchHandoff(env, { clientWorkspaceId: null, grantedMemoryScopes: ["content"], permittedDataClassifications: ["internal", "public"] }, { store: handoffStore(getDb()), recordAudit: async () => {}, now });
}

async function main() {
  const db = getDb();
  const now = new Date();
  const store = contentStore(db);
  const stamp = now.getTime();

  const { track } = await createContentTrack(
    { label: "Publish Proof Track", slug: `pub-proof-${stamp}`, ownerType: "company", voiceProfile: { personaName: "WOBBLE" } } as never,
    { store, recordAudit: async () => {} },
  );

  const basePacket = { contentTrackId: track.id, platform: "instagram", format: "static", objective: "book calls", targetAudience: "founders", angle: "specificity", hook: "Your outbound is generic", mainCopy: "Say the one specific thing.", caption: "Specificity beats volume.", cta: "DM AUDIT", designDirection: "WOBBLE dark", selfReview: { usefulness: 8, originality: 8, brandFit: 8, clarity: 8, aggressionControl: 8, proofStrength: 8, postWorthiness: "pass" }, createdBy: "content_orchestrator" };

  // APPROVED pack → should be imported into the library.
  const approved = await createContentPacket(basePacket as never, { store, recordAudit: async () => {} });
  await db.update(contentPackets).set({ approvalStatus: "approved" }).where(eq(contentPackets.id, approved.packet.id));
  const wfOk = `prove_pub_ok_${stamp}`;
  await routeToPublishing(approved.packet.id, wfOk, now);
  console.log(`  ✓ APPROVED packet ${approved.packet.id} routed to publishing (wf ${wfOk})`);

  // DRAFT pack → should be HELD (not imported).
  const draft = await createContentPacket(basePacket as never, { store, recordAudit: async () => {} });
  const wfHold = `prove_pub_hold_${stamp}`;
  await routeToPublishing(draft.packet.id, wfHold, now);
  console.log(`  ✓ DRAFT packet ${draft.packet.id} routed to publishing (wf ${wfHold})`);

  console.log(`\n  Origination complete. The LIVE publishing consumer will claim both.`);
  console.log(`  Approved wf: ${wfOk}  |  Draft wf: ${wfHold}`);
  console.log(`  approvedPacketId=${approved.packet.id} draftPacketId=${draft.packet.id}`);
}

main().then(() => closeDb()).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
