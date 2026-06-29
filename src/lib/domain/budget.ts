export interface BudgetGateInput {
  category: "openrouter" | "search" | "media" | "video";
  projectedCost: number;
  spentToday: number;
  dailyCap: number;
  batchSize: number;
  maxBatchSize: number;
}

export interface BudgetGateResult {
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
}

export function evaluateBudgetGate(input: BudgetGateInput): BudgetGateResult {
  if (input.batchSize > input.maxBatchSize) {
    return {
      allowed: false,
      requiresApproval: true,
      reason: `${input.category} batch size ${input.batchSize} exceeds max batch size ${input.maxBatchSize}`,
    };
  }

  const projectedTotal = input.spentToday + input.projectedCost;
  if (projectedTotal > input.dailyCap) {
    return {
      allowed: false,
      requiresApproval: true,
      reason: `${input.category} projected spend exceeds daily cap: ${projectedTotal} > ${input.dailyCap}`,
    };
  }

  return {
    allowed: true,
    requiresApproval: false,
    reason: `${input.category} job is within configured budget limits`,
  };
}
