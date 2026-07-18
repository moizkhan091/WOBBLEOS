/**
 * Additive commercial architecture (execution-order step 10) — assemble a company's full commercial journey
 * lineage (org → qualification → opportunity → meeting → discovery → artifact → project) from existing records,
 * with the additive aliases (Opportunity Snapshot / Paid Transformation Audit / Proposal) as views. Pure read.
 *
 * Run:  DATABASE_URL=… npx tsx src/scripts/prove-commercial-journey.ts
 */
import { closeDb } from "@/db";
import { listCompanies } from "@/lib/crm";
import { getCommercialJourney } from "@/lib/commercial-journey";

async function main() {
  const company = (await listCompanies({ includeArchived: true, limit: 500 })).find((c) => /Nova Dental/i.test(c.name));
  if (!company) throw new Error("Nova Dental prospect not found — run prove-qualification first");

  const j = await getCommercialJourney(company.id);
  console.log(`  COMPANY: ${j.company.name} (${j.company.industry}) — status ${j.company.status}`);
  console.log(`  JOURNEY STAGE (furthest reached): ${j.stage.toUpperCase()}`);
  console.log(`  qualification: ${j.qualification ? `Grade ${j.qualification.grade} (${j.qualification.overallScore}/100) — ${j.qualification.recommendation}` : "none"}`);
  console.log(`  opportunities (Opportunity Snapshots): ${j.opportunities.length}`);
  for (const o of j.opportunities) console.log(`     • ${o.name} [${o.stage}] audits=${o.linkedAuditIds.length} proposal=${o.linkedProposalId ?? "-"} projects=${o.linkedProjectIds.length}`);
  console.log(`  meetings: ${j.meetings.length}, discovery facts: ${j.discoveryFactCount} (approved on top meeting: ${j.meetings[0]?.approvedDiscoveryFacts ?? 0})`);
  for (const m of j.meetings) console.log(`     • ${m.title} [${m.meetingType}] facts=${m.discoveryFactCount} approved=${m.approvedDiscoveryFacts}`);
  console.log(`  artifacts: Paid Transformation Audits=${j.paidTransformationAudits.length}, free audits=${j.freeAudits}, proposals=${j.proposals.length}, projects=${j.projects.length}`);
  console.log("  DONE: commercial journey lineage assembled (org → qualification → opportunity → meeting → discovery → artifact → project).");
}

main().then(() => closeDb()).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
