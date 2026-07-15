import { describe, expect, it } from "vitest";
import { shapeDepartmentRollups, getDepartmentRollups, getDepartmentDetail, type HandoffAggRow, type MemberAggRow, type RegisteredDepartment, type DepartmentRollupStore, type DepartmentMemberSummary } from "@/lib/departments";
import type { HandoffRow } from "@/lib/domain/handoff-delivery";

const t = (s: string) => new Date(s);

const reg = (over: Partial<RegisteredDepartment>): RegisteredDepartment => ({ slug: "x", name: "X", status: "active", healthStatus: "unknown", purpose: "p", operatingModel: "agent_team", orchestratorAgentSlug: null, outboundProducts: [], downstreamConsumers: [], ...over });

describe("shapeDepartmentRollups (registry ∪ live activity)", () => {
  it("rolls up registry identity + handoff state + cost + weighted quality + member counts", () => {
    const handoffRows: HandoffAggRow[] = [
      { department: "paid_audit", deliveryState: "completed", n: 4, costSum: 0.4, qualitySum: 32, qualityN: 4, lastAt: t("2026-07-12T10:00:00Z") },
      { department: "paid_audit", deliveryState: "processing", n: 1, costSum: 0, qualitySum: 0, qualityN: 0, lastAt: t("2026-07-12T11:00:00Z") },
      { department: "content", deliveryState: "completed", n: 2, costSum: 0.1, qualitySum: 18, qualityN: 2, lastAt: t("2026-07-12T09:00:00Z") },
      { department: "content", deliveryState: "dead_lettered", n: 1, costSum: 0, qualitySum: 0, qualityN: 0, lastAt: t("2026-07-12T09:30:00Z") },
    ];
    const memberRows: MemberAggRow[] = [
      { department: "paid_audit", total: 6, active: 6 },
      { department: "content", total: 4, active: 3 },
    ];
    const registered: RegisteredDepartment[] = [
      reg({ slug: "paid_audit", name: "Paid Audit", status: "active", healthStatus: "healthy" }),
      reg({ slug: "content", name: "Content", status: "active", healthStatus: "degraded" }),
      reg({ slug: "proposal", name: "Proposal", status: "draft", healthStatus: "unknown" }),
    ];

    const rollups = shapeDepartmentRollups(handoffRows, memberRows, registered);

    // content first (stuck handoff), then paid_audit (in-flight), then proposal (registered, no activity).
    expect(rollups.map((d) => d.department)).toEqual(["content", "paid_audit", "proposal"]);

    const pa = rollups.find((d) => d.department === "paid_audit")!;
    expect(pa).toMatchObject({ name: "Paid Audit", status: "active", healthStatus: "healthy" });
    expect(pa.handoffs).toMatchObject({ total: 5, completed: 4, inFlight: 1, stuck: 0 });
    expect(pa.quality.avg).toBe(8);
    expect(pa.members).toEqual({ total: 6, active: 6 });
    expect(pa.lastActivityAt).toEqual(t("2026-07-12T11:00:00Z"));

    // A REGISTERED department with no activity still appears (from the registry), members zeroed.
    const prop = rollups.find((d) => d.department === "proposal")!;
    expect(prop).toMatchObject({ name: "Proposal", status: "draft", healthStatus: "unknown" });
    expect(prop.handoffs.total).toBe(0);
    expect(prop.members).toEqual({ total: 0, active: 0 });
  });

  it("surfaces a department seen only in handoff activity but not registered (name/status null)", () => {
    const rollups = shapeDepartmentRollups(
      [{ department: "ghost_dept", deliveryState: "completed", n: 1, costSum: 0, qualitySum: 0, qualityN: 0, lastAt: null }],
      [],
      [],
    );
    const ghost = rollups.find((d) => d.department === "ghost_dept")!;
    expect(ghost.name).toBeNull();
    expect(ghost.status).toBeNull();
    expect(ghost.handoffs.completed).toBe(1);
  });

  it("returns [] when there is no registry and no activity", () => {
    expect(shapeDepartmentRollups([], [], [])).toEqual([]);
  });
});

function makeStore(over: Partial<DepartmentRollupStore> = {}): DepartmentRollupStore {
  return {
    handoffAggByDepartment: async () => [],
    memberCountsByDepartment: async () => [],
    registeredDepartments: async () => [],
    getRegisteredDepartment: async () => null,
    membersByDepartment: async () => [],
    ...over,
  };
}

describe("getDepartmentRollups", () => {
  it("assembles from the injected store (registry + members + handoffs)", async () => {
    const store = makeStore({
      handoffAggByDepartment: async () => [{ department: "content", deliveryState: "completed", n: 3, costSum: 0.2, qualitySum: 24, qualityN: 3, lastAt: t("2026-07-12T08:00:00Z") }],
      memberCountsByDepartment: async () => [{ department: "content", total: 4, active: 4 }],
      registeredDepartments: async () => [reg({ slug: "content", name: "Content" })],
    });
    const rollups = await getDepartmentRollups({ store });
    expect(rollups).toHaveLength(1);
    expect(rollups[0]).toMatchObject({ department: "content", name: "Content", handoffs: { completed: 3 }, quality: { avg: 8 }, members: { total: 4, active: 4 } });
  });
});

describe("getDepartmentDetail (registry-driven roster)", () => {
  it("returns the department's registry facts + team (from memberships) + recent handoffs", async () => {
    const members: DepartmentMemberSummary[] = [
      { memberRef: "content_strategist", memberType: "agent", role: "strategist", responsibility: "strategy", active: true, priority: 10, capabilities: ["strategy"] },
      { memberRef: "content_scorer", memberType: "agent", role: "qa_scorer", responsibility: "score", active: true, priority: 40, capabilities: ["scoring"] },
    ];
    const store = makeStore({
      getRegisteredDepartment: async (slug) => (slug === "content" ? reg({ slug: "content", name: "Content", outboundProducts: ["content_pack"], downstreamConsumers: ["publishing"] }) : null),
      membersByDepartment: async (slug) => (slug === "content" ? members : []),
    });
    const recent = [{ id: "handoff_1", department: "content" } as unknown as HandoffRow];

    const detail = await getDepartmentDetail("content", { store, listRecentHandoffs: async (dept, lim) => { expect(dept).toBe("content"); expect(lim).toBeLessThanOrEqual(200); return recent; } });

    expect(detail.department).toBe("content");
    expect(detail.registry?.name).toBe("Content");
    expect(detail.registry?.downstreamConsumers).toEqual(["publishing"]);
    expect(detail.members.map((m) => m.memberRef)).toEqual(["content_strategist", "content_scorer"]);
    expect(detail.recentHandoffs[0].id).toBe("handoff_1");
  });
});
