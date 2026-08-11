import { z } from "zod";

/**
 * Model Control (pure domain).
 *
 * One place that answers "what model is each part of the OS running, what has it cost, and how do I
 * change it". The switching machinery already existed (setModelForRole, the seeded role map, live
 * resolution on every provider call). What did not exist was a canonical LIST of roles, so nothing
 * could render them, and six code paths hardcoded a model and bypassed the map entirely. A switcher
 * page over that would have been a lie: you flip everything to cheap and the transcript extractor
 * keeps billing you for a strong model.
 *
 * The rule this file encodes: EVERY model choice is a role, every role is listed here, and nothing
 * hardcodes a model id at a call site.
 */

export const MODEL_CONTROL_MODULE = "model_control";

/** Which department a role belongs to, so the page can group and swap by department. */
export const ROLE_DEPARTMENTS = [
  "revenue_crm",
  "audit",
  "proposal",
  "content",
  "intelligence",
  "workspace",
] as const;
export type RoleDepartment = (typeof ROLE_DEPARTMENTS)[number];

export const DEPARTMENT_LABELS: Record<RoleDepartment, string> = {
  revenue_crm: "Revenue and CRM",
  audit: "Audit team",
  proposal: "Proposals",
  content: "Content studio",
  intelligence: "Intelligence and memory",
  workspace: "Workspace",
};

export interface ModelRoleDef {
  role: string;
  label: string;
  department: RoleDepartment;
  /** What this role actually does, so a founder can judge whether it needs a strong model. */
  purpose: string;
  /** Sensible default when the role has never been set. */
  defaultModel: string;
  /** Whether the work genuinely needs reasoning, used by the presets and shown as a warning. */
  needsJudgment: boolean;
  /** Agents that run on this role, for the "who is affected" column. */
  agents: string[];
}

const CHEAP = "openai/gpt-4o-mini";
const STRONG = "anthropic/claude-sonnet-4.5";

/**
 * Every model decision in the OS.
 *
 * `needsJudgment` is the honest signal: it marks work where a cheap model measurably fails, not work
 * that merely feels important. The transcript extractor is marked because a mini model dropped every
 * money figure on a real call; the prioritiser is not, because sorting a list by two labels does not
 * need reasoning.
 */
export const MODEL_ROLE_CATALOG: ModelRoleDef[] = [
  // Revenue and CRM
  { role: "revenue_head", label: "Head of Revenue", department: "revenue_crm", purpose: "Runs the department in conversation, decides what to do about a client and drives the tools.", defaultModel: STRONG, needsJudgment: true, agents: ["revenue_head"] },
  { role: "call_questions", label: "Pre-call questions", department: "revenue_crm", purpose: "Writes the questions for a client's next call from their form answers and approved findings.", defaultModel: STRONG, needsJudgment: true, agents: ["call_question_engine"] },
  { role: "meeting_intelligence", label: "Call transcript extraction", department: "revenue_crm", purpose: "Pulls findings and money numbers out of a call. A cheap model drops the figures and fumbles the arithmetic.", defaultModel: STRONG, needsJudgment: true, agents: ["meeting_intelligence_analyst"] },
  { role: "qualification", label: "Qualification council", department: "revenue_crm", purpose: "Eight specialists score budget, urgency, access and fit. Cheap is fine: each scores one narrow question.", defaultModel: CHEAP, needsJudgment: false, agents: ["qual_real_problem_agent", "qual_budget_agent", "qual_urgency_agent", "qual_access_agent", "qual_learn_agent", "qual_phased_agent", "qual_workflow_agent", "qual_complexity_agent"] },

  // Audit team
  { role: "audit_discovery", label: "Audit discovery", department: "audit", purpose: "Maps the client's current state from the intake notes.", defaultModel: STRONG, needsJudgment: true, agents: ["audit_discovery_mapper"] },
  { role: "audit_opportunity", label: "Audit opportunities", department: "audit", purpose: "Finds and sizes the automation opportunities.", defaultModel: STRONG, needsJudgment: true, agents: ["audit_opportunity_finder"] },
  { role: "audit_prioritization", label: "Audit prioritisation", department: "audit", purpose: "Sorts opportunities by impact and difficulty. Mechanical, cheap is fine.", defaultModel: CHEAP, needsJudgment: false, agents: ["audit_prioritizer"] },
  { role: "audit_roadmap", label: "Audit roadmap", department: "audit", purpose: "Builds the phased twelve month plan.", defaultModel: STRONG, needsJudgment: true, agents: ["audit_roadmap_architect"] },
  { role: "audit_report", label: "Audit report", department: "audit", purpose: "Writes the executive report and the ROI the client reads first.", defaultModel: STRONG, needsJudgment: true, agents: ["audit_report_writer"] },
  { role: "audit_interview_planner", label: "Interview planner", department: "audit", purpose: "Plans the internal interview roadmap for an audit.", defaultModel: STRONG, needsJudgment: true, agents: ["audit_interview_planner"] },
  { role: "pitch_writer", label: "Quick pitch", department: "audit", purpose: "Writes the top-of-funnel pitch from a prospect's gaps.", defaultModel: STRONG, needsJudgment: true, agents: ["wobble_pitch_writer"] },

  // Proposals
  { role: "proposal_architect", label: "Solution architect", department: "proposal", purpose: "Designs the technical solution, integrations, ROI and risks behind a proposal.", defaultModel: STRONG, needsJudgment: true, agents: ["proposal_solution_architect", "revision_specialist"] },

  // Content
  { role: "content_strategy", label: "Content strategy", department: "content", purpose: "Decides topic, angle, format and platform.", defaultModel: STRONG, needsJudgment: true, agents: ["content_strategist"] },
  { role: "content_research", label: "Content research", department: "content", purpose: "Pulls grounded evidence for a brief.", defaultModel: CHEAP, needsJudgment: false, agents: ["content_researcher"] },
  { role: "content_copywriting", label: "Copywriting", department: "content", purpose: "Writes the actual hooks, captions and carousels.", defaultModel: STRONG, needsJudgment: true, agents: ["content_copywriter"] },
  { role: "content_scoring", label: "Content scoring", department: "content", purpose: "Scores a draft against brand and platform fit.", defaultModel: CHEAP, needsJudgment: false, agents: ["content_scorer"] },
  { role: "content_render", label: "Visual rendering", department: "content", purpose: "Turns an approved pack into rendered visuals.", defaultModel: STRONG, needsJudgment: true, agents: ["content_worker"] },

  // Intelligence and memory
  { role: "knowledge_compiler", label: "Knowledge compiler", department: "intelligence", purpose: "Compiles approved sources into interlinked knowledge notes.", defaultModel: CHEAP, needsJudgment: false, agents: ["knowledge_compiler"] },
  { role: "memory_router", label: "Memory router", department: "intelligence", purpose: "Decides which memory bank a fact belongs in.", defaultModel: CHEAP, needsJudgment: false, agents: ["memory_router"] },
  { role: "offer_validation", label: "Offer validation", department: "intelligence", purpose: "Scores a proposed offer before it reaches a founder.", defaultModel: CHEAP, needsJudgment: false, agents: [] },

  // Workspace
  { role: "ask_wobble", label: "Ask WOBBLE", department: "workspace", purpose: "The generalist command surface across every module.", defaultModel: CHEAP, needsJudgment: false, agents: ["ask_wobble"] },
  { role: "default", label: "Everything else", department: "workspace", purpose: "The fallback any unmapped role resolves to. Keep this cheap.", defaultModel: CHEAP, needsJudgment: false, agents: [] },
];

export const ROLE_BY_NAME = new Map(MODEL_ROLE_CATALOG.map((r) => [r.role, r]));

// ---------------------------------------------------------------- presets

export const PRESETS = ["economy", "balanced", "premium"] as const;
export type Preset = (typeof PRESETS)[number];

export const PRESET_LABELS: Record<Preset, string> = {
  economy: "Economy",
  balanced: "Balanced",
  premium: "Premium",
};

export const PRESET_DESCRIPTIONS: Record<Preset, string> = {
  economy: "Everything on the cheap model. Cheapest possible, and the audit and transcript quality will drop noticeably.",
  balanced: "Strong only where a cheap model measurably fails: judgment work. Everything mechanical stays cheap.",
  premium: "Strong everywhere. Best output, several times the cost.",
};

/**
 * The model each role gets under a preset.
 *
 * Balanced is not a compromise, it is the honest default: it spends on the roles where a cheap model
 * was actually observed to fail and refuses to spend anywhere else.
 */
export function presetModel(preset: Preset, role: ModelRoleDef, cheap = CHEAP, strong = STRONG): string {
  if (preset === "economy") return cheap;
  if (preset === "premium") return strong;
  return role.needsJudgment ? strong : cheap;
}

/** Which preset (if any) the current map matches exactly. */
export function detectPreset(current: Record<string, string>): Preset | "custom" {
  for (const preset of PRESETS) {
    const matches = MODEL_ROLE_CATALOG.every((r) => (current[r.role] ?? r.defaultModel) === presetModel(preset, r));
    if (matches) return preset;
  }
  return "custom";
}

// ---------------------------------------------------------------- requests

export const applyModelChangeSchema = z
  .object({
    /** Change one role. */
    role: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
    /** Change every role in one department. */
    department: z.enum(ROLE_DEPARTMENTS).optional(),
    /** Change everything to a preset. */
    preset: z.enum(PRESETS).optional(),
  })
  .refine((v) => Boolean(v.preset) || Boolean(v.model), { message: "supply a preset, or a model to set" })
  .refine((v) => !(v.model && !v.role && !v.department), { message: "a model needs either a role or a department to apply to" });
export type ApplyModelChange = z.infer<typeof applyModelChangeSchema>;

/** Expand a request into the concrete (role, model) pairs to write. */
export function resolveChanges(input: ApplyModelChange): Array<{ role: string; model: string }> {
  if (input.preset) {
    const scope = input.department ? MODEL_ROLE_CATALOG.filter((r) => r.department === input.department) : MODEL_ROLE_CATALOG;
    return scope.map((r) => ({ role: r.role, model: presetModel(input.preset!, r) }));
  }
  if (input.department && input.model) {
    return MODEL_ROLE_CATALOG.filter((r) => r.department === input.department).map((r) => ({ role: r.role, model: input.model! }));
  }
  if (input.role && input.model) return [{ role: input.role, model: input.model }];
  return [];
}

/** A blunt warning when a founder puts a cheap model on work that genuinely needs reasoning. */
export function downgradeWarnings(changes: Array<{ role: string; model: string }>, cheapModels: Set<string>): string[] {
  return changes
    .filter((c) => cheapModels.has(c.model) && ROLE_BY_NAME.get(c.role)?.needsJudgment)
    .map((c) => {
      const def = ROLE_BY_NAME.get(c.role)!;
      return `${def.label}: ${def.purpose}`;
    });
}
