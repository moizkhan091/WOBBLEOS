import { z } from "zod";
import { newId } from "@/lib/ids";

/**
 * Prompt/Skill Registry (Chunk 34) - domain layer.
 *
 * Skills are living SOPs: versioned, approval-gated prompt bodies + rules that
 * workers load at runtime. Workers must NEVER hardcode strategy/prompts - they
 * ask the registry for the latest APPROVED version of a skill by slug.
 *
 * One DB row = one version. status: draft -> approved -> archived.
 */

export const PROMPT_SKILL_STATUSES = ["draft", "approved", "archived"] as const;
export type PromptSkillStatus = (typeof PROMPT_SKILL_STATUSES)[number];

export interface PromptSkillRow {
  id: string;
  slug: string;
  name: string;
  module: string;
  trigger: string;
  version: number;
  status: PromptSkillStatus;
  goal: string;
  promptBody: string;
  rules: string[];
  referencePaths: string[];
  approvedBy: string | null;
  approvedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const slugField = z
  .string()
  .trim()
  .min(1, "slug is required")
  .regex(/^[a-z0-9_]+$/, "slug must be lowercase letters, numbers, or underscore");

export const createPromptSkillSchema = z.object({
  slug: slugField,
  name: z.string().trim().min(1, "name is required"),
  module: z.string().trim().min(1, "module is required"),
  trigger: z.string().trim().min(1, "trigger is required"),
  goal: z.string().trim().min(1, "goal is required"),
  promptBody: z.string().trim().min(1, "promptBody is required"),
  rules: z.array(z.string().trim().min(1)).default([]),
  referencePaths: z.array(z.string().trim().min(1)).default([]),
  requestedBy: z.string().trim().min(1).optional(),
});
export type CreatePromptSkillInput = z.input<typeof createPromptSkillSchema>;

/** Propose a new version of an existing skill (any field may change). */
export const proposeSkillVersionSchema = z.object({
  promptBody: z.string().trim().min(1, "promptBody is required"),
  goal: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  trigger: z.string().trim().min(1).optional(),
  rules: z.array(z.string().trim().min(1)).optional(),
  referencePaths: z.array(z.string().trim().min(1)).optional(),
  requestedBy: z.string().trim().min(1).optional(),
});
export type ProposeSkillVersionInput = z.input<typeof proposeSkillVersionSchema>;

export function buildPromptSkillRow(
  input: CreatePromptSkillInput,
  opts: { now?: Date; id?: string; version?: number; status?: PromptSkillStatus } = {},
): PromptSkillRow {
  const parsed = createPromptSkillSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("skill"),
    slug: parsed.slug,
    name: parsed.name,
    module: parsed.module,
    trigger: parsed.trigger,
    version: opts.version ?? 1,
    status: opts.status ?? "draft",
    goal: parsed.goal,
    promptBody: parsed.promptBody,
    rules: parsed.rules,
    referencePaths: parsed.referencePaths,
    approvedBy: null,
    approvedAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** The single approved version a worker should load: highest version with status "approved". */
export function pickLatestApproved(rows: PromptSkillRow[]): PromptSkillRow | null {
  const approved = rows.filter((r) => r.status === "approved");
  if (!approved.length) return null;
  return approved.reduce((a, b) => (b.version > a.version ? b : a));
}

export function nextVersion(rows: PromptSkillRow[]): number {
  return rows.reduce((max, r) => Math.max(max, r.version), 0) + 1;
}

/**
 * Seed skills (Chunk 34 acceptance): command-skills prime/explore/brainstorm
 * plus core content/research/decision skills. Seeded as APPROVED v1 so workers
 * have an approved skill to load out of the box. Editable + re-versionable later.
 */
export const DEFAULT_PROMPT_SKILLS: CreatePromptSkillInput[] = [
  {
    slug: "prime",
    name: "Prime",
    module: "ask_wobble",
    trigger: "/prime",
    goal: "Load current WOBBLE context (Brain, approved sources, active goals) before a work session.",
    promptBody:
      "You are priming for a WOBBLE work session. Summarize the current state from approved Brain + sources: active goals, live clients, current offers, recent decisions, and what is waiting on a founder. Cite evidence. If context is thin, say what is missing and suggest what to add - do not invent.",
    rules: ["Only use approved memory + sources", "Cite evidence", "Never invent facts"],
  },
  {
    slug: "explore",
    name: "Explore",
    module: "ask_wobble",
    trigger: "/explore",
    goal: "Explore a problem space widely before converging.",
    promptBody:
      "Explore the given topic as a sharp thinking partner. Surface angles, risks, and non-obvious options grounded in approved context. Offer opposing views. End with the 2-3 highest-leverage directions and what evidence would confirm each.",
    rules: ["Ground claims in approved context", "Always include an opposing view", "No hype"],
  },
  {
    slug: "brainstorm",
    name: "Brainstorm",
    module: "ask_wobble",
    trigger: "/brainstorm",
    goal: "Generate a diverse set of on-brand ideas for a stated goal.",
    promptBody:
      "Brainstorm ideas for the stated goal in WOBBLE voice (confident, sharp, never corporate). Diversify across angles and formats. For each idea give a one-line why-it-works. Flag any that need a founder gut-check. Do not repeat the same angle.",
    rules: ["WOBBLE voice", "Diversify angles", "Flag low-confidence ideas"],
  },
  {
    slug: "content_generation",
    name: "Content Generation",
    module: "content_command",
    trigger: "content.generate",
    goal: "Turn approved research + Brain into on-brand content packets that pass the excellence gate.",
    promptBody:
      "Generate content packets grounded ONLY in the provided approved sources + memory. For each packet produce platform, format, objective, target audience, angle, a scroll-stopping hook, main copy (or carousel slide copy), caption, CTA, design direction, the source/memory ids used, an evidence summary, and a claim-risk level. No unsupported claims. Respect the track voice and do-not-say list.",
    rules: [
      "Ground every claim in provided sources/memory",
      "One clear hook per packet",
      "Respect track voice + do-not-say",
      "Never fabricate stats or quotes",
    ],
  },
  {
    slug: "research_brief",
    name: "Research Brief",
    module: "research_radar",
    trigger: "research.brief",
    goal: "Turn a signal into a decision-ready brief.",
    promptBody:
      "Summarize the signal into a founder-ready brief: what happened, why it matters to WOBBLE, likely responses, and 2-3 recommended actions with confidence. Link evidence. Keep it tight.",
    rules: ["Cite the source signal", "Give confidence per recommendation", "No filler"],
  },
  {
    slug: "decision_brief",
    name: "Decision Brief",
    module: "decision_room",
    trigger: "decision.brief",
    goal: "Frame a strategic decision with options, evidence, and a recommendation.",
    promptBody:
      "Frame the decision: the question, the options scored, evidence for each, the opposing view, risk, and a single recommendation with confidence. Keep the reasoning trail explicit so a founder can audit it.",
    rules: ["Always include an opposing view", "State confidence", "Keep the reasoning trail"],
  },
];
