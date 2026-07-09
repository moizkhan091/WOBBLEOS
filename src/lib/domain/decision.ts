// Decision Room — pure domain. Decisions with scored options + a reasoning trail.
import { z } from "zod";
import { newId } from "@/lib/ids";

export const DECISION_MODULE = "decision";
export const DECISION_STATUSES = ["open", "scoring", "decided", "revisit", "archived"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

const TRANSITIONS: Record<DecisionStatus, DecisionStatus[]> = {
  open: ["scoring", "decided", "archived"],
  scoring: ["decided", "open", "archived"],
  decided: ["revisit", "archived"],
  revisit: ["scoring", "decided", "archived"],
  archived: [],
};
export function canTransitionDecision(from: DecisionStatus, to: DecisionStatus): boolean {
  if (from === to) return true;
  return (TRANSITIONS[from] ?? []).includes(to);
}

export interface DecisionOption { id: string; label: string; rationale?: string; pros?: string[]; cons?: string[]; score?: number }
export interface ReasoningEntry { at: string; note: string; by?: string }

export interface DecisionRow {
  id: string;
  title: string;
  context: string | null;
  category: string;
  status: DecisionStatus;
  options: DecisionOption[];
  decidedOptionId: string | null;
  decisionRationale: string | null;
  reasoningTrail: ReasoningEntry[];
  confidence: number;
  owner: string | null;
  companyId: string | null;
  opportunityId: string | null;
  createdBy: string | null;
  archivedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const optionInputSchema = z.object({ label: z.string().trim().min(1), rationale: z.string().trim().optional(), pros: z.array(z.string().trim().min(1)).optional(), cons: z.array(z.string().trim().min(1)).optional() });

export const createDecisionSchema = z.object({
  title: z.string().trim().min(1),
  context: z.string().trim().optional(),
  category: z.string().trim().min(1).default("strategy"),
  options: z.array(optionInputSchema).optional(),
  owner: z.string().trim().min(1).optional(),
  companyId: z.string().trim().min(1).optional(),
  opportunityId: z.string().trim().min(1).optional(),
  createdBy: z.string().trim().min(1).optional(),
});
export type CreateDecisionInput = z.input<typeof createDecisionSchema>;

export function buildDecisionRow(input: CreateDecisionInput, opts: { now?: Date; id?: string } = {}): DecisionRow {
  const now = opts.now ?? new Date();
  const options: DecisionOption[] = (input.options ?? []).map((o) => ({ id: newId("opt"), label: o.label.trim(), rationale: o.rationale, pros: o.pros, cons: o.cons }));
  return {
    id: opts.id ?? newId("decision"),
    title: input.title.trim(),
    context: input.context ?? null,
    category: input.category ?? "strategy",
    status: "open",
    options,
    decidedOptionId: null,
    decisionRationale: null,
    reasoningTrail: [{ at: now.toISOString(), note: "Decision opened.", by: input.createdBy }],
    confidence: 0,
    owner: input.owner ?? null,
    companyId: input.companyId ?? null,
    opportunityId: input.opportunityId ?? null,
    createdBy: input.createdBy ?? null,
    archivedAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

/** Pick the highest-scored option (ties -> first). Returns null if no options scored. */
export function topOption(options: DecisionOption[]): DecisionOption | null {
  const scored = options.filter((o) => typeof o.score === "number");
  if (!scored.length) return null;
  return scored.reduce((best, o) => ((o.score ?? 0) > (best.score ?? 0) ? o : best));
}
