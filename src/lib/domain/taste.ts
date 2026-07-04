import { z } from "zod";
import { newId } from "@/lib/ids";

export const TASTE_PROFILE_SCOPES = ["brand", "founder", "client", "project", "agent"] as const;
export type TasteProfileScope = (typeof TASTE_PROFILE_SCOPES)[number];

export const FEEDBACK_DECISIONS = ["approve", "reject", "edit", "regenerate", "archive", "needs_review"] as const;
export type FeedbackDecision = (typeof FEEDBACK_DECISIONS)[number];

export const FEEDBACK_REASON_CATEGORIES = [
  "off_brand",
  "weak_idea",
  "bad_design",
  "bad_copy",
  "too_generic",
  "wrong_audience",
  "not_premium_enough",
  "factually_wrong",
  "bad_visual_direction",
  "poor_strategy",
  "bad_format",
  "not_aligned_with_founder_taste",
  "other",
] as const;
export type FeedbackReasonCategory = (typeof FEEDBACK_REASON_CATEGORIES)[number];

export interface TasteProfileRow {
  id: string;
  profileKey: string;
  scope: TasteProfileScope;
  subjectId: string | null;
  label: string;
  status: "active" | "archived";
  hardConstraints: string[];
  preferenceWeights: Record<string, number>;
  positiveSignals: number;
  negativeSignals: number;
  confidence: string;
  lastFeedbackAt: Date | null;
  provenanceEventIds: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeedbackDimension {
  key: string;
  value: string;
  weight?: number;
}

export interface FeedbackEventRow {
  id: string;
  targetType: string;
  targetId: string;
  decision: FeedbackDecision;
  reasonCategory: FeedbackReasonCategory | null;
  reason: string | null;
  actor: string;
  founderId: string | null;
  clientId: string | null;
  projectId: string | null;
  outputType: string | null;
  module: string | null;
  agentSlug: string | null;
  sourceIds: string[];
  memoryBankSlugs: string[];
  dimensions: FeedbackDimension[];
  profileKeys: string[];
  signalStrength: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const nonEmpty = z.string().trim().min(1);

export const feedbackDimensionSchema = z.object({
  key: nonEmpty,
  value: nonEmpty,
  weight: z.number().positive().max(5).optional(),
});

export const tasteProfileInputSchema = z.object({
  scope: z.enum(TASTE_PROFILE_SCOPES),
  subjectId: z.string().trim().min(1).optional(),
  profileKey: z.string().trim().min(1).optional(),
  label: nonEmpty,
  hardConstraints: z.array(nonEmpty).default([]),
  preferenceWeights: z.record(z.string(), z.number()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type TasteProfileInput = z.input<typeof tasteProfileInputSchema>;

export const feedbackEventInputSchema = z.object({
  targetType: nonEmpty,
  targetId: nonEmpty,
  decision: z.enum(FEEDBACK_DECISIONS),
  reasonCategory: z.enum(FEEDBACK_REASON_CATEGORIES).optional(),
  reason: z.string().trim().optional(),
  actor: nonEmpty,
  founderId: z.string().trim().min(1).optional(),
  clientId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  outputType: z.string().trim().min(1).optional(),
  module: z.string().trim().min(1).optional(),
  agentSlug: z.string().trim().min(1).optional(),
  sourceIds: z.array(nonEmpty).default([]),
  memoryBankSlugs: z.array(nonEmpty).default([]),
  dimensions: z.array(feedbackDimensionSchema).default([]),
  profileKeys: z.array(nonEmpty).optional(),
  signalStrength: z.number().positive().max(5).default(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).superRefine((input, ctx) => {
  if (input.decision === "reject" && !input.reason?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["reason"],
      message: "rejection reason is required so WOBBLE can learn what not to repeat",
    });
  }
});
export type FeedbackEventInput = z.input<typeof feedbackEventInputSchema>;

export function normalizeTasteSubjectId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function profileKeyForFeedbackScope(input: { scope: TasteProfileScope; subjectId?: string | null }): string {
  if (input.scope === "brand") return "brand:wobble";
  if (!input.subjectId?.trim()) throw new Error(`${input.scope} taste profiles require a subjectId`);
  return `${input.scope}:${normalizeTasteSubjectId(input.subjectId)}`;
}

export const DEFAULT_TASTE_PROFILES: TasteProfileInput[] = [
  {
    profileKey: "brand:wobble",
    scope: "brand",
    label: "WOBBLE Brand Taste",
    hardConstraints: [
      "Founder taste can tune outputs, but cannot override approved WOBBLE brand rules.",
      "Rejected output patterns remain searchable as negative examples, not trusted truth.",
    ],
    metadata: { seed: true, protected: true },
  },
  { profileKey: "founder:moiz", scope: "founder", subjectId: "Moiz", label: "Moiz Taste Profile", metadata: { seed: true } },
  { profileKey: "founder:ali", scope: "founder", subjectId: "Ali", label: "Ali Taste Profile", metadata: { seed: true } },
  { profileKey: "founder:ibrahim", scope: "founder", subjectId: "Ibrahim", label: "Ibrahim Taste Profile", metadata: { seed: true } },
  { profileKey: "founder:haad", scope: "founder", subjectId: "Haad", label: "Haad Taste Profile", metadata: { seed: true } },
];

export function buildTasteProfileRow(input: TasteProfileInput, opts: { id?: string; now?: Date } = {}): TasteProfileRow {
  const p = tasteProfileInputSchema.parse(input);
  const now = opts.now ?? new Date();
  const profileKey = p.profileKey ?? profileKeyForFeedbackScope({ scope: p.scope, subjectId: p.subjectId });
  return {
    id: opts.id ?? newId("taste"),
    profileKey,
    scope: p.scope,
    subjectId: p.scope === "brand" ? "wobble" : p.subjectId ?? profileKey.split(":")[1] ?? null,
    label: p.label,
    status: "active",
    hardConstraints: p.hardConstraints,
    preferenceWeights: p.preferenceWeights,
    positiveSignals: 0,
    negativeSignals: 0,
    confidence: "0",
    lastFeedbackAt: null,
    provenanceEventIds: [],
    metadata: p.metadata,
    createdAt: now,
    updatedAt: now,
  };
}

export function profileInputFromKey(profileKey: string): TasteProfileInput {
  const [scopeRaw, ...rest] = profileKey.split(":");
  const scope = TASTE_PROFILE_SCOPES.includes(scopeRaw as TasteProfileScope) ? (scopeRaw as TasteProfileScope) : "brand";
  const subjectId = rest.join(":") || (scope === "brand" ? "wobble" : "unknown");
  const human = subjectId
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return {
    profileKey,
    scope,
    subjectId: scope === "brand" ? "wobble" : subjectId,
    label: scope === "brand" ? "WOBBLE Brand Taste" : `${human} ${scope.charAt(0).toUpperCase() + scope.slice(1)} Taste`,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function founderSubjectFor(input: z.output<typeof feedbackEventInputSchema>): string {
  return input.founderId ?? input.actor;
}

export function profileKeysForFeedback(input: z.output<typeof feedbackEventInputSchema>): string[] {
  return unique([
    profileKeyForFeedbackScope({ scope: "brand" }),
    profileKeyForFeedbackScope({ scope: "founder", subjectId: founderSubjectFor(input) }),
    input.clientId ? profileKeyForFeedbackScope({ scope: "client", subjectId: input.clientId }) : "",
    input.projectId ? profileKeyForFeedbackScope({ scope: "project", subjectId: input.projectId }) : "",
    input.agentSlug ? profileKeyForFeedbackScope({ scope: "agent", subjectId: input.agentSlug }) : "",
    ...(input.profileKeys ?? []),
  ]);
}

export function buildFeedbackEventRow(input: FeedbackEventInput, opts: { id?: string; now?: Date } = {}): FeedbackEventRow {
  const p = feedbackEventInputSchema.parse(input);
  const now = opts.now ?? new Date();
  const profileKeys = profileKeysForFeedback(p);
  return {
    id: opts.id ?? newId("feedback"),
    targetType: p.targetType,
    targetId: p.targetId,
    decision: p.decision,
    reasonCategory: p.reasonCategory ?? null,
    reason: p.reason?.trim() || null,
    actor: p.actor,
    founderId: p.founderId ?? (p.actor ? normalizeTasteSubjectId(p.actor) : null),
    clientId: p.clientId ?? null,
    projectId: p.projectId ?? null,
    outputType: p.outputType ?? null,
    module: p.module ?? null,
    agentSlug: p.agentSlug ?? null,
    sourceIds: p.sourceIds,
    memoryBankSlugs: p.memoryBankSlugs,
    dimensions: p.dimensions,
    profileKeys,
    signalStrength: String(p.signalStrength),
    metadata: p.metadata,
    createdAt: now,
  };
}

function decisionSign(decision: FeedbackDecision): 1 | -1 {
  return decision === "reject" || decision === "archive" ? -1 : 1;
}

function profileLearningMultiplier(profile: Pick<TasteProfileRow, "scope">): number {
  if (profile.scope === "brand") return 0.35;
  return 1;
}

export function applyFeedbackToTasteProfile(profile: TasteProfileRow, event: FeedbackEventRow, opts: { now?: Date } = {}): TasteProfileRow {
  const now = opts.now ?? new Date();
  const sign = decisionSign(event.decision);
  const signalStrength = Number(event.signalStrength || 1);
  const multiplier = profileLearningMultiplier(profile);
  const preferenceWeights = { ...profile.preferenceWeights };
  let conflicts = 0;

  for (const dimension of event.dimensions) {
    const key = `${normalizeTasteSubjectId(dimension.key)}:${normalizeTasteSubjectId(dimension.value)}`;
    const previous = Number(preferenceWeights[key] ?? 0);
    const delta = sign * (dimension.weight ?? 1) * signalStrength * multiplier;
    if (previous !== 0 && delta !== 0 && Math.sign(previous) !== Math.sign(delta)) conflicts += 1;
    preferenceWeights[key] = Number((previous + delta).toFixed(4));
  }

  const positiveSignals = profile.positiveSignals + (sign > 0 ? 1 : 0);
  const negativeSignals = profile.negativeSignals + (sign < 0 ? 1 : 0);
  const signalCount = positiveSignals + negativeSignals;
  const confidence = Math.min(0.95, signalCount / 12);
  const previousConflictCount = Number(profile.metadata.conflictCount ?? 0);

  return {
    ...profile,
    preferenceWeights,
    positiveSignals,
    negativeSignals,
    confidence: confidence.toFixed(4),
    lastFeedbackAt: event.createdAt,
    provenanceEventIds: unique([...profile.provenanceEventIds, event.id]),
    metadata: {
      ...profile.metadata,
      conflictCount: previousConflictCount + conflicts,
      lastDecision: event.decision,
      lastReasonCategory: event.reasonCategory,
      lastReason: event.reason,
      lastTargetType: event.targetType,
      lastTargetId: event.targetId,
    },
    updatedAt: now,
  };
}
