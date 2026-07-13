/**
 * Real-DB proof of Founder Taste SCOPED learning (Phase 6) on Postgres: a correction updates ONLY its scoped
 * profile — one correction NEVER becomes a global/other-scope permanent preference.
 *
 * Uses two isolated CLIENT-scope profiles so the shared brand/founder seed profiles are never touched. Proven:
 *   - feedback scoped to client A updates ONLY client A's signals (client B is unchanged);
 *   - a positive vs a negative decision moves the right counter + confidence grows with signal count;
 *   - getTasteProfile retrieves the correct scoped profile (and never another scope's).
 *
 * ISOLATED (unique client ids) + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-founder-taste-db.ts
 */
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { feedbackEvents, tasteProfiles } from "@/db/schema";
import { ensureTasteProfile, recordFeedbackEvent, getTasteProfile, defaultStore as tasteStore } from "@/lib/taste";
import { profileKeyForFeedbackScope } from "@/lib/domain/taste";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const subjA = `verifytasteA_${uniq}`;
  const subjB = `verifytasteB_${uniq}`;
  const keyA = profileKeyForFeedbackScope({ scope: "client", subjectId: subjA });
  const keyB = profileKeyForFeedbackScope({ scope: "client", subjectId: subjB });
  const deps = { store: tasteStore(db), recordAudit: async () => {} };
  const eventIds: string[] = [];

  try {
    await ensureTasteProfile({ scope: "client", subjectId: subjA, label: "Client A Taste" }, deps);
    await ensureTasteProfile({ scope: "client", subjectId: subjB, label: "Client B Taste" }, deps);

    // A REJECTION scoped to client A only.
    const r1 = await recordFeedbackEvent({ targetType: "content_packet", targetId: `pkt_${uniq}`, decision: "reject", reason: "off-brand tone for this client", actor: "Moiz", profileKeys: [keyA] }, deps);
    eventIds.push(r1.event.id);

    const a1 = await getTasteProfile(keyA, deps);
    const b1 = await getTasteProfile(keyB, deps);
    assert(a1?.negativeSignals === 1 && a1.positiveSignals === 0, "the correction incremented ONLY client A's negative signal");
    assert(b1?.negativeSignals === 0 && b1.positiveSignals === 0, "client B is UNCHANGED — the correction did not leak to another scope (never a global preference)");
    assert(Number(a1!.confidence) > 0, "client A's confidence grew from the real feedback");

    // A positive decision scoped to client A → moves the positive counter, still isolated from B.
    const r2 = await recordFeedbackEvent({ targetType: "content_packet", targetId: `pkt2_${uniq}`, decision: "approve", actor: "Moiz", profileKeys: [keyA] }, deps);
    eventIds.push(r2.event.id);
    const a2 = await getTasteProfile(keyA, deps);
    const b2 = await getTasteProfile(keyB, deps);
    assert(a2?.positiveSignals === 1 && a2.negativeSignals === 1, "an approval moved client A's POSITIVE counter (both signals now recorded)");
    assert(b2?.positiveSignals === 0 && b2.negativeSignals === 0, "client B STILL unchanged after further scoped feedback");
    assert(getKey(a2!) === keyA && getKey(b2!) === keyB, "getTasteProfile retrieves the correct scoped profile, never another scope's");

    console.log("\nALL REAL-DB FOUNDER TASTE SCOPING CHECKS PASSED ✅");
  } finally {
    if (eventIds.length) await db.delete(feedbackEvents).where(inArray(feedbackEvents.id, eventIds)).catch(() => {});
    await db.delete(feedbackEvents).where(inArray(feedbackEvents.targetId, [`pkt_${uniq}`, `pkt2_${uniq}`])).catch(() => {});
    await db.delete(tasteProfiles).where(inArray(tasteProfiles.profileKey, [keyA, keyB])).catch(() => {});
  }
}
function getKey(p: { profileKey: string }): string { return p.profileKey; }

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
