import { describe, expect, it } from "vitest";
import { buildEscalationRow, isEscalationOverdue, type EscalationRow } from "@/lib/domain/escalation";
import { createEscalation, acknowledgeEscalation, resolveEscalation, dismissEscalation, listEscalations, escalationStatusCounts, type EscalationStore } from "@/lib/departments/escalation";

const now = new Date("2026-07-12T12:00:00.000Z");

function makeStore(seed: EscalationRow[] = []) {
  const rows = new Map<string, EscalationRow>(seed.map((r) => [r.id, r]));
  const store: EscalationStore = {
    findOpen: async (dept, wf, task, reason) => [...rows.values()].find((r) => r.departmentSlug === dept && r.workflowId === wf && r.taskId === task && r.reason === reason && r.status === "open") ?? null,
    insert: async (row) => { rows.set(row.id, row); },
    getById: async (id) => rows.get(id) ?? null,
    transition: async (id, from, fields) => { const r = rows.get(id); if (!r || !from.includes(r.status)) return false; rows.set(id, { ...r, ...fields }); return true; },
    list: async (q) => [...rows.values()].filter((r) => (!q.departmentSlug || r.departmentSlug === q.departmentSlug) && (!q.status || r.status === q.status) && (!q.reason || r.reason === q.reason)).slice(0, q.limit),
    countByStatus: async () => { const o: Record<string, number> = {}; for (const r of rows.values()) o[r.status] = (o[r.status] ?? 0) + 1; return o; },
  };
  return { store, rows };
}

const deps = (store: EscalationStore) => ({ store, recordAudit: async () => {}, now });
const input = (over = {}) => ({ departmentSlug: "paid_audit", workflowId: "wf1", taskId: "t1", reason: "budget_exhausted" as const, severity: "high" as const, requiredDecision: "raise budget or hold", ...over });

describe("escalation domain", () => {
  it("builds an open escalation with an SLA from severity", () => {
    const e = buildEscalationRow(input(), { now });
    expect(e).toMatchObject({ status: "open", reason: "budget_exhausted", severity: "high", assignee: "founder_command_centre" });
    expect(e.slaDueAt!.getTime()).toBe(now.getTime() + 4 * 60 * 60_000); // high = 4h
  });
  it("flags an overdue open escalation", () => {
    const e = buildEscalationRow(input({ severity: "critical" }), { now });
    expect(isEscalationOverdue(e, new Date(now.getTime() + 2 * 60 * 60_000))).toBe(true); // critical SLA 1h
    expect(isEscalationOverdue({ ...e, status: "resolved" }, new Date(now.getTime() + 99 * 60 * 60_000))).toBe(false);
  });
});

describe("escalation service", () => {
  it("creates an escalation and dedups a second OPEN for the same blocked step", async () => {
    const { store, rows } = makeStore();
    const a = await createEscalation(input(), deps(store));
    expect(a.deduped).toBe(false);
    const b = await createEscalation(input(), deps(store)); // same dept/wf/task/reason, still open
    expect(b.deduped).toBe(true);
    expect(b.escalation.id).toBe(a.escalation.id);
    expect(rows.size).toBe(1);
  });

  it("acknowledge → resolve with an action the workflow can read (resume/reroute/blocked/terminate)", async () => {
    const { store, rows } = makeStore();
    const { escalation } = await createEscalation(input(), deps(store));
    expect(await acknowledgeEscalation(escalation.id, "Moiz", deps(store))).toBe(true);
    expect(rows.get(escalation.id)!.status).toBe("acknowledged");
    expect(await resolveEscalation(escalation.id, { action: "resume", resolution: "budget raised, resume", resolvedBy: "Moiz" }, deps(store))).toBe(true);
    const r = rows.get(escalation.id)!;
    expect(r.status).toBe("resolved");
    expect(r.resolutionAction).toBe("resume");
    expect(r.resolvedBy).toBe("Moiz");
  });

  it("a 'blocked' resolution keeps it acknowledged (work stays blocked), not resolved", async () => {
    const { store, rows } = makeStore();
    const { escalation } = await createEscalation(input(), deps(store));
    await resolveEscalation(escalation.id, { action: "blocked", resolution: "hold until next week", resolvedBy: "Moiz" }, deps(store));
    expect(rows.get(escalation.id)!.status).toBe("acknowledged");
    expect(rows.get(escalation.id)!.resolutionAction).toBe("blocked");
  });

  it("re-escalation is allowed after resolution (a new OPEN for the same step)", async () => {
    const { store, rows } = makeStore();
    const first = await createEscalation(input(), deps(store));
    await resolveEscalation(first.escalation.id, { action: "resume", resolution: "done", resolvedBy: "Moiz" }, deps(store));
    const second = await createEscalation(input(), deps(store)); // same step blocks again
    expect(second.deduped).toBe(false);
    expect(rows.size).toBe(2);
  });

  it("lists + counts by status", async () => {
    const { store } = makeStore();
    await createEscalation(input({ taskId: "a" }), deps(store));
    await createEscalation(input({ taskId: "b", reason: "dead_lettered" }), deps(store));
    expect(await listEscalations({ departmentSlug: "paid_audit" }, deps(store))).toHaveLength(2);
    expect(await listEscalations({ reason: "dead_lettered" }, deps(store))).toHaveLength(1);
    expect((await escalationStatusCounts(deps(store))).open).toBe(2);
  });

  it("dismiss closes a non-actionable escalation", async () => {
    const { store, rows } = makeStore();
    const { escalation } = await createEscalation(input(), deps(store));
    expect(await dismissEscalation(escalation.id, "Moiz", "not a real problem", deps(store))).toBe(true);
    expect(rows.get(escalation.id)!.status).toBe("dismissed");
  });
});
