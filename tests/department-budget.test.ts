import { describe, expect, it } from "vitest";
import { buildDepartmentRow, type DepartmentRow } from "@/lib/domain/department";
import { evaluateBudget, aggregateUsage, buildBudgetReservationRow, windowBoundaries, type BudgetReservationRow, type BudgetUsage } from "@/lib/domain/department-budget";
import { reserveBudget, settleBudget, releaseBudget, expireStaleReservations, getBudgetState, type BudgetStore } from "@/lib/departments/budget";
import type { DepartmentRegistryStore } from "@/lib/departments/registry";

const now = new Date("2026-07-12T12:00:00.000Z");
const zeroUsage = (): BudgetUsage => ({ dailyCents: 0, dailyTokens: 0, monthlyCents: 0, monthlyTokens: 0, providerTokens: {}, activeReservations: 0 });

function dept(budget: Partial<DepartmentRow["budget"]> = {}, concurrencyLimit = 4): DepartmentRow {
  return buildDepartmentRow({ slug: "paid_audit", name: "Paid Audit", purpose: "p", status: "active", budget: budget as never, limits: { concurrencyLimit, timeoutMs: 60000, retryPolicy: { maxRetries: 2, backoffMs: 1000 } } }, { now });
}

describe("evaluateBudget — real caps, before the provider call", () => {
  const d = dept({ perRunCents: 100, dailyCents: 500, monthlyCents: 2000, perRunTokens: 1000, dailyTokens: 5000, providerBudgets: { openrouter: 3000 } });

  it("allows a request within every cap", () => {
    expect(evaluateBudget(d.budget, d.limits, zeroUsage(), { estimatedCents: 50, estimatedTokens: 500 }).ok).toBe(true);
  });
  it("blocks a per-run overage before anything else", () => {
    const r = evaluateBudget(d.budget, d.limits, zeroUsage(), { estimatedCents: 150, estimatedTokens: 0 });
    expect(r.ok).toBe(false);
    expect(r.blockedBy).toBe("per_run_cents");
  });
  it("blocks a daily-window overage (existing usage + this request)", () => {
    const r = evaluateBudget(d.budget, d.limits, { ...zeroUsage(), dailyCents: 480, monthlyCents: 480 }, { estimatedCents: 50, estimatedTokens: 0 });
    expect(r.ok).toBe(false);
    expect(r.blockedBy).toBe("daily_cents");
  });
  it("blocks a provider-cap overage", () => {
    const r = evaluateBudget(d.budget, d.limits, { ...zeroUsage(), providerTokens: { openrouter: 2900 } }, { estimatedCents: 0, estimatedTokens: 500, provider: "openrouter" });
    expect(r.ok).toBe(false);
    expect(r.blockedBy).toContain("provider_openrouter");
  });
  it("blocks a concurrency overage", () => {
    const r = evaluateBudget(d.budget, d.limits, { ...zeroUsage(), activeReservations: 4 }, { estimatedCents: 1, estimatedTokens: 1 });
    expect(r.ok).toBe(false);
    expect(r.blockedBy).toBe("concurrency");
  });
  it("marks degraded when a window is >=90% but not over", () => {
    const r = evaluateBudget(d.budget, d.limits, { ...zeroUsage(), dailyCents: 460, monthlyCents: 460 }, { estimatedCents: 20, estimatedTokens: 0 });
    expect(r.ok).toBe(true);
    expect(r.degraded).toBe(true);
  });
  it("null caps are unbounded", () => {
    const r = evaluateBudget(dept({}).budget, dept({}).limits, { ...zeroUsage(), dailyCents: 1e9 }, { estimatedCents: 1e9, estimatedTokens: 1e9 });
    expect(r.ok).toBe(true);
  });
});

describe("aggregateUsage — reserved holds, settled actuals, released/expired free", () => {
  const res = (over: Partial<BudgetReservationRow>): BudgetReservationRow => ({ ...buildBudgetReservationRow({ departmentSlug: "paid_audit", workflowId: "w", taskId: "t", estimatedCents: 100, estimatedTokens: 200 }, { now, id: "x" }), ...over });
  it("counts reserved estimates + settled actuals; ignores released/expired", () => {
    const rows = [
      res({ id: "a", state: "reserved", estimatedCents: 100, estimatedTokens: 200 }),
      res({ id: "b", state: "settled", actualCents: 40, actualTokens: 80 }),
      res({ id: "c", state: "released", estimatedCents: 999 }),
      res({ id: "d", state: "expired", estimatedCents: 999 }),
    ];
    const u = aggregateUsage(rows, now);
    expect(u.monthlyCents).toBe(140); // 100 reserved + 40 settled
    expect(u.monthlyTokens).toBe(280);
    expect(u.activeReservations).toBe(1); // only the reserved one
  });
  it("daily window excludes rows created before start-of-day", () => {
    const { dayStart } = windowBoundaries(now);
    const before = new Date(dayStart.getTime() - 3600_000);
    const rows = [res({ id: "a", createdAt: before, estimatedCents: 100 }), res({ id: "b", createdAt: now, estimatedCents: 30 })];
    const u = aggregateUsage(rows, now);
    expect(u.monthlyCents).toBe(130);
    expect(u.dailyCents).toBe(30); // only today's
  });
});

// ---- service with in-memory stores ----
function makeBudgetStore(seed: BudgetReservationRow[] = []) {
  const rows = new Map<string, BudgetReservationRow>(seed.map((r) => [r.id, r]));
  const store: BudgetStore = {
    withDepartmentLock: async (dept, fn) => fn({
      getUnit: async (d, wf, task) => [...rows.values()].find((r) => r.departmentSlug === d && r.workflowId === wf && r.taskId === task) ?? null,
      windowRows: async (d, ms) => [...rows.values()].filter((r) => r.departmentSlug === d && r.createdAt.getTime() >= ms.getTime()),
      insert: async (row) => { if ([...rows.values()].some((r) => r.departmentSlug === row.departmentSlug && r.workflowId === row.workflowId && r.taskId === row.taskId)) throw new Error("duplicate unit"); rows.set(row.id, row); },
    }),
    getById: async (id) => rows.get(id) ?? null,
    transition: async (id, from, fields) => { const r = rows.get(id); if (!r || r.state !== from) return false; rows.set(id, { ...r, ...fields }); return true; },
    listExpired: async (n, limit) => [...rows.values()].filter((r) => r.state === "reserved" && r.expiresAt.getTime() <= n.getTime()).slice(0, limit),
    windowRows: async (d, ms) => [...rows.values()].filter((r) => r.departmentSlug === d && r.createdAt.getTime() >= ms.getTime()),
  };
  return { store, rows };
}
function registryFor(d: DepartmentRow): DepartmentRegistryStore {
  return { getDepartmentBySlug: async (s) => (s === d.slug ? d : null), insertDepartment: async () => {}, listDepartments: async () => [d], updateDepartment: async () => {}, insertMember: async () => {}, getMember: async () => null, listMembers: async () => [], listMembershipsForRef: async () => [], updateMember: async () => {} };
}

describe("budget runtime service", () => {
  const d = dept({ dailyCents: 100 });
  const deps = (bs: BudgetStore) => ({ store: registryFor(d), budgetStore: bs, recordAudit: async () => {}, now });

  it("reserves, then settles against the actual cost", async () => {
    const { store, rows } = makeBudgetStore();
    const r = await reserveBudget({ departmentSlug: "paid_audit", workflowId: "wf", taskId: "t1", estimatedCents: 40, estimatedTokens: 100 }, deps(store));
    expect(r.ok).toBe(true);
    expect(await settleBudget(r.reservation!.id, { actualCents: 25, actualTokens: 90 }, deps(store))).toBe(true);
    expect(rows.get(r.reservation!.id)!.state).toBe("settled");
    expect(rows.get(r.reservation!.id)!.actualCents).toBe(25);
  });

  it("BLOCKS a request that would exceed the cap — before the provider call, no row inserted", async () => {
    const { store, rows } = makeBudgetStore();
    const r = await reserveBudget({ departmentSlug: "paid_audit", workflowId: "wf", taskId: "t1", estimatedCents: 150 }, deps(store));
    expect(r.ok).toBe(false);
    expect(r.reservation).toBeNull();
    expect(rows.size).toBe(0); // nothing reserved
  });

  it("RETRY does not double-charge: the same unit reuses its reservation", async () => {
    const { store, rows } = makeBudgetStore();
    const a = await reserveBudget({ departmentSlug: "paid_audit", workflowId: "wf", taskId: "t1", estimatedCents: 60 }, deps(store));
    const b = await reserveBudget({ departmentSlug: "paid_audit", workflowId: "wf", taskId: "t1", estimatedCents: 60 }, deps(store)); // retry
    expect(b.deduped).toBe(true);
    expect(b.reservation!.id).toBe(a.reservation!.id);
    expect(rows.size).toBe(1); // one reservation, not two
  });

  it("a released reservation frees the hold so new work fits", async () => {
    const { store } = makeBudgetStore();
    const a = await reserveBudget({ departmentSlug: "paid_audit", workflowId: "wf", taskId: "t1", estimatedCents: 80 }, deps(store));
    // Now only 20 left; a 40 request blocks.
    expect((await reserveBudget({ departmentSlug: "paid_audit", workflowId: "wf", taskId: "t2", estimatedCents: 40 }, deps(store))).ok).toBe(false);
    await releaseBudget(a.reservation!.id, deps(store));
    // Freed — the 40 request now fits.
    expect((await reserveBudget({ departmentSlug: "paid_audit", workflowId: "wf", taskId: "t3", estimatedCents: 40 }, deps(store))).ok).toBe(true);
  });

  it("expireStaleReservations releases reserved-but-expired holds", async () => {
    const stale = buildBudgetReservationRow({ departmentSlug: "paid_audit", workflowId: "wf", taskId: "old", estimatedCents: 50 }, { now: new Date(now.getTime() - 60 * 60_000), ttlMs: 60_000 });
    const { store, rows } = makeBudgetStore([stale]);
    expect(await expireStaleReservations(deps(store))).toBe(1);
    expect(rows.get(stale.id)!.state).toBe("expired");
  });

  it("founder OVERRIDE reserves past the block, recorded with overrideBy", async () => {
    const { store } = makeBudgetStore();
    const audits: { type: string; actor?: string }[] = [];
    const od = { store: registryFor(d), budgetStore: store, recordAudit: async (e: { eventType: string; actor?: string }) => void audits.push({ type: e.eventType, actor: e.actor }), now };
    const r = await reserveBudget({ departmentSlug: "paid_audit", workflowId: "wf", taskId: "t1", estimatedCents: 150, overrideBy: "Moiz" }, od);
    expect(r.ok).toBe(true);
    expect(r.overridden).toBe(true);
    expect(r.reservation!.overrideBy).toBe("Moiz");
    expect(audits.some((a) => a.type === "budget.override" && a.actor === "Moiz")).toBe(true);
  });

  it("getBudgetState reports usage + remaining per window", async () => {
    const { store } = makeBudgetStore();
    await reserveBudget({ departmentSlug: "paid_audit", workflowId: "wf", taskId: "t1", estimatedCents: 30 }, deps(store));
    const state = await getBudgetState("paid_audit", deps(store));
    expect(state?.usage.dailyCents).toBe(30);
    expect(state?.remaining.dailyCents).toBe(70); // 100 cap - 30
  });
});
