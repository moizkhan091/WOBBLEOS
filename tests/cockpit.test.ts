import { describe, expect, it } from "vitest";
import { getIntelligenceCockpit } from "@/lib/cockpit";

describe("intelligence cockpit aggregation (pure, injected readers)", () => {
  it("aggregates each panel exactly and fabricates nothing", async () => {
    const c = await getIntelligenceCockpit({
      orgMetrics: async () => ({ revenueCents: 250_000, revenueEvidenceTier: "verified-financial", revenuePeriodMonths: 1 }),
      listProposals: async () => [{ status: "proposed" }, { status: "proposed" }, { status: "active" }, { status: "rejected" }],
      listActiveGrants: async () => [{}, {}, {}],
      listOpenEscalations: async () => [{}, {}],
      listPendingApprovals: async () => [{}],
      listMediaJobs: async () => [{ status: "queued" }, { status: "blocked" }, { status: "succeeded" }, { status: "queued" }],
      now: () => "2026-07-14T00:00:00.000Z",
    });
    expect(c.revenue).toEqual({ revenueCents: 250_000, evidenceTier: "verified-financial", periodMonths: 1 });
    expect(c.optimizer).toEqual({ proposed: 2, active: 1, total: 4 });
    expect(c.autonomy).toEqual({ activeGrants: 3 });
    expect(c.attention).toEqual({ openEscalations: 2, pendingApprovals: 1, total: 3 });
    expect(c.media.total).toBe(4);
    expect(c.media.byStatus).toEqual({ queued: 2, blocked: 1, succeeded: 1 });
  });

  it("reports honest zeros/nulls when every store is empty (never invented)", async () => {
    const c = await getIntelligenceCockpit({
      orgMetrics: async () => ({ revenueCents: null, revenueEvidenceTier: null, revenuePeriodMonths: 1 }),
      listProposals: async () => [], listActiveGrants: async () => [], listOpenEscalations: async () => [],
      listPendingApprovals: async () => [], listMediaJobs: async () => [], now: () => "t",
    });
    expect(c.revenue.revenueCents).toBeNull();
    expect(c.optimizer).toEqual({ proposed: 0, active: 0, total: 0 });
    expect(c.attention.total).toBe(0);
    expect(c.media).toEqual({ total: 0, byStatus: {} });
  });
});
