import { evaluateBudgetGate, type BudgetGateInput, type BudgetGateResult } from "@/lib/domain/budget";
import { createApproval, type CreateApprovalInput, type ApprovalRow } from "@/lib/approvals";
import { sumEstimatedCostSince } from "@/lib/model-runs";
import { getDb, type Db } from "@/db";

/**
 * Chunk 05/07: Budget guard service.
 *
 * Wraps the pure `evaluateBudgetGate` (domain) with a real spend lookup and an
 * optional approval. When a job would exceed the daily cap or batch limit, the
 * guard can BLOCK it and raise a high-risk "budget" approval (reusing Chunk 04).
 * Spend lookup + approval creation are injectable so this is testable without a
 * database.
 */

export type BudgetCategory = BudgetGateInput["category"];

export interface BudgetCapConfig {
  dailyCap: number;
  maxBatchSize: number;
}

export interface GuardBudgetInput {
  category: BudgetCategory;
  projectedCost: number;
  batchSize?: number;
  cap: BudgetCapConfig;
  /** the job/entity this spend is for; required to raise an approval */
  entity?: { type: string; id: string };
  requestedBy?: string;
}

export interface GuardBudgetDeps {
  spentToday: (category: BudgetCategory) => Promise<number>;
  createApproval?: (input: CreateApprovalInput) => Promise<ApprovalRow>;
}

export interface GuardBudgetResult extends BudgetGateResult {
  spentToday: number;
  approvalId?: string;
}

export async function guardBudget(input: GuardBudgetInput, deps: GuardBudgetDeps): Promise<GuardBudgetResult> {
  const spent = await deps.spentToday(input.category);

  const gate = evaluateBudgetGate({
    category: input.category,
    projectedCost: input.projectedCost,
    spentToday: spent,
    dailyCap: input.cap.dailyCap,
    batchSize: input.batchSize ?? 1,
    maxBatchSize: input.cap.maxBatchSize,
  });

  if (gate.requiresApproval && deps.createApproval && input.entity) {
    const approval = await deps.createApproval({
      approvalType: "budget",
      entityType: input.entity.type,
      entityId: input.entity.id,
      riskLevel: "high",
      requestedBy: input.requestedBy,
      confirmationRequired: true,
      notes: gate.reason,
      metadata: {
        category: input.category,
        projectedCost: input.projectedCost,
        spentToday: spent,
        dailyCap: input.cap.dailyCap,
      },
    });
    return { ...gate, spentToday: spent, approvalId: approval.id };
  }

  return { ...gate, spentToday: spent };
}

/** Default spend source for LLM (model_runs-backed) categories: today's logged model-run cost. */
export async function modelRunSpentToday(now: Date = new Date(), db: Db = getDb()): Promise<number> {
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  return sumEstimatedCostSince(startOfToday, db);
}

/** Convenience: wire the real DB spend source + real approval creation. */
export function defaultGuardDeps(now?: Date): GuardBudgetDeps {
  return {
    spentToday: () => modelRunSpentToday(now),
    createApproval: (input) => createApproval(input),
  };
}
