import { z } from "zod";
import type { ProviderMessage } from "@/lib/providers";

/**
 * Doc 2 — the INTERNAL audit roadmap (pure domain). After the paid audit is sold, this tells US how
 * to run it: who to interview, what to ask each stakeholder, and the week-by-week plan — using the
 * Morningside-style AI-audit methodology. It reads ONLY this client's Doc 1 pitch (per-client data
 * isolation) plus the stakeholders + free-call notes we supply. Never client-facing. One LLM node.
 */

export const ROADMAP_MODULE = "paid_audit";
export const ROADMAP_ROLE = "audit_interview_planner";
export const ROADMAP_AGENT = "audit_interview_planner";

export const roadmapPlanSchema = z.object({
  overview: z.string().trim().default(""),
  interviewPlan: z
    .array(z.object({ role: z.string().trim().min(1), name: z.string().trim().default(""), why: z.string().trim().default(""), questions: z.array(z.string().trim().min(1)).default([]) }))
    .default([]),
  sequence: z.array(z.object({ week: z.string().trim().min(1), focus: z.string().trim().default(""), activities: z.array(z.string().trim().min(1)).default([]) })).default([]),
  dataToGather: z.array(z.string().trim().min(1)).default([]),
  prepNotes: z.string().trim().default(""),
});
export type RoadmapPlan = z.infer<typeof roadmapPlanSchema>;

function extractJson(text: string): string | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start !== -1 && end > start ? body.slice(start, end + 1) : null;
}
export function parseRoadmapPlan(text: string): RoadmapPlan | null {
  const raw = extractJson(text);
  if (!raw) return null;
  try {
    const r = roadmapPlanSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export function buildRoadmapPrompt(input: { businessName: string; industry?: string | null; pitchSummary: string; whatWeNoticed: string[]; stakeholders: Array<{ name?: string; role: string }>; freeCallNotes?: string }): ProviderMessage[] {
  const system = `You are Wobble's audit engagement lead, planning an INTERNAL playbook for how OUR team will run a paid AI audit of ${input.businessName}${input.industry ? `, a ${input.industry} business` : ""}. This is for us only — it is NOT sent to the client.
Use the proven AI-audit method: Week 1 = discovery — interview 3-5 key stakeholders (30-45 min each) about their day-to-day, pain points, repetitive tasks, decision bottlenecks; map their acquisition/delivery/support processes. Week 2 = opportunity identification + technical feasibility. Week 3 = validation with the client. Week 4 = roadmap + ROI presentation.
For EACH stakeholder we should interview, give the role, why they matter, and 4-8 specific questions tailored to THIS business. List the data/numbers/docs we should gather. Respond with STRICT JSON only:
{"overview":"how we'll run this audit","interviewPlan":[{"role":"...","name":"...","why":"...","questions":["..."]}],"sequence":[{"week":"Week 1","focus":"...","activities":["..."]}],"dataToGather":["..."],"prepNotes":"..."}`;
  const user = [
    `BUSINESS: ${input.businessName}`,
    `WHAT OUR PITCH FOUND: ${input.pitchSummary}`,
    input.whatWeNoticed.length ? `OBSERVATIONS: ${input.whatWeNoticed.join("; ")}` : null,
    input.stakeholders.length ? `KNOWN STAKEHOLDERS: ${input.stakeholders.map((s) => `${s.name ? s.name + " — " : ""}${s.role}`).join("; ")}` : "STAKEHOLDERS: (unknown — recommend the roles we should ask to interview)",
    input.freeCallNotes ? `FREE-CALL NOTES: ${input.freeCallNotes}` : null,
  ].filter(Boolean).join("\n\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

/** Deterministic fallback plan when no model key — a sensible generic interview playbook. */
export function deterministicRoadmap(businessName: string, stakeholders: Array<{ name?: string; role: string }>): RoadmapPlan {
  const roles = stakeholders.length ? stakeholders : [{ role: "Founder / Owner" }, { role: "Operations lead" }, { role: "Sales / front desk" }];
  return {
    overview: `A 4-week AI audit of ${businessName}: discovery interviews + process mapping, opportunity identification, validation, then the roadmap + ROI presentation.`,
    interviewPlan: roles.map((s) => ({ role: s.role, name: s.name ?? "", why: "Owns part of the customer journey and its pain points.", questions: ["Walk me through your day-to-day.", "Where do things get stuck or repetitive?", "What do you wish was automated?", "Where do leads or customers fall through the cracks?"] })),
    sequence: [
      { week: "Week 1", focus: "Discovery", activities: ["Stakeholder interviews (30-45 min each)", "Map acquisition / delivery / support processes", "Preliminary bottleneck inventory"] },
      { week: "Week 2", focus: "Opportunity identification", activities: ["Build the opportunity database", "Technical feasibility assessment", "Impact/difficulty matrix"] },
      { week: "Week 3", focus: "Validation", activities: ["Temp-check the top opportunities with the client", "Refine scope"] },
      { week: "Week 4", focus: "Roadmap + ROI", activities: ["12-month roadmap", "ROI model", "Executive presentation"] },
    ],
    dataToGather: ["Monthly leads + close rate", "Average deal / customer value", "Team headcount + roles", "Current tools/stack", "Hours spent on manual tasks"],
    prepNotes: "Confirm the stakeholder list and book the Week-1 interviews before kickoff.",
  };
}

/** Map an internal roadmap into the shared report renderer shape (rendered for our own use). */
export function roadmapToReportShape(plan: RoadmapPlan, businessName: string): Record<string, unknown> {
  return {
    businessName,
    executiveSummary: `INTERNAL audit playbook for ${businessName}. ${plan.overview}`,
    situationSummary: plan.overview,
    summary: `Interview roadmap — ${plan.interviewPlan.length} stakeholders`,
    roadmap: plan.sequence.map((w) => ({ title: w.week, focus: w.focus, months: "", objectives: w.activities, deliverables: [], items: [] })),
    opportunities: plan.interviewPlan.map((s) => ({ name: `${s.role}${s.name ? ` (${s.name})` : ""}`, title: s.role, description: s.why, reason: s.why, expectedOutcome: s.questions.slice(0, 3).join(" · "), impact: "medium" })),
    nextSteps: plan.dataToGather,
  };
}
