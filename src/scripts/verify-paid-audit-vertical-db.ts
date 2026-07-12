/**
 * Real-DB proof for the Paid Audit DEPARTMENT vertical (Phase 3, Batch 5) end-to-end against live
 * Postgres: trigger → the department accepts a validated inbound handoff → the registry-loaded
 * 5-specialist graph runs, each node driven by a CLAIMED handoff → the business audit is aggregated →
 * routed to the Proposal department as a real durable handoff → telemetry recorded. Canned node runner
 * (no LLM / no spend).
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-paid-audit-vertical-db.ts
 */
import { getDb, closeDb } from "@/db";
import { handoffs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { seedDepartments } from "@/lib/departments/seed";
import { defaultStore as registryStore } from "@/lib/departments/registry";
import { defaultStore as handoffStore } from "@/lib/handoff";
import { runPaidAuditDepartment } from "@/lib/departments/verticals/paid-audit";

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
  const wf = `verify_pav_${Date.now()}`;

  await seedDepartments({ store: registryStore(db), recordAudit: async () => {} });

  const res = await runPaidAuditDepartment(
    { businessName: "Acme", intakeNotes: "x", requestedBy: "Moiz", companyId: "clientVert", graphRunId: wf },
    {
      handoffStore: handoffStore(db),
      graph: { retrieveBrain: async () => [], runNode: async (i: { role: string }) => ({ text: CANNED[i.role], runId: `r_${i.role}` }), recordAgentRun: async () => ({}), persistAudit: async () => {}, recordAudit: async () => {} },
      recordAudit: async () => {},
      now,
    },
  );

  assert(res.accepted, "the Paid Audit department accepted the inbound trigger");
  assert(res.product?.agentRunCount === 5, "the 5-specialist graph ran (agentRunCount=5)");
  assert(res.routedTo.map((r) => r.department).includes("proposal"), "the business audit routed to Proposal");

  const rows = await db.select().from(handoffs).where(eq(handoffs.workflowId, wf));
  const paNodes = rows.filter((r) => r.department === "paid_audit");
  assert(paNodes.length === 5, `5 specialist node handoffs exist (got ${paNodes.length})`);
  assert(paNodes.every((r) => r.deliveryState === "completed"), "every specialist node handoff was claimed → completed");
  const routed = rows.filter((r) => r.department === "proposal");
  assert(routed.length === 1 && routed[0].deliveryState === "delivered", "one durable handoff delivered to Proposal, awaiting its claim");
  assert((routed[0].envelope as { expectedOutputSchema: string }).expectedOutputSchema === "business_audit", "the routed product schema is business_audit");

  // Cleanup (handoffs; the graph cleared its own checkpoints on success; audit was a no-op).
  await db.delete(handoffs).where(eq(handoffs.workflowId, wf));
  console.log("\nALL REAL-DB PAID-AUDIT VERTICAL CHECKS PASSED ✅");
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
