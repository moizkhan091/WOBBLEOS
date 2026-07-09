import { z } from "zod";
import type { ProviderMessage } from "@/lib/providers";
import { WOBBLE_SERVICES } from "@/lib/domain/free-audit";

/**
 * Paid Audit Graph (pure domain) — the McKinsey-depth AI audit team.
 *
 * SEPARATE from the Free Audit (the founder was explicit: not one AI doing both). Five distinct
 * agent_runs, each its own model role, grounded in the intake + Free-Audit diagnosis + brand Brain +
 * the FULL Wobble service catalog: Discovery/current-state -> Opportunity identification ->
 * Prioritization (impact/difficulty) -> 12-month Roadmap -> ROI + executive report. Mirrors the
 * content-graph pattern (parse-or-throw strict JSON per node, provenance, assembly). Orchestrator +
 * IO live in src/lib/paid-audit-graph. Artifact spec: WOBBLE_COMPANY_OS lines 199-215.
 */

export const PAID_AUDIT_MODULE = "paid_audit";
export const PAID_AUDIT_JOB_TYPE = "audit.paid";
export const PAID_AUDIT_QUEUE = "general";

export const PAID_AUDIT_ROLES = {
  discovery: "audit_discovery",
  opportunity: "audit_opportunity",
  prioritization: "audit_prioritization",
  roadmap: "audit_roadmap",
  report: "audit_report",
} as const;

export const PAID_AUDIT_AGENTS = {
  discovery: "audit_discovery_mapper",
  opportunity: "audit_opportunity_finder",
  prioritization: "audit_prioritizer",
  roadmap: "audit_roadmap_architect",
  report: "audit_report_writer",
} as const;

const LEVEL = z.enum(["low", "medium", "high"]);

// ---------------------------------------------------------------- node schemas

export const discoverySchema = z.object({
  acquisition: z.array(z.string().trim().min(1)).default([]),
  delivery: z.array(z.string().trim().min(1)).default([]),
  support: z.array(z.string().trim().min(1)).default([]),
  bottlenecks: z.array(z.object({ area: z.string().trim().min(1), pain: z.string().trim().min(1), severity: LEVEL.default("medium") })).default([]),
});
export type Discovery = z.infer<typeof discoverySchema>;

export const opportunitySchema = z.object({
  opportunities: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        area: z.string().trim().min(1),
        service: z.string().trim().default(""), // a Wobble service slug when one fits
        description: z.string().trim().min(1),
        impact: LEVEL.default("medium"),
        difficulty: LEVEL.default("medium"),
        monthlyHoursSaved: z.number().min(0).optional(),
      }),
    )
    .default([]),
});
export type OpportunitySet = z.infer<typeof opportunitySchema>;

export const prioritizationSchema = z.object({
  quickWins: z.array(z.string().trim().min(1)).default([]), // titles: high impact / low difficulty
  bigSwings: z.array(z.string().trim().min(1)).default([]), // high impact / high difficulty
  rationale: z.string().trim().default(""),
});
export type Prioritization = z.infer<typeof prioritizationSchema>;

export const roadmapSchema = z.object({
  phases: z
    .array(z.object({ title: z.string().trim().min(1), months: z.string().trim().default(""), focus: z.string().trim().default(""), items: z.array(z.string().trim().min(1)).default([]) }))
    .default([]),
});
export type Roadmap = z.infer<typeof roadmapSchema>;

export const reportSchema = z.object({
  executiveSummary: z.string().trim().min(1),
  roi: z.object({
    estimatedMonthlyUpsideCents: z.number().int().min(0).optional(),
    estimatedImplementationCents: z.number().int().min(0).optional(),
    paybackMonths: z.number().min(0).optional(),
  }).default({}),
});
export type AuditReportNode = z.infer<typeof reportSchema>;

// ---------------------------------------------------------------- robust JSON parse (same as content-graph)

function extractJson(text: string): string | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  if (start === -1) return null;
  const end = body.lastIndexOf("}");
  if (end <= start) return null;
  return body.slice(start, end + 1);
}

export function parseJsonObject<T>(text: string, schema: z.ZodType<T>): T | null {
  const raw = extractJson(text);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = schema.safeParse(parsed);
  return result.success ? result.data : null;
}

// ---------------------------------------------------------------- prompts

export interface AuditContext {
  businessName: string;
  industry?: string | null;
  intakeNotes: string; // stakeholder answers, current-state notes
  freeAuditSummary?: string; // the deterministic Free-Audit summary, if run
  brain: Array<{ title: string; content: string }>;
}

const SERVICE_MENU = WOBBLE_SERVICES.map((s) => `${s.slug} (${s.name})`).join(", ");

export function buildDiscoveryPrompt(ctx: AuditContext): ProviderMessage[] {
  const system = `You are the DISCOVERY consultant on an AI transformation audit (McKinsey-grade). From the stakeholder notes, map the business as three systems — how they ACQUIRE customers, DELIVER, and SUPPORT — and pinpoint the real bottlenecks. Be concrete and specific to THIS business; never generic. Respond with STRICT JSON only:
{"acquisition":["..."],"delivery":["..."],"support":["..."],"bottlenecks":[{"area":"...","pain":"...","severity":"low|medium|high"}]}`;
  const user = [`BUSINESS: ${ctx.businessName}${ctx.industry ? ` (${ctx.industry})` : ""}`, `STAKEHOLDER NOTES:\n${ctx.intakeNotes}`, ctx.freeAuditSummary ? `PRELIMINARY SCAN: ${ctx.freeAuditSummary}` : null].filter(Boolean).join("\n\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

export function buildOpportunityPrompt(ctx: AuditContext, discovery: Discovery): ProviderMessage[] {
  const system = `You are the OPPORTUNITY consultant. Given the current-state map and its bottlenecks, identify concrete AI/automation opportunities. Where a Wobble service fits, name its slug in "service" (only from the menu). Rate impact and difficulty honestly. Respond with STRICT JSON only:
{"opportunities":[{"title":"...","area":"...","service":"wobble-slug-or-empty","description":"...","impact":"low|medium|high","difficulty":"low|medium|high","monthlyHoursSaved":0}]}
WOBBLE SERVICE MENU (use these slugs): ${SERVICE_MENU}`;
  const user = `CURRENT STATE:\n${JSON.stringify(discovery)}\n\nBUSINESS: ${ctx.businessName}`;
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

export function buildPrioritizationPrompt(opps: OpportunitySet): ProviderMessage[] {
  const system = `You are the PRIORITIZATION consultant. Sort opportunities onto an impact/difficulty matrix: quickWins = high impact + low/medium difficulty; bigSwings = high impact + high difficulty. Reference opportunities by their exact titles. Respond with STRICT JSON only:
{"quickWins":["title",...],"bigSwings":["title",...],"rationale":"..."}`;
  const user = `OPPORTUNITIES:\n${JSON.stringify(opps.opportunities.map((o) => ({ title: o.title, impact: o.impact, difficulty: o.difficulty })))}`;
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

export function buildRoadmapPrompt(opps: OpportunitySet, priority: Prioritization): ProviderMessage[] {
  const system = `You are the ROADMAP architect. Build a phased 12-month plan. Phase 1 = the quick wins (fast ROI to justify the engagement), later phases = the bigger swings. Each phase: title, month range, focus, and the item titles it delivers. Respond with STRICT JSON only:
{"phases":[{"title":"...","months":"Month 1-3","focus":"...","items":["title",...]}]}`;
  const user = `QUICK WINS: ${priority.quickWins.join(", ")}\nBIG SWINGS: ${priority.bigSwings.join(", ")}\n\nALL OPPORTUNITIES:\n${JSON.stringify(opps.opportunities.map((o) => o.title))}`;
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

export function buildReportPrompt(ctx: AuditContext, discovery: Discovery, opps: OpportunitySet, roadmap: Roadmap): ProviderMessage[] {
  const system = `You are the ENGAGEMENT LEAD writing the executive summary of the audit for the client's leadership. Tie the current-state pain to the opportunities and the roadmap.
Estimate ROI grounded in the business's own economics (deal value, lead volume, hours saved, leaked revenue) — realistic, not inflated, not trivial.
CRITICAL: all money amounts are INTEGER CENTS (multiply dollars by 100). Example: $18,000/month upside = 1800000; a $45,000 build = 4500000. Do NOT output dollars.
Respond with STRICT JSON only:
{"executiveSummary":"...","roi":{"estimatedMonthlyUpsideCents":1800000,"estimatedImplementationCents":4500000,"paybackMonths":6}}`;
  const user = `BUSINESS: ${ctx.businessName}\nBOTTLENECKS: ${discovery.bottlenecks.map((b) => b.pain).join("; ")}\nOPPORTUNITIES: ${opps.opportunities.length}\nROADMAP PHASES: ${roadmap.phases.length}`;
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

// ---------------------------------------------------------------- assembly

export interface PaidAuditReport {
  businessName: string;
  industry: string | null;
  executiveSummary: string;
  currentState: Discovery;
  opportunities: OpportunitySet["opportunities"];
  prioritization: Prioritization;
  roadmap: Roadmap["phases"];
  roi: AuditReportNode["roi"];
  serviceCount: number;
}

export function assemblePaidAuditReport(input: {
  businessName: string;
  industry?: string | null;
  discovery: Discovery;
  opportunities: OpportunitySet;
  prioritization: Prioritization;
  roadmap: Roadmap;
  report: AuditReportNode;
}): PaidAuditReport {
  return {
    businessName: input.businessName,
    industry: input.industry ?? null,
    executiveSummary: input.report.executiveSummary,
    currentState: input.discovery,
    opportunities: input.opportunities.opportunities,
    prioritization: input.prioritization,
    roadmap: input.roadmap.phases,
    roi: input.report.roi,
    serviceCount: new Set(input.opportunities.opportunities.map((o) => o.service).filter(Boolean)).size,
  };
}
