import { describe, expect, it } from "vitest";
import { buildAutomationRow, matchingRules, createAutomationSchema, type AutomationRow } from "@/lib/domain/automation";
import { addAutomation, toggleAutomation, runAutomation, fireEventRules, type AutomationStore } from "@/lib/automations";

const now = new Date("2026-07-10T12:00:00Z");

describe("automation domain", () => {
  it("builds an enabled manual rule", () => {
    const r = buildAutomationRow({ name: "Nightly digest", actionType: "digest.build" }, { now, id: "auto_1" });
    expect(r).toMatchObject({ id: "auto_1", enabled: true, triggerType: "manual", actionQueue: "general", runCount: 0 });
  });
  it("requires an event name for event triggers", () => {
    expect(createAutomationSchema.safeParse({ name: "x", triggerType: "event", actionType: "y" }).success).toBe(false);
    expect(createAutomationSchema.safeParse({ name: "x", triggerType: "event", triggerEvent: "crm.opportunity_stage_moved", actionType: "y" }).success).toBe(true);
  });
  it("matches enabled event rules", () => {
    const rules: AutomationRow[] = [
      { ...buildAutomationRow({ name: "a", triggerType: "event", triggerEvent: "deal.won", actionType: "t" }, { now }), enabled: true },
      { ...buildAutomationRow({ name: "b", triggerType: "event", triggerEvent: "deal.won", actionType: "t" }, { now }), enabled: false },
      { ...buildAutomationRow({ name: "c", triggerType: "event", triggerEvent: "other", actionType: "t" }, { now }), enabled: true },
    ];
    expect(matchingRules(rules, "deal.won")).toHaveLength(1);
  });
});

function store() {
  const m = new Map<string, AutomationRow>();
  const s: AutomationStore = {
    insertRule: async (r) => void m.set(r.id, r),
    listRules: async (q) => [...m.values()].filter((r) => (q.enabled === undefined || r.enabled === q.enabled)).slice(0, q.limit),
    getRule: async (id) => m.get(id) ?? null,
    updateRule: async (id, f) => { const r = m.get(id); if (r) m.set(id, { ...r, ...f }); },
  };
  return s;
}

describe("automation service", () => {
  it("runs a rule -> enqueues a real job + bumps stats", async () => {
    const s = store();
    const enqueued: { queue: string; type: string }[] = [];
    const deps = { store: s, now, recordAudit: async () => {}, enqueue: async (i: { queue: string; type: string }) => { enqueued.push(i); return { job: { id: "job_1" } }; } };
    const r = await addAutomation({ name: "Build content", actionQueue: "content", actionType: "content.generate" }, deps);
    const ran = await runAutomation(r.id, { actor: "Moiz" }, deps);
    expect(ran?.jobId).toBe("job_1");
    expect(ran?.rule.runCount).toBe(1);
    expect(enqueued[0]).toMatchObject({ queue: "content", type: "content.generate" });
    const off = await toggleAutomation(r.id, false, {}, deps);
    expect(off?.enabled).toBe(false);
  });
  it("fires matching event rules", async () => {
    const s = store();
    const enqueued: string[] = [];
    const deps = { store: s, now, recordAudit: async () => {}, enqueue: async (i: { type: string }) => { enqueued.push(i.type); return { job: { id: "j_" + enqueued.length } }; } };
    await addAutomation({ name: "On won", triggerType: "event", triggerEvent: "crm.opportunity_stage_moved", actionType: "project.bootstrap" }, deps);
    const jobIds = await fireEventRules("crm.opportunity_stage_moved", { to: "won" }, deps);
    expect(jobIds).toHaveLength(1);
    expect(enqueued).toContain("project.bootstrap");
  });
});
