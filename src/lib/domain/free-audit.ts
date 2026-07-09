import { z } from "zod";
import { newId } from "@/lib/ids";

/**
 * Free Audit engine (pure, testable) — the top-of-funnel money-maker.
 *
 * v1 is a DETERMINISTIC diagnoser grounded in the real Wobble service catalog: a prospect's
 * current-state signals + stated problems map to the relevant Wobble services, quick wins, and an
 * opportunity map. Runs with zero LLM spend and is fully verifiable. The multi-agent LLM team
 * (social scrape via Apify, deeper reasoning, premium report writing) layers on top later — same
 * pattern as "Plan my feed". Free = "what we can do" without a deep audit (don't gatekeep — it
 * protects conversion); the Paid Audit is the McKinsey-depth engagement (separate module/team).
 */

export const FREE_AUDIT_MODULE = "free_audit";

// ---------------------------------------------------------------- Wobble service catalog
// The full menu (the founder: "it needs to know ALL our services"). category + the problem signals
// each service resolves. Kept as data so the diagnoser and the future LLM team both read one source.

export interface WobbleService {
  slug: string;
  name: string;
  category: "lead_capture" | "speed_to_lead" | "booking" | "sales_followup" | "retention" | "reputation" | "ads" | "content" | "ops" | "support" | "ecommerce" | "analytics";
  solves: string[]; // problem-signal keywords
  quickWin: boolean; // low-effort, fast ROI — surfaced first
}

export const WOBBLE_SERVICES: WobbleService[] = [
  { slug: "speed-to-lead-system", name: "Speed-to-Lead System", category: "speed_to_lead", solves: ["slow_response", "missing_leads", "leads_go_cold"], quickWin: true },
  { slug: "missed-call-text-back-system", name: "Missed-Call Text-Back", category: "speed_to_lead", solves: ["missed_calls", "no_after_hours", "phone_unanswered"], quickWin: true },
  { slug: "website-chat-booking-agent", name: "Website Chat + Booking Agent", category: "booking", solves: ["no_website_chat", "website_no_booking", "visitors_leave"], quickWin: true },
  { slug: "appointment-setter-system", name: "AI Appointment Setter", category: "booking", solves: ["manual_booking", "low_show_rate", "slow_scheduling"], quickWin: false },
  { slug: "no-show-reduction-system", name: "No-Show Reduction", category: "booking", solves: ["no_show", "no_shows", "missed_appointments"], quickWin: true },
  { slug: "ai-receptionist-system", name: "AI Receptionist", category: "speed_to_lead", solves: ["phone_unanswered", "front_desk_cost", "no_after_hours"], quickWin: false },
  { slug: "dental-medspa-front-desk-system", name: "Dental / Medspa Front Desk", category: "booking", solves: ["front_desk_cost", "manual_booking", "no_after_hours"], quickWin: false },
  { slug: "home-services-booking-system", name: "Home-Services Booking", category: "booking", solves: ["manual_booking", "missed_calls", "quote_delays"], quickWin: false },
  { slug: "sales-follow-up-system", name: "Sales Follow-Up System", category: "sales_followup", solves: ["no_followup", "leads_go_cold", "manual_followup"], quickWin: true },
  { slug: "quote-follow-up-system", name: "Quote Follow-Up", category: "sales_followup", solves: ["quotes_ignored", "no_followup", "quote_delays"], quickWin: true },
  { slug: "missed-lead-recovery-system", name: "Missed-Lead Recovery", category: "sales_followup", solves: ["missing_leads", "leads_go_cold", "no_followup"], quickWin: false },
  { slug: "crm-pipeline-automation", name: "CRM & Pipeline Automation", category: "ops", solves: ["no_crm", "manual_data_entry", "disorganized_pipeline"], quickWin: false },
  { slug: "customer-reactivation-system", name: "Customer Reactivation", category: "retention", solves: ["dormant_customers", "low_repeat", "no_retention"], quickWin: true },
  { slug: "abandoned-cart-retention-system", name: "Abandoned-Cart Retention", category: "ecommerce", solves: ["cart_abandonment", "low_repeat", "ecom"], quickWin: true },
  { slug: "ecommerce-growth-system", name: "E-commerce Growth System", category: "ecommerce", solves: ["ecom", "low_repeat", "low_aov"], quickWin: false },
  { slug: "review-reputation-system", name: "Review & Reputation", category: "reputation", solves: ["few_reviews", "bad_reputation", "no_review_asks"], quickWin: true },
  { slug: "referral-word-of-mouth-system", name: "Referral / Word-of-Mouth", category: "retention", solves: ["no_referrals", "low_repeat"], quickWin: true },
  { slug: "ai-ads-strategy-launch", name: "AI Ads Strategy & Launch", category: "ads", solves: ["not_running_ads", "no_ads", "want_more_leads"], quickWin: false },
  { slug: "ai-ads-management-optimization", name: "AI Ads Management", category: "ads", solves: ["ads_underperforming", "wasted_ad_spend"], quickWin: false },
  { slug: "ai-ads-tracking-intelligence", name: "Ads Tracking & Intelligence", category: "analytics", solves: ["no_tracking", "cant_measure_ads"], quickWin: false },
  { slug: "ai-creative-engine", name: "AI Creative Engine", category: "content", solves: ["ad_fatigue", "no_creative", "slow_content"], quickWin: false },
  { slug: "ai-content-repurposing", name: "AI Content Repurposing", category: "content", solves: ["slow_content", "not_posting", "inconsistent_content"], quickWin: true },
  { slug: "ai-product-creative", name: "AI Product Creative", category: "content", solves: ["no_creative", "ecom", "slow_content"], quickWin: false },
  { slug: "inbox-dm-management-system", name: "Inbox & DM Management", category: "support", solves: ["slow_dms", "missed_dms", "manual_inbox"], quickWin: true },
  { slug: "customer-support-agent-system", name: "AI Customer Support Agent", category: "support", solves: ["support_overload", "slow_support", "repetitive_tickets"], quickWin: false },
  { slug: "ai-email-sms-flows", name: "AI Email / SMS Flows", category: "retention", solves: ["no_nurture", "no_email", "low_repeat"], quickWin: true },
  { slug: "landing-page-cro", name: "Landing Page CRO", category: "lead_capture", solves: ["low_conversion", "website_no_booking", "visitors_leave"], quickWin: false },
  { slug: "search-visibility-system", name: "Search Visibility (SEO/GEO)", category: "analytics", solves: ["low_traffic", "not_found_online", "no_seo"], quickWin: false },
  { slug: "ai-invoice-chaser", name: "AI Invoice Chaser", category: "ops", solves: ["unpaid_invoices", "manual_followup", "cashflow"], quickWin: true },
  { slug: "ai-data-entry", name: "AI Data Entry", category: "ops", solves: ["manual_data_entry", "admin_overload"], quickWin: true },
  { slug: "ai-workflow-automation", name: "AI Workflow Automation", category: "ops", solves: ["manual_process", "admin_overload", "repetitive_tasks"], quickWin: false },
  { slug: "ai-company-brain", name: "AI Company Brain", category: "ops", solves: ["scattered_knowledge", "no_sops", "onboarding_slow"], quickWin: false },
  { slug: "ai-internal-knowledge-assistant", name: "Internal Knowledge Assistant", category: "ops", solves: ["scattered_knowledge", "no_sops"], quickWin: false },
  { slug: "owners-report-dashboard", name: "Owner's Report Dashboard", category: "analytics", solves: ["no_visibility", "no_reporting", "flying_blind"], quickWin: false },
];

export const SERVICE_BY_SLUG = new Map(WOBBLE_SERVICES.map((s) => [s.slug, s]));

// ---------------------------------------------------------------- intake + diagnosis

export const AUDIT_SIGNALS = [
  "missed_calls", "slow_response", "no_website_chat", "website_no_booking", "no_followup", "no_crm",
  "not_running_ads", "ads_underperforming", "few_reviews", "no_referrals", "manual_data_entry",
  "no_after_hours", "slow_dms", "cart_abandonment", "no_nurture", "no_show", "unpaid_invoices",
  "not_posting", "no_seo", "no_visibility",
] as const;
export type AuditSignal = (typeof AUDIT_SIGNALS)[number];

export const runAuditSchema = z.object({
  companyId: z.string().trim().min(1).optional(),
  opportunityId: z.string().trim().min(1).optional(),
  businessName: z.string().trim().min(1),
  industry: z.string().trim().min(1).optional(),
  problems: z.array(z.string().trim().min(1)).default([]),
  signals: z.array(z.string().trim().min(1)).default([]),
  monthlyLeads: z.number().int().min(0).optional(),
  avgDealValueCents: z.number().int().min(0).optional(),
  createdBy: z.string().trim().min(1).optional(),
});
export type RunAuditInput = z.input<typeof runAuditSchema>;

export interface AuditOpportunity {
  service: string;
  name: string;
  category: string;
  quickWin: boolean;
  reason: string;
  impact: "high" | "medium" | "low";
}

export interface AuditReport {
  businessName: string;
  industry: string | null;
  summary: string;
  quickWins: AuditOpportunity[];
  opportunities: AuditOpportunity[];
  serviceCount: number;
  estimatedMonthlyUpsideCents: number | null;
}

function normalizeSignal(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Map current-state signals + free-text problems to matching Wobble services (deterministic). */
export function diagnose(input: RunAuditInput): AuditReport {
  const p = runAuditSchema.parse(input);
  const signalSet = new Set(p.signals.map(normalizeSignal));
  const problemText = p.problems.join(" ").toLowerCase();

  const matched = new Map<string, AuditOpportunity>();
  for (const svc of WOBBLE_SERVICES) {
    const hitSignal = svc.solves.find((k) => signalSet.has(k));
    const hitProblem = svc.solves.find((k) => problemText.includes(k.replace(/_/g, " ")) || problemText.includes(k));
    const trigger = hitSignal ?? hitProblem;
    if (!trigger) continue;
    matched.set(svc.slug, {
      service: svc.slug,
      name: svc.name,
      category: svc.category,
      quickWin: svc.quickWin,
      reason: `addresses "${trigger.replace(/_/g, " ")}"`,
      impact: svc.quickWin ? "high" : hitSignal ? "medium" : "low",
    });
  }

  const all = [...matched.values()].sort((a, b) => (a.quickWin === b.quickWin ? 0 : a.quickWin ? -1 : 1));
  const quickWins = all.filter((o) => o.quickWin);

  let estimatedMonthlyUpsideCents: number | null = null;
  if (p.monthlyLeads && p.avgDealValueCents) {
    const recoverable = Math.round(p.monthlyLeads * 0.15); // speed/follow-up/booking recover ~15% of leaked leads
    estimatedMonthlyUpsideCents = recoverable * p.avgDealValueCents;
  }

  const summary = all.length
    ? `${p.businessName} shows ${all.length} AI opportunit${all.length === 1 ? "y" : "ies"} across ${new Set(all.map((o) => o.category)).size} areas, with ${quickWins.length} quick win${quickWins.length === 1 ? "" : "s"} to start.`
    : `No clear gaps detected from the signals given — a live call would surface more.`;

  return { businessName: p.businessName, industry: p.industry ?? null, summary, quickWins, opportunities: all, serviceCount: all.length, estimatedMonthlyUpsideCents };
}

// ---------------------------------------------------------------- persistence row

export interface AuditRow {
  id: string;
  kind: string; // free | paid
  companyId: string | null;
  opportunityId: string | null;
  businessName: string;
  status: string;
  report: AuditReport;
  input: Record<string, unknown>;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function buildAuditRow(input: RunAuditInput, report: AuditReport, opts: { now?: Date; id?: string; kind?: string } = {}): AuditRow {
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("audit"),
    kind: opts.kind ?? "free",
    companyId: input.companyId ?? null,
    opportunityId: input.opportunityId ?? null,
    businessName: input.businessName,
    status: "complete",
    report,
    input: { problems: input.problems ?? [], signals: input.signals ?? [], monthlyLeads: input.monthlyLeads, avgDealValueCents: input.avgDealValueCents, industry: input.industry },
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
