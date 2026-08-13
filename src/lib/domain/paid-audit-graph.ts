import { z } from "zod";
import type { ProviderMessage } from "@/lib/providers";
import { WOBBLE_SERVICES } from "@/lib/domain/free-audit";
import { sanitizeDeep, withHouseStyle } from "@/lib/domain/house-style";

/**
 * Paid Audit Graph (pure domain) — the McKinsey-depth AI audit team.
 *
 * SEPARATE from the Free Audit. Five agent_runs, each its own model role, grounded in the intake +
 * Free-Audit diagnosis + brand Brain + the FULL Wobble service catalog: Discovery (deep current-state
 * map) → Opportunity (15-20 detailed opportunities) → Prioritization → 12-month Roadmap (objectives +
 * deliverables per phase) → Executive report (ROI + risks + KPIs + tech stack + next steps). Built for
 * DEPTH — this is a real consulting deliverable. Orchestrator + IO in src/lib/paid-audit-graph.
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

// ---------------------------------------------------------------- node schemas (deep)

const processStepSchema = z.object({ step: z.string().trim().min(1), detail: z.string().trim().default(""), tool: z.string().trim().default(""), pain: z.string().trim().default("") });

export const discoverySchema = z.object({
  situation: z.string().trim().default(""),
  acquisition: z.array(processStepSchema).default([]),
  delivery: z.array(processStepSchema).default([]),
  support: z.array(processStepSchema).default([]),
  bottlenecks: z.array(z.object({ area: z.string().trim().min(1), pain: z.string().trim().min(1), rootCause: z.string().trim().default(""), severity: LEVEL.default("medium"), businessImpact: z.string().trim().default("") })).default([]),
  keyMetrics: z.array(z.object({ label: z.string().trim().min(1), value: z.string().trim().default("") })).default([]),
});
export type Discovery = z.infer<typeof discoverySchema>;

export const opportunitySchema = z.object({
  opportunities: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        area: z.string().trim().default(""),
        service: z.string().trim().default(""),
        description: z.string().trim().min(1),
        howItWorks: z.string().trim().default(""),
        expectedOutcome: z.string().trim().default(""),
        impact: LEVEL.default("medium"),
        difficulty: LEVEL.default("medium"),
        monthlyHoursSaved: z.number().min(0).optional(),
        estimatedMonthlyValueCents: z.number().int().min(0).optional(),
        kpis: z.array(z.string().trim().min(1)).default([]),
        /**
         * The bottleneck or the thing the client actually said that this comes from.
         *
         * WOBBLE's own deal reviewer found three line items on a real proposal that "appear nowhere in
         * the audit findings", because the audit was told to be COMPREHENSIVE rather than grounded. An
         * opportunity that cannot name its source is one the client never asked for, and it travels all
         * the way into a quote.
         */
        groundedIn: z.string().trim().default(""),
      }),
    )
    .default([]),
});
export type OpportunitySet = z.infer<typeof opportunitySchema>;

export const prioritizationSchema = z.object({
  quickWins: z.array(z.string().trim().min(1)).default([]),
  bigSwings: z.array(z.string().trim().min(1)).default([]),
  rationale: z.string().trim().default(""),
});
export type Prioritization = z.infer<typeof prioritizationSchema>;

export const roadmapSchema = z.object({
  phases: z
    .array(z.object({
      title: z.string().trim().min(1),
      months: z.string().trim().default(""),
      focus: z.string().trim().default(""),
      objectives: z.array(z.string().trim().min(1)).default([]),
      deliverables: z.array(z.string().trim().min(1)).default([]),
      items: z.array(z.string().trim().min(1)).default([]),
      expectedOutcome: z.string().trim().default(""),
    }))
    .default([]),
});
export type Roadmap = z.infer<typeof roadmapSchema>;

export const reportSchema = z.object({
  executiveSummary: z.string().trim().min(1),
  situationSummary: z.string().trim().default(""),
  roi: z.object({
    estimatedMonthlyUpsideCents: z.number().int().min(0).optional(),
    estimatedImplementationCents: z.number().int().min(0).optional(),
    paybackMonths: z.number().min(0).optional(),
    breakdown: z.array(z.object({ area: z.string().trim().min(1), monthlyValueCents: z.number().int().min(0).default(0) })).default([]),
  }).optional(),
  risks: z.array(z.object({ risk: z.string().trim().min(1), mitigation: z.string().trim().default("") })).default([]),
  successMetrics: z.array(z.string().trim().min(1)).default([]),
  recommendedTechStack: z.array(z.string().trim().min(1)).default([]),
  nextSteps: z.array(z.string().trim().min(1)).default([]),
});
export type AuditReportNode = z.infer<typeof reportSchema>;

// ---------------------------------------------------------------- robust JSON parse

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

// ---------------------------------------------------------------- prompts (demand depth)

export interface AuditContext {
  businessName: string;
  industry?: string | null;
  intakeNotes: string;
  freeAuditSummary?: string;
  brain: Array<{ title: string; content: string }>;
}

const SERVICE_MENU = WOBBLE_SERVICES.map((s) => `${s.slug} (${s.name})`).join(", ");

export function buildDiscoveryPrompt(ctx: AuditContext): ProviderMessage[] {
  const system = `You are the DISCOVERY partner on a McKinsey-grade AI transformation audit. Map the business in DEPTH from the stakeholder notes, do not be brief. For each of the three systems (how they ACQUIRE customers, DELIVER the work, SUPPORT/retain customers), list the concrete PROCESS STEPS with detail, the tool used, and the pain at that step. Then the bottlenecks with root cause + business impact, and any key metrics they mentioned. Be specific to THIS business; infer sensibly where notes are thin. Respond with STRICT JSON only:
{"situation":"2-4 sentence narrative of where the business is today","acquisition":[{"step":"...","detail":"...","tool":"...","pain":"..."}],"delivery":[{...}],"support":[{...}],"bottlenecks":[{"area":"...","pain":"...","rootCause":"...","severity":"low|medium|high","businessImpact":"..."}],"keyMetrics":[{"label":"...","value":"..."}]}`;
  const user = [`BUSINESS: ${ctx.businessName}${ctx.industry ? ` (${ctx.industry})` : ""}`, `STAKEHOLDER NOTES:\n${ctx.intakeNotes}`, ctx.freeAuditSummary ? `PRELIMINARY SCAN: ${ctx.freeAuditSummary}` : null].filter(Boolean).join("\n\n");
  return [{ role: "system", content: withHouseStyle(system) }, { role: "user", content: user }];
}

export function buildOpportunityPrompt(ctx: AuditContext, discovery: Discovery): ProviderMessage[] {
  const system = `You are the OPPORTUNITY partner. From the current-state map and bottlenecks, identify the AI/automation opportunities this business ACTUALLY has.

The single rule that matters: EVERY opportunity must trace to a bottleneck above or to something the stakeholder said. Put that source, quoted or closely paraphrased, in "groundedIn". If you cannot fill "groundedIn" from the material, do not write the opportunity.

This used to ask for a comprehensive set covering every system, and the result was a proposal carrying three things the client had never mentioned. A business that never raised a complaint does not need complaint tracking. Five grounded opportunities beat fourteen where a third are invented, because the invented ones are what stop a client trusting the rest.

Write as many as the material genuinely supports. Fewer than five usually means the notes are thin, say so rather than padding. More than twelve almost never happens honestly. For EACH: a description, how it works, the expected outcome, impact + difficulty, estimated monthly hours saved, estimated monthly value in INTEGER CENTS, and 1-3 KPIs to measure it. Keep each entry TIGHT (1-2 sentences per field) so the full JSON is complete and never truncated. Where a Wobble service fits, put its slug in "service" (only from the menu). Respond with STRICT JSON only:
{"opportunities":[{"title":"...","area":"...","service":"wobble-slug-or-empty","description":"...","howItWorks":"...","expectedOutcome":"...","impact":"low|medium|high","difficulty":"low|medium|high","monthlyHoursSaved":0,"estimatedMonthlyValueCents":0,"kpis":["..."],"groundedIn":"the bottleneck or the client's own words this comes from"}]}
WOBBLE SERVICE MENU (use these slugs): ${SERVICE_MENU}`;
  const user = `CURRENT STATE:\n${JSON.stringify(discovery)}\n\nBUSINESS: ${ctx.businessName}. Write only the opportunities this material supports.`;
  return [{ role: "system", content: withHouseStyle(system) }, { role: "user", content: user }];
}

export function buildPrioritizationPrompt(opps: OpportunitySet): ProviderMessage[] {
  const system = `You are the PRIORITIZATION partner. Sort opportunities onto an impact/difficulty matrix: quickWins = high impact + low/medium difficulty; bigSwings = high impact + high difficulty. Reference opportunities by their exact titles, and give a clear sequencing rationale. Respond with STRICT JSON only:
{"quickWins":["title",...],"bigSwings":["title",...],"rationale":"why this sequence"}`;
  const user = `OPPORTUNITIES:\n${JSON.stringify(opps.opportunities.map((o) => ({ title: o.title, impact: o.impact, difficulty: o.difficulty })))}`;
  return [{ role: "system", content: withHouseStyle(system) }, { role: "user", content: user }];
}

export function buildRoadmapPrompt(opps: OpportunitySet, priority: Prioritization): ProviderMessage[] {
  const system = `You are the ROADMAP architect. Build a detailed phased 12-month plan (4-5 phases). Phase 1 = quick wins for fast ROI. For EACH phase give: title, month range, focus, 2-4 objectives, the concrete deliverables, the opportunity item titles it delivers, and the expected outcome at the end of the phase. Respond with STRICT JSON only:
{"phases":[{"title":"...","months":"Month 1-3","focus":"...","objectives":["..."],"deliverables":["..."],"items":["title",...],"expectedOutcome":"..."}]}`;
  const user = `QUICK WINS: ${priority.quickWins.join(", ")}\nBIG SWINGS: ${priority.bigSwings.join(", ")}\n\nALL OPPORTUNITIES:\n${JSON.stringify(opps.opportunities.map((o) => o.title))}`;
  return [{ role: "system", content: withHouseStyle(system) }, { role: "user", content: user }];
}

export function buildReportPrompt(ctx: AuditContext, discovery: Discovery, opps: OpportunitySet, roadmap: Roadmap): ProviderMessage[] {
  const system = `You are the ENGAGEMENT LEAD writing the full executive report for the client's leadership. Write a substantial executive summary (4-6 sentences) AND a situation summary, then estimate ROI, key risks with mitigations, the success metrics/KPIs to track, a recommended tech stack, and clear next steps.
CRITICAL: all money amounts are INTEGER CENTS (dollars×100). Example: $18,000/month = 1800000; a $45,000 build = 4500000. Ground ROI in the business's own economics (deal value, lead volume, hours saved, leaked revenue), realistic, not trivial, not inflated. Respond with STRICT JSON only:
{"executiveSummary":"...","situationSummary":"...","roi":{"estimatedMonthlyUpsideCents":1800000,"estimatedImplementationCents":4500000,"paybackMonths":6,"breakdown":[{"area":"...","monthlyValueCents":0}]},"risks":[{"risk":"...","mitigation":"..."}],"successMetrics":["..."],"recommendedTechStack":["..."],"nextSteps":["..."]}`;
  const user = `BUSINESS: ${ctx.businessName}\nSITUATION: ${discovery.situation}\nBOTTLENECKS: ${discovery.bottlenecks.map((b) => b.pain).join("; ")}\nOPPORTUNITIES (${opps.opportunities.length}): ${opps.opportunities.map((o) => o.title).slice(0, 20).join("; ")}\nROADMAP PHASES: ${roadmap.phases.length}`;
  return [{ role: "system", content: withHouseStyle(system) }, { role: "user", content: user }];
}

// ---------------------------------------------------------------- assembly

export interface PaidAuditReport {
  businessName: string;
  industry: string | null;
  executiveSummary: string;
  situationSummary: string;
  currentState: Discovery;
  opportunities: OpportunitySet["opportunities"];
  prioritization: Prioritization;
  roadmap: Roadmap["phases"];
  roi: AuditReportNode["roi"];
  risks: AuditReportNode["risks"];
  successMetrics: string[];
  recommendedTechStack: string[];
  nextSteps: string[];
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
  // The audit is the most client-facing thing WOBBLE produces, so house style is enforced on the way
  // OUT as well as instructed on the way in. sanitizeDeep walks every nested string (opportunities,
  // roadmap phases, risks) rather than only the summary a reader sees first.
  return sanitizeDeep({
    businessName: input.businessName,
    industry: input.industry ?? null,
    executiveSummary: input.report.executiveSummary,
    situationSummary: input.report.situationSummary || input.discovery.situation,
    currentState: input.discovery,
    opportunities: input.opportunities.opportunities,
    prioritization: input.prioritization,
    roadmap: input.roadmap.phases,
    roi: input.report.roi,
    risks: input.report.risks,
    successMetrics: input.report.successMetrics,
    recommendedTechStack: input.report.recommendedTechStack,
    nextSteps: input.report.nextSteps,
    serviceCount: new Set(input.opportunities.opportunities.map((o) => o.service).filter(Boolean)).size,
  });
}

/**
 * Drop opportunities that cannot name where they came from.
 *
 * The prompt asks for grounding; this enforces it, the same way the follow-up writer's invented case
 * study is caught by a checker rather than trusted to instructions. An ungrounded opportunity is one
 * the client never asked for, and it travels all the way into a quote.
 *
 * Returns what it dropped so an audit can say so rather than silently shrinking. If EVERYTHING is
 * ungrounded the model ignored the field, and throwing the whole audit away would be worse than
 * keeping it, so it is kept and the caller can see that nothing was grounded.
 */
export function keepGroundedOpportunities(set: OpportunitySet): { kept: OpportunitySet["opportunities"]; dropped: string[] } {
  const grounded = set.opportunities.filter((o) => (o.groundedIn ?? "").trim().length >= 10);
  if (!grounded.length) return { kept: set.opportunities, dropped: [] };
  return {
    kept: grounded,
    dropped: set.opportunities.filter((o) => (o.groundedIn ?? "").trim().length < 10).map((o) => o.title),
  };
}
