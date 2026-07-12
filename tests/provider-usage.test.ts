import { describe, expect, it } from "vitest";
import { buildProviderUsageRow, effectiveCostUsd, aggregateUnitUsage, type ProviderUsageRow } from "@/lib/domain/provider-usage";
import { recordProviderUsage, usageForUnit, type ProviderUsageStore } from "@/lib/provider-usage";

const now = new Date("2026-07-12T12:00:00.000Z");

describe("provider-usage domain — estimated vs actual stays honest", () => {
  it("marks usage ACTUAL + VERIFIED when tokens and provider cost are present", () => {
    const r = buildProviderUsageRow({ providerRequestId: "req_1", provider: "openrouter", model: "openai/gpt-4o", inputTokens: 100, outputTokens: 50, providerReportedCostUsd: 0.0021 }, { now });
    expect(r.estimationStatus).toBe("actual");
    expect(r.verificationStatus).toBe("verified");
    expect(effectiveCostUsd(r)).toBeCloseTo(0.0021, 6); // provider-reported wins
  });

  it("marks usage ESTIMATED when no tokens, UNVERIFIED when no provider cost (calculated only)", () => {
    const noTokens = buildProviderUsageRow({ providerRequestId: "req_2", provider: "openrouter", model: "openai/gpt-4o" }, { now });
    expect(noTokens.estimationStatus).toBe("estimated");
    const noCost = buildProviderUsageRow({ providerRequestId: "req_3", provider: "openrouter", model: "openai/gpt-4o", inputTokens: 200, outputTokens: 100 }, { now });
    expect(noCost.verificationStatus).toBe("unverified");
    expect(Number(noCost.calculatedCostUsd)).toBeGreaterThan(0); // computed from pricing
    expect(noCost.providerReportedCostUsd).toBeNull();
  });

  it("a FAILED call with no tokens is not billable", () => {
    const failed = buildProviderUsageRow({ providerRequestId: "req_4", provider: "openrouter", model: "openai/gpt-4o", status: "failed" }, { now });
    expect(failed.billable).toBe(false);
    expect(effectiveCostUsd(failed)).toBe(0);
  });

  it("aggregates a unit: provider-reported preferred, tokens summed, verification tracked", () => {
    const rows: ProviderUsageRow[] = [
      buildProviderUsageRow({ providerRequestId: "a", provider: "openrouter", model: "m", inputTokens: 100, outputTokens: 50, providerReportedCostUsd: 0.01 }, { now }),
      buildProviderUsageRow({ providerRequestId: "b", provider: "openrouter", model: "m", inputTokens: 200, outputTokens: 100 }, { now }), // calculated only
    ];
    const agg = aggregateUnitUsage(rows);
    expect(agg.tokens).toBe(450);
    expect(agg.anyActual).toBe(true);
    expect(agg.allVerified).toBe(false); // one is unverified
    expect(agg.costCents).toBeGreaterThanOrEqual(1); // >= 0.01 * 100 (provider-reported) + calculated
  });
});

function makeStore(seed: ProviderUsageRow[] = []) {
  const rows = new Map<string, ProviderUsageRow>(seed.map((r) => [`${r.providerRequestId}::${r.attempt}`, r]));
  const store: ProviderUsageStore = {
    findByRequest: async (id, attempt) => rows.get(`${id}::${attempt}`) ?? null,
    insert: async (row) => { const k = `${row.providerRequestId}::${row.attempt}`; if (rows.has(k)) throw new Error("duplicate"); rows.set(k, row); },
    listForUnit: async (dept, wf, task) => [...rows.values()].filter((r) => r.departmentSlug === dept && r.workflowId === wf && r.taskId === task),
    listForWorkflow: async (wf) => [...rows.values()].filter((r) => r.workflowId === wf),
    listForDepartmentSince: async (dept, since) => [...rows.values()].filter((r) => r.departmentSlug === dept && r.createdAt.getTime() >= since.getTime()),
  };
  return { store, rows };
}

describe("recordProviderUsage — idempotent by (providerRequestId, attempt)", () => {
  it("a duplicate provider request/callback records ONCE (no double-charge)", async () => {
    const { store, rows } = makeStore();
    const ctx = { departmentSlug: "paid_audit", workflowId: "wf", taskId: "t1" };
    const a = await recordProviderUsage({ providerRequestId: "gen-abc", provider: "openrouter", model: "m", inputTokens: 100, outputTokens: 50, providerReportedCostUsd: 0.02, context: ctx }, { store });
    const b = await recordProviderUsage({ providerRequestId: "gen-abc", provider: "openrouter", model: "m", inputTokens: 100, outputTokens: 50, providerReportedCostUsd: 0.02, context: ctx }, { store }); // duplicate callback
    expect(b.deduped).toBe(true);
    expect(b.row.id).toBe(a.row.id);
    expect(rows.size).toBe(1);
  });

  it("a RETRY (attempt 2) is a distinct usage row, not a duplicate", async () => {
    const { store, rows } = makeStore();
    await recordProviderUsage({ providerRequestId: "req_x", attempt: 1, provider: "openrouter", model: "m", inputTokens: 10, outputTokens: 5, context: { departmentSlug: "d", workflowId: "w", taskId: "t" } }, { store });
    await recordProviderUsage({ providerRequestId: "req_x", attempt: 2, provider: "openrouter", model: "m", inputTokens: 12, outputTokens: 6, context: { departmentSlug: "d", workflowId: "w", taskId: "t" } }, { store });
    expect(rows.size).toBe(2);
  });

  it("usageForUnit sums the ACTUAL cost + tokens for a unit of work", async () => {
    const { store } = makeStore();
    const ctx = { departmentSlug: "paid_audit", workflowId: "wf", taskId: "t1" };
    await recordProviderUsage({ providerRequestId: "u1", provider: "openrouter", model: "m", inputTokens: 100, outputTokens: 50, providerReportedCostUsd: 0.03, context: ctx }, { store });
    await recordProviderUsage({ providerRequestId: "u2", provider: "openrouter", model: "m", inputTokens: 200, outputTokens: 100, providerReportedCostUsd: 0.05, context: ctx }, { store });
    const unit = await usageForUnit("paid_audit", "wf", "t1", { store });
    expect(unit.rows).toBe(2);
    expect(unit.tokens).toBe(450);
    expect(unit.costCents).toBe(8); // (0.03 + 0.05) * 100
    expect(unit.anyActual).toBe(true);
    expect(unit.allVerified).toBe(true);
  });
});
