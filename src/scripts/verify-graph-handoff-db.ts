/**
 * Real-DB proof that a graph is a RUNTIME-DRIVEN execution backbone (Phase 2): the paid-audit graph runs
 * each node THROUGH the durable handoff runtime (dispatch → claim → validate → execute → ack → complete)
 * against live Postgres, not just persisting side-records. Also proves retry idempotency (a re-run with
 * the same graphRunId dedups to the existing handoffs — no churn) and lineage integrity.
 *
 * Uses a canned node runner (no LLM, no spend) + no-op persistAudit so we exercise ONLY the transport.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-graph-handoff-db.ts
 */
import { getDb, closeDb } from "@/db";
import { handoffs as handoffsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runPaidAuditGraph } from "@/lib/paid-audit-graph";
import { defaultStore } from "@/lib/handoff";

const CANNED: Record<string, string> = {
  audit_discovery: JSON.stringify({ situation: "x", acquisition: [], delivery: [], support: [], bottlenecks: [], keyMetrics: [] }),
  audit_opportunity: JSON.stringify({ opportunities: [{ title: "T", service: "missed-call-text-back-system", description: "d", impact: "high", difficulty: "low", kpis: ["k"] }] }),
  audit_prioritization: JSON.stringify({ quickWins: [], bigSwings: [], rationale: "r" }),
  audit_roadmap: JSON.stringify({ phases: [] }),
  audit_report: JSON.stringify({ executiveSummary: "E", situationSummary: "s", roi: { estimatedMonthlyUpsideCents: 1, estimatedImplementationCents: 1, paybackMonths: 1 }, risks: [], successMetrics: ["s"], recommendedTechStack: ["Wobble OS"], nextSteps: ["n"] }),
};

async function main() {
  const db = getDb();
  const now = new Date();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const graphRunId = `verify_wf_${Date.now()}`;

  const deps = {
    retrieveBrain: async () => [],
    runNode: async (i: { role: string }) => ({ text: CANNED[i.role], runId: `r_${i.role}` }),
    recordAgentRun: async () => ({}),
    recordAudit: async () => {},
    persistAudit: async () => {},
    handoffStore: defaultStore(db),
    now,
  };

  // 1. Run the graph — every node must be driven through a claimed handoff.
  const res = await runPaidAuditGraph({ businessName: "Acme", intakeNotes: "x", requestedBy: "Moiz", companyId: "clientVDB", graphRunId }, deps);
  assert(!!res.auditId, "graph produced an audit");

  const rows = await db.select().from(handoffsTable).where(eq(handoffsTable.workflowId, graphRunId));
  assert(rows.length === 5, `exactly 5 durable handoffs drove the 5 nodes (got ${rows.length})`);
  assert(rows.every((r) => r.deliveryState === "completed"), "every handoff reached completed (delivered → claimed → acknowledged → completed)");
  assert(rows.every((r) => r.acknowledgedAt !== null && r.completedAt !== null), "every handoff was durably acknowledged AND completed");
  assert(rows.every((r) => r.clientWorkspaceId === "clientVDB"), "every handoff carried the client workspace scope (tenant isolation)");

  // 2. Lineage: one correlation across the run, and a causation chain linking the hops.
  assert(new Set(rows.map((r) => r.correlationId)).size === 1, "one correlationId across the whole workflow");
  const withCausation = rows.filter((r) => r.causationId !== null);
  assert(withCausation.length === 4, "4 of 5 handoffs carry a causationId (the entry hop has none) — lineage intact");

  // 3. Retry idempotency: re-running with the SAME graphRunId dedups to the existing handoffs (no churn).
  await runPaidAuditGraph({ businessName: "Acme", intakeNotes: "x", requestedBy: "Moiz", companyId: "clientVDB", graphRunId }, deps);
  const afterRetry = await db.select().from(handoffsTable).where(eq(handoffsTable.workflowId, graphRunId));
  assert(afterRetry.length === 5, `still exactly 5 handoffs after a retry (deduped, no churn) — got ${afterRetry.length}`);

  // Cleanup.
  await db.delete(handoffsTable).where(eq(handoffsTable.workflowId, graphRunId));

  console.log("\nALL REAL-DB GRAPH-HANDOFF CHECKS PASSED ✅");
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
