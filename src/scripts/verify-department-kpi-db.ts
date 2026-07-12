/**
 * Real-DB proof for department KPIs (Phase 3): after real work runs (the Paid Audit vertical dispatches
 * 5 completed handoffs), getDepartmentKpis computes truthful metrics from that live runtime data — jobs
 * received, products completed, success rate, avg completion time — with targets, freshness and
 * confidence. KPIs are computed, not configured names.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-department-kpi-db.ts
 */
import { getDb, closeDb } from "@/db";
import { handoffs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { seedDepartments } from "@/lib/departments/seed";
import { defaultStore as registryStore } from "@/lib/departments/registry";
import { defaultStore as handoffStore } from "@/lib/handoff";
import { runPaidAuditDepartment } from "@/lib/departments/verticals/paid-audit";
import { getDepartmentKpis } from "@/lib/departments/kpi";

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
  const wf = `verify_kpi_${Date.now()}`;
  await seedDepartments({ store: registryStore(db), recordAudit: async () => {} });

  // Produce real runtime data: run the Paid Audit vertical (5 node handoffs → completed).
  await runPaidAuditDepartment(
    { businessName: "Acme", intakeNotes: "x", requestedBy: "Moiz", companyId: "clientKpi", graphRunId: wf },
    { handoffStore: handoffStore(db), graph: { retrieveBrain: async () => [], runNode: async (i: { role: string }) => ({ text: CANNED[i.role], runId: `r_${i.role}` }), recordAgentRun: async () => ({}), persistAudit: async () => {}, recordAudit: async () => {} }, recordAudit: async () => {}, now },
  );

  // Compute KPIs from the live data.
  const kpis = await getDepartmentKpis("paid_audit", { now });
  assert(!!kpis, "KPIs computed for paid_audit");
  const get = (k: string) => kpis!.find((v) => v.key === k)!;

  assert(get("jobs_received").value! >= 5, `jobs_received counts the real handoffs (>=5): ${get("jobs_received").value}`);
  assert(get("products_completed").value! >= 5, `products_completed counts completed handoffs (>=5): ${get("products_completed").value}`);
  assert(get("success_rate").value !== null && get("success_rate").value! > 0, `success_rate computed from runtime: ${get("success_rate").value}`);
  assert(get("avg_completion_ms").value !== null || get("avg_completion_ms").confidence === "none", "avg_completion_ms is a real value or honestly absent");
  assert(get("success_rate").target === 0.95, "success_rate carries the target from the seeded department config");
  assert(get("jobs_received").freshnessAt !== null, "freshness reflects the latest data point");
  assert(get("jobs_received").confidence !== "none", "confidence reflects the real sample");
  // Definition + period + source are exposed for every KPI.
  assert(kpis!.every((v) => v.definition.length > 0 && v.period.length > 0 && v.source.length > 0), "every KPI exposes definition + period + source");

  await db.delete(handoffs).where(eq(handoffs.workflowId, wf));
  console.log("\nALL REAL-DB DEPARTMENT-KPI CHECKS PASSED ✅");
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
