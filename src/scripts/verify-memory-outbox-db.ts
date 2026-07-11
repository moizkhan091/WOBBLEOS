/**
 * Real-DB verification for the memory_update approval path on the transactional outbox: approving a
 * memory update ATOMICALLY flips the approval + records a `memory.apply` effect, applies the memory write
 * (record + chunks + bank links + proposal flip) idempotently, and converges on re-apply. Against live
 * Postgres — this closes the former cross-store gap (consumed approval with no memory).
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-memory-outbox-db.ts
 */
import { getDb, closeDb } from "@/db";
import { approvals, approvalEffects, memoryBanks, memoryRecords, memoryChunks, memoryBankLinks, memoryUpdateProposals } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { buildApprovalRow } from "@/lib/approvals";
import { buildMemoryBankRow, buildMemoryUpdateProposalRow } from "@/lib/domain/memory";
import { approveMemoryUpdate, activateApprovedMemoryUpdate, defaultStore } from "@/lib/memory";

async function main() {
  const db = getDb();
  const now = new Date();
  const store = defaultStore(db);
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const ts = Date.now();
  const bankSlug = `verify_bank_${ts}`;
  const proposalId = `verify_memproposal_${ts}`;
  const approvalId = `verify_ap_${ts}`;

  // Seed an active memory bank, a pending proposal, and its pending approval.
  await db.insert(memoryBanks).values(buildMemoryBankRow(
    { slug: bankSlug, label: "Verify Bank", scope: "company", purpose: "verify", description: "verify", defaultTier: "working", allowedTrustLevels: ["founder_core", "approved_expert", "monitored"] },
    { id: `memorybank_${bankSlug}`, now },
  ) as never);
  const proposal = buildMemoryUpdateProposalRow(
    { proposedMemory: "Outbox-verified durable fact.", reason: "Real-DB proof.", affectedArea: "brand", suggestedBankSlugs: [bankSlug], confidence: 0.9 },
    { id: proposalId, now },
  );
  await store.insertProposal(proposal);
  await db.insert(approvals).values(buildApprovalRow({ approvalType: "memory_update", entityType: "memory_update_proposal", entityId: proposalId, requestedBy: "system" }, { id: approvalId, now }));

  // 1. Approve through the real (DB-default) outbox path: atomic flip+effect, inline apply, reconcile.
  const res = await approveMemoryUpdate(
    { proposalId, approvalId, approvedBy: "Moiz", slug: `verify-fact-${ts}`, title: "Verify fact", memoryTier: "core", trustLevel: "founder_core", bankSlugs: [bankSlug] },
    { store, now, embedder: null },
  );
  assert(!!res.memoryRecord?.id, "approveMemoryUpdate returned the written memory record");

  // 2. The approval is approved and exactly one memory.apply effect was recorded (atomic), now applied.
  const ap = (await db.select().from(approvals).where(eq(approvals.id, approvalId)))[0];
  assert(ap.status === "approved", "approval flipped to approved");
  const effects = await db.select().from(approvalEffects).where(eq(approvalEffects.approvalId, approvalId));
  assert(effects.length === 1 && effects[0].effectType === "memory.apply", "exactly one memory.apply effect recorded (atomic, no duplicate)");
  assert(effects[0].state === "applied", "the memory.apply effect reconciled to applied");

  // 3. The downstream memory write actually landed: record + chunk(s) + bank link(s), proposal approved.
  const records = await db.select().from(memoryRecords).where(eq(memoryRecords.id, res.memoryRecord.id));
  assert(records.length === 1, "memory record persisted");
  const chunks = await db.select().from(memoryChunks).where(eq(memoryChunks.memoryRecordId, res.memoryRecord.id));
  assert(chunks.length >= 1, "memory chunk(s) persisted");
  const links = await db.select().from(memoryBankLinks).where(eq(memoryBankLinks.memoryRecordId, res.memoryRecord.id));
  assert(links.length >= 1, "memory bank link(s) persisted");
  const prop = (await db.select().from(memoryUpdateProposals).where(eq(memoryUpdateProposals.id, proposalId)))[0];
  assert(prop.status === "approved", "proposal flipped to approved (same tx as the write)");

  // 4. Idempotency (crash-recovery re-apply): activating again is a no-op — no duplicate record/chunks.
  const again = await activateApprovedMemoryUpdate(proposalId, { slug: `verify-fact-${ts}`, title: "Verify fact", memoryTier: "core", trustLevel: "founder_core", bankSlugs: [bankSlug], approvedBy: "Moiz" }, { store, now, embedder: null });
  assert(again === null, "re-apply on an approved proposal is a no-op (exactly-once)");
  const recordsAfter = await db.select().from(memoryRecords).where(eq(memoryRecords.id, res.memoryRecord.id));
  assert(recordsAfter.length === 1, "still exactly one memory record after re-apply");

  // Cleanup.
  await db.delete(memoryBankLinks).where(eq(memoryBankLinks.memoryRecordId, res.memoryRecord.id));
  await db.delete(memoryChunks).where(eq(memoryChunks.memoryRecordId, res.memoryRecord.id));
  await db.delete(memoryRecords).where(eq(memoryRecords.id, res.memoryRecord.id));
  await db.delete(memoryUpdateProposals).where(eq(memoryUpdateProposals.id, proposalId));
  await db.delete(approvalEffects).where(eq(approvalEffects.approvalId, approvalId));
  await db.delete(approvals).where(eq(approvals.id, approvalId));
  await db.delete(memoryBanks).where(and(eq(memoryBanks.slug, bankSlug)));

  console.log("\nALL REAL-DB MEMORY-OUTBOX CHECKS PASSED ✅");
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
