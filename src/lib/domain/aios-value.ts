// AIOS Value / KPI framework — pure domain (Doctrine 9).
//
// A task/work inventory model + the founder-facing value KPIs computed from it (founder hours saved,
// automation %, augmentation %, fully-autonomous %, revenue/employee, cost per completed workflow,
// net ROI, payback). The whole point is HONESTY: every KPI carries an evidence-quality tier and an
// aggregate KPI is only ever as strong as its WEAKEST input, so a founder-estimate is never dressed up
// as a measured actual. Empty inventory → honest nulls, not zeros pretending to be results.
import { z } from "zod";
import { newId } from "@/lib/ids";

/** Evidence-quality tiers, ordered weakest → strongest. The order is load-bearing (see `weakestTier`). */
export const AIOS_EVIDENCE_TIERS = [
  "founder-estimate",
  "benchmark",
  "inferred",
  "measured-baseline",
  "measured-actual",
  "verified-financial",
] as const;
export type AiosEvidenceTier = (typeof AIOS_EVIDENCE_TIERS)[number];

const TIER_STRENGTH: Record<AiosEvidenceTier, number> = {
  "founder-estimate": 0,
  benchmark: 1,
  inferred: 2,
  "measured-baseline": 3,
  "measured-actual": 4,
  "verified-financial": 5,
};

/** Tiers at or below this strength are estimates and must be labeled as such, never shown as "actual". */
const ESTIMATE_MAX_STRENGTH = TIER_STRENGTH.inferred;
export function isEstimateTier(tier: AiosEvidenceTier): boolean {
  return TIER_STRENGTH[tier] <= ESTIMATE_MAX_STRENGTH;
}

/** The weakest tier across inputs — an aggregate KPI can be no stronger than its softest evidence. */
export function weakestTier(tiers: AiosEvidenceTier[]): AiosEvidenceTier | null {
  if (tiers.length === 0) return null;
  return tiers.reduce((min, t) => (TIER_STRENGTH[t] < TIER_STRENGTH[min] ? t : min));
}

/** Where a task sits on the human→machine ladder. */
export const AUTOMATION_STATES = ["manual", "augmented", "automated", "autonomous"] as const;
export type AutomationState = (typeof AUTOMATION_STATES)[number];

/** How often a task recurs. Normalized to occurrences per 30-day month for volume weighting. */
export const FREQUENCY_PERIODS = ["day", "week", "month", "quarter", "year"] as const;
export type FrequencyPeriod = (typeof FREQUENCY_PERIODS)[number];
const PERIOD_MONTHLY_FACTOR: Record<FrequencyPeriod, number> = {
  day: 30,
  week: 30 / 7,
  month: 1,
  quarter: 1 / 3,
  year: 1 / 12,
};

export interface TaskFrequency {
  per: FrequencyPeriod;
  count: number;
}

export function monthlyOccurrences(freq: TaskFrequency): number {
  return freq.count * PERIOD_MONTHLY_FACTOR[freq.per];
}

export const CONFIDENCE_LABELS = ["none", "low", "medium", "high"] as const;
export type ConfidenceLabel = (typeof CONFIDENCE_LABELS)[number];
const CONFIDENCE_ORDER: Record<ConfidenceLabel, number> = { none: 0, low: 1, medium: 2, high: 3 };
function minConfidence(labels: ConfidenceLabel[]): ConfidenceLabel {
  if (labels.length === 0) return "none";
  return labels.reduce((min, l) => (CONFIDENCE_ORDER[l] < CONFIDENCE_ORDER[min] ? l : min));
}

export interface TaskInventoryItem {
  id: string;
  task: string;
  owner: string;
  department: string;
  frequency: TaskFrequency;
  /** Minutes one occurrence took BEFORE the AIOS touched it. */
  baselineMinutes: number;
  /** Minutes of human execution one occurrence takes NOW (excludes review — that's separate). */
  currentMinutes: number;
  automationState: AutomationState;
  /** Added human oversight per occurrence for augmented/autonomous work. */
  humanReviewMinutes: number;
  /** Where baseline/current came from — sets the ceiling on how strongly savings can be claimed. */
  evidenceSource: AiosEvidenceTier;
  confidence: ConfidenceLabel;
  /** Occurrences observed as completed (drives cost-per-workflow). Null = not tracked. */
  completedCount: number | null;
  metadata: Record<string, unknown>;
}

const taskInventorySchema = z.object({
  task: z.string().trim().min(1),
  owner: z.string().trim().min(1),
  department: z.string().trim().min(1),
  frequency: z.object({ per: z.enum(FREQUENCY_PERIODS), count: z.number().positive() }),
  baselineMinutes: z.number().min(0),
  currentMinutes: z.number().min(0),
  automationState: z.enum(AUTOMATION_STATES),
  humanReviewMinutes: z.number().min(0).default(0),
  evidenceSource: z.enum(AIOS_EVIDENCE_TIERS),
  confidence: z.enum(CONFIDENCE_LABELS).default("low"),
  completedCount: z.number().min(0).nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type TaskInventoryInput = z.input<typeof taskInventorySchema>;

export function buildTaskInventoryItem(input: TaskInventoryInput, opts: { id?: string } = {}): TaskInventoryItem {
  const p = taskInventorySchema.parse(input);
  return {
    id: opts.id ?? newId("task"),
    task: p.task,
    owner: p.owner,
    department: p.department,
    frequency: p.frequency,
    baselineMinutes: p.baselineMinutes,
    currentMinutes: p.currentMinutes,
    automationState: p.automationState,
    humanReviewMinutes: p.humanReviewMinutes,
    evidenceSource: p.evidenceSource,
    confidence: p.confidence,
    completedCount: p.completedCount,
    metadata: p.metadata,
  };
}

/** Net minutes saved per occurrence: baseline − (current human time + review). May be negative (truthful). */
export function netMinutesSavedPerOccurrence(item: TaskInventoryItem): number {
  return item.baselineMinutes - item.currentMinutes - item.humanReviewMinutes;
}

/** Monthly minutes saved for a task = per-occurrence net × monthly occurrences. */
export function monthlyMinutesSaved(item: TaskInventoryItem): number {
  return netMinutesSavedPerOccurrence(item) * monthlyOccurrences(item.frequency);
}

/** Org-level inputs the task inventory can't supply. Each financial input carries its own evidence tier. */
export interface AiosOrgMetrics {
  headcount: number | null;
  revenueCents: number | null;
  /** The period `revenueCents` covers, in months (e.g. 1 = MRR, 12 = ARR). */
  revenuePeriodMonths: number;
  revenueEvidenceTier: AiosEvidenceTier | null;
  /** Monthly cost of running the automation (provider spend + tooling) in cents. */
  automationCostCentsPerMonth: number | null;
  automationCostEvidenceTier: AiosEvidenceTier | null;
  /** Loaded value of a founder hour, in cents — used to price saved hours for ROI. */
  founderHourlyRateCents: number | null;
  founderHourlyRateEvidenceTier: AiosEvidenceTier | null;
  /** Who counts as a founder (owners whose saved time rolls into "founder hours saved"). */
  founders: string[];
}

export interface AiosValueInputs {
  tasks: TaskInventoryItem[];
  org: AiosOrgMetrics;
}

export type AiosKpiUnit = "hours" | "ratio" | "cents_per_employee" | "cents_per_workflow" | "months" | "count";

export interface AiosKpi {
  key: string;
  label: string;
  definition: string;
  /** Null = not enough evidence to state a value (honest gap), not "zero". */
  value: number | null;
  unit: AiosKpiUnit;
  /** The aggregate tier — the weakest contributing input. Null when value is null. */
  evidenceTier: AiosEvidenceTier | null;
  /** True when `evidenceTier` is an estimate tier: the UI must NOT render this as a measured actual. */
  isEstimate: boolean;
  confidence: ConfidenceLabel;
  inputsCount: number;
  note?: string;
}

function kpi(partial: Omit<AiosKpi, "isEstimate">): AiosKpi {
  return { ...partial, isEstimate: partial.evidenceTier ? isEstimateTier(partial.evidenceTier) : false };
}

const round = (n: number, dp = 2): number => Math.round(n * 10 ** dp) / 10 ** dp;

/**
 * Compute the AIOS value KPIs from the task inventory + org metrics. Pure and deterministic. Every KPI is
 * honest: null when unsupported, evidence-tiered to its weakest input, and flagged `isEstimate` so an
 * estimate is never presented as an actual.
 */
export function computeAiosValue(inputs: AiosValueInputs): AiosKpi[] {
  const { tasks, org } = inputs;
  const founders = new Set(org.founders);

  // --- Hours saved -----------------------------------------------------------------------------
  const allTiers = tasks.map((t) => t.evidenceSource);
  const totalMinutes = tasks.reduce((s, t) => s + monthlyMinutesSaved(t), 0);
  const founderTasks = tasks.filter((t) => founders.has(t.owner));
  const founderMinutes = founderTasks.reduce((s, t) => s + monthlyMinutesSaved(t), 0);

  const hoursSavedTotal = kpi({
    key: "hours_saved_total",
    label: "Hours saved / month",
    definition: "Σ (baseline − current − review) × monthly occurrences, all owners, in hours.",
    value: tasks.length ? round(totalMinutes / 60, 1) : null,
    unit: "hours",
    evidenceTier: weakestTier(allTiers),
    confidence: minConfidence(tasks.map((t) => t.confidence)),
    inputsCount: tasks.length,
  });

  const founderHoursSaved = kpi({
    key: "founder_hours_saved",
    label: "Founder hours saved / month",
    definition: "Same as hours saved, restricted to tasks owned by a founder.",
    value: founderTasks.length ? round(founderMinutes / 60, 1) : null,
    unit: "hours",
    evidenceTier: weakestTier(founderTasks.map((t) => t.evidenceSource)),
    confidence: minConfidence(founderTasks.map((t) => t.confidence)),
    inputsCount: founderTasks.length,
    note: founderTasks.length ? undefined : "No tasks owned by a configured founder.",
  });

  // --- State mix (volume-weighted by monthly occurrences) --------------------------------------
  const occByState: Record<AutomationState, number> = { manual: 0, augmented: 0, automated: 0, autonomous: 0 };
  let totalOcc = 0;
  for (const t of tasks) {
    const occ = monthlyOccurrences(t.frequency);
    occByState[t.automationState] += occ;
    totalOcc += occ;
  }
  const stateTier = weakestTier(allTiers);
  const stateConf = minConfidence(tasks.map((t) => t.confidence));
  const share = (n: number): number | null => (totalOcc > 0 ? round(n / totalOcc, 3) : null);

  const automationPct = kpi({
    key: "automation_pct",
    label: "Automation %",
    definition: "Share of monthly work occurrences that are automated or autonomous.",
    value: share(occByState.automated + occByState.autonomous),
    unit: "ratio",
    evidenceTier: totalOcc > 0 ? stateTier : null,
    confidence: stateConf,
    inputsCount: tasks.length,
  });
  const augmentationPct = kpi({
    key: "augmentation_pct",
    label: "Augmentation %",
    definition: "Share of monthly work occurrences that are augmented (human-in-the-loop).",
    value: share(occByState.augmented),
    unit: "ratio",
    evidenceTier: totalOcc > 0 ? stateTier : null,
    confidence: stateConf,
    inputsCount: tasks.length,
  });
  const autonomousPct = kpi({
    key: "fully_autonomous_pct",
    label: "Fully-autonomous %",
    definition: "Share of monthly work occurrences that run fully autonomously.",
    value: share(occByState.autonomous),
    unit: "ratio",
    evidenceTier: totalOcc > 0 ? stateTier : null,
    confidence: stateConf,
    inputsCount: tasks.length,
  });

  // --- Revenue / employee ----------------------------------------------------------------------
  const revPerEmployee = kpi({
    key: "revenue_per_employee",
    label: "Revenue / employee (monthly)",
    definition: "Monthly revenue ÷ headcount, in cents.",
    value:
      org.revenueCents !== null && org.headcount && org.headcount > 0 && org.revenuePeriodMonths > 0
        ? Math.round(org.revenueCents / org.revenuePeriodMonths / org.headcount)
        : null,
    unit: "cents_per_employee",
    evidenceTier: org.revenueCents !== null && org.headcount ? org.revenueEvidenceTier : null,
    confidence: org.revenueCents !== null && org.headcount ? "medium" : "none",
    inputsCount: org.headcount ?? 0,
  });

  // --- Cost per completed workflow -------------------------------------------------------------
  const completedThisMonth = tasks.reduce((s, t) => {
    if (t.completedCount !== null) return s + t.completedCount;
    // fall back to modeled monthly occurrences for machine-run work
    if (t.automationState === "automated" || t.automationState === "autonomous") return s + monthlyOccurrences(t.frequency);
    return s;
  }, 0);
  const costTiers = [org.automationCostEvidenceTier, weakestTier(allTiers)].filter((t): t is AiosEvidenceTier => t !== null);
  const costPerWorkflow = kpi({
    key: "cost_per_completed_workflow",
    label: "Cost / completed workflow",
    definition: "Monthly automation cost ÷ completed workflows this month, in cents.",
    value: org.automationCostCentsPerMonth !== null && completedThisMonth > 0 ? Math.round(org.automationCostCentsPerMonth / completedThisMonth) : null,
    unit: "cents_per_workflow",
    evidenceTier: org.automationCostCentsPerMonth !== null && completedThisMonth > 0 ? weakestTier(costTiers) : null,
    confidence: org.automationCostCentsPerMonth !== null && completedThisMonth > 0 ? "low" : "none",
    inputsCount: Math.round(completedThisMonth),
  });

  // --- Net ROI + payback -----------------------------------------------------------------------
  // Monthly value of saved founder time (priced at the founder rate) vs monthly automation cost.
  const canPrice = org.founderHourlyRateCents !== null && founderTasks.length > 0;
  const monthlyValueCents = canPrice ? (founderMinutes / 60) * org.founderHourlyRateCents! : null;
  const roiTiers = [weakestTier(founderTasks.map((t) => t.evidenceSource)), org.founderHourlyRateEvidenceTier, org.automationCostEvidenceTier].filter(
    (t): t is AiosEvidenceTier => t !== null,
  );
  const haveRoi = monthlyValueCents !== null && org.automationCostCentsPerMonth !== null && org.automationCostCentsPerMonth > 0;
  const netRoi = kpi({
    key: "net_roi_monthly",
    label: "Net ROI (monthly)",
    definition: "(value of founder hours saved − automation cost) ÷ automation cost.",
    value: haveRoi ? round((monthlyValueCents! - org.automationCostCentsPerMonth!) / org.automationCostCentsPerMonth!, 2) : null,
    unit: "ratio",
    evidenceTier: haveRoi ? weakestTier(roiTiers) : null,
    confidence: haveRoi ? minConfidence(founderTasks.map((t) => t.confidence)) : "none",
    inputsCount: founderTasks.length,
    note: haveRoi ? undefined : "Needs founder hourly rate, founder-owned savings, and automation cost.",
  });

  const havePayback = monthlyValueCents !== null && monthlyValueCents > 0 && org.automationCostCentsPerMonth !== null;
  const payback = kpi({
    key: "payback_months",
    label: "Payback (months)",
    definition: "Automation cost ÷ monthly value of saved founder time.",
    value: havePayback ? round(org.automationCostCentsPerMonth! / monthlyValueCents!, 2) : null,
    unit: "months",
    evidenceTier: havePayback ? weakestTier(roiTiers) : null,
    confidence: havePayback ? minConfidence(founderTasks.map((t) => t.confidence)) : "none",
    inputsCount: founderTasks.length,
  });

  return [hoursSavedTotal, founderHoursSaved, automationPct, augmentationPct, autonomousPct, revPerEmployee, costPerWorkflow, netRoi, payback];
}

export interface AiosValueScope {
  type: "company" | "department" | "client" | "project";
  id?: string | null;
  label?: string;
}

export interface AiosValueSnapshot {
  id: string;
  scope: AiosValueScope;
  generatedAt: Date;
  isEmpty: boolean;
  taskCount: number;
  kpis: AiosKpi[];
  /** Weakest tier present across all non-null KPIs — the honest ceiling on the whole snapshot. */
  overallEvidenceTier: AiosEvidenceTier | null;
  note: string;
}

/** Wrap computed KPIs into a scoped snapshot with an honest overall evidence ceiling + empty handling. */
export function buildAiosValueSnapshot(scope: AiosValueScope, inputs: AiosValueInputs, opts: { now: Date; id?: string }): AiosValueSnapshot {
  const kpis = computeAiosValue(inputs);
  const isEmpty = inputs.tasks.length === 0;
  const presentTiers = kpis.map((k) => k.evidenceTier).filter((t): t is AiosEvidenceTier => t !== null);
  const scopeName = scope.label ?? (scope.id ? `${scope.type}:${scope.id}` : scope.type);
  return {
    id: opts.id ?? newId("aios_value"),
    scope,
    generatedAt: opts.now,
    isEmpty,
    taskCount: inputs.tasks.length,
    kpis,
    overallEvidenceTier: weakestTier(presentTiers),
    note: isEmpty
      ? `No task inventory for ${scopeName}; KPIs are null until work is inventoried.`
      : `${inputs.tasks.length} task${inputs.tasks.length === 1 ? "" : "s"} inventoried for ${scopeName}.`,
  };
}
