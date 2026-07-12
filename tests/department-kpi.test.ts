import { describe, expect, it } from "vitest";
import { computeDepartmentKpis, type KpiHandoff } from "@/lib/departments/kpi";
import { buildDepartmentRow, type DepartmentRow } from "@/lib/domain/department";

const now = new Date("2026-07-12T12:00:00.000Z");

function dept(): DepartmentRow {
  return buildDepartmentRow({ slug: "paid_audit", name: "Paid Audit", purpose: "p", status: "active", kpis: [{ key: "success_rate", target: 0.9, unit: "ratio" }, { key: "qa_pass_rate", target: 0.8, unit: "ratio" }] }, { now });
}

function h(over: Partial<KpiHandoff>): KpiHandoff {
  return { deliveryState: "completed", retryCount: 0, latencyMs: 1000, costEstimate: 10, qualityScore: null, createdAt: now, completedAt: new Date(now.getTime() + 2000), updatedAt: now, ...over };
}

function kpi(values: ReturnType<typeof computeDepartmentKpis>, key: string) {
  return values.find((v) => v.key === key)!;
}

describe("computeDepartmentKpis — real metrics from runtime data", () => {
  const handoffs: KpiHandoff[] = [
    h({ deliveryState: "completed", latencyMs: 1000, qualityScore: 8, completedAt: new Date(now.getTime() + 3000) }),
    h({ deliveryState: "completed", latencyMs: 2000, qualityScore: 5, completedAt: new Date(now.getTime() + 5000) }),
    h({ deliveryState: "dead_lettered", retryCount: 5, qualityScore: null, completedAt: null }),
    h({ deliveryState: "completed", latencyMs: 3000, qualityScore: 9, completedAt: new Date(now.getTime() + 4000) }),
  ];
  const values = computeDepartmentKpis({
    department: dept(),
    handoffs,
    settled: [{ actualCents: 30, actualTokens: 1500 }, { actualCents: 20, actualTokens: 800 }],
    escalations: { open: 2, stale: 1 },
    approvals: { approved: 8, rejected: 2 },
    now,
  });

  it("computes jobs, completions, success + failure + dead-letter rates", () => {
    expect(kpi(values, "jobs_received").value).toBe(4);
    expect(kpi(values, "products_completed").value).toBe(3);
    expect(kpi(values, "success_rate").value).toBe(0.75); // 3/4
    expect(kpi(values, "failure_rate").value).toBe(0.25); // 1 dead-lettered / 4
    expect(kpi(values, "dead_letter_rate").value).toBe(0.25);
    expect(kpi(values, "retry_rate").value).toBe(0.25); // 1 with retries / 4
  });

  it("computes timing, cost-per-product and token use from settled reservations", () => {
    expect(kpi(values, "avg_completion_ms").value).toBe(2000); // (1000+2000+3000)/3
    expect(kpi(values, "cost_per_product_cents").value).toBe(17); // (30+20)/3 = 16.67 → 17
    expect(kpi(values, "token_use").value).toBe(2300);
  });

  it("computes QA pass rate only over quality-scored completions, and approval rate", () => {
    // 3 completed have quality (8,5,9); ≥6 → 8 and 9 → 2/3.
    expect(kpi(values, "qa_pass_rate").value).toBeCloseTo(0.667, 2);
    expect(kpi(values, "approval_rate").value).toBe(0.8); // 8/(8+2)
  });

  it("carries the target from the department config", () => {
    expect(kpi(values, "success_rate").target).toBe(0.9);
    expect(kpi(values, "qa_pass_rate").target).toBe(0.8);
    expect(kpi(values, "failure_rate").target).toBeNull(); // not configured
  });

  it("surfaces escalation-derived counts", () => {
    expect(kpi(values, "open_escalations").value).toBe(2);
    expect(kpi(values, "stale_work").value).toBe(1);
  });

  it("confidence + freshness reflect the data; empty data is honest null/none", () => {
    expect(kpi(values, "jobs_received").confidence).toBe("low"); // 4 samples
    expect(kpi(values, "jobs_received").freshnessAt).toEqual(now);
    const empty = computeDepartmentKpis({ department: dept(), handoffs: [], settled: [], escalations: { open: 0, stale: 0 }, approvals: { approved: 0, rejected: 0 }, now });
    expect(kpi(empty, "success_rate").value).toBeNull();
    expect(kpi(empty, "success_rate").confidence).toBe("none");
    expect(kpi(empty, "approval_rate").value).toBeNull();
  });
});
