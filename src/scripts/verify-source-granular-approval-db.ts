/**
 * Real-DB proof of the GRANULAR source-approval invariant (Phase 5) on live Postgres.
 *
 * A source (research target) is scouted on its cadence ONLY when `approvalStatus === "approved"`. Approval is
 * per-source (by id) — approving ONE proposed source must NEVER activate the others. Proven with the exact
 * invariant the mandate calls out:
 *
 *     10 approved (active) + 4 pending (proposed) + approve exactly 1 = 11 approved, 3 STILL pending.
 *
 * The scheduler's scout set is `listResearchTargets({ approvalStatus: "approved" })` — this proves that set is
 * exactly 11 after the single approval (never 14). ISOLATED by a unique client scope + finally-cleanup.
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-source-granular-approval-db.ts
 */
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { researchTargets } from "@/db/schema";
import { buildResearchTargetRow } from "@/lib/domain/intelligence";
import { defaultStore as intelligenceStore, listResearchTargets } from "@/lib/intelligence";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const clientId = `verify_src_${uniq}`;
  const intel = { store: intelligenceStore(db), recordAudit: async () => {} };

  const seedTarget = async (i: number, approvalStatus: "approved" | "pending"): Promise<string> => {
    const row = buildResearchTargetRow({ name: `Rival ${i}`, targetType: "competitor_account", handleOrUrl: `https://example.com/rival-${i}`, scope: "client", cadence: "weekly", addedBy: "Moiz" }, { id: `tgt_${uniq}_${i}` });
    await db.insert(researchTargets).values({ ...row, approvalStatus, clientId } as typeof researchTargets.$inferInsert);
    return row.id;
  };
  const approvedCount = async () => (await listResearchTargets({ scope: "client", clientId, approvalStatus: "approved", limit: 100 }, intel)).length;
  const pendingCount = async () => (await listResearchTargets({ scope: "client", clientId, approvalStatus: "pending", limit: 100 }, intel)).length;

  try {
    // 10 approved (active/scouted) + 4 pending (proposed).
    for (let i = 0; i < 10; i++) await seedTarget(i, "approved");
    const pendingIds: string[] = [];
    for (let i = 10; i < 14; i++) pendingIds.push(await seedTarget(i, "pending"));

    assert(await approvedCount() === 10, "start: exactly 10 approved (active) sources");
    assert(await pendingCount() === 4, "start: exactly 4 pending (proposed) sources");

    // Approve EXACTLY ONE proposed source (the granular, per-id operation the founder performs).
    if (!intel.store.updateResearchTarget) throw new Error("store lacks updateResearchTarget");
    await intel.store.updateResearchTarget(pendingIds[0], { approvalStatus: "approved" });

    assert(await approvedCount() === 11, "after approving ONE: exactly 11 approved (the invariant — never 14)");
    assert(await pendingCount() === 3, "after approving ONE: the OTHER 3 proposals are STILL pending (not activated)");

    // The scheduler's scout set (approved only) is exactly the 11 — the other 3 are never scouted.
    const scoutSet = await listResearchTargets({ scope: "client", clientId, approvalStatus: "approved", limit: 100 }, intel);
    assert(scoutSet.length === 11 && scoutSet.every((t) => t.approvalStatus === "approved"), "the scheduler scout set is exactly the 11 approved sources");
    assert(!scoutSet.some((t) => pendingIds.slice(1).includes(t.id)), "none of the still-proposed sources leaked into the scout set");

    console.log("\nALL REAL-DB GRANULAR SOURCE-APPROVAL CHECKS PASSED ✅");
  } finally {
    await db.delete(researchTargets).where(eq(researchTargets.clientId, clientId)).catch(() => {});
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
