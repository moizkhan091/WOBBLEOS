import { newId } from "@/lib/ids";
import { estimateCostUsd } from "@/lib/domain/cost";

/**
 * Normalized provider-usage contract (Phase 3). ONE shape for every provider call's ACTUAL usage —
 * tokens (incl. cached + reasoning), provider-reported vs internally-calculated cost, latency, attempt,
 * and full workflow/task/handoff/department/agent/tenant context. Budgets settle against this (actual),
 * never the estimate. `estimationStatus` and `verificationStatus` keep estimated and actual honestly
 * distinct — estimated usage is NEVER presented as actual.
 */

export type ProviderUsageStatus = "succeeded" | "failed";
export type EstimationStatus = "estimated" | "actual";
export type VerificationStatus = "unverified" | "verified";

export interface ProviderUsageContext {
  workflowId?: string | null;
  taskId?: string | null;
  handoffId?: string | null;
  departmentSlug?: string | null;
  agentSlug?: string | null;
  companyId?: string | null;
  clientWorkspaceId?: string | null;
  role?: string | null;
  module?: string | null;
}

export interface ProviderUsageRow {
  id: string;
  providerRequestId: string;
  provider: string;
  model: string;
  attempt: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  cachedOutputTokens: number | null;
  reasoningTokens: number | null;
  toolCalls: number;
  providerReportedCostUsd: string | null; // numeric → string for the pg driver
  calculatedCostUsd: string;
  currency: string;
  creditsConsumed: string | null;
  latencyMs: number | null;
  status: ProviderUsageStatus;
  billable: boolean;
  estimationStatus: EstimationStatus;
  verificationStatus: VerificationStatus;
  workflowId: string | null;
  taskId: string | null;
  handoffId: string | null;
  departmentSlug: string | null;
  agentSlug: string | null;
  companyId: string | null;
  clientWorkspaceId: string | null;
  role: string | null;
  module: string | null;
  modelRunId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface BuildProviderUsageInput {
  providerRequestId?: string;
  provider: string;
  model: string;
  attempt?: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  cachedOutputTokens?: number | null;
  reasoningTokens?: number | null;
  toolCalls?: number;
  /** Provider-reported cost in USD (present → verified). */
  providerReportedCostUsd?: number | null;
  /** Internally calculated cost (from pricing); computed from tokens when omitted. */
  calculatedCostUsd?: number;
  currency?: string;
  creditsConsumed?: number | null;
  latencyMs?: number | null;
  status?: ProviderUsageStatus;
  /** Failed calls settle only actual billable usage; default: billable unless a failure with no tokens. */
  billable?: boolean;
  modelRunId?: string | null;
  context?: ProviderUsageContext;
}

export function buildProviderUsageRow(input: BuildProviderUsageInput, opts: { id?: string; now?: Date } = {}): ProviderUsageRow {
  const now = opts.now ?? new Date();
  const ctx = input.context ?? {};
  const hasTokens = input.inputTokens != null || input.outputTokens != null;
  const calculated = input.calculatedCostUsd ?? estimateCostUsd({ provider: input.provider, model: input.model, inputTokens: input.inputTokens ?? undefined, outputTokens: input.outputTokens ?? undefined });
  // A failed call with no token usage is not billable; otherwise it is.
  const billable = input.billable ?? !(input.status === "failed" && !hasTokens);
  return {
    id: opts.id ?? newId("provuse"),
    providerRequestId: input.providerRequestId?.trim() || `local_${newId("preq")}`,
    provider: input.provider,
    model: input.model,
    attempt: input.attempt ?? 1,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    cachedInputTokens: input.cachedInputTokens ?? null,
    cachedOutputTokens: input.cachedOutputTokens ?? null,
    reasoningTokens: input.reasoningTokens ?? null,
    toolCalls: input.toolCalls ?? 0,
    providerReportedCostUsd: input.providerReportedCostUsd != null ? String(input.providerReportedCostUsd) : null,
    calculatedCostUsd: String(calculated),
    currency: input.currency ?? "USD",
    creditsConsumed: input.creditsConsumed != null ? String(input.creditsConsumed) : null,
    latencyMs: input.latencyMs ?? null,
    status: input.status ?? "succeeded",
    billable,
    estimationStatus: hasTokens ? "actual" : "estimated",
    verificationStatus: input.providerReportedCostUsd != null ? "verified" : "unverified",
    workflowId: ctx.workflowId ?? null,
    taskId: ctx.taskId ?? null,
    handoffId: ctx.handoffId ?? null,
    departmentSlug: ctx.departmentSlug ?? null,
    agentSlug: ctx.agentSlug ?? null,
    companyId: ctx.companyId ?? null,
    clientWorkspaceId: ctx.clientWorkspaceId ?? null,
    role: ctx.role ?? null,
    module: ctx.module ?? null,
    modelRunId: input.modelRunId ?? null,
    startedAt: null,
    completedAt: now,
    createdAt: now,
  };
}

/** The billable cost of a usage row in USD: provider-reported when present, else internally calculated. */
export function effectiveCostUsd(row: Pick<ProviderUsageRow, "providerReportedCostUsd" | "calculatedCostUsd" | "billable">): number {
  if (!row.billable) return 0;
  return row.providerReportedCostUsd != null ? Number(row.providerReportedCostUsd) : Number(row.calculatedCostUsd);
}

/** Aggregate rows for a unit of work into settled totals (cents + tokens + verification). Pure. */
export function aggregateUnitUsage(rows: ProviderUsageRow[]): { costCents: number; tokens: number; anyActual: boolean; allVerified: boolean } {
  let costUsd = 0;
  let tokens = 0;
  let anyActual = false;
  let allVerified = rows.length > 0;
  for (const r of rows) {
    costUsd += effectiveCostUsd(r);
    tokens += (r.inputTokens ?? 0) + (r.outputTokens ?? 0);
    if (r.estimationStatus === "actual") anyActual = true;
    if (r.verificationStatus !== "verified") allVerified = false;
  }
  return { costCents: Math.round(costUsd * 100), tokens, anyActual, allVerified };
}
