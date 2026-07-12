import { describe, expect, it } from "vitest";
import { cronDue, runScheduledTick } from "@/lib/scheduler";
import { dispatchEvent, invalidateEventRuleCache, type AutomationStore } from "@/lib/automations";
import { buildAutomationRow, type AutomationRow } from "@/lib/domain/automation";

const now = new Date("2026-07-10T12:00:00Z");

describe("cronDue", () => {
  it("is due when the next fire after 'since' is at/before now", () => {
    // every 5 min; last ran 10 min ago → due
    expect(cronDue("*/5 * * * *", new Date("2026-07-10T11:50:00Z"), now)).toBe(true);
  });
  it("is not due when the next fire is in the future", () => {
    // daily at 00:00; last ran at 00:00 today → next is tomorrow → not due at noon
    expect(cronDue("0 0 * * *", new Date("2026-07-10T00:00:00Z"), now)).toBe(false);
  });
  it("never throws on a bad cron", () => {
    expect(cronDue("not a cron", new Date("2026-07-10T00:00:00Z"), now)).toBe(false);
  });
});

describe("runScheduledTick crash-recovery", () => {
  it("reclaims stalled jobs every tick (wired, not dormant)", async () => {
    let reclaimCalled = false;
    const result = await runScheduledTick({
      now,
      enqueue: async () => ({ job: { id: "j" } }),
      recordAudit: async () => {},
      reclaimStalled: async () => { reclaimCalled = true; return 3; },
    });
    expect(reclaimCalled).toBe(true); // wired into the tick, not dormant
    expect(result.stalledReclaimed).toBe(3);
    expect(result.errors.some((e) => e.startsWith("reclaim:"))).toBe(false); // reclaim itself did not error
  });

  it("runs Continuous Research in the daily-maintenance block and records the insight count (Phase 5 cadence)", async () => {
    let researchRan = false;
    const result = await runScheduledTick({
      now,
      runMaintenance: true,
      enqueue: async () => ({ job: { id: "j" } }),
      recordAudit: async () => {},
      reclaimStalled: async () => 0,
      // Injected research tick (the real default runs the research department WITH the research_validation
      // QA gate; here we assert only that maintenance drives it and records the result).
      researchTick: async () => { researchRan = true; return { insights: 3, released: true }; },
    });
    expect(researchRan).toBe(true); // continuous research is wired into maintenance, not dormant
    expect(result.continuousResearchInsights).toBe(3);
    expect(result.maintenanceRan).toBe(true);
    expect(result.errors.some((e) => e.startsWith("continuous-research:"))).toBe(false);
  });
});

function store(rules: AutomationRow[]) {
  const m = new Map(rules.map((r) => [r.id, r]));
  const s: AutomationStore = {
    insertRule: async (r) => void m.set(r.id, r),
    listRules: async (q) => [...m.values()].filter((r) => q.enabled === undefined || r.enabled === q.enabled),
    getRule: async (id) => m.get(id) ?? null,
    updateRule: async (id, f) => { const r = m.get(id); if (r) m.set(id, { ...r, ...f }); },
  };
  return s;
}

describe("dispatchEvent (event bus)", () => {
  it("fires only rules whose triggerEvent matches, and enqueues real jobs", async () => {
    invalidateEventRuleCache();
    const enqueued: string[] = [];
    const rules = [
      { ...buildAutomationRow({ name: "on won", triggerType: "event", triggerEvent: "crm.opportunity_stage_moved", actionType: "project.bootstrap" }, { now, id: "r1" }), enabled: true },
      { ...buildAutomationRow({ name: "on lead", triggerType: "event", triggerEvent: "crm.lead_created", actionType: "x" }, { now, id: "r2" }), enabled: true },
    ];
    const deps = { store: store(rules), now, recordAudit: async () => {}, enqueue: async (i: { type: string }) => { enqueued.push(i.type); return { job: { id: "j" + enqueued.length } }; } };
    const ids = await dispatchEvent("crm.opportunity_stage_moved", { to: "won" }, deps);
    expect(ids).toHaveLength(1);
    expect(enqueued).toEqual(["project.bootstrap"]);
  });
  it("no-ops when nothing matches", async () => {
    invalidateEventRuleCache();
    const rules = [{ ...buildAutomationRow({ name: "x", triggerType: "event", triggerEvent: "a.b", actionType: "t" }, { now, id: "r1" }), enabled: true }];
    const ids = await dispatchEvent("nothing.matches", {}, { store: store(rules), now, recordAudit: async () => {}, enqueue: async () => ({ job: { id: "j" } }) });
    expect(ids).toEqual([]);
  });
});
