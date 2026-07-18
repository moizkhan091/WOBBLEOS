/**
 * Prove the Paid AI Audit runs ALL FIVE consultant nodes end-to-end after the opportunity-truncation fix —
 * the opportunity node was hitting the 6000-token cap → truncated JSON → "unparseable output". Fix: tighter
 * opportunity prompt (10-14 concise) + 8000-token headroom. Linked to the Nova Dental company so the audit
 * also surfaces in that org's workspace (Artifacts tab).
 *
 * Run:  DATABASE_URL=… OPENROUTER_API_KEY=… npx tsx src/scripts/prove-paid-audit.ts
 */
import { closeDb } from "@/db";
import { runPaidAuditGraph } from "@/lib/paid-audit-graph";

const NOTES =
  "3 clinics in Karachi. Front desk drowns in WhatsApp and missed calls — we lose ~30 calls/week and bookings go to whoever answers first. Paper diaries, no CRM, manual appointment reminders. High appointment volume, lots of no-shows. Owner makes the decisions, keen to modernise but wary of agencies. Budget is fine if it pays back.";

async function main() {
  const res = await runPaidAuditGraph({
    businessName: "Nova Dental Karachi", industry: "dental / med spa", intakeNotes: NOTES,
    requestedBy: "Moiz", companyId: "co_acd636ed-7853-48aa-980d-1fa5d4c03d75",
  });
  const r = res.report;
  console.log(`  auditId=${res.auditId} agentRuns=${res.agentRunCount} modelRuns=${res.modelRunIds.length}`);
  console.log(`  opportunities=${r.opportunities.length} roadmap-phases=${r.roadmap.length} risks=${r.risks.length} nextSteps=${r.nextSteps.length} serviceCount=${r.serviceCount}`);
  console.log(`  exec: ${r.executiveSummary.slice(0, 140)}`);
  console.log(`  top opportunity: ${r.opportunities[0]?.title} (impact ${r.opportunities[0]?.impact})`);
  if (r.opportunities.length === 0) throw new Error("no opportunities — the opportunity node still failed to parse");
  if (r.roadmap.length === 0) throw new Error("no roadmap phases — a downstream node failed");
  console.log("  DONE: Paid AI Audit ran all 5 nodes (opportunity node parsed cleanly — truncation bug fixed).");
}

main().then(() => closeDb()).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
