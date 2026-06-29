import { describe, expect, it } from "vitest";
import { evaluateBudgetGate } from "@/lib/domain/budget";

describe("evaluateBudgetGate", () => {
  it("requires explicit approval when projected spend exceeds the configured cap", () => {
    const result = evaluateBudgetGate({
      category: "video",
      projectedCost: 18,
      spentToday: 35,
      dailyCap: 50,
      batchSize: 2,
      maxBatchSize: 4,
    });

    expect(result.allowed).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.reason).toContain("daily cap");
  });

  it("blocks media batches above the maximum configured batch size", () => {
    const result = evaluateBudgetGate({
      category: "media",
      projectedCost: 2,
      spentToday: 5,
      dailyCap: 50,
      batchSize: 8,
      maxBatchSize: 4,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("batch");
  });
});
