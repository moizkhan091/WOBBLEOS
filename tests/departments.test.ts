import { describe, expect, it } from "vitest";
import { shapeDepartmentRollups, getDepartmentRollups, type HandoffAggRow, type AgentAggRow, type DepartmentRollupStore } from "@/lib/departments";

const t = (s: string) => new Date(s);

describe("shapeDepartmentRollups", () => {
  it("rolls up handoff state, cost, weighted quality, and the agent team per department", () => {
    const handoffRows: HandoffAggRow[] = [
      { department: "paid_audit", deliveryState: "completed", n: 4, costSum: 0.4, qualitySum: 32, qualityN: 4, lastAt: t("2026-07-12T10:00:00Z") },
      { department: "paid_audit", deliveryState: "processing", n: 1, costSum: 0, qualitySum: 0, qualityN: 0, lastAt: t("2026-07-12T11:00:00Z") },
      { department: "content", deliveryState: "completed", n: 2, costSum: 0.1, qualitySum: 18, qualityN: 2, lastAt: t("2026-07-12T09:00:00Z") },
      { department: "content", deliveryState: "dead_lettered", n: 1, costSum: 0, qualitySum: 0, qualityN: 0, lastAt: t("2026-07-12T09:30:00Z") },
    ];
    const agentRows: AgentAggRow[] = [
      { team: "paid_audit", total: 5, active: 5 },
      { team: "content", total: 4, active: 3 },
    ];

    const rollups = shapeDepartmentRollups(handoffRows, agentRows);

    // Sorted: content first (it has a stuck handoff), then paid_audit (in-flight).
    expect(rollups.map((d) => d.department)).toEqual(["content", "paid_audit"]);

    const pa = rollups.find((d) => d.department === "paid_audit")!;
    expect(pa.handoffs.total).toBe(5);
    expect(pa.handoffs.completed).toBe(4);
    expect(pa.handoffs.inFlight).toBe(1); // processing
    expect(pa.handoffs.stuck).toBe(0);
    expect(pa.cost.totalEstimate).toBeCloseTo(0.4);
    expect(pa.quality.avg).toBe(8); // 32/4
    expect(pa.quality.samples).toBe(4);
    expect(pa.agents).toEqual({ total: 5, active: 5 });
    expect(pa.lastActivityAt).toEqual(t("2026-07-12T11:00:00Z")); // the most recent across states

    const c = rollups.find((d) => d.department === "content")!;
    expect(c.handoffs.stuck).toBe(1); // dead_lettered
    expect(c.quality.avg).toBe(9); // 18/2
    expect(c.agents).toEqual({ total: 4, active: 3 });
  });

  it("includes departments that have agents but no handoffs yet (and vice-versa)", () => {
    const rollups = shapeDepartmentRollups(
      [{ department: "intelligence", deliveryState: "completed", n: 1, costSum: 0, qualitySum: 0, qualityN: 0, lastAt: null }],
      [{ team: "finance", total: 2, active: 2 }],
    );
    const finance = rollups.find((d) => d.department === "finance")!;
    expect(finance.handoffs.total).toBe(0);
    expect(finance.agents.total).toBe(2);
    expect(finance.quality.avg).toBeNull();
    const intel = rollups.find((d) => d.department === "intelligence")!;
    expect(intel.agents.total).toBe(0); // no registered team yet, still surfaced from handoff activity
    expect(intel.handoffs.completed).toBe(1);
  });

  it("returns [] when there is no activity", () => {
    expect(shapeDepartmentRollups([], [])).toEqual([]);
  });
});

describe("getDepartmentRollups", () => {
  it("assembles from the injected store", async () => {
    const store: DepartmentRollupStore = {
      handoffAggByDepartment: async () => [{ department: "content", deliveryState: "completed", n: 3, costSum: 0.2, qualitySum: 24, qualityN: 3, lastAt: t("2026-07-12T08:00:00Z") }],
      agentCountsByTeam: async () => [{ team: "content", total: 4, active: 4 }],
    };
    const rollups = await getDepartmentRollups({ store });
    expect(rollups).toHaveLength(1);
    expect(rollups[0]).toMatchObject({ department: "content", handoffs: { completed: 3 }, quality: { avg: 8 }, agents: { total: 4, active: 4 } });
  });
});
