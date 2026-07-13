/**
 * Real-DB proof (Postgres) that BACKUP RESTORE is safe, additive, and non-destructive:
 *   export a snapshot → lose a row + modify another → restore DRY_RUN (reports what WOULD insert, writes nothing)
 *   → restore APPLY (re-inserts ONLY the missing row) → the lost row is back AND the modified row is NOT reverted
 *   (onConflictDoNothing never overwrites) → a second APPLY is idempotent (0 inserts). Invalid snapshots are rejected.
 *
 * ISOLATED + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-backup-restore-db.ts
 */
import { inArray, eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { offers as offersTable, auditLogs } from "@/db/schema";
import { exportSnapshot, restoreSnapshot, validateSnapshot, type BackupSnapshot } from "@/lib/backup";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const lostId = `offer_lost_${uniq}`, keepId = `offer_keep_${uniq}`;
  const ids = [lostId, keepId];

  const mkOffer = (id: string, name: string) => ({ id, name, status: "draft", priceCents: 1000, currency: "USD", deliverables: [], experiments: [], score: "0", metadata: {}, createdAt: new Date(), updatedAt: new Date() });
  const getOffer = async (id: string) => (await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1))[0] as { id: string; name: string } | undefined;

  try {
    // Seed two known offers, then EXPORT a real snapshot (contains both, alongside all other business data).
    await db.insert(offersTable).values([mkOffer(lostId, "Lost Offer"), mkOffer(keepId, "Keep Offer")] as never);
    const snapshot = await exportSnapshot(new Date().toISOString());
    const snapOffers = snapshot.data.offers as Array<{ id: string }>;
    assert(snapOffers.some((o) => o.id === lostId) && snapOffers.some((o) => o.id === keepId), "the export captured both seeded offers into the snapshot");

    // Simulate data loss (delete one) + an intentional divergence (modify the other AFTER the snapshot).
    await db.delete(offersTable).where(eq(offersTable.id, lostId));
    await db.update(offersTable).set({ name: "MODIFIED_KEEP" }).where(eq(offersTable.id, keepId));
    assert(!(await getOffer(lostId)), "the 'lost' offer is gone");

    // Validation: a bad-version snapshot is REJECTED before any write.
    assert(!validateSnapshot({ version: "nope", data: {} }).ok, "an unsupported-version snapshot is REJECTED by validation");

    // DRY_RUN: reports the missing row as new, writes NOTHING.
    const dry = await restoreSnapshot(snapshot, { mode: "dry_run", tables: ["offers"], actor: "Moiz" });
    const dryOffers = dry.tables.find((t) => t.key === "offers")!;
    assert(dry.mode === "dry_run" && dryOffers.newRows >= 1, "DRY_RUN reports ≥1 new row for offers (the missing one)");
    assert(!(await getOffer(lostId)), "DRY_RUN wrote NOTHING — the lost offer is still absent (a true preview)");

    // APPLY: additively re-inserts ONLY the missing row; the modified existing row is NOT overwritten.
    const applied = await restoreSnapshot(snapshot, { mode: "apply", tables: ["offers"], actor: "Moiz" });
    const back = await getOffer(lostId);
    assert(!!back && back.name === "Lost Offer", "APPLY re-inserted the lost offer (restored from the snapshot)");
    const kept = await getOffer(keepId);
    assert(!!kept && kept.name === "MODIFIED_KEEP", "NON-DESTRUCTIVE: the existing (modified) offer was NOT overwritten/reverted — restore only fills MISSING rows");
    assert(applied.totalInserted >= 1, "APPLY reports the additive insert count");
    assert((await db.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.eventType, "backup.restored"))).length >= 1, "an APPLY writes a backup.restored audit record");

    // IDEMPOTENT: a second APPLY inserts nothing new (both rows now present).
    const again = await restoreSnapshot(snapshot, { mode: "apply", tables: ["offers"], actor: "Moiz" });
    const againOffers = again.tables.find((t) => t.key === "offers")!;
    assert(againOffers.inserted === 0 && againOffers.newRows === 0, "IDEMPOTENT: a repeated APPLY inserts nothing (no duplicates, no overwrite)");

    console.log("\n✅ backup-restore DB proof passed");
  } finally {
    await db.delete(offersTable).where(inArray(offersTable.id, ids));
    await closeDb();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
