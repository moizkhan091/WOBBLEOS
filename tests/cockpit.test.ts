import { describe, expect, it } from "vitest";
import { getIntelligenceCockpit } from "@/lib/cockpit";

const now = new Date("2026-07-14T00:00:00.000Z");
const past = new Date(now.getTime() - 86_400_000);
const future = new Date(now.getTime() + 86_400_000);

describe("intelligence cockpit aggregation (pure, injected readers)", () => {
  it("aggregates each panel exactly, uses exact counts, and counts only IN-EFFECT grants", async () => {
    const c = await getIntelligenceCockpit({
      orgMetrics: async () => ({ revenueCents: 250_000, revenueEvidenceTier: "verified-financial", revenuePeriodMonths: 1 }),
      listProposals: async () => [{ status: "proposed" }, { status: "proposed" }, { status: "active" }, { status: "rejected" }],
      // 3 status=active grants, but one is EXPIRED and one is not-yet-effective → only 1 in force.
      listActiveGrants: async () => [
        { effectiveFrom: past, expiresAt: future }, // in effect
        { effectiveFrom: past, expiresAt: past },   // expired → excluded
        { effectiveFrom: future, expiresAt: null }, // not yet effective → excluded
      ],
      countOpenEscalations: async () => 2,
      countPendingApprovals: async () => 250, // exact count (would have been capped at 200 by a list())
      listMediaJobs: async () => [{ status: "queued" }, { status: "blocked" }, { status: "succeeded" }, { status: "queued" }],
      now: () => now,
    });
    expect(c.revenue).toEqual({ revenueCents: 250_000, evidenceTier: "verified-financial", periodMonths: 1 });
    expect(c.optimizer).toEqual({ proposed: 2, active: 1, total: 4 });
    expect(c.autonomy).toEqual({ activeGrants: 1 }); // only the in-effect grant
    expect(c.attention).toEqual({ openEscalations: 2, pendingApprovals: 250, total: 252 }); // exact, not capped
    expect(c.media.total).toBe(4);
    expect(c.media.byStatus).toEqual({ queued: 2, blocked: 1, succeeded: 1 });
  });

  it("reports honest zeros/nulls when every store is empty (never invented)", async () => {
    const c = await getIntelligenceCockpit({
      orgMetrics: async () => ({ revenueCents: null, revenueEvidenceTier: null, revenuePeriodMonths: 1 }),
      listProposals: async () => [], listActiveGrants: async () => [], countOpenEscalations: async () => 0,
      countPendingApprovals: async () => 0, listMediaJobs: async () => [], now: () => now,
    });
    expect(c.revenue.revenueCents).toBeNull();
    expect(c.optimizer).toEqual({ proposed: 0, active: 0, total: 0 });
    expect(c.autonomy.activeGrants).toBe(0);
    expect(c.attention.total).toBe(0);
    expect(c.media).toEqual({ total: 0, byStatus: {} });
  });
});
