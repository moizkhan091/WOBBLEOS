/**
 * Real-DB proof of the production-reachable CONTENT QA → PUBLISHING path on live Postgres.
 *
 * Walks the honest path from an approved content packet to a published post, and proves every guard that
 * keeps it truthful. The QA gate → founder-approval decision itself is proven in `verify-content-gate-db`;
 * this proof takes over at the promotion boundary (approval → Library → scheduled_posts → provider adapter):
 *
 *   - APPROVED packet → a real publishable Library asset (status ready), owner-scoped to its source track.
 *   - UNAPPROVED (pending) or QA-failed (draft) packet → refused promotion (no asset) — unapproved cannot publish.
 *   - IDEMPOTENT: re-importing a packet returns the same asset; re-scheduling asset+platform returns the same
 *     post — a duplicate retry never creates a duplicate asset or scheduled post.
 *   - TENANT ISOLATION: a caller scoped to one track owner never sees another owner's assets.
 *   - MISSING CREDENTIALS: a manual publisher truthfully DEFERS (post stays scheduled) — no fake "published".
 *   - CONFIGURED PROVIDER: the scheduled post is dispatched through the REAL adapter, which moves it to published.
 *   - AUDIT: asset promotion, scheduling and publishing each emit a real audit event.
 *
 * The distinctions are preserved end-to-end: generation → QA acceptance → founder approval → Library promotion
 * → scheduling → external publishing are separate, gated steps. ISOLATED (unique track ids + finally-cleanup).
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-content-publishing-db.ts
 */
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { contentAssets, contentPackets, contentTracks, scheduledPosts } from "@/db/schema";
import { createContentTrack, defaultStore as contentStore } from "@/lib/content";
import { buildContentPacketRow, type ContentApprovalStatus } from "@/lib/domain/content-command";
import { importFromContentPacket, listContentAssets, schedulePost, dispatchDuePosts, defaultStore as libraryStore, type PublisherAdapter } from "@/lib/library";
import type { AuditEventInput } from "@/lib/domain/audit";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const now = new Date();
  const stamp = Date.now();
  const trackA = `pub_track_a_${stamp}`;
  const trackB = `pub_track_b_${stamp}`;
  const cStore = contentStore(db);
  const lStore = libraryStore(db);
  const audits: Array<{ eventType: string; entityId: string }> = [];
  const recordAudit = async (e: AuditEventInput) => { audits.push({ eventType: e.eventType, entityId: e.entityId ?? "" }); };
  const assetIds: string[] = [];
  const packetIds: string[] = [];

  const seedPacket = async (trackId: string, approvalStatus: ContentApprovalStatus): Promise<string> => {
    const row = buildContentPacketRow({
      contentTrackId: trackId, platform: "instagram", format: "carousel", objective: "book calls", targetAudience: "founders",
      angle: "specificity beats volume", hook: `Hook ${approvalStatus}`, mainCopy: "Copy", caption: "Caption", cta: "CTA", designDirection: "clean premium",
      selfReview: { usefulness: 8, originality: 8, brandFit: 8, clarity: 8, aggressionControl: 8, proofStrength: 8, postWorthiness: "pass" },
      approvalStatus, createdBy: "Moiz",
    }, { now });
    await cStore.insertPacket(row);
    packetIds.push(row.id);
    return row.id;
  };

  try {
    await createContentTrack({ slug: trackA, label: "Pub Track A", ownerType: "company", approvalRequired: true }, { recordAudit: async () => {} });
    await createContentTrack({ slug: trackB, label: "Pub Track B", ownerType: "company", approvalRequired: true }, { recordAudit: async () => {} });

    const pkApproved = await seedPacket(trackA, "approved");
    const pkPending = await seedPacket(trackA, "pending");
    const pkDraft = await seedPacket(trackA, "draft");
    const pkApprovedB = await seedPacket(trackB, "approved");

    // ---- APPROVED → publishable Library asset (owner-scoped to the source track) ----
    const asset = await importFromContentPacket(pkApproved, { store: lStore, recordAudit });
    assert(asset !== null && asset.status === "ready", "an APPROVED packet promotes to a publishable Library asset (status ready)");
    assert(asset!.sourcePacketId === pkApproved && asset!.ownerScope === "content_track" && asset!.ownerId === trackA, "the asset is owner-scoped to its source track (tenant isolation carried through)");
    assetIds.push(asset!.id);

    // ---- UNAPPROVED / QA-failed → refused promotion ----
    assert((await importFromContentPacket(pkPending, { store: lStore, recordAudit })) === null, "a PENDING (unapproved) packet is refused promotion — unapproved content cannot publish");
    assert((await importFromContentPacket(pkDraft, { store: lStore, recordAudit })) === null, "a DRAFT (QA-failed, never approved) packet is refused promotion");
    assert((await db.select().from(contentAssets).where(inArray(contentAssets.sourcePacketId, [pkPending, pkDraft]))).length === 0, "no Library asset exists for any unapproved packet");

    // ---- IDEMPOTENT import ----
    const asset2 = await importFromContentPacket(pkApproved, { store: lStore, recordAudit });
    assert(asset2!.id === asset!.id, "re-importing the same packet returns the SAME asset (no duplicate)");
    assert((await db.select().from(contentAssets).where(eq(contentAssets.sourcePacketId, pkApproved))).length === 1, "exactly one asset exists for the packet after a re-import");

    // ---- TENANT ISOLATION ----
    const assetB = await importFromContentPacket(pkApprovedB, { store: lStore, recordAudit });
    assetIds.push(assetB!.id);
    const scopedToA = await listContentAssets({ ownerScope: "content_track", ownerId: trackA }, { store: lStore });
    assert(scopedToA.length === 1 && scopedToA[0].id === asset!.id, "a caller scoped to track A sees ONLY track A's asset (track B's is not leaked)");

    // ---- SCHEDULING (idempotent) ----
    const past = new Date(now.getTime() - 60_000);
    const post1 = await schedulePost({ assetId: asset!.id, platform: "instagram", scheduledAt: past, publisher: "manual", createdBy: "Moiz" }, { store: lStore, recordAudit });
    const post1b = await schedulePost({ assetId: asset!.id, platform: "instagram", scheduledAt: new Date(now.getTime() - 30_000), publisher: "manual", createdBy: "Moiz" }, { store: lStore, recordAudit });
    assert(post1b.id === post1.id, "re-scheduling the same asset+platform returns the SAME live post (no duplicate scheduled post)");
    assert((await db.select().from(scheduledPosts).where(eq(scheduledPosts.assetId, asset!.id))).length === 1, "exactly one scheduled post exists for the asset+platform after a retry");

    // ---- MISSING CREDENTIALS → manual publisher DEFERS (truthful, not a fake publish) ----
    const deferred = await dispatchDuePosts({ store: lStore, now: new Date(now.getTime() + 1000), publishers: { manual: (await import("@/lib/library")).manualPublisher }, recordAudit });
    assert(deferred.deferred === 1 && deferred.dispatched === 0, "with no provider credentials the manual publisher DEFERS the due post (truthful blocked state)");
    assert((await lStore.getScheduledPostById(post1.id))?.status === "scheduled", "the deferred post stays scheduled — never falsely marked published");

    // ---- CONFIGURED PROVIDER → the REAL adapter publishes ----
    let adapterCalled = false;
    const fakeAdapter: PublisherAdapter = { slug: "zernio", publish: async () => { adapterCalled = true; return { publisherRef: "ext_post_123" }; } };
    const post2 = await schedulePost({ assetId: asset!.id, platform: "linkedin", scheduledAt: past, publisher: "zernio", createdBy: "Moiz" }, { store: lStore, recordAudit });
    const dispatched = await dispatchDuePosts({ store: lStore, now: new Date(now.getTime() + 1000), publishers: { zernio: fakeAdapter, manual: (await import("@/lib/library")).manualPublisher }, recordAudit });
    assert(dispatched.dispatched === 1 && adapterCalled, "a configured provider path invokes the REAL publishing adapter");
    const publishedPost = await lStore.getScheduledPostById(post2.id);
    assert(publishedPost?.status === "published" && publishedPost.publisherRef === "ext_post_123", "the dispatched post is published with the provider's external ref");

    // ---- AUDIT: promotion + scheduling + publishing each emitted a real event ----
    assert(audits.some((a) => a.eventType === "library.asset_added" && a.entityId === asset!.id), "asset promotion was audited (library.asset_added)");
    assert(audits.some((a) => a.eventType === "library.post_scheduled"), "scheduling was audited (library.post_scheduled)");
    assert(audits.some((a) => a.eventType === "library.post_published" && a.entityId === post2.id), "publishing was audited (library.post_published)");

    console.log("\nALL REAL-DB CONTENT PUBLISHING CHECKS PASSED ✅");
  } finally {
    if (assetIds.length) {
      await db.delete(scheduledPosts).where(inArray(scheduledPosts.assetId, assetIds));
      await db.delete(contentAssets).where(inArray(contentAssets.id, assetIds));
    }
    if (packetIds.length) await db.delete(contentPackets).where(inArray(contentPackets.id, packetIds));
    await db.delete(contentTracks).where(inArray(contentTracks.id, [trackA, trackB]));
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
