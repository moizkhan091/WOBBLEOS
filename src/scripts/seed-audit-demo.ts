/**
 * Seed realistic demo data for a hands-on UI/UX audit (local only — never run against production).
 *
 * Empty states are easy to make look good; the bugs live where real data is long, numerous, and messy.
 * This seeds companies/contacts/opportunities spread across pipeline stages (including deliberately LONG
 * names and large values to expose truncation/overflow), leads at several scores, meetings, proposals,
 * invoices, and tasks.
 *
 * Run: DATABASE_URL=... npx tsx src/scripts/seed-audit-demo.ts
 */
import { addCompany, addContact, addLead, addOpportunity, moveOpportunityStage } from "@/lib/crm";
import { addMeeting } from "@/lib/meetings";
import { createProposal } from "@/lib/proposals";
import { createInvoice } from "@/lib/finance";
import type { AuditEventInput } from "@/lib/domain/audit";

const noAudit = async (_: AuditEventInput) => {};

const COMPANIES = [
  { name: "Northline Dental Group", industry: "Dental", stage: "qualified", value: 480_000 },
  { name: "Harbourfront Construction & Civil Engineering Partners LLP", industry: "Construction", stage: "proposal_sent", value: 2_450_000 },
  { name: "Lumen SaaS", industry: "B2B SaaS", stage: "ai_readiness_call_booked", value: 180_000 },
  { name: "Verde Landscaping", industry: "Home Services", stage: "paid_audit_sold", value: 95_000 },
  { name: "Atlas Legal", industry: "Legal", stage: "negotiation", value: 1_200_000 },
  { name: "Peak Physio", industry: "Healthcare", stage: "won", value: 320_000 },
  { name: "Cobalt Logistics", industry: "Logistics", stage: "contacted", value: 640_000 },
  { name: "Rivera Real Estate", industry: "Real Estate", stage: "audit_delivered", value: 750_000 },
];

const LEADS = [
  { name: "Sana Malik", company: "Bright Smile Orthodontics", intent: "high", urgency: "high", source: "referral" },
  { name: "Tom Becker", company: "Becker HVAC", intent: "medium", urgency: "low", source: "inbound" },
  { name: "Priya Raman", company: "Raman Accounting Associates and Advisory Services", intent: "high", urgency: "medium", source: "linkedin" },
  { name: "Marcus Webb", company: "Webb Fitness", intent: "low", urgency: "unknown", source: "cold_email" },
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  if (process.env.NODE_ENV === "production") throw new Error("refusing to seed demo data in production");
  const deps = { recordAudit: noAudit };
  let opps = 0;

  for (const c of COMPANIES) {
    const co = await addCompany({ name: c.name, industry: c.industry, createdBy: "Moiz" } as Parameters<typeof addCompany>[0], deps);
    await addContact({ companyId: co.id, fullName: `${c.name.split(" ")[0]} Owner`, email: `owner@${c.name.split(" ")[0].toLowerCase()}.com` } as Parameters<typeof addContact>[0], deps);
    const opp = await addOpportunity(
      { name: `${c.name} — AI workforce build`, companyId: co.id, valueCents: c.value, createdBy: "Moiz" } as Parameters<typeof addOpportunity>[0],
      deps,
    );
    opps += 1;
    if (c.stage !== "new_lead") {
      await moveOpportunityStage(opp.id, c.stage as never, { actor: "Moiz", reason: "demo seed" }).catch(() => {});
    }
    await addMeeting({ title: `${c.name} — AI readiness call`, meetingType: "ai_readiness_call", companyId: co.id } as Parameters<typeof addMeeting>[0], deps).catch(() => {});
    if (["proposal_sent", "negotiation", "won"].includes(c.stage)) {
      await createProposal({ title: `${c.name} — Wobble AI OS Proposal`, companyId: co.id, opportunityId: opp.id, pricingCents: c.value, createdBy: "Moiz" } as Parameters<typeof createProposal>[0], deps).catch(() => {});
    }
    if (c.stage === "won") {
      await createInvoice({ lineItems: [{ description: "AI OS implementation", quantity: 1, unitPriceCents: c.value }], dueDate: new Date(Date.now() + 14 * 86_400_000), createdBy: "Moiz" } as Parameters<typeof createInvoice>[0], deps).catch(() => {});
    }
  }

  for (const l of LEADS) {
    await addLead({
      name: l.company, contactName: l.name, companyName: l.company, source: l.source,
      intentLevel: l.intent, urgencyLevel: l.urgency, createdBy: "Moiz",
    } as Parameters<typeof addLead>[0], deps).catch((e) => console.error("lead failed:", l.name, e instanceof Error ? e.message : e));
  }

  console.log(`seeded: ${COMPANIES.length} companies, ${opps} opportunities across stages, ${LEADS.length} leads`);
  process.exit(0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
