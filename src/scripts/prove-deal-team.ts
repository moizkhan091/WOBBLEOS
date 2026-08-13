/**
 * Run all four deal-team agents against a real client and print what they actually say.
 *
 * The context they read was rebuilt three times (the price of zero, the missing cost basis, the cost
 * printed in the quote's currency) and each of those was found by PRINTING the string an agent
 * receives, never by reading the code. This script closes that loop: it runs the agents themselves so
 * the output can be judged, not assumed.
 *
 * Usage: npx tsx src/scripts/prove-deal-team.ts [companyName]
 * Costs roughly four provider calls. Nothing is sent to anyone.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { crmCompanies, proposals } from "@/db/schema";
import { draftFollowUp, generateObjectionBrief, loadDealTeamContext, reviewProposalBeforeSending } from "@/lib/deal-team";
import { renderContext } from "@/lib/domain/deal-team";

function line(s = "") {
  process.stdout.write(s + "\n");
}

async function main() {
  const wanted = process.argv[2];
  const db = getDb();
  const companies = await db.select().from(crmCompanies).limit(200);
  const company = wanted ? companies.find((c) => c.name.toLowerCase().includes(wanted.toLowerCase())) : companies.find((c) => c.name.includes("Bright Smile")) ?? companies[0];
  if (!company) throw new Error("no company to test against");

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.companyId, company.id), isNull(proposals.archivedAt)))
    .orderBy(desc(proposals.createdAt))
    .limit(1);

  line(`CLIENT: ${company.name} (${company.industry ?? "no industry"})`);
  line(`PROPOSAL: ${proposal ? `${proposal.title}, ${proposal.currency} ${(proposal.pricingCents / 100).toLocaleString()}, ${proposal.status}` : "none"}`);
  line();

  const ctx = await loadDealTeamContext(company.id, proposal?.id);
  if (!ctx) throw new Error("no context");
  const rendered = renderContext(ctx);
  line("=== WHAT THE AGENTS ARE TOLD ===");
  line(rendered.slice(0, 2600));
  line();

  line("=== OBJECTION HANDLER ===");
  try {
    const brief = await generateObjectionBrief(company.id);
    for (const o of brief.objections) {
      line(`- [${o.likelihood}] ${o.objection}`);
      line(`  rooted in: ${o.rootedIn}`);
      line(`  answer: ${o.answer}`);
      if (o.proof) line(`  proof: ${o.proof}`);
    }
  } catch (e) {
    line(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }
  line();

  line("=== FOLLOW-UP WRITER (whatsapp) ===");
  try {
    const draft = await draftFollowUp(company.id, { channel: "whatsapp" });
    line(draft.body);
    line(`asks for: ${draft.asksFor}`);
    line(`grounded in: ${draft.groundedIn}`);
    const claims = (draft as { unverifiedClaims?: string[] }).unverifiedClaims;
    if (claims?.length) line(`DO NOT SEND AS WRITTEN: ${claims.join(" | ")}`);
  } catch (e) {
    line(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }
  line();

  if (proposal) {
    line("=== PRE-SEND REVIEW (reviewer + pricing analyst) ===");
    try {
      const review = await reviewProposalBeforeSending(proposal.id);
      if (review.critique) {
        line(`verdict: ${review.critique.verdict}`);
        line(`headline: ${review.critique.headline}`);
        for (const i of review.critique.items) line(`- [${i.severity}] (${i.where}) ${i.issue}\n  fix: ${i.fix}`);
      }
      if (review.pricing) {
        line(`pricing verdict: ${review.pricing.verdict}`);
        line(`headline: ${review.pricing.headline}`);
        if (review.pricing.affordability) line(`affordability: ${review.pricing.affordability}`);
        for (const n of review.pricing.notes) line(`- ${n}`);
      }
      if (review.failures.length) line(`FAILURES: ${review.failures.join("; ")}`);
    } catch (e) {
      line(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
