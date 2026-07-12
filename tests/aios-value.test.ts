import { describe, expect, it } from "vitest";
import {
  buildAiosValueSnapshot,
  buildTaskInventoryItem,
  computeAiosValue,
  isEstimateTier,
  weakestTier,
  type AiosOrgMetrics,
  type AiosValueInputs,
  type TaskInventoryItem,
} from "@/lib/domain/aios-value";
import { getAiosValueSnapshot, inMemoryTaskStore, emptyOrgMetrics } from "@/lib/aios-value";

const now = new Date("2026-07-12T12:00:00.000Z");

// Founder-owned, fully measured, high-frequency, real savings.
const founderTask: TaskInventoryItem = buildTaskInventoryItem(
  {
    task: "Draft weekly investor update",
    owner: "moiz",
    department: "content",
    frequency: { per: "day", count: 1 },
    baselineMinutes: 60,
    currentMinutes: 10,
    humanReviewMinutes: 5,
    automationState: "autonomous",
    evidenceSource: "measured-actual",
    confidence: "high",
  },
  { id: "task_founder" },
);

// Employee-owned, still manual, only a founder ESTIMATE of the baseline.
const manualTask: TaskInventoryItem = buildTaskInventoryItem(
  {
    task: "Manual QA sweep",
    owner: "employee1",
    department: "content",
    frequency: { per: "week", count: 2 },
    baselineMinutes: 30,
    currentMinutes: 30,
    automationState: "manual",
    evidenceSource: "founder-estimate",
    confidence: "low",
  },
  { id: "task_manual" },
);

const org: AiosOrgMetrics = {
  headcount: 5,
  revenueCents: 1_000_000,
  revenuePeriodMonths: 1,
  revenueEvidenceTier: "verified-financial",
  automationCostCentsPerMonth: 60_000,
  automationCostEvidenceTier: "measured-actual",
  founderHourlyRateCents: 10_000,
  founderHourlyRateEvidenceTier: "founder-estimate",
  founders: ["moiz"],
};

function kpiMap(inputs: AiosValueInputs) {
  return Object.fromEntries(computeAiosValue(inputs).map((k) => [k.key, k]));
}

describe("aios-value domain — evidence tiers", () => {
  it("orders tiers weakest→strongest and labels estimates", () => {
    expect(weakestTier(["measured-actual", "founder-estimate", "verified-financial"])).toBe("founder-estimate");
    expect(weakestTier([])).toBeNull();
    expect(isEstimateTier("founder-estimate")).toBe(true);
    expect(isEstimateTier("inferred")).toBe(true);
    expect(isEstimateTier("measured-baseline")).toBe(false);
    expect(isEstimateTier("verified-financial")).toBe(false);
  });
});

describe("aios-value domain — KPI computation", () => {
  const kpis = kpiMap({ tasks: [founderTask, manualTask], org });

  it("computes hours saved (total vs founder-only)", () => {
    // founderTask nets 45 min/occurrence × 30 occ/mo = 1350 min = 22.5h; manualTask nets 0.
    expect(kpis.hours_saved_total.value).toBe(22.5);
    expect(kpis.founder_hours_saved.value).toBe(22.5);
  });

  it("aggregate KPI is only as strong as its weakest input — an estimate is never shown as actual", () => {
    // Total pools a measured-actual task WITH a founder-estimate task → the aggregate is estimate-tiered.
    expect(kpis.hours_saved_total.evidenceTier).toBe("founder-estimate");
    expect(kpis.hours_saved_total.isEstimate).toBe(true);
    // Founder-only savings come entirely from the measured-actual task → a true actual.
    expect(kpis.founder_hours_saved.evidenceTier).toBe("measured-actual");
    expect(kpis.founder_hours_saved.isEstimate).toBe(false);
  });

  it("computes the automation state mix (volume-weighted)", () => {
    expect(kpis.automation_pct.value).toBe(0.778);
    expect(kpis.fully_autonomous_pct.value).toBe(0.778);
    expect(kpis.augmentation_pct.value).toBe(0);
  });

  it("computes revenue/employee, cost per workflow, net ROI and payback with honest tiers", () => {
    expect(kpis.revenue_per_employee.value).toBe(200_000);
    expect(kpis.revenue_per_employee.evidenceTier).toBe("verified-financial");
    expect(kpis.revenue_per_employee.isEstimate).toBe(false);

    expect(kpis.cost_per_completed_workflow.value).toBe(2000); // 60000c ÷ 30 modeled autonomous workflows

    expect(kpis.net_roi_monthly.value).toBe(2.75); // (225000 value − 60000 cost) / 60000
    // ROI leans on a founder-estimate hourly rate → must be flagged an estimate.
    expect(kpis.net_roi_monthly.evidenceTier).toBe("founder-estimate");
    expect(kpis.net_roi_monthly.isEstimate).toBe(true);

    expect(kpis.payback_months.value).toBe(0.27);
  });
});

describe("aios-value domain — honest empty", () => {
  it("empty inventory → null KPIs, not zeros pretending to be results", () => {
    const kpis = kpiMap({ tasks: [], org: emptyOrgMetrics(["moiz"]) });
    for (const key of ["hours_saved_total", "founder_hours_saved", "automation_pct", "net_roi_monthly", "payback_months"]) {
      expect(kpis[key].value).toBeNull();
      expect(kpis[key].evidenceTier).toBeNull();
      expect(kpis[key].isEstimate).toBe(false);
    }
  });

  it("snapshot is honest-empty with a null overall tier", () => {
    const snap = buildAiosValueSnapshot({ type: "company", label: "WOBBLE" }, { tasks: [], org: emptyOrgMetrics() }, { now });
    expect(snap.isEmpty).toBe(true);
    expect(snap.taskCount).toBe(0);
    expect(snap.overallEvidenceTier).toBeNull();
    expect(snap.note).toMatch(/No task inventory/i);
  });
});

describe("aios-value service — store + scope", () => {
  it("computes a scoped snapshot from an injected in-memory store + org metrics", async () => {
    const store = inMemoryTaskStore([founderTask, manualTask]);
    const snap = await getAiosValueSnapshot({ type: "company", label: "WOBBLE" }, { store, orgMetrics: async () => org, now });
    expect(snap.isEmpty).toBe(false);
    expect(snap.taskCount).toBe(2);
    // overall ceiling = weakest present tier across KPIs (a founder-estimate task is in the mix).
    expect(snap.overallEvidenceTier).toBe("founder-estimate");
  });

  it("department scope filters the inventory", async () => {
    const otherDept = buildTaskInventoryItem(
      { task: "Finance recon", owner: "ali", department: "finance", frequency: { per: "month", count: 4 }, baselineMinutes: 120, currentMinutes: 20, automationState: "automated", evidenceSource: "measured-baseline" },
      { id: "task_fin" },
    );
    const store = inMemoryTaskStore([founderTask, manualTask, otherDept]);
    const snap = await getAiosValueSnapshot({ type: "department", id: "finance" }, { store, now });
    expect(snap.taskCount).toBe(1);
  });
});
