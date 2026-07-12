/**
 * Real-DB proof that Decision Learning is DURABLE + GATED on live Postgres (Doctrine 7).
 *
 * Seeds repeated COMMITTED Decision Room decisions, then exercises the real service against the DB-backed
 * `decision_policies` store and proves:
 *   - a repeated committed direction DERIVES a scoped policy PROPOSAL, persisted as `proposed` (never active);
 *   - a single decision never becomes a policy (only the repeated direction does);
 *   - re-running is IDEMPOTENT (natural key already tracked → nothing re-proposed);
 *   - the partial-unique index is a real DB backstop (a duplicate live insert is a silent no-op);
 *   - APPROVE flips it to `active` (the only path to activation) and REJECT flips a proposal to `rejected`,
 *     both persisted.
 *
 * ISOLATED: a unique category + a source scoped to it, so it never reads or writes unrelated decisions.
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-decision-learning-db.ts
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { decisionPolicies, decisions as decisionsTable } from "@/db/schema";
import { listDecisions } from "@/lib/decisions";
import { proposeDecisionPolicies, approveDecisionPolicy, rejectDecisionPolicy, listDecisionPolicies, createDbDecisionPolicyStore } from "@/lib/decision-learning";
import { newId } from "@/lib/ids";
import type { DecisionSource } from "@/lib/decision-learning";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const stamp = Date.now();
  const category = `pricing_${stamp}`; // unique → isolates this run from all other committed decisions
  const store = createDbDecisionPolicyStore(db);
  // A source scoped to THIS run's category (exercises the real DB listDecisions path, isolated).
  const source: DecisionSource = { async listCommittedDecisions() { return (await listDecisions({ status: "decided", category, limit: 100 })).filter((d) => d.status === "decided" && d.decidedOptionId); } };

  const commit = async (title: string, label: string, owner: string) => {
    const optId = newId("opt");
    const now = new Date();
    await db.insert(decisionsTable).values({
      id: newId("dec"), title, category, status: "decided", options: [{ id: optId, label }], decidedOptionId: optId,
      decisionRationale: `chose ${label}`, owner, createdBy: owner, createdAt: now, updatedAt: now,
    } as typeof decisionsTable.$inferInsert);
  };

  try {
    // Three committed decisions, SAME founder scope + category + direction → one repetition policy.
    await commit("Q1 pricing", "Hold firm on price", "moiz");
    await commit("Q2 pricing", "Hold firm on price", "moiz");
    await commit("Q3 pricing", "Hold firm on price", "moiz");
    // One committed decision in a DIFFERENT direction (minority) — must NOT spawn its own policy.
    await commit("One-off discount", "Offer a discount", "moiz");

    // ---- derive proposals ----
    const inserted = await proposeDecisionPolicies({ source, store });
    assert(inserted.length === 1, `exactly one policy proposed from the repeated direction (got ${inserted.length})`);
    const p = inserted[0];
    assert(p.status === "proposed", "the derived policy is PROPOSED (never auto-active)");
    assert(p.scope === "founder" && p.scopeId === "moiz" && p.category === category, "the policy is scoped to founder:moiz for this category");
    assert(p.direction === "hold firm on price" && p.origin === "repetition", "the policy captures the repeated committed direction");
    assert(p.repetitionCount === 3 && p.contested === true && p.dissentCount === 1, "repetition/dissent counts reflect the real evidence (3 for, 1 against)");
    assert(p.confidence > 0, "a real confidence was computed");

    // persisted durably
    const dbRows = await db.select().from(decisionPolicies).where(and(eq(decisionPolicies.scopeId, "moiz"), eq(decisionPolicies.category, category)));
    assert(dbRows.length === 1 && dbRows[0].id === p.id, "the proposal is persisted in decision_policies");
    assert(dbRows[0].status === "proposed" && Number(dbRows[0].confidence) === p.confidence, "the persisted row round-trips (status + numeric confidence)");

    // ---- idempotency ----
    const again = await proposeDecisionPolicies({ source, store });
    assert(again.length === 0, "re-running proposes nothing new (natural key already tracked)");
    assert((await db.select().from(decisionPolicies).where(eq(decisionPolicies.category, category))).length === 1, "still exactly one policy row after the re-run");

    // ---- DB backstop: a duplicate LIVE insert is a silent no-op (partial-unique index) ----
    await store.insertPolicy({ ...p, id: newId("policy") });
    assert((await db.select().from(decisionPolicies).where(eq(decisionPolicies.category, category))).length === 1, "the partial-unique index rejected a duplicate live natural-key insert (still one row)");

    // ---- approve → active ----
    const activated = await approveDecisionPolicy(p.id, { approvedBy: "moiz" }, { store });
    assert(activated?.status === "active", "approving a proposed policy flips it to ACTIVE");
    const afterApprove = await store.getPolicy(p.id);
    assert(afterApprove?.status === "active" && afterApprove.effectiveFrom instanceof Date, "the activation is persisted with an effectiveFrom");

    // approving again is a no-op (not in `proposed` state anymore)
    assert((await approveDecisionPolicy(p.id, { approvedBy: "moiz" }, { store })) === null, "re-approving an active policy is a no-op");

    // ---- reject path: a DISTINCT founder scope yields its own proposal, which can be rejected ----
    await commit("A1 billing", "Monthly billing", "ali");
    await commit("A2 billing", "Monthly billing", "ali");
    await commit("A3 billing", "Monthly billing", "ali");
    const insertedAli = await proposeDecisionPolicies({ source, store });
    assert(insertedAli.length === 1 && insertedAli[0].scopeId === "ali", "a distinct founder scope yields its own fresh proposal (moiz's active one is not re-proposed)");
    const rejected = await rejectDecisionPolicy(insertedAli[0].id, { rejectedBy: "moiz" }, { store });
    assert(rejected?.status === "rejected", "rejecting a proposed policy flips it to REJECTED");
    assert((await store.getPolicy(insertedAli[0].id))?.status === "rejected", "the rejection is persisted");

    const listed = await listDecisionPolicies({ scope: "founder", scopeId: "moiz", category }, { store });
    assert(listed.length === 1 && listed[0].id === p.id, "listDecisionPolicies returns the persisted policy for the scope");

    console.log("\nALL REAL-DB DECISION LEARNING CHECKS PASSED ✅");
  } finally {
    await db.delete(decisionPolicies).where(eq(decisionPolicies.category, category));
    const rows = await db.select({ id: decisionsTable.id }).from(decisionsTable).where(eq(decisionsTable.category, category));
    if (rows.length) await db.delete(decisionsTable).where(inArray(decisionsTable.id, rows.map((r) => r.id)));
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
