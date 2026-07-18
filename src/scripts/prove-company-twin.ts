/**
 * Onboard WOBBLE itself as the OS's canonical Company Twin — using ONLY existing primitives (no new
 * table): a `crm_companies` self-record (status "internal") + the `company` / `brand` / `design` /
 * `offer` memory banks seeded with WOBBLE truth taken faithfully from docs/WOBBLE_COMPANY_OS.md. The
 * already-ingested offers module holds the service catalogue. Idempotent: the company is matched by
 * name; memory records dedupe on content, so re-running does not pile up duplicates.
 *
 * Run:  DATABASE_URL=…@127.0.0.1:15432/wobble_os npx tsx src/scripts/prove-company-twin.ts
 */
import { closeDb } from "@/db";
import { addCompany, listCompanies } from "@/lib/crm";
import { createMemoryRecord, retrieveMemoryContext } from "@/lib/memory";
import type { MemoryTier, TrustLevel } from "@/lib/domain/memory";

const FOUNDER = "Moiz";

interface TwinFact {
  bank: string;
  area: string;
  title: string;
  content: string;
  tier: MemoryTier;
  trust: TrustLevel;
}

// Every fact below is condensed from docs/WOBBLE_COMPANY_OS.md — WOBBLE's own source of truth. Nothing invented.
const FACTS: TwinFact[] = [
  // ---- company bank: WOBBLE truth, positioning, strategy (core / founder_core) ----
  {
    bank: "company", area: "company_identity", tier: "core", trust: "founder_core",
    title: "WOBBLE identity & category",
    content:
      "WOBBLE is an AI-first transformation company for Pakistani businesses. It installs custom AI Operating Systems — AI employees, automations, dashboards, workflows, knowledge bases, SOPs, tool connections, and team training — inside businesses. It does NOT sell random AI tools, one-off automations, or hidden agency output. Core line: 'They sell you outputs. We build your operating system.' Category phrase: AI Workforce Company. Primary offer: Wobble AI OS.",
  },
  {
    bank: "company", area: "company_mission", tier: "core", trust: "founder_core",
    title: "WOBBLE mission",
    content:
      "Mission: bring Pakistani businesses into the AI race before the global market gap becomes impossible to close — by installing custom AI Operating Systems, training teams, and turning manual operations into intelligent systems. Belief: AI capability should live inside the business, not be gatekept by agencies. 'Replace repetitive work. Upgrade the people.' Team-safe: 'We do not replace your team. We upgrade them with AI employees.'",
  },
  {
    bank: "company", area: "company_offer_process", tier: "core", trust: "founder_core",
    title: "What WOBBLE sells — fixed process, custom scope",
    content:
      "WOBBLE sells a fixed process with custom scope, in four steps: (1) AI Readiness Call — free qualifier ('The call is free. The diagnosis is not.'); (2) Wobble AI OS Audit — first paid product, a deep business + technical diagnosis; (3) Wobble AI OS Buildout — custom-priced implementation, all systems or one high-leverage workflow or phased; (4) AI Transformation Partnership — monthly ongoing optimization, new buildouts, training, reviews. The process is consistent; the scope is custom.",
  },
  {
    bank: "company", area: "company_pricing", tier: "core", trust: "founder_core",
    title: "WOBBLE pricing philosophy",
    content:
      "Pricing: the deep audit is NEVER free — 'We do not do free audits. We do real audits.' Model: free AI Readiness Call, paid Wobble AI OS Audit, custom-priced buildout, monthly AI Transformation Partnership. Pricing varies by complexity, company stage, scope, number of departments, depth of audit, and first implementation phase.",
  },
  {
    bank: "company", area: "company_icp", tier: "core", trust: "founder_core",
    title: "WOBBLE ICP — Pakistan-first, readiness-filtered",
    content:
      "ICP is Pakistan-first, filtered by readiness / urgency / operational pain — NOT by industry. Core ICP: owner-led growth businesses in Pakistan with real operations, messy workflows, pressure to scale, and budget for serious transformation. Strongest first market: established SMBs. Wedges: ecommerce/retail, real estate, agencies, clinics/education/services, funded startups, and Pakistani businesses operating globally (global-facing AI workflows, not 'international clients').",
  },
  {
    bank: "company", area: "company_enemy", tier: "core", trust: "founder_core",
    title: "WOBBLE's enemy — agency dependency",
    content:
      "WOBBLE is anti-agency-DEPENDENCY, not anti-AI. Enemy = the outdated agency model that keeps businesses dependent while hiding the process, owning the system, and selling outputs. Public contrast: 'Most agencies are becoming AI middlemen. Wobble installs the capability inside your business.' Attack the MODEL, never named companies or people without evidence and legal clearance.",
  },
  {
    bank: "company", area: "company_payment_boundary", tier: "core", trust: "founder_core",
    title: "WOBBLE payment boundary",
    content:
      "Payment boundary: 'AI can prepare the paperwork. Humans approve the money.' WOBBLE can draft invoices, prepare payment reminders, organize receivables/payables, summarize outstanding invoices, and prepare reconciliation reports — but NEVER promises AI sending, approving, or moving money, or making final financial decisions, as a default part of the AI OS.",
  },
  {
    bank: "company", area: "company_data_moat", tier: "core", trust: "founder_core",
    title: "WOBBLE data moat (internal only)",
    content:
      "INTERNAL STRATEGY ONLY: WOBBLE's long-term moat is learning from audits, implementations, business workflows, and anonymized operational benchmarks across Pakistani companies. Never publicly frame this as 'we monetize client data' (trust killer). Public-safe framing: 'Wobble learns from implementation patterns and anonymized operational benchmarks while protecting client privacy.' Do not mention SaaS in public positioning yet.",
  },
  // ---- brand bank: voice, do-not-say, positioning (core / founder_core) ----
  {
    bank: "brand", area: "brand_voice", tier: "core", trust: "founder_core",
    title: "WOBBLE voice",
    content:
      "WOBBLE voice is hybrid: lead with rebellion, close with trust. It is rebellious, cut-throat, direct, anti-agency-dependency, founder-led, educational, slightly dangerous, and business-serious underneath. Founder voice can be raw and polarizing; company voice stays premium but still sharp. Rule: 'If the copy could sit comfortably on a generic marketing agency website, it is not Wobble copy.' It is NOT polite corporate jargon, fake guru hype, random insults, or empty shock content.",
  },
  {
    bank: "brand", area: "brand_controversy", tier: "core", trust: "founder_core",
    title: "WOBBLE controversy doctrine",
    content:
      "Controversy doctrine: 'Be ruthless with models. Be precise with facts.' Attack the agency MODEL, not named companies or people. Make the punch true (accuracy, not fake outrage). Follow every attack with the WOBBLE alternative. No defamation, no personal beef, no cheap controversy. WOBBLE punches the old agency model, then calmly shows the new operating system.",
  },
  {
    bank: "brand", area: "brand_do_not_say", tier: "core", trust: "founder_core",
    title: "WOBBLE do-not-say list",
    content:
      "DO NOT SAY: 'we are a SaaS company', 'we work with everyone', 'we fully replace your employees', 'we automate everything', 'we monetize client data', 'guaranteed results in 30 days', 'no human needed', 'AI will handle your payments', 'all agencies are scammers', or named attacks on specific agencies without evidence. SAY INSTEAD: fixed process / custom scope; replace repetitive work, upgrade the people; audit first, build second; human review where it matters; AI capability belongs inside the business.",
  },
  {
    bank: "brand", area: "brand_language_system", tier: "core", trust: "founder_core",
    title: "WOBBLE language system",
    content:
      "Language system — use with intention: 'AI Employees' = main public phrase (website, social, brand, client-facing). 'AI Agents' = technical/architecture phrase (docs, build specs, implementation plans). 'AI Teammates' = employee-safe adoption phrase (workshops, training, change management). 'Automations' = repeated workflows, data movement, reports, pipelines. Recommended public phrase: 'AI employees and automations inside your business.'",
  },
  {
    bank: "brand", area: "brand_positioning", tier: "core", trust: "founder_core",
    title: "WOBBLE master positioning",
    content:
      "Master positioning: 'Wobble installs custom AI Operating Systems inside Pakistani businesses, combining AI employees, automations, dashboards, and team training so companies can move faster, sell smarter, and stop falling behind.' One-liner: 'Wobble builds custom AI Operating Systems for Pakistani businesses.' Aggressive campaign line: 'Most agencies are becoming AI middlemen. They keep the system. Wobble installs it inside your business.'",
  },
  // ---- design bank: WOBBLE Design DNA (working / founder_core) ----
  {
    bank: "design", area: "design_dna_palette", tier: "working", trust: "founder_core",
    title: "WOBBLE Design DNA — palette & feel",
    content:
      "WOBBLE Design DNA (color): primary electric lime #B8FF2C. Core palette: black / near-black, white, electric lime. Accent palette: deep blue and orange ONLY when needed, never as the core mood. Visual feel: dark interface, electric intelligence, movement, future-work energy.",
  },
  {
    bank: "design", area: "design_dna_motifs", tier: "working", trust: "founder_core",
    title: "WOBBLE Design DNA — motifs & promise",
    content:
      "WOBBLE Design DNA (form): graphic motifs are orb/sphere, distorted W, motion trail, dot fields, line waves, and a consistent icon system. Logo direction: minimal wordmark or iconic wobble dot/orb. Personality: bold, fast, unpredictable, intelligent, rebellious. Visual promise: NOT corporate SaaS beige, NOT generic AI blue, NOT agency pastel — WOBBLE should look like a system from the future entering Pakistani business.",
  },
  // ---- offer bank: the first paid offer in detail (working / approved_expert) ----
  {
    bank: "offer", area: "offer_ai_os_audit", tier: "working", trust: "approved_expert",
    title: "Wobble AI OS Audit — the first paid offer",
    content:
      "Wobble AI OS Audit (first paid offer): a deep business + technical diagnosis mapping where AI creates the most leverage across the company, turned into a clear implementation roadmap. Outputs: current-state business map, workflow bottleneck map, AI opportunity map, priority chart (automate 1st / 2nd / 3rd), recommended AI OS architecture, dashboard + AI-employee + automation + tool recommendations, data/SOP/knowledge needs, training needs, implementation timeline and phases, safety and human-review requirements, and a final report the client can use internally or with any builder. Promise: 'The audit alone should make your business smarter.'",
  },
];

async function upsertSelfCompany() {
  const existing = (await listCompanies({ includeArchived: true, limit: 500 })).find(
    (c) => c.name.trim().toLowerCase() === "wobble",
  );
  if (existing) {
    console.log(`  company twin: reusing existing WOBBLE self-record ${existing.id} (status=${existing.status})`);
    return existing;
  }
  const row = await addCompany({
    name: "WOBBLE",
    legalName: "WOBBLE",
    industry: "AI Transformation",
    website: "wobblepk.com",
    country: "Pakistan",
    status: "internal",
    clientType: "self",
    companySize: "startup",
    notes: "WOBBLE itself — the Company Twin. AI-first transformation company installing custom AI Operating Systems inside Pakistani businesses.",
    tags: ["company-twin", "internal", "wobble"],
    metadata: { isCompanyTwin: true, source: "docs/WOBBLE_COMPANY_OS.md" },
    createdBy: FOUNDER,
  });
  console.log(`  company twin: created WOBBLE self-record ${row.id} (status=${row.status})`);
  return row;
}

async function main() {
  const twin = await upsertSelfCompany();

  let created = 0;
  let deduped = 0;
  const perBank: Record<string, number> = {};
  for (const f of FACTS) {
    const before = f.title;
    const rec = await createMemoryRecord({
      title: f.title,
      content: f.content,
      area: f.area,
      memoryTier: f.tier,
      trustLevel: f.trust,
      bankSlugs: [f.bank],
      createdBy: FOUNDER,
    });
    // dedupe returns the pre-existing record when content already present; detect by title mismatch.
    if (rec.title === before) {
      perBank[f.bank] = (perBank[f.bank] ?? 0) + 1;
      created += 1;
    } else {
      deduped += 1;
    }
  }
  console.log(`  memory: ${created} twin facts present across banks ${JSON.stringify(perBank)} (${deduped} were pre-existing duplicates)`);

  // Prove the twin is QUERYABLE — semantic retrieval over the seeded banks.
  const preview = (chunks: Array<{ content: string }>) => chunks.slice(0, 3).map((c) => c.content.slice(0, 60));
  const q1 = await retrieveMemoryContext({ query: "What does WOBBLE sell and how is it priced?", limit: 3 });
  const q2 = await retrieveMemoryContext({ query: "What is WOBBLE's brand voice and what must we never say?", limit: 3 });
  const q3 = await retrieveMemoryContext({ query: "What is WOBBLE's primary brand color and visual design?", limit: 3 });
  console.log("  retrieval 'what does WOBBLE sell' ->", preview(q1));
  console.log("  retrieval 'brand voice / do-not-say' ->", preview(q2));
  console.log("  retrieval 'brand color / design' ->", preview(q3));
  console.log(`  company twin id=${twin.id} — WOBBLE onboarded as the canonical Company Twin.`);
}

main().then(() => closeDb()).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
