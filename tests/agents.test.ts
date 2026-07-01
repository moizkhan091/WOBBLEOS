import { describe, expect, it } from "vitest";
import { buildAgentRow, buildAgentRunRow, DEFAULT_AGENTS } from "@/lib/domain/agents";
import { getAgent, listAgentRuns, listAgents, recordAgentRun, registerAgent, type AgentRow, type AgentRunRow, type AgentStore } from "@/lib/agents";
import type { AuditEventInput } from "@/lib/domain/audit";

const now = new Date("2026-07-01T12:00:00.000Z");
const base = { slug: "content_worker", name: "Content Worker", role: "copywriter", module: "content_command", purpose: "make content" };

function makeStore(seed: AgentRow[] = []) {
  const rows = new Map(seed.map((a) => [a.id, a]));
  const runs: AgentRunRow[] = [];
  const store: AgentStore = {
    insertAgent: async (row) => void rows.set(row.id, row),
    getAgentById: async (id) => rows.get(id) ?? null,
    getAgentBySlug: async (slug) => [...rows.values()].find((a) => a.slug === slug) ?? null,
    listAgents: async (q) => [...rows.values()].filter((a) => (q.module ? a.module === q.module : true)).filter((a) => (q.status ? a.status === q.status : true)).slice(0, q.limit),
    updateAgent: async (id, fields) => { const c = rows.get(id); if (c) rows.set(id, { ...c, ...fields } as AgentRow); },
    insertRun: async (row) => void runs.push(row),
    listRuns: async (q) => runs.filter((r) => (q.agentId ? r.agentId === q.agentId : true)).slice(0, q.limit),
  };
  return { store, rows, runs };
}
function audit() {
  const events: AuditEventInput[] = [];
  return { recordAudit: async (e: AuditEventInput) => void events.push(e), events };
}

describe("agent registry domain", () => {
  it("builds an agent with safe defaults", () => {
    const a = buildAgentRow(base, { id: "agent_x", now });
    expect(a).toMatchObject({ id: "agent_x", slug: "content_worker", status: "active", runCount: 0, failureCount: 0, costProfile: "mid", cadence: "manual" });
  });
  it("rejects a bad slug", () => {
    expect(() => buildAgentRow({ ...base, slug: "Bad Slug" })).toThrow();
  });
  it("builds a run row with numeric->string cost", () => {
    const a = buildAgentRow(base, { id: "a", now });
    const r = buildAgentRunRow(a, { agentSlug: a.slug, status: "succeeded", costEstimate: 0.12, latencyMs: 900 }, { id: "run_1", now });
    expect(r).toMatchObject({ id: "run_1", agentId: "a", agentSlug: "content_worker", status: "succeeded", costEstimate: "0.12", latencyMs: 900 });
    expect(r.completedAt).toEqual(now);
  });
  it("ships a sensible default agent roster", () => {
    expect(DEFAULT_AGENTS.map((a) => a.slug)).toContain("content_worker");
    expect(DEFAULT_AGENTS.length).toBeGreaterThanOrEqual(5);
  });
});

describe("agent registry service", () => {
  it("registers an agent idempotently + audits", async () => {
    const { store, rows } = makeStore();
    const { recordAudit, events } = audit();
    const a1 = await registerAgent(base, { store, recordAudit, now });
    const a2 = await registerAgent(base, { store, recordAudit, now });
    expect(a1.id).toBe(a2.id);
    expect(rows.size).toBe(1);
    expect(events.map((e) => e.eventType)).toContain("agent.registered");
  });

  it("records a run, rolls counters, and audits", async () => {
    const seed = buildAgentRow(base, { id: "agent_cw", now });
    const { store, runs } = makeStore([seed]);
    const { recordAudit, events } = audit();
    const { run, agent } = await recordAgentRun({ agentSlug: "content_worker", status: "succeeded", costEstimate: 0.2, qualityScore: 8 }, { store, recordAudit, now });
    expect(run.status).toBe("succeeded");
    expect(agent.runCount).toBe(1);
    expect(runs).toHaveLength(1);
    expect(events.map((e) => e.eventType)).toContain("agent.run.completed");
    const listed = await listAgentRuns({ agentId: "agent_cw" }, { store });
    expect(listed).toHaveLength(1);
  });

  it("counts failures and audits agent.run.failed", async () => {
    const seed = buildAgentRow(base, { id: "agent_cw", now });
    const { store } = makeStore([seed]);
    const { recordAudit, events } = audit();
    const { agent } = await recordAgentRun({ agentSlug: "content_worker", status: "failed", error: "boom" }, { store, recordAudit, now });
    expect(agent.failureCount).toBe(1);
    expect(events.map((e) => e.eventType)).toContain("agent.run.failed");
  });

  it("throws when recording a run for an unregistered agent", async () => {
    const { store } = makeStore();
    await expect(recordAgentRun({ agentSlug: "ghost", status: "succeeded" }, { store, recordAudit: async () => {}, now })).rejects.toThrow(/not found/);
  });

  it("lists + fetches agents by slug and id", async () => {
    const seed = buildAgentRow(base, { id: "agent_cw", now });
    const { store } = makeStore([seed]);
    expect((await listAgents({}, { store })).length).toBe(1);
    expect((await getAgent("content_worker", { store }))?.id).toBe("agent_cw");
    expect((await getAgent("agent_cw", { store }))?.slug).toBe("content_worker");
  });
});
