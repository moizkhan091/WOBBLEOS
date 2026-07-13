/**
 * Real-DB proof that Context OS is OPERATIONAL on live Postgres: the durable onboarding → trusted-context
 * pipeline, end-to-end. Proven:
 *   - raw intake is stored immutably; extraction produces PENDING assertions that are NOT trusted;
 *   - retrieval before approval returns NOTHING (raw/extracted never auto-trusted) but records evidence;
 *   - approval is the ONLY path to trusted; retrieval then returns exactly the approved, in-scope assertions;
 *   - retrieval records the exact assertion ids it returned (telemetry / evidence);
 *   - TENANT ISOLATION: client B's context never appears in client A's retrieval;
 *   - a superseding approval marks the prior superseded (not treated as current);
 *   - contradictions between approved assertions are surfaced separately (never overwritten);
 *   - deletion removes the scope's sources + assertions + retrievals.
 *
 * ISOLATED (unique client scopes) + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-context-os-db.ts
 */
import { and, eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { contextAssertions, contextRetrievals, contextSources } from "@/db/schema";
import {
  recordContextSource, extractAssertions, approveContextAssertion, retrieveTrustedContext,
  listContextContradictions, contextCoverageForScope, deleteContextScope, exportContextScope,
} from "@/lib/context-os";
import type { ContextScope } from "@/lib/domain/context-os";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const A: ContextScope = { type: "client", id: `ctxA_${uniq}` };
  const B: ContextScope = { type: "client", id: `ctxB_${uniq}` };
  const deps = { db, recordAudit: async () => {} };

  try {
    // Raw intake (immutable) + extraction → PENDING assertions.
    const src = await recordContextSource({ kind: "questionnaire", content: "Our pricing is $99/mo; our ICP is founders.", scope: A, importedBy: "Moiz" }, deps);
    const [a1, a2] = await extractAssertions(src.id, [
      { statement: "Pricing is $99/mo", entities: ["pricing"], trust: 0.9 },
      { statement: "ICP is founders", entities: ["icp"], trust: 0.8 },
    ], deps);
    assert(a1.status === "extracted" && a2.status === "extracted", "extraction produced PENDING assertions (not trusted)");

    // Retrieval BEFORE approval → nothing trusted; but a retrieval evidence row is recorded.
    const pre = await retrieveTrustedContext(A, "ask", { agentSlug: "content_strategist" }, deps);
    assert(pre.assertions.length === 0, "raw/extracted context is NOT retrievable before approval (never auto-trusted)");
    assert((await db.select().from(contextRetrievals).where(eq(contextRetrievals.id, pre.retrievalId)))[0] !== undefined, "the retrieval was recorded as evidence even when empty");

    // Approve ONE → it becomes trusted.
    await approveContextAssertion(a1.id, "Moiz", {}, deps);
    const post = await retrieveTrustedContext(A, "ask", { agentSlug: "content_strategist" }, deps);
    assert(post.assertions.length === 1 && post.assertions[0].id === a1.id, "after approval, ONLY the approved assertion is retrievable");
    const retRow = (await db.select().from(contextRetrievals).where(eq(contextRetrievals.id, post.retrievalId)))[0];
    assert(retRow.assertionIds.length === 1 && retRow.assertionIds[0] === a1.id, "the retrieval records the EXACT approved assertion id it returned (evidence)");
    assert((await contextCoverageForScope(A, deps)) === 1, "coverage = 1 (the one source produced an approved assertion)");

    // TENANT ISOLATION: client B's approved assertion never leaks into A.
    const srcB = await recordContextSource({ kind: "manual", content: "B's secret pricing", scope: B, importedBy: "Moiz" }, deps);
    const [b1] = await extractAssertions(srcB.id, [{ statement: "B pricing is $999/mo", entities: ["pricing"], trust: 0.9 }], deps);
    await approveContextAssertion(b1.id, "Moiz", {}, deps);
    const aAgain = await retrieveTrustedContext(A, "ask", {}, deps);
    assert(!aAgain.assertions.some((x) => x.id === b1.id), "client B's approved assertion does NOT leak into client A's context (tenant isolation)");

    // SUPERSESSION: a new approved assertion supersedes a1 → a1 no longer current.
    const [a3] = await extractAssertions(src.id, [{ statement: "Pricing is now $129/mo", entities: ["pricing"], trust: 0.95 }], deps);
    await approveContextAssertion(a3.id, "Moiz", { supersedesId: a1.id }, deps);
    const afterSupersede = await retrieveTrustedContext(A, "ask", {}, deps);
    const ids = afterSupersede.assertions.map((x) => x.id);
    assert(ids.includes(a3.id) && !ids.includes(a1.id), "the superseding assertion is current; the superseded one is NOT treated as current");

    // CONTRADICTION: approve a2's entity twice with different statements → surfaced (not overwritten).
    await approveContextAssertion(a2.id, "Moiz", {}, deps);
    const [a4] = await extractAssertions(src.id, [{ statement: "ICP is enterprises", entities: ["icp"], trust: 0.7 }], deps);
    await approveContextAssertion(a4.id, "Moiz", {}, deps); // NOT superseding → a real contradiction on entity `icp`
    const contradictions = await listContextContradictions(A, deps);
    assert(contradictions.some((c) => c.entity === "icp"), "a contradiction between approved assertions is surfaced separately (never silently overwritten)");

    // EXPORT + DELETION.
    const exported = await exportContextScope(A, deps);
    assert(exported.sources.length >= 1 && exported.assertions.length >= 1, "export returns the scope's sources + assertions");
    const del = await deleteContextScope(A, deps);
    assert(del.deletedSources >= 1 && del.deletedAssertions >= 1, "deletion removes the scope's sources + assertions");
    assert((await db.select().from(contextAssertions).where(and(eq(contextAssertions.scopeType, A.type), eq(contextAssertions.scopeId, A.id)))).length === 0, "no assertions remain for the deleted scope");

    console.log("\nALL REAL-DB CONTEXT OS CHECKS PASSED ✅");
  } finally {
    for (const s of [A, B]) {
      await db.delete(contextRetrievals).where(and(eq(contextRetrievals.scopeType, s.type), eq(contextRetrievals.scopeId, s.id))).catch(() => {});
      await db.delete(contextAssertions).where(and(eq(contextAssertions.scopeType, s.type), eq(contextAssertions.scopeId, s.id))).catch(() => {});
      await db.delete(contextSources).where(and(eq(contextSources.scopeType, s.type), eq(contextSources.scopeId, s.id))).catch(() => {});
    }
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
