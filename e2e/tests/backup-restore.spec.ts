import { test, expect } from "@playwright/test";

/**
 * Backup export → restore, the founder-facing round-trip (real DB effects). Restore is ADDITIVE + NON-DESTRUCTIVE:
 * dry_run previews without writing; apply inserts ONLY missing rows and never overwrites. An invalid snapshot is rejected.
 */
test.describe("Backup & Restore — export → dry-run → apply (real effects)", () => {
  test("a founder exports a snapshot and restores it safely (additive, non-destructive)", async ({ request }) => {
    // EXPORT a real snapshot of the business tables.
    const exp = await request.get("/api/backup/export");
    expect(exp.ok()).toBe(true);
    const snapshot = (await exp.json()) as { version: string; data: Record<string, unknown[]> };
    expect(snapshot.version).toBe("wobble-os-backup-1");

    // INVALID snapshot → rejected (422), never written.
    const bad = await request.post("/api/backup/restore", { data: { snapshot: { version: "bad", data: {} }, mode: "dry_run" } });
    expect(bad.status()).toBe(422);

    // DRY RUN → a true preview. Every exported row already exists, so nothing would be inserted.
    const dry = await request.post("/api/backup/restore", { data: { snapshot, mode: "dry_run" } });
    expect(dry.ok()).toBe(true);
    const dryBody = (await dry.json()) as { ok: boolean; mode: string; totalInserted: number; totalNew: number; tables: unknown[] };
    expect(dryBody.ok).toBe(true);
    expect(dryBody.mode).toBe("dry_run");
    expect(dryBody.totalInserted).toBe(0); // dry run writes nothing
    expect(Array.isArray(dryBody.tables)).toBe(true);

    // APPLY → safe: since the just-exported rows all still exist, restore inserts NOTHING (never overwrites).
    const apply = await request.post("/api/backup/restore", { data: { snapshot, mode: "apply" } });
    expect(apply.ok()).toBe(true);
    const applyBody = (await apply.json()) as { totalInserted: number; totalNew: number };
    expect(applyBody.totalNew).toBe(0);
    expect(applyBody.totalInserted).toBe(0); // additive + non-destructive: all rows present → no-op
  });
});
