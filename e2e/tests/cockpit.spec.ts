import { test, expect } from "@playwright/test";

/**
 * Intelligence Cockpit — the founder aggregation surface (real DB effects). It reads real operational systems and
 * reports real counts + a coherent shape; nothing is fabricated (empty stores → honest zeros/nulls).
 */
test.describe("Intelligence Cockpit — real aggregation (real effects)", () => {
  test("the founder cockpit returns a coherent, real aggregation", async ({ request }) => {
    const res = await request.get("/api/cockpit");
    expect(res.ok()).toBe(true);
    const c = ((await res.json()) as { cockpit: { revenue: { periodMonths: number }; optimizer: { proposed: number; active: number; total: number }; autonomy: { activeGrants: number }; attention: { openEscalations: number; pendingApprovals: number; total: number }; media: { total: number; byStatus: Record<string, number> } } }).cockpit;
    // Shape + coherence (real counts, non-negative, totals consistent — never fabricated).
    expect(c.optimizer.total).toBeGreaterThanOrEqual(c.optimizer.proposed + c.optimizer.active);
    expect(c.attention.total).toBe(c.attention.openEscalations + c.attention.pendingApprovals);
    expect(c.autonomy.activeGrants).toBeGreaterThanOrEqual(0);
    expect(c.media.total).toBeGreaterThanOrEqual(0);
    expect(Object.values(c.media.byStatus).reduce((s, n) => s + n, 0)).toBe(c.media.total);
    expect(c.revenue.periodMonths).toBeGreaterThan(0);
  });
});
