/**
 * Qualification Council (execution-order step 9) — qualify a real CRM prospect through the 8 council roles
 * (deterministic policy signals + evidence-LLM), producing an A–E grade + recommendation, persisted versioned.
 *
 * Run:  DATABASE_URL=… OPENROUTER_API_KEY=… npx tsx src/scripts/prove-qualification.ts
 */
import { closeDb } from "@/db";
import { addCompany, listCompanies } from "@/lib/crm";
import { runQualification, listQualifications, getQualificationDetail } from "@/lib/qualification";

async function main() {
  // Find or create a representative WOBBLE-ICP prospect (a Pakistani dental SMB with manual front-desk pain).
  const NAME = "Nova Dental Karachi (UAT prospect)";
  let company = (await listCompanies({ includeArchived: true, limit: 500 })).find((c) => c.name === NAME);
  if (!company) {
    company = await addCompany({
      name: NAME, industry: "dental / med spa", website: "novadental.example.pk", country: "Pakistan",
      companySize: "smb", status: "qualified_prospect",
      notes: "3 clinics in Karachi. Front desk drowns in WhatsApp + missed calls; owner keen to modernise but wary of agencies. No CRM. High appointment volume.",
      tags: ["uat", "qualification-prospect"], createdBy: "Moiz",
    });
    console.log(`  created prospect ${company.id}`);
  } else {
    console.log(`  reusing prospect ${company.id}`);
  }

  const { assessment, roles } = await runQualification(company.id, { actor: "Moiz" });
  console.log(`  GRADE: ${assessment.grade} (${assessment.overallScore}/100, version ${assessment.version})`);
  console.log(`  ${assessment.recommendation}`);
  console.log("  roles:");
  for (const r of roles.sort((a, b) => b.score - a.score)) {
    console.log(`    ${String(r.score).padStart(3)}  ${r.role.padEnd(24)} ${r.policyNote ? "[policy] " : "         "}— ${r.rationale.slice(0, 60)}`);
  }

  const runs = await listQualifications(company.id, 10);
  const storedRoles = await getQualificationDetail(assessment.id);
  console.log(`  persisted: ${runs.length} assessment(s), latest grade=${runs[0]?.grade}, ${storedRoles.length} role rows for ${assessment.id}`);
  if (storedRoles.length !== 8) throw new Error(`expected 8 stored roles, got ${storedRoles.length}`);
  console.log("  DONE: Qualification Council proven live (policy + LLM → 8 roles → A-E grade → versioned persistence).");
}

main().then(() => closeDb()).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
