/**
 * Real-DB proof that Earned Autonomy is OPERATIONAL + enforced at a real action point (Phase 6) on Postgres.
 * Proven:
 *   - a policy CHANGES the resolved level for a reversible, low-risk, QA-passed action (no policy → recommend;
 *     an earned `autonomous` policy → autonomous) — i.e. a policy changes production behaviour;
 *   - HARD CAPS hold: an `autonomous` policy for an IRREVERSIBLE / financial action still resolves to `confirm`;
 *   - REVOCATION + EXPIRY take an autonomous action back to the baseline;
 *   - ACTION-POINT ENFORCEMENT (the real `dispatchDuePosts` publish path, one dispatch over three due posts):
 *       · a QA'd (pack-sourced) post WITH an earned `content.publish` autonomous grant → DISPATCHED (fires);
 *       · a QA'd post with NO grant → HELD for a founder confirm (never silently auto-posted);
 *       · an un-QA'd (manually imported) post WITH the same grant → HELD (the QA hard-cap can't be overridden).
 *     So an earned policy actually flips a real post from held → published, and safety caps still hold.
 *
 * ISOLATED (unique category/ids) + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-autonomy-db.ts
 */
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { autonomyPolicies, contentAssets, scheduledPosts } from "@/db/schema";
import { createAutonomyPolicy, resolveActionAutonomy, revokeAutonomyPolicy } from "@/lib/autonomy";
import { addContentAsset, schedulePost, dispatchDuePosts, defaultStore as libraryStore, type PublisherAdapter } from "@/lib/library";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const cat = `test.action_${uniq}`;
  const deps = { db, recordAudit: async () => {} };
  const store = libraryStore(db);
  const policyIds: string[] = [];
  const assetIds: string[] = [];

  const reversibleAction = { category: cat, reversible: true, riskLevel: "low" as const, financialCents: 0, qaPassed: true };

  try {
    // ---- resolver: a policy changes the resolved level for a reversible action ---------------------------
    assert((await resolveActionAutonomy(reversibleAction, deps)).level === "recommend", "no policy → baseline `recommend` (never silent autonomy)");

    const p = await createAutonomyPolicy({ category: cat, grantedLevel: "autonomous", approvedBy: "Moiz", maxRiskLevel: "low" }, deps);
    policyIds.push(p.id);
    assert((await resolveActionAutonomy(reversibleAction, deps)).level === "autonomous", "an earned autonomous policy → the action resolves AUTONOMOUS (policy changes production behaviour)");

    // ---- hard caps: no policy can push a sensitive action past confirm -----------------------------------
    const capIrrev = await resolveActionAutonomy({ ...reversibleAction, reversible: false }, deps);
    assert(capIrrev.level === "confirm" && capIrrev.capped, "an IRREVERSIBLE action is capped at `confirm` even with an autonomous grant");
    const capMoney = await resolveActionAutonomy({ ...reversibleAction, financialCents: 100 }, deps);
    assert(capMoney.level === "confirm" && capMoney.capped, "a FINANCIAL action (moves money) is capped at `confirm` even with an autonomous grant");

    // ---- revocation + expiry fall back to baseline ------------------------------------------------------
    assert(await revokeAutonomyPolicy(p.id, "Moiz", deps), "the policy was revoked");
    assert((await resolveActionAutonomy(reversibleAction, deps)).level === "recommend", "after revocation the action is back to baseline `recommend`");

    const expired = await createAutonomyPolicy({ category: cat, grantedLevel: "autonomous", approvedBy: "Moiz", effectiveFrom: new Date(Date.now() - 2 * 86400_000), expiresAt: new Date(Date.now() - 86400_000) }, deps);
    policyIds.push(expired.id);
    assert((await resolveActionAutonomy(reversibleAction, deps)).level === "recommend", "an EXPIRED policy grants nothing (baseline recommend)");

    // ---- ACTION-POINT ENFORCEMENT on the real publish path ----------------------------------------------
    // Three content tracks, three due posts, one dispatch. A granted+QA'd post fires; the others hold.
    const trackGranted = `trk_ok_${uniq}`, trackNoGrant = `trk_none_${uniq}`, trackUnqa = `trk_unqa_${uniq}`;
    async function seedDuePost(track: string, sourceType: "content_pack" | "imported"): Promise<string> {
      const asset = await addContentAsset({ title: `Autonomy asset ${track}`, platforms: ["linkedin"], ownerScope: "content_track", ownerId: track, sourceType }, { store, recordAudit: async () => {} });
      assetIds.push(asset.id);
      await schedulePost({ assetId: asset.id, platform: "linkedin", scheduledAt: new Date(Date.now() - 60_000), publisher: "zernio" }, { store, recordAudit: async () => {} });
      return asset.id;
    }
    const idGranted = await seedDuePost(trackGranted, "content_pack"); // QA'd + will be granted → should fire
    const idNoGrant = await seedDuePost(trackNoGrant, "content_pack"); // QA'd, no grant → held
    const idUnqa = await seedDuePost(trackUnqa, "imported");           // granted but un-QA'd → held (cap)

    // Earned grant: autonomous content.publish for the QA'd track AND the un-QA'd track (proves the QA cap, not scope, holds the latter).
    for (const t of [trackGranted, trackUnqa]) {
      const gp = await createAutonomyPolicy({ category: "content.publish", grantedLevel: "autonomous", approvedBy: "Moiz", clientId: t, maxRiskLevel: "medium" }, deps);
      policyIds.push(gp.id);
    }

    const published: string[] = [];
    const fakeAdapter: PublisherAdapter = { slug: "zernio", publish: async ({ post }) => { published.push(post.assetId); return { publisherRef: `ext_${post.assetId}` }; } };
    const res = await dispatchDuePosts({ store, now: new Date(), enforceAutonomy: true, publishers: { zernio: fakeAdapter }, recordAudit: async () => {} });

    assert(res.dispatched === 1 && published.length === 1 && published[0] === idGranted, "ONLY the QA'd post with an earned autonomous grant was DISPATCHED (a policy flips a real post held → published)");
    assert(res.heldForConfirm === 2 && !published.includes(idNoGrant), "the no-grant post was HELD for a founder confirm (never silently auto-posted)");
    assert(!published.includes(idUnqa), "the un-QA'd post did NOT publish despite an autonomous grant (the QA hard-cap can't be overridden)");

    console.log("\nALL REAL-DB EARNED AUTONOMY CHECKS PASSED ✅");
  } finally {
    if (policyIds.length) await db.delete(autonomyPolicies).where(inArray(autonomyPolicies.id, policyIds)).catch(() => {});
    await db.delete(autonomyPolicies).where(eq(autonomyPolicies.category, cat)).catch(() => {});
    if (assetIds.length) {
      await db.delete(scheduledPosts).where(inArray(scheduledPosts.assetId, assetIds)).catch(() => {});
      await db.delete(contentAssets).where(inArray(contentAssets.id, assetIds)).catch(() => {});
    }
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
