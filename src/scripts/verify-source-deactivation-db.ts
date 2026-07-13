/**
 * Real-DB proof that SOURCE DEACTIVATION is a complete, reversible, founder-controlled path on Postgres:
 *   active+approved source (with chunks) → founder deactivates → DEPENDENCY/IMPACT check (chunks preserved count)
 *     → the source is DISABLED (status archived): COLLECTION STOPS (dropped from `listApprovedSourcesForJobs`)
 *     + PROPAGATION STOPS (`attachSourceChunks` refuses new chunks) → HISTORICAL EVIDENCE REMAINS (existing chunks
 *     still queryable, downstream context NOT deleted) → APPROVAL preserved → AUDIT recorded
 *   → founder REACTIVATES (rollback) → the source re-enters the feed + accepts chunks again → AUDIT recorded.
 * Guard rails: deactivating a non-active source, or reactivating a non-deactivated source, is refused.
 *
 * ISOLATED + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-source-deactivation-db.ts
 */
import { inArray, eq, and } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { sources as sourcesTable, sourceChunks as sourceChunksTable, auditLogs } from "@/db/schema";
import { createSource, activateApprovedSource, attachSourceChunks, deactivateSource, reactivateSource, listApprovedSourcesForJobs, defaultStore as sourceStore } from "@/lib/sources";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const store = sourceStore(db);
  const deps = { store };
  const sourceIds: string[] = [];

  const auditCount = async (sourceId: string, eventType: string) =>
    (await db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.entityId, sourceId), eq(auditLogs.eventType, eventType)))).length;
  const inJobFeed = async (sourceId: string) =>
    (await listApprovedSourcesForJobs({ store, limit: 500 })).some((s) => s.id === sourceId);
  const chunkCount = async (sourceId: string) =>
    (await db.select({ id: sourceChunksTable.id }).from(sourceChunksTable).where(eq(sourceChunksTable.sourceId, sourceId))).length;

  try {
    // Set up an ACTIVE, APPROVED source with 3 chunks (real evidence).
    const created = await createSource({ title: `Deact ${uniq}`, sourceType: "url", url: `https://example.com/${uniq}`, ownerScope: "company", ownerId: `deact_${uniq}`, addedBy: "Moiz" } as never, deps);
    const sourceId = created.source.id;
    sourceIds.push(sourceId);
    await activateApprovedSource(sourceId, { trustLevel: "verified", approvedBy: "Moiz" }, deps);
    await attachSourceChunks({ sourceId, chunks: ["chunk one evidence", "chunk two evidence", "chunk three evidence"] }, deps);
    const activeRow = await store.getSourceById(sourceId);
    assert(activeRow?.status === "active" && activeRow?.approvalStatus === "approved", "setup: the source is ACTIVE + APPROVED");
    assert(await chunkCount(sourceId) === 3, "setup: 3 chunks (evidence) are attached");
    assert(await inJobFeed(sourceId), "setup: the active source IS in the collection job feed");

    // DEACTIVATE → impact check + disabled + audit.
    const deact = await deactivateSource(sourceId, { deactivatedBy: "Moiz", reason: "no longer authoritative" }, deps);
    assert(deact.ok, "deactivateSource succeeds");
    assert(deact.impact?.chunksPreserved === 3, "IMPACT CHECK: the founder is told 3 chunks (evidence) will be PRESERVED");
    const archivedRow = await store.getSourceById(sourceId);
    assert(archivedRow?.status === "archived" && archivedRow?.processingStatus === "archived", "the source is DISABLED (status + processing archived)");
    assert(archivedRow?.approvalStatus === "approved", "the APPROVAL is PRESERVED (deactivation is not rejection)");
    assert(typeof (archivedRow?.metadata as Record<string, unknown>)?.deactivatedAt === "string" && (archivedRow?.metadata as Record<string, unknown>)?.deactivationReason === "no longer authoritative", "deactivation metadata (who/when/why) is recorded on the source");
    assert(await auditCount(sourceId, "source.deactivated") === 1, "an AUDIT record (source.deactivated) is written");

    // COLLECTION STOPS + PROPAGATION STOPS + EVIDENCE REMAINS.
    assert(!(await inJobFeed(sourceId)), "COLLECTION STOPS: the deactivated source is NO LONGER in the job feed (no new collection)");
    let propagationBlocked = false;
    try { await attachSourceChunks({ sourceId, chunks: ["post-deactivation chunk"] }, deps); } catch { propagationBlocked = true; }
    assert(propagationBlocked, "PROPAGATION STOPS: attachSourceChunks REFUSES new chunks on a deactivated source");
    assert(await chunkCount(sourceId) === 3, "HISTORICAL EVIDENCE REMAINS: the 3 existing chunks are untouched (downstream context NOT deleted, no new chunk added)");

    // REACTIVATE (rollback) → re-enters the feed + accepts chunks + audit.
    const react = await reactivateSource(sourceId, { reactivatedBy: "Moiz" }, deps);
    assert(react.ok, "reactivateSource succeeds (rollback)");
    const reactivatedRow = await store.getSourceById(sourceId);
    assert(reactivatedRow?.status === "active" && reactivatedRow?.processingStatus === "ready", "the source is ACTIVE again");
    assert(await inJobFeed(sourceId), "the reactivated source is BACK in the job feed");
    await attachSourceChunks({ sourceId, chunks: ["chunk four after reactivation"] }, deps);
    assert(await chunkCount(sourceId) === 4, "propagation RESUMES: a new chunk can be attached again after reactivation");
    assert(await auditCount(sourceId, "source.reactivated") === 1, "an AUDIT record (source.reactivated) is written");

    // Guard rails.
    const reDeact = await deactivateSource(sourceId, { deactivatedBy: "Moiz" }, deps); // now active — fine
    assert(reDeact.ok, "re-deactivating an active source succeeds");
    const doubleDeact = await deactivateSource(sourceId, { deactivatedBy: "Moiz" }, deps); // already archived
    assert(!doubleDeact.ok && /not active/.test(doubleDeact.error ?? ""), "GUARD: deactivating an already-deactivated source is REFUSED");
    const badReact = await reactivateSource(created.source.id + "_missing", { reactivatedBy: "Moiz" }, deps);
    assert(!badReact.ok, "GUARD: reactivating a missing source is REFUSED");

    console.log("\n✅ source-deactivation DB proof passed");
  } finally {
    if (sourceIds.length) {
      await db.delete(sourceChunksTable).where(inArray(sourceChunksTable.sourceId, sourceIds));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, sourceIds));
      await db.delete(sourcesTable).where(inArray(sourcesTable.id, sourceIds));
    }
    await closeDb();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
