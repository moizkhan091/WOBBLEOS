/**
 * Real-DB proof that a Context OS trusted-context retrieval FAILURE is recorded EXPLICITLY (never silent), on
 * Postgres. Fail-open must: never fabricate context, never disappear, and capture generator + scope/tenant +
 * error category + retryability + correlation + the downstream outcome (the generator proceeded ungrounded).
 *
 * ISOLATED (unique scope id) + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-context-failure-telemetry-db.ts
 */
import { eq, like } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { contextRetrievalFailures } from "@/db/schema";
import { retrieveTrustedContextBlock, recordContextRetrievalFailure, listContextRetrievalFailures, classifyRetrievalError } from "@/lib/context-os";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const scopeId = `ctxfail_client_${uniq}`;
  const scope = { type: "client" as const, id: scopeId };

  try {
    // classify: transient → retryable; schema/query → not; unknown → not.
    assert(classifyRetrievalError(new Error("connection terminated unexpectedly")).category === "db_unavailable" && classifyRetrievalError(new Error("connection terminated")).retryable, "a connection error classifies as db_unavailable + retryable");
    assert(classifyRetrievalError(new Error('column "x" does not exist')).category === "query_error" && !classifyRetrievalError(new Error("syntax error")).retryable, "a query/schema error classifies as query_error + NOT retryable");

    // recordContextRetrievalFailure captures every required field.
    await recordContextRetrievalFailure({ scope, task: "paid_audit", generator: "audit_discovery", correlationId: `corr_${uniq}`, error: new Error("connection terminated unexpectedly") }, { db });
    const after1 = await listContextRetrievalFailures({ scopeType: "client", scopeId }, { db });
    assert(after1.failures.length === 1, "a retrieval failure is RECORDED (never silent)");
    const f = after1.failures[0];
    assert(f.generator === "audit_discovery" && f.task === "paid_audit" && f.scopeType === "client" && f.scopeId === scopeId, "the failure captures generator + task + scope/tenant");
    assert(f.errorCategory === "db_unavailable" && f.retryable === true && f.correlationId === `corr_${uniq}` && f.downstreamOutcome === "proceeded_ungrounded", "the failure captures error category + retryability + correlation id + downstream outcome (proceeded ungrounded)");

    // retrieveTrustedContextBlock FAILS-OPEN (returns null) AND records the failure — the SELECT throws, the
    // failure INSERT still lands (a real fault surfaces to the founder; grounding is never fabricated).
    const failingDb = { select: () => { throw new Error("connection terminated unexpectedly"); }, insert: (t: unknown) => db.insert(t as never) } as unknown as typeof db;
    const block = await retrieveTrustedContextBlock({ type: "client", id: scopeId }, "proposal_synthesis", { agentSlug: "proposal_solution_architect", correlationId: `corr2_${uniq}` }, { db: failingDb });
    assert(block === null, "on a retrieval fault the block is null — the generator proceeds WITHOUT grounding (never fabricated)");
    const after2 = await listContextRetrievalFailures({ scopeType: "client", scopeId }, { db });
    assert(after2.failures.length === 2 && after2.failures.some((x) => x.task === "proposal_synthesis" && x.correlationId === `corr2_${uniq}`), "retrieveTrustedContextBlock recorded the fault explicitly (fail-open is NOT silent)");

    // A SUCCESSFUL retrieval (real db, no approved context in this fresh scope) → null, and records NO failure.
    const before = (await listContextRetrievalFailures({ scopeType: "client", scopeId }, { db })).failures.length;
    const ok = await retrieveTrustedContextBlock({ type: "client", id: scopeId }, "proposal_synthesis", { agentSlug: "x" }, { db });
    assert(ok === null, "an empty (but healthy) retrieval returns null (no context yet)");
    assert((await listContextRetrievalFailures({ scopeType: "client", scopeId }, { db })).failures.length === before, "a HEALTHY empty retrieval records NO failure (only real faults are recorded)");

    console.log("\nALL REAL-DB CONTEXT-FAILURE-TELEMETRY CHECKS PASSED ✅");
  } finally {
    await db.delete(contextRetrievalFailures).where(eq(contextRetrievalFailures.scopeId, scopeId)).catch(() => {});
    await db.delete(contextRetrievalFailures).where(like(contextRetrievalFailures.scopeId, `ctxfail_client_${uniq}%`)).catch(() => {});
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
