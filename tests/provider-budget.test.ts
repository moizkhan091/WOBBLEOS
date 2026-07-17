import { describe, expect, it } from "vitest";
import {
  PROVIDER_BUDGETS,
  wouldExceedBudget,
  assertProviderAllowance,
  ProviderBudgetExceededError,
  type ProviderBudget,
} from "@/lib/provider-budget";

/**
 * External paid-provider budget control (campaign expansion). The gate every paid call passes: worst-case
 * charge may never breach the INTERNAL stop threshold, and an untracked provider is never silently
 * unlimited-billed. The arithmetic is pure so it is tested away from the DB.
 */
describe("provider budget control", () => {
  const usd: ProviderBudget = { ceiling: 3.0, stop: 2.7, unit: "usd" };

  it("wouldExceedBudget rejects on the pessimistic (worst-case) bound, not the expected", () => {
    expect(wouldExceedBudget(2.5, 0.15, usd)).toBe(false); // 2.65 ≤ 2.7
    expect(wouldExceedBudget(2.6, 0.15, usd)).toBe(true); // 2.75 > 2.7 → blocked BEFORE the $3 ceiling
    expect(wouldExceedBudget(2.7, 0.0001, usd)).toBe(true); // already at stop
  });

  it("assertProviderAllowance THROWS with the exact overage when spend+worst-case would breach the stop", async () => {
    await expect(
      assertProviderAllowance("openrouter", 0.5, { getSpent: async () => 2.5 }),
    ).rejects.toBeInstanceOf(ProviderBudgetExceededError);
  });

  it("assertProviderAllowance allows a call safely under the stop and reports remaining", async () => {
    const r = await assertProviderAllowance("openrouter", 0.1, { getSpent: async () => 1.0 });
    expect(r.tracked).toBe(true);
    expect(r.spent).toBe(1.0);
    expect(r.remaining).toBeCloseTo(1.7, 5); // 2.7 stop − 1.0 spent
  });

  it("an UNTRACKED provider is never silently unlimited — reported as not-tracked (caller must register a budget)", async () => {
    const r = await assertProviderAllowance("some_new_paid_api", 999, { getSpent: async () => 0 });
    expect(r.tracked).toBe(false);
    expect(r.budget).toBeNull();
  });

  it("the founder-set UAT ceilings/stops are exactly as specified", () => {
    expect(PROVIDER_BUDGETS.openrouter).toEqual({ ceiling: 3.0, stop: 2.7, unit: "usd" });
    expect(PROVIDER_BUDGETS.tavily).toEqual({ ceiling: 500, stop: 380, unit: "credits" });
    expect(PROVIDER_BUDGETS.apify).toEqual({ ceiling: 2.0, stop: 1.0, unit: "usd" });
    // every stop is strictly below its ceiling so an in-flight call cannot cross the hard limit
    for (const b of Object.values(PROVIDER_BUDGETS)) expect(b.stop).toBeLessThan(b.ceiling);
  });
});
