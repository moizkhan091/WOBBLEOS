import { z } from "zod";
import { newId } from "@/lib/ids";

/**
 * Qualification Council — the pure, deterministic core. Eight council roles (the WOBBLE qualification filters
 * from WOBBLE_COMPANY_OS.md §8) each score a prospect 0-100 on one axis; a weighted roll-up maps to an A–E
 * qualification grade with a recommendation. Some roles carry a DETERMINISTIC policy signal computed from CRM
 * data (no model needed); the rest are evidence-LLM assessed. All scoring/grading here is provider-free and
 * unit-tested.
 */

export type QualificationGrade = "A" | "B" | "C" | "D" | "E";

export interface QualificationRoleDef {
  slug: string;
  name: string;
  agentSlug: string;
  weight: number;
  question: string;
  /** true → the role's score is at least partly derived deterministically from CRM signals (policy). */
  hasPolicySignal: boolean;
}

/** The 8 council roles = WOBBLE's qualification filters. */
export const QUALIFICATION_ROLES: QualificationRoleDef[] = [
  { slug: "real_problem", name: "Real Business Problem", agentSlug: "qual_real_problem_agent", weight: 1.3, question: "Is there a real, describable business problem (revenue/cost/speed/chaos) AI can attack — not just curiosity?", hasPolicySignal: false },
  { slug: "real_budget", name: "Real Budget", agentSlug: "qual_budget_agent", weight: 1.3, question: "Is there a real budget for a paid audit + likely implementation? (company size / stage / signals)", hasPolicySignal: true },
  { slug: "owner_urgency", name: "Owner Urgency", agentSlug: "qual_urgency_agent", weight: 1.1, question: "Is the owner serious and urgent, or just exploring?", hasPolicySignal: false },
  { slug: "access", name: "Access to Workflows/People/Tools/Data", agentSlug: "qual_access_agent", weight: 1.1, question: "Can WOBBLE access enough workflows, people, tools and data to audit and build properly?", hasPolicySignal: true },
  { slug: "willingness_learn", name: "Willingness to Learn", agentSlug: "qual_learn_agent", weight: 0.9, question: "Is the business willing to LEARN and adopt AI, not just outsource work to an agency?", hasPolicySignal: false },
  { slug: "phased_implementation", name: "Willingness to Implement in Phases", agentSlug: "qual_phased_agent", weight: 0.9, question: "Will they implement in phases rather than demanding everything at once?", hasPolicySignal: false },
  { slug: "high_value_workflow", name: "High-Value First Workflow", agentSlug: "qual_workflow_agent", weight: 1.1, question: "Is there a clear high-value first workflow (a strong wedge) to start with?", hasPolicySignal: false },
  { slug: "operational_complexity", name: "Operational Complexity", agentSlug: "qual_complexity_agent", weight: 1.0, question: "Is there enough operational complexity (volume, roles, manual work) for AI to matter?", hasPolicySignal: true },
];

export const QUALIFICATION_ROLE_SLUGS = QUALIFICATION_ROLES.map((r) => r.slug);

/** Grade bands (A best). */
export const GRADE_BANDS: Array<{ grade: QualificationGrade; min: number; recommendation: string }> = [
  { grade: "A", min: 85, recommendation: "Prioritise now — book the paid AI OS Audit; strong fit across problem, budget, urgency and access." },
  { grade: "B", min: 70, recommendation: "Pursue — qualify the one or two weaker filters on the readiness call, then book the audit." },
  { grade: "C", min: 55, recommendation: "Nurture — real potential but a key filter is soft; educate and re-qualify before the paid audit." },
  { grade: "D", min: 40, recommendation: "Low priority — multiple filters weak; keep warm with founder content, do not spend audit effort yet." },
  { grade: "E", min: 0, recommendation: "Disqualify for now — not ready (no budget / no urgency / no access / no real problem)." },
];

export interface RoleScore {
  slug: string;
  score: number; // 0..100
  rationale: string;
  /** the deterministic policy signal contribution, when the role has one (for transparency). */
  policyNote?: string;
}

export function computeQualificationScore(scores: RoleScore[]): number {
  const byWeight = QUALIFICATION_ROLES.reduce<Record<string, number>>((acc, r) => ((acc[r.slug] = r.weight), acc), {});
  let weightedSum = 0;
  let weightTotal = 0;
  for (const s of scores) {
    const w = byWeight[s.slug];
    if (w === undefined) continue;
    const clamped = Math.max(0, Math.min(100, s.score));
    weightedSum += clamped * w;
    weightTotal += w;
  }
  if (weightTotal === 0) return 0;
  return Math.round(weightedSum / weightTotal);
}

export function gradeFor(score: number): { grade: QualificationGrade; recommendation: string } {
  const band = GRADE_BANDS.find((b) => score >= b.min) ?? GRADE_BANDS[GRADE_BANDS.length - 1];
  return { grade: band.grade, recommendation: band.recommendation };
}

/**
 * Deterministic policy signal per role from CRM data (0..100 or null when no signal applies). This is the
 * "policy" half; the LLM refines around it. Pure + unit-tested.
 */
export interface QualificationSubjectSignals {
  companySize?: string | null;   // e.g. "startup" | "smb" | "enterprise" | free text
  industry?: string | null;
  hasWebsite?: boolean;
  hasNotes?: boolean;
  status?: string | null;        // CRM status
}

const ICP_INDUSTRIES = ["ecommerce", "retail", "real estate", "property", "agency", "marketing", "clinic", "dental", "med spa", "healthcare", "education", "hospitality", "restaurant", "services"];
const BUDGET_SIZE_SCORE: Record<string, number> = { enterprise: 90, "mid-market": 85, midmarket: 85, smb: 70, sme: 70, small: 55, startup: 50, micro: 35, solo: 30 };

export function policySignal(roleSlug: string, s: QualificationSubjectSignals): { score: number; note: string } | null {
  switch (roleSlug) {
    case "real_budget": {
      const size = (s.companySize ?? "").toLowerCase().trim();
      if (!size) return null;
      const score = BUDGET_SIZE_SCORE[size] ?? 55;
      return { score, note: `company size '${s.companySize}' → budget signal ${score}` };
    }
    case "access": {
      // A real web presence + captured notes suggests reachable operations/data to audit.
      const score = (s.hasWebsite ? 40 : 0) + (s.hasNotes ? 40 : 0) + 20;
      return { score: Math.min(100, score), note: `website=${!!s.hasWebsite}, notes=${!!s.hasNotes}` };
    }
    case "operational_complexity": {
      const ind = (s.industry ?? "").toLowerCase();
      const inIcp = ICP_INDUSTRIES.some((k) => ind.includes(k));
      const score = inIcp ? 80 : ind ? 55 : 45;
      return { score, note: `industry '${s.industry ?? "?"}' ${inIcp ? "in ICP" : "generic"}` };
    }
    default:
      return null;
  }
}

/** Blend a deterministic policy signal with the LLM score (when both exist), else use whichever is present. */
export function blendScore(llmScore: number | null, policy: { score: number } | null): number {
  if (policy && llmScore !== null) return Math.round(0.5 * policy.score + 0.5 * llmScore);
  if (policy) return policy.score;
  return Math.max(0, Math.min(100, Math.round(llmScore ?? 0)));
}

// ---------------------------------------------------------------- parse + row builders

const roleResultSchema = z.object({ score: z.coerce.number().min(0).max(100), rationale: z.string().trim().min(1) });
export function parseRoleResult(slug: string, raw: string): { score: number; rationale: string } {
  let json: unknown;
  try { const m = raw.match(/\{[\s\S]*\}/); json = JSON.parse(m ? m[0] : raw); }
  catch { throw new Error(`role '${slug}' returned unparseable output`); }
  const parsed = roleResultSchema.parse(json);
  return { score: Math.round(parsed.score), rationale: parsed.rationale };
}

export interface QualificationAssessmentRow {
  id: string;
  subjectType: string; // company | lead | opportunity
  subjectId: string;
  version: number;
  grade: QualificationGrade;
  overallScore: number;
  recommendation: string;
  summary: string | null;
  model: string | null;
  createdBy: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface QualificationRoleRow {
  id: string;
  assessmentId: string;
  role: string;
  agentSlug: string;
  score: number;
  weight: number;
  rationale: string;
  policyNote: string | null;
  createdAt: Date;
}

export function buildAssessmentRow(
  input: { subjectType: string; subjectId: string; version: number; grade: QualificationGrade; overallScore: number; recommendation: string; summary?: string; model?: string; createdBy?: string; metadata?: Record<string, unknown> },
  opts: { id?: string; now?: Date } = {},
): QualificationAssessmentRow {
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("qual"),
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    version: input.version,
    grade: input.grade,
    overallScore: input.overallScore,
    recommendation: input.recommendation,
    summary: input.summary ?? null,
    model: input.model ?? null,
    createdBy: input.createdBy ?? null,
    metadata: input.metadata ?? {},
    createdAt: now,
  };
}

export function buildRoleRow(
  input: { assessmentId: string; role: string; agentSlug: string; score: number; weight: number; rationale: string; policyNote?: string | null },
  opts: { id?: string; now?: Date } = {},
): QualificationRoleRow {
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("qualrole"),
    assessmentId: input.assessmentId,
    role: input.role,
    agentSlug: input.agentSlug,
    score: input.score,
    weight: input.weight,
    rationale: input.rationale,
    policyNote: input.policyNote ?? null,
    createdAt: now,
  };
}
