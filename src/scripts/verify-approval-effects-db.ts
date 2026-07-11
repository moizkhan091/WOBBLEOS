/**
 * Real-DB verification for the approval-effects outbox: the ATOMIC flip+record transaction and
 * idempotent reconciliation, against live Postgres.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-approval-effects-db.ts
 */
import { getDb, closeDb } from "@/db";
import { approvals, approvalEffects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildApprovalRow } from "@/lib/approvals";
import { claimApprovalAndRecordEffect, reconcileApprovalEffects, defaultStore } from "@/lib/approval-effects";

async function main() {
  const db = getDb();
  const now = new Date();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const apId = `verify_ap_${Date.now()}`;

  // Seed a pending approval.
  await db.insert(approvals).values(buildApprovalRow({ approvalType: "source", entityType: "source", entityId: "src_x", requestedBy: "system" }, { id: apId, now }));

  // 1. Atomic claim + effect record.
  const c1 = await claimApprovalAndRecordEffect({ approvalId: apId, approvedBy: "Moiz", effect: { approvalId: apId, effectType: "source.activate", entityType: "source", entityId: "src_x", payload: { trustLevel: "tier_3_monitored" }, actor: "Moiz" } }, { db, now });
  assert(c1.claimed && !!c1.effectId, "atomic claim flipped the approval AND recorded the effect");
  const ap = (await db.select().from(approvals).where(eq(approvals.id, apId)))[0];
  assert(ap.status === "approved", "approval is approved (same tx)");
  const eff = (await db.select().from(approvalEffects).where(eq(approvalEffects.id, c1.effectId!)))[0];
  assert(eff.state === "pending", "effect recorded pending (same tx)");

  // 2. Duplicate claim: already actioned → no second flip, no second effect.
  const c2 = await claimApprovalAndRecordEffect({ approvalId: apId, approvedBy: "Ali", effect: { approvalId: apId, effectType: "source.activate", entityType: "source", entityId: "src_x", actor: "Ali" } }, { db, now });
  assert(!c2.claimed, "duplicate claim rejected (approval no longer pending)");
  const effCount = (await db.select().from(approvalEffects).where(eq(approvalEffects.approvalId, apId))).length;
  assert(effCount === 1, "exactly one effect row exists (no duplicate)");

  // 3. Reconcile applies the effect idempotently (crash safety net path).
  let appliedCount = 0;
  const appliers = { "source.activate": async () => { appliedCount += 1; } };
  const r1 = await reconcileApprovalEffects(appliers, { store: defaultStore(db), recordAudit: async () => {}, now, onlyId: c1.effectId! });
  assert(r1.applied === 1 && appliedCount === 1, "reconcile applied the pending effect");
  const r2 = await reconcileApprovalEffects(appliers, { store: defaultStore(db), recordAudit: async () => {}, now, onlyId: c1.effectId! });
  assert(r2.applied === 0 && appliedCount === 1, "second reconcile is a no-op (exactly-once)");

  // Cleanup.
  await db.delete(approvalEffects).where(eq(approvalEffects.approvalId, apId));
  await db.delete(approvals).where(eq(approvals.id, apId));

  console.log("\nALL REAL-DB APPROVAL-EFFECT CHECKS PASSED ✅");
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
