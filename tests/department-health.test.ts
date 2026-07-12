import { describe, expect, it } from "vitest";
import { computeDepartmentHealth, refreshDepartmentHealth, type DepartmentHealthSignals, type DepartmentHealthDeps } from "@/lib/departments/health";
import { buildDepartmentRow, type DepartmentRow } from "@/lib/domain/department";

const now = new Date("2026-07-12T12:00:00.000Z");

function healthy(): DepartmentHealthSignals {
  return { orchestratorRegistered: true, orchestratorActive: true, totalAgents: 5, activeAgents: 5, backlog: 0, deadLettered: 0, failed: 0, avgLatencyMs: 1200, spendCents: 0, overBudget: false, blockedApprovals: 0, downstreamDeliveryFailures: 0, providerHealthy: true, qaFailureRate: 0, staleKnowledgeDays: 1, missingCredentials: [] };
}

describe("computeDepartmentHealth — truthful, worst-cause wins", () => {
  it("healthy when every signal is good", () => {
    expect(computeDepartmentHealth("active", healthy()).status).toBe("healthy");
  });

  it("non-active departments are not operational (draft → unknown, archived → unavailable)", () => {
    expect(computeDepartmentHealth("draft", healthy()).status).toBe("unknown");
    expect(computeDepartmentHealth("archived", healthy()).status).toBe("unavailable");
  });

  it("misconfigured: no orchestrator / no team / missing credentials", () => {
    expect(computeDepartmentHealth("active", { ...healthy(), orchestratorRegistered: false }).status).toBe("misconfigured");
    expect(computeDepartmentHealth("active", { ...healthy(), totalAgents: 0, activeAgents: 0 }).status).toBe("misconfigured");
    expect(computeDepartmentHealth("active", { ...healthy(), missingCredentials: ["OPENROUTER_API_KEY"] }).status).toBe("misconfigured");
  });

  it("unavailable: orchestrator/agents inactive or provider down", () => {
    expect(computeDepartmentHealth("active", { ...healthy(), orchestratorActive: false }).status).toBe("unavailable");
    expect(computeDepartmentHealth("active", { ...healthy(), activeAgents: 0 }).status).toBe("unavailable");
    expect(computeDepartmentHealth("active", { ...healthy(), providerHealthy: false }).status).toBe("unavailable");
  });

  it("over_budget beats failed/blocked/degraded", () => {
    expect(computeDepartmentHealth("active", { ...healthy(), overBudget: true, deadLettered: 5, blockedApprovals: 3 }).status).toBe("over_budget");
  });

  it("failed: dead-lettered or downstream delivery failures", () => {
    expect(computeDepartmentHealth("active", { ...healthy(), deadLettered: 1 }).status).toBe("failed");
    expect(computeDepartmentHealth("active", { ...healthy(), downstreamDeliveryFailures: 2 }).status).toBe("failed");
  });

  it("blocked: blocked approvals or backlog over block threshold", () => {
    expect(computeDepartmentHealth("active", { ...healthy(), blockedApprovals: 1 }).status).toBe("blocked");
    expect(computeDepartmentHealth("active", { ...healthy(), backlog: 60 }).status).toBe("blocked");
  });

  it("stale: knowledge older than the threshold", () => {
    expect(computeDepartmentHealth("active", { ...healthy(), staleKnowledgeDays: 45 }).status).toBe("stale");
  });

  it("degraded: retrying failures, high QA failure rate, or moderate backlog", () => {
    expect(computeDepartmentHealth("active", { ...healthy(), failed: 1 }).status).toBe("degraded");
    expect(computeDepartmentHealth("active", { ...healthy(), qaFailureRate: 0.5 }).status).toBe("degraded");
    expect(computeDepartmentHealth("active", { ...healthy(), backlog: 15 }).status).toBe("degraded");
  });

  it("reasons explain the status", () => {
    const r = computeDepartmentHealth("active", { ...healthy(), deadLettered: 3 });
    expect(r.reasons.join()).toMatch(/dead-lettered/);
  });
});

describe("refreshDepartmentHealth persists the computed status", () => {
  it("computes from injected signals and writes via the registry", async () => {
    const dept = buildDepartmentRow({ slug: "paid_audit", name: "Paid Audit", purpose: "p", status: "active", orchestratorAgentSlug: "paid_audit_orchestrator" }, { now });
    let written: string | null = null;
    const deps: DepartmentHealthDeps = {
      store: {
        getDepartmentBySlug: async (s) => (s === "paid_audit" ? dept : null),
        insertDepartment: async () => {}, listDepartments: async () => [dept],
        updateDepartment: async (_s, fields) => { if (fields.healthStatus) written = fields.healthStatus; },
        insertMember: async () => {}, getMember: async () => null, listMembers: async () => [], listMembershipsForRef: async () => [], updateMember: async () => {},
      },
      recordAudit: async () => {},
      now,
      loadSignals: async () => ({ ...healthy(), deadLettered: 2 }),
    } as DepartmentHealthDeps;

    const result = await refreshDepartmentHealth("paid_audit", deps);
    expect(result?.status).toBe("failed");
    expect(written).toBe("failed"); // persisted through the registry
  });
});
