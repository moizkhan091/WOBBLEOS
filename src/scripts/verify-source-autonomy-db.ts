/**
 * Real-DB proof that Earned Autonomy is enforced at the SOURCE.ACTIVATION action point (Phase 6) on Postgres.
 * Source activation is REVERSIBLE, so an earned grant genuinely RELEASES it (unlike the capped content.publish):
 *   - NO policy → `createSource({enforceAutonomy})` leaves the source PENDING a founder approval (baseline);
 *   - an earned `autonomous` `source.activation` grant (scope-matched) → the source AUTO-ACTIVATES (approved+active);
 *   - a REVOKED grant → pending; an EXPIRED grant → pending;
 *   - TENANT isolation: a grant scoped to client A does NOT auto-activate client B's source.
 *
 * ISOLATED + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-source-autonomy-db.ts
 */
import { inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { sources as sourcesTable, approvals as approvalsTable, autonomyPolicies } from "@/db/schema";
import { createSource, defaultStore as sourceStore } from "@/lib/sources";
import { createAutonomyPolicy, revokeAutonomyPolicy } from "@/lib/autonomy";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const clientA = `srcclient_a_${uniq}`, clientB = `srcclient_b_${uniq}`;
  const store = sourceStore(db);
  const deps = { store, enforceAutonomy: true as const };
  const sourceIds: string[] = [];
  const policyIds: string[] = [];

  const addSource = async (clientId: string, tag: string) => {
    const r = await createSource({ title: `Src ${tag} ${uniq}`, sourceType: "url", ownerScope: "client", ownerId: clientId } as never, deps);
    sourceIds.push(r.source.id);
    const row = await store.getSourceById(r.source.id);
    return { autoActivated: !!r.autoActivated, approvalStatus: row?.approvalStatus, processingStatus: row?.processingStatus };
  };
  const grant = async (clientId: string, opts: { expired?: boolean } = {}) => {
    const p = await createAutonomyPolicy({ category: "source.activation", grantedLevel: "autonomous", approvedBy: "Moiz", clientId, maxRiskLevel: "low", ...(opts.expired ? { effectiveFrom: new Date(Date.now() - 2 * 86400_000), expiresAt: new Date(Date.now() - 86400_000) } : {}) }, { db });
    policyIds.push(p.id);
    return p;
  };

  try {
    // NO policy → pending (baseline, never silent activation).
    const s1 = await addSource(clientA, "nopolicy");
    assert(!s1.autoActivated && s1.approvalStatus === "pending", "NO policy → the source stays PENDING a founder approval (never silently auto-activated)");

    // An earned autonomous grant for client A → the source AUTO-ACTIVATES.
    const p = await grant(clientA);
    const s2 = await addSource(clientA, "granted");
    assert(s2.autoActivated && s2.approvalStatus === "approved" && s2.processingStatus === "ready", "an earned `source.activation` grant → the source AUTO-ACTIVATES (a policy changes production behaviour; a REVERSIBLE action is released)");

    // TENANT isolation: client A's grant does NOT auto-activate client B's source.
    const s3 = await addSource(clientB, "othertenant");
    assert(!s3.autoActivated && s3.approvalStatus === "pending", "TENANT isolation: client A's grant does NOT auto-activate client B's source (stays pending)");

    // REVOKE → back to pending.
    assert(await revokeAutonomyPolicy(p.id, "Moiz", { db }), "the grant was revoked");
    const s4 = await addSource(clientA, "revoked");
    assert(!s4.autoActivated && s4.approvalStatus === "pending", "after REVOCATION the source stays PENDING (revoked grant does not execute)");

    // EXPIRED grant → pending.
    await grant(clientA, { expired: true });
    const s5 = await addSource(clientA, "expired");
    assert(!s5.autoActivated && s5.approvalStatus === "pending", "an EXPIRED grant does not execute (source stays pending)");

    console.log("\nALL REAL-DB SOURCE-ACTIVATION AUTONOMY CHECKS PASSED ✅");
  } finally {
    if (sourceIds.length) {
      await db.delete(approvalsTable).where(inArray(approvalsTable.entityId, sourceIds)).catch(() => {});
      await db.delete(sourcesTable).where(inArray(sourcesTable.id, sourceIds)).catch(() => {});
    }
    if (policyIds.length) await db.delete(autonomyPolicies).where(inArray(autonomyPolicies.id, policyIds)).catch(() => {});
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
