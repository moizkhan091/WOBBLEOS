// Daily Founder Brief — pure domain (Doctrine 8).
//
// Assembles a scoped, evidence-linked, progressive-disclosure brief from ALREADY-normalized
// signals that injectable providers fetch from existing WOBBLE stores (escalations, department
// KPIs, intelligence, CRM movement, finance alerts, delivery risks, provider/connection health,
// approvals due). This module NEVER touches the DB and NEVER fabricates: every signal carries at
// least one evidence link, a confidence, and a freshness stamp, and any signal that arrives without
// evidence is rejected (a provider bug), not invented into existence.
import { z } from "zod";
import { newId } from "@/lib/ids";

export const BRIEF_SCOPE_TYPES = ["company", "department", "client", "project"] as const;
export type BriefScopeType = (typeof BRIEF_SCOPE_TYPES)[number];

export const BRIEF_CADENCES = ["daily", "weekly", "monthly", "on_demand"] as const;
export type BriefCadence = (typeof BRIEF_CADENCES)[number];

/** The eight founder-relevant signal families the brief assembles. */
export const SIGNAL_CATEGORIES = [
  "escalation",
  "approval_due",
  "finance_alert",
  "delivery_risk",
  "provider_health",
  "kpi",
  "crm_movement",
  "intelligence",
] as const;
export type SignalCategory = (typeof SIGNAL_CATEGORIES)[number];

export const SIGNAL_SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export type SignalSeverity = (typeof SIGNAL_SEVERITIES)[number];

export const CONFIDENCE_LABELS = ["none", "low", "medium", "high"] as const;
export type ConfidenceLabel = (typeof CONFIDENCE_LABELS)[number];

/** A verifiable pointer back to the source record. Never optional in aggregate — a signal needs ≥1. */
export interface EvidenceLink {
  /** Source kind, e.g. "escalation" | "handoff" | "kpi" | "approval" | "intelligence_item" | "crm_deal" | "finance_alert" | "connection". */
  kind: string;
  /** The source entity id. */
  ref: string;
  label: string;
  /** Optional deep link into the OS UI (relative route) — the lead wires this to real drill-to-evidence. */
  href?: string;
}

export interface BriefScope {
  type: BriefScopeType;
  /** Entity id for department/client/project scope; null/undefined = company-wide. */
  id?: string | null;
  label?: string;
  cadence: BriefCadence;
}

export interface SignalConfidence {
  label: ConfidenceLabel;
  /** 0..1 — used for ranking; the label is what the founder sees. */
  score: number;
}

/** Comparison-to-goal placeholder. `onTrack`/`delta` are null when there is no target yet. */
export interface BriefComparison {
  metric: string;
  current: number | null;
  target: number | null;
  unit?: string;
  delta: number | null;
  onTrack: boolean | null;
}

/** A normalized signal ready to rank. Providers return drafts (below); the service builds these. */
export interface BriefSignal {
  id: string;
  category: SignalCategory;
  title: string;
  summary: string;
  severity: SignalSeverity;
  confidence: SignalConfidence;
  /** When the underlying data was last observed; null = freshness unknown (ranked conservatively). */
  freshnessAt: Date | null;
  /** REQUIRED, non-empty. The anti-fabrication guarantee. */
  evidence: EvidenceLink[];
  scope: BriefScope;
  comparisonToGoal: BriefComparison | null;
  /** True for signals that need a founder action (e.g. approvals due). Floats them up. */
  actionRequired: boolean;
  metadata: Record<string, unknown>;
}

const evidenceSchema = z.object({
  kind: z.string().trim().min(1),
  ref: z.string().trim().min(1),
  label: z.string().trim().min(1),
  href: z.string().trim().min(1).optional(),
});

const comparisonSchema = z.object({
  metric: z.string().trim().min(1),
  current: z.number().nullable(),
  target: z.number().nullable(),
  unit: z.string().trim().min(1).optional(),
  delta: z.number().nullable(),
  onTrack: z.boolean().nullable(),
});

/** What a provider returns per signal — no id (assigned on build), evidence REQUIRED and non-empty. */
export const briefSignalDraftSchema = z.object({
  category: z.enum(SIGNAL_CATEGORIES),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  severity: z.enum(SIGNAL_SEVERITIES).default("medium"),
  confidence: z.object({ label: z.enum(CONFIDENCE_LABELS), score: z.number().min(0).max(1) }),
  freshnessAt: z.date().nullable().default(null),
  evidence: z.array(evidenceSchema).min(1, "a brief signal must carry at least one evidence link"),
  scope: z.object({
    type: z.enum(BRIEF_SCOPE_TYPES),
    id: z.string().trim().min(1).nullable().optional(),
    label: z.string().trim().min(1).optional(),
    cadence: z.enum(BRIEF_CADENCES),
  }),
  comparisonToGoal: comparisonSchema.nullable().default(null),
  actionRequired: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type BriefSignalDraft = z.input<typeof briefSignalDraftSchema>;

/**
 * Build + validate a signal from a provider draft. Throws if the draft carries no evidence — the brief
 * never invents a source. Use `safeBuildBriefSignal` in the service to omit-and-count instead of crashing.
 */
export function buildBriefSignal(draft: BriefSignalDraft, opts: { id?: string } = {}): BriefSignal {
  const parsed = briefSignalDraftSchema.parse(draft);
  return {
    id: opts.id ?? newId("signal"),
    category: parsed.category,
    title: parsed.title,
    summary: parsed.summary,
    severity: parsed.severity,
    confidence: parsed.confidence,
    freshnessAt: parsed.freshnessAt,
    evidence: parsed.evidence,
    scope: { type: parsed.scope.type, id: parsed.scope.id ?? null, label: parsed.scope.label, cadence: parsed.scope.cadence },
    comparisonToGoal: parsed.comparisonToGoal,
    actionRequired: parsed.actionRequired,
    metadata: parsed.metadata,
  };
}

const SEVERITY_WEIGHT: Record<SignalSeverity, number> = { critical: 1.0, high: 0.8, medium: 0.55, low: 0.3, info: 0.15 };
const SEVERITY_RANK: Record<SignalSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
/** Category priority — escalations/approvals/finance outrank slower-moving intelligence. */
const CATEGORY_WEIGHT: Record<SignalCategory, number> = {
  escalation: 1.0,
  approval_due: 0.9,
  finance_alert: 0.85,
  delivery_risk: 0.8,
  provider_health: 0.7,
  kpi: 0.6,
  crm_movement: 0.55,
  intelligence: 0.5,
};
const CONFIDENCE_ORDER: Record<ConfidenceLabel, number> = { none: 0, low: 1, medium: 2, high: 3 };

export function confidenceLabelFromScore(score: number): ConfidenceLabel {
  if (score <= 0) return "none";
  if (score < 0.4) return "low";
  if (score < 0.75) return "medium";
  return "high";
}

/** The weakest (most cautious) confidence across a set — null when the set is empty. */
export function minConfidenceLabel(labels: ConfidenceLabel[]): ConfidenceLabel | null {
  if (labels.length === 0) return null;
  return labels.reduce((min, l) => (CONFIDENCE_ORDER[l] < CONFIDENCE_ORDER[min] ? l : min));
}

/** Exponential freshness: 1.0 at now, halving every `halfLifeHours`. Unknown freshness → conservative 0.5. */
export function freshnessScore(freshnessAt: Date | null, now: Date, halfLifeHours: number): number {
  if (!freshnessAt) return 0.5;
  const ageHours = Math.max(0, (now.getTime() - freshnessAt.getTime()) / 3_600_000);
  return Math.pow(0.5, ageHours / Math.max(halfLifeHours, 0.0001));
}

export interface RankedSignal {
  signal: BriefSignal;
  score: number;
  rank: number;
}

export interface RankOptions {
  now: Date;
  halfLifeHours?: number;
}

/** Composite score in 0..1. Deterministic: severity + category + confidence + freshness + action bump. */
export function scoreSignal(signal: BriefSignal, opts: RankOptions): number {
  const fresh = freshnessScore(signal.freshnessAt, opts.now, opts.halfLifeHours ?? 48);
  const base =
    SEVERITY_WEIGHT[signal.severity] * 0.4 +
    CATEGORY_WEIGHT[signal.category] * 0.25 +
    signal.confidence.score * 0.15 +
    fresh * 0.2;
  const bumped = signal.actionRequired ? base + 0.05 : base;
  return Math.min(1, Math.round(bumped * 10000) / 10000);
}

/** Rank signals highest-first. Stable tie-break: score → severity → category weight → id. */
export function rankSignals(signals: BriefSignal[], opts: RankOptions): RankedSignal[] {
  const scored = signals.map((signal) => ({ signal, score: scoreSignal(signal, opts) }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (SEVERITY_RANK[b.signal.severity] !== SEVERITY_RANK[a.signal.severity]) return SEVERITY_RANK[b.signal.severity] - SEVERITY_RANK[a.signal.severity];
    if (CATEGORY_WEIGHT[b.signal.category] !== CATEGORY_WEIGHT[a.signal.category]) return CATEGORY_WEIGHT[b.signal.category] - CATEGORY_WEIGHT[a.signal.category];
    return a.signal.id < b.signal.id ? -1 : a.signal.id > b.signal.id ? 1 : 0;
  });
  return scored.map((s, i) => ({ signal: s.signal, score: s.score, rank: i + 1 }));
}

const CATEGORY_LABEL: Record<SignalCategory, string> = {
  escalation: "Escalations",
  approval_due: "Approvals due",
  finance_alert: "Finance alerts",
  delivery_risk: "Delivery risks",
  provider_health: "Provider health",
  kpi: "KPIs vs goal",
  crm_movement: "CRM movement",
  intelligence: "Intelligence",
};

export interface BriefSection {
  category: SignalCategory;
  label: string;
  count: number;
  highestSeverity: SignalSeverity | null;
  /** Full ranked list for progressive disclosure — the UI shows the top item and expands to the rest. */
  items: RankedSignal[];
}

export interface FounderBrief {
  id: string;
  scope: BriefScope;
  generatedAt: Date;
  isEmpty: boolean;
  totalSignals: number;
  freshnessWindow: { oldest: Date | null; newest: Date | null };
  /** Top-N ranked signals across all categories (progressive-disclosure headline). */
  headline: RankedSignal[];
  /** Every signal grouped by category, ranked within — the expandable body. */
  sections: BriefSection[];
  /** Weakest confidence present, so the founder sees how much to trust the brief at a glance. */
  lowestConfidence: ConfidenceLabel | null;
  /** Categories whose provider failed or was unavailable — honest coverage gaps, not silent drops. */
  degradedCategories: SignalCategory[];
  /** Count of provider signals omitted for missing/invalid evidence (anti-fabrication). */
  omittedSignals: number;
  /**
   * APPROVED trusted-context guidance for INTERPRETING the brief (founder-approved standing priorities/facts) —
   * a DISTINCT block, NOT a signal: it never adds to `totalSignals`, `headline` or `sections`, and never
   * fabricates operational data. Null when none / not wired.
   */
  trustedContext: string | null;
  note: string;
}

export interface AssembleOptions {
  now: Date;
  topN?: number;
  halfLifeHours?: number;
  id?: string;
  degradedCategories?: SignalCategory[];
  omittedSignals?: number;
  /** APPROVED trusted-context guidance block (distinct from signals; never fabricates operational data). */
  trustedContext?: string | null;
}

function highestSeverity(signals: BriefSignal[]): SignalSeverity | null {
  if (signals.length === 0) return null;
  return signals.reduce<SignalSeverity>((max, s) => (SEVERITY_RANK[s.severity] > SEVERITY_RANK[max] ? s.severity : max), "info");
}

/**
 * Assemble the founder brief from normalized signals. Pure and deterministic. Honest-empty when there are
 * no signals. Progressive disclosure = top-N headline + per-category sections that carry the full ranked list.
 */
export function assembleFounderBrief(scope: BriefScope, signals: BriefSignal[], opts: AssembleOptions): FounderBrief {
  const topN = Math.max(1, opts.topN ?? 5);
  const degraded = opts.degradedCategories ?? [];
  const omitted = opts.omittedSignals ?? 0;
  const ranked = rankSignals(signals, { now: opts.now, halfLifeHours: opts.halfLifeHours });

  const freshTimes = signals.map((s) => s.freshnessAt).filter((d): d is Date => d !== null).map((d) => d.getTime());
  const freshnessWindow = {
    oldest: freshTimes.length ? new Date(Math.min(...freshTimes)) : null,
    newest: freshTimes.length ? new Date(Math.max(...freshTimes)) : null,
  };

  const sections: BriefSection[] = SIGNAL_CATEGORIES.map((category) => {
    const items = ranked.filter((r) => r.signal.category === category);
    return {
      category,
      label: CATEGORY_LABEL[category],
      count: items.length,
      highestSeverity: highestSeverity(items.map((r) => r.signal)),
      items,
    };
  }).filter((s) => s.count > 0);

  const lowestConfidence = minConfidenceLabel(signals.map((s) => s.confidence.label));
  const isEmpty = signals.length === 0;
  const scopeName = scope.label ?? (scope.id ? `${scope.type}:${scope.id}` : scope.type);

  let note: string;
  if (isEmpty && degraded.length === 0) {
    note = `No founder-relevant signals for ${scopeName} in this ${scope.cadence} window.`;
  } else if (isEmpty) {
    note = `No signals assembled for ${scopeName}; coverage degraded for: ${degraded.join(", ")}.`;
  } else {
    const parts = [`${signals.length} signal${signals.length === 1 ? "" : "s"} across ${sections.length} categor${sections.length === 1 ? "y" : "ies"} for ${scopeName}.`];
    if (degraded.length) parts.push(`Coverage degraded: ${degraded.join(", ")}.`);
    if (omitted) parts.push(`${omitted} omitted for missing evidence.`);
    note = parts.join(" ");
  }

  return {
    id: opts.id ?? newId("brief"),
    scope,
    generatedAt: opts.now,
    isEmpty,
    totalSignals: signals.length,
    freshnessWindow,
    headline: ranked.slice(0, topN),
    sections,
    lowestConfidence,
    degradedCategories: degraded,
    omittedSignals: omitted,
    trustedContext: opts.trustedContext ?? null,
    note,
  };
}
