import { describe, expect, it } from "vitest";
import { computeDepartmentHealth, refreshDepartmentHealth, type DepartmentHealthSignals, type DepartmentHealthDeps } from "@/lib/departments/health";
import { buildDepartmentRow, type DepartmentRow } from "@/lib/domain/department";

const now = new Date("2026-07-12T12:00:00.000Z");

function healthy(): DepartmentHealthSignals {
  return { orchestratorRegistered: true, orchestratorActive: true, totalAgents: 5, activeAgents: 5, backlog: 0, deadLettered: 0, failed: 0, avgLatencyMs: 1200, spendCents: 0, overBudget: false, blockedApprovals: 0, downstreamDeliveryFailures: 0, providerHealthy: true, qaFailureRate: 0, staleKnowledgeDays: 1, missingCredentials: [] };
}

/** A correctly-configured human control plane: the founders are the team, so no orchestrator, no agents. */
function controlPlane(): DepartmentHealthSignals {
  return { ...healthy(), orchestratorRegistered: false, orchestratorActive: false, totalAgents: 0, activeAgents: 0 };
}

/** A correctly-configured service department: its "team" is code, so no orchestrator and no agents. */
function serviceDept(bindings: DepartmentHealthSignals["serviceBindings"]): DepartmentHealthSignals {
  return { ...healthy(), orchestratorRegistered: false, orchestratorActive: false, totalAgents: 0, activeAgents: 0, serviceBindings: bindings };
}
const alive = (ref: string, kind = "worker") => ({ kind, ref, required: true, state: "alive" as const });

describe("computeDepartmentHealth — truthful, worst-cause wins", () => {
  it("healthy when every signal is good", () => {
    expect(computeDepartmentHealth("active", healthy()).status).toBe("healthy");
  });

  it("non-active departments are not operational (draft → unknown, archived → unavailable)", () => {
    expect(computeDepartmentHealth("draft", healthy()).status).toBe("unknown");
    expect(computeDepartmentHealth("archived", healthy()).status).toBe("unavailable");
  });

  /**
   * WOB-UAT-022. The Founder Command Centre is human-operated: no orchestrator and no agent members is
   * its CORRECT configuration, not a fault. Judged as an agent_team it reported `misconfigured` forever
   * on a working console. The staffing checks must not apply — but every other signal still must, so a
   * control plane cannot hide a real problem behind its operating model.
   */
  describe("human_control_plane — the founders are the team", () => {
    it("is healthy with no orchestrator and no agents (that is the correct configuration)", () => {
      expect(computeDepartmentHealth("active", controlPlane(), undefined, "human_control_plane").status).toBe("healthy");
    });

    it("an agent_team with the SAME signals is still misconfigured (the distinction is real)", () => {
      const r = computeDepartmentHealth("active", controlPlane(), undefined, "agent_team");
      expect(r.status).toBe("misconfigured");
      expect(r.reasons).toContain("no orchestrator registered");
      expect(r.reasons).toContain("no specialist team (0 members)");
    });

    it("defaults to agent_team when the operating model is not given (no silent leniency)", () => {
      expect(computeDepartmentHealth("active", controlPlane()).status).toBe("misconfigured");
    });

    it("still reports real problems truthfully — it is not a blanket exemption", () => {
      // Blocked approvals are exactly the control plane's own workload; it must still say so.
      expect(computeDepartmentHealth("active", { ...controlPlane(), blockedApprovals: 3 }, undefined, "human_control_plane").status).toBe("blocked");
      expect(computeDepartmentHealth("active", { ...controlPlane(), deadLettered: 1 }, undefined, "human_control_plane").status).toBe("failed");
      expect(computeDepartmentHealth("active", { ...controlPlane(), overBudget: true }, undefined, "human_control_plane").status).toBe("over_budget");
      expect(computeDepartmentHealth("active", { ...controlPlane(), missingCredentials: ["X"] }, undefined, "human_control_plane").status).toBe("misconfigured");
    });
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

/**
 * WOB-UAT-025. Free Audit, Media Production and Publishing all WORK — a deterministic route, a
 * dedicated `worker-video` + `media_jobs`, `scheduled_posts` + the publisher registry — but they carry
 * no `department_members`, so judged as agent teams they reported "draft · team 0/0", IDENTICALLY to
 * Design Intelligence and Security & Governance, which genuinely do not exist. A founder reading that
 * screen would conclude three working capabilities were unbuilt and two unbuilt ones were understaffed.
 *
 * The danger in fixing it is that `service_department` becomes a way to SILENCE the staffing check and
 * report green forever — the WOB-UAT-022 mistake with a new label. So health must come from whether the
 * backing code is actually alive, and these pin that down in both directions.
 */
describe("service_department — the team is code, and health comes from that code", () => {
  it("is healthy when every required backing service is alive, despite 0 agents", () => {
    const r = computeDepartmentHealth("active", serviceDept([alive("worker-video"), alive("fal", "adapter")]), undefined, "service_department");
    expect(r.status).toBe("healthy");
  });

  it("is UNAVAILABLE when a required worker is not heartbeating — stopping worker-video really is down", () => {
    const r = computeDepartmentHealth(
      "active",
      serviceDept([{ kind: "worker", ref: "worker-video", required: true, state: "missing", detail: "heartbeat is 900s old" }]),
      undefined,
      "service_department",
    );
    expect(r.status).toBe("unavailable");
    expect(r.reasons.join(" ")).toMatch(/worker-video/);
  });

  it("is BLOCKED — not unavailable — when a required adapter has no credentials", () => {
    // "no FAL_KEY" is a credential the founder can add, not a broken system. The job layer already
    // models exactly this (unconfigured provider → terminal `blocked`), so the department must agree.
    const r = computeDepartmentHealth(
      "active",
      serviceDept([alive("worker-video"), { kind: "adapter", ref: "fal", required: true, state: "blocked", detail: "credentials not configured" }]),
      undefined,
      "service_department",
    );
    expect(r.status).toBe("blocked");
    expect(r.reasons.join(" ")).toMatch(/fal/);
  });

  it("is MISCONFIGURED when it declares no backing services at all", () => {
    // Otherwise `service_department` would be a free pass: "my capability is real code" with no code
    // named is exactly the unverifiable claim this operating model exists to replace.
    const r = computeDepartmentHealth("active", serviceDept([]), undefined, "service_department");
    expect(r.status).toBe("misconfigured");
    expect(r.reasons.join(" ")).toMatch(/no backing services/);
  });

  it("refuses to claim health for a binding it cannot verify — unknown is never 'fine'", () => {
    const r = computeDepartmentHealth(
      "active",
      serviceDept([{ kind: "worker", ref: "worker-video", required: true, state: "unknown", detail: "no readable timestamp" }]),
      undefined,
      "service_department",
    );
    expect(r.status).toBe("unknown");
  });

  it("degrades — rather than fails — when only an OPTIONAL binding is gone", () => {
    const r = computeDepartmentHealth(
      "active",
      serviceDept([alive("worker-video"), { kind: "adapter", ref: "fal", required: false, state: "blocked" }]),
      undefined,
      "service_department",
    );
    expect(r.status).toBe("degraded");
  });

  it("still reports a REAL problem over an unverifiable one — a dead worker beats 'I could not check'", () => {
    const r = computeDepartmentHealth(
      "active",
      serviceDept([
        { kind: "worker", ref: "worker-video", required: true, state: "missing" },
        { kind: "adapter", ref: "fal", required: true, state: "unknown" },
      ]),
      undefined,
      "service_department",
    );
    expect(r.status).toBe("unavailable"); // not "unknown"
  });

  it("does NOT let a service department hide a genuine failure behind its operating model", () => {
    // Every non-staffing signal still applies — the same guarantee the control plane has.
    const r = computeDepartmentHealth("active", { ...serviceDept([alive("worker-video")]), deadLettered: 2 }, undefined, "service_department");
    expect(r.status).toBe("failed");
  });

  it("an agent_team with 0 members is STILL misconfigured — the exemption is per-model, not global", () => {
    expect(computeDepartmentHealth("active", serviceDept([alive("worker-video")]), undefined, "agent_team").status).toBe("misconfigured");
  });
});
