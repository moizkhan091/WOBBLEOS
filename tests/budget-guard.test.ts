import { describe, expect, it, vi } from "vitest";
import { guardBudget, type GuardBudgetDeps } from "@/lib/budget";
import type { CreateApprovalInput, ApprovalRow } from "@/lib/approvals";

const cap = { dailyCap: 25, maxBatchSize: 50 };

function depsWith(spent: number, approvalCreator?: (i: CreateApprovalInput) => Promise<ApprovalRow>): GuardBudgetDeps {
  return {
    spentToday: async () => spent,
    createApproval: approvalCreator,
  };
}

describe("guardBudget", () => {
  it("allows a job within the daily cap and batch limit", async () => {
    const res = await guardBudget({ category: "openrouter", projectedCost: 1, cap }, depsWith(0));
    expect(res.allowed).toBe(true);
    expect(res.requiresApproval).toBe(false);
    expect(res.approvalId).toBeUndefined();
    expect(res.spentToday).toBe(0);
  });

  it("blocks and raises a high-risk approval when projected spend exceeds the cap", async () => {
    const created: CreateApprovalInput[] = [];
    const creator = async (i: CreateApprovalInput) => {
      created.push(i);
      return { id: "approval_budget_1" } as ApprovalRow;
    };

    const res = await guardBudget(
      { category: "openrouter", projectedCost: 5, cap, entity: { type: "content_job", id: "job_1" }, requestedBy: "Moiz" },
      depsWith(24, creator),
    );

    expect(res.allowed).toBe(false);
    expect(res.requiresApproval).toBe(true);
    expect(res.approvalId).toBe("approval_budget_1");
    expect(created[0]).toMatchObject({ approvalType: "budget", riskLevel: "high", confirmationRequired: true, entityId: "job_1" });
  });

  it("blocks when batch size exceeds the max", async () => {
    const res = await guardBudget({ category: "media", projectedCost: 1, batchSize: 100, cap }, depsWith(0));
    expect(res.allowed).toBe(false);
    expect(res.requiresApproval).toBe(true);
  });

  it("does not create an approval when no creator/entity is provided", async () => {
    const creator = vi.fn();
    const res = await guardBudget({ category: "openrouter", projectedCost: 100, cap }, { spentToday: async () => 0, createApproval: creator as never });
    expect(res.allowed).toBe(false);
    expect(res.approvalId).toBeUndefined();
    expect(creator).not.toHaveBeenCalled(); // no entity -> no approval raised
  });
});
