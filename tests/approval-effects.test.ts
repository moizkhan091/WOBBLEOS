import { describe, expect, it } from "vitest";
import { buildApprovalEffectRow, decideEffectRetry, type ApprovalEffectRow, type ApprovalEffectState } from "@/lib/domain/approval-effect";
import { reconcileApprovalEffects, type ApprovalEffectStore, type ApprovalEffectApplier } from "@/lib/approval-effects";
import { APPROVAL_EFFECT_APPLIERS } from "@/lib/approval-effects/appliers";

const now = new Date("2026-07-11T12:00:00Z");

function makeStore(seed: ApprovalEffectRow[] = []) {
  const rows = new Map<string, ApprovalEffectRow>(seed.map((r) => [r.id, r]));
  const byKey = new Set(seed.map((r) => `${r.approvalId}::${r.effectType}`));
  const store: ApprovalEffectStore = {
    insert: async (row) => {
      const k = `${row.approvalId}::${row.effectType}`;
      if (byKey.has(k)) throw new Error("duplicate key value violates unique constraint"); // unique (approvalId, effectType)
      byKey.add(k);
      rows.set(row.id, row);
    },
    getById: async (id) => rows.get(id) ?? null,
    listDuePending: async (at, limit) => [...rows.values()].filter((r) => r.state === "pending" && (r.runAfter === null || r.runAfter.getTime() <= at.getTime())).slice(0, limit),
    transition: async (id, from, fields) => { const r = rows.get(id); if (!r || r.state !== from) return false; rows.set(id, { ...r, ...fields }); return true; },
  };
  return { store, rows };
}

function effect(overrides: Partial<ApprovalEffectRow> = {}): ApprovalEffectRow {
  return { ...buildApprovalEffectRow({ approvalId: "ap_1", effectType: "source.activate", entityType: "source", entityId: "src_1", actor: "Moiz" }, { now, id: "eff_1" }), ...overrides };
}

describe("approval-effect applier coverage", () => {
  it("every migrated approval effect type has a registered idempotent applier", () => {
    // source, content_packet, skill, model_upgrade, memory_update are migrated to the outbox; each has an applier.
    expect(Object.keys(APPROVAL_EFFECT_APPLIERS).sort()).toEqual(["content.import", "memory.apply", "model.apply", "skill.activate", "source.activate"]);
    for (const fn of Object.values(APPROVAL_EFFECT_APPLIERS)) expect(typeof fn).toBe("function");
  });
});

describe("approval-effect domain", () => {
  it("retries with backoff until out of attempts, then fails", () => {
    expect(decideEffectRetry({ attempts: 1, maxAttempts: 3 })).toMatchObject({ next: "pending", backoffMs: 2000 });
    expect(decideEffectRetry({ attempts: 3, maxAttempts: 3 })).toMatchObject({ next: "failed" });
  });
});

describe("approval-effects reconciler (transactional outbox)", () => {
  it("applies a pending effect idempotently and marks it applied", async () => {
    const { store, rows } = makeStore([effect()]);
    let applied = 0;
    const appliers: Record<string, ApprovalEffectApplier> = { "source.activate": async () => { applied += 1; } };
    const r = await reconcileApprovalEffects(appliers, { store, recordAudit: async () => {}, now });
    expect(r).toMatchObject({ applied: 1, retried: 0, failed: 0 });
    expect(applied).toBe(1);
    expect(rows.get("eff_1")!.state).toBe("applied");
  });

  it("CRASH RESUME: an effect recorded but never applied (process died) is applied by a later reconcile", async () => {
    // The effect exists in `pending` — this models a crash AFTER the atomic flip+record but BEFORE apply.
    const { store, rows } = makeStore([effect()]);
    const appliers: Record<string, ApprovalEffectApplier> = { "source.activate": async () => {} };
    // First reconcile (the "recovery" run) converges it.
    await reconcileApprovalEffects(appliers, { store, recordAudit: async () => {}, now });
    expect(rows.get("eff_1")!.state).toBe("applied");
  });

  it("EXACTLY-ONCE under duplicate delivery: a second reconcile does not re-apply", async () => {
    const { store } = makeStore([effect()]);
    let applied = 0;
    const appliers: Record<string, ApprovalEffectApplier> = { "source.activate": async () => { applied += 1; } };
    await reconcileApprovalEffects(appliers, { store, recordAudit: async () => {}, now });
    await reconcileApprovalEffects(appliers, { store, recordAudit: async () => {}, now }); // duplicate pass
    expect(applied).toBe(1); // applied exactly once (no longer pending after the first pass)
  });

  it("duplicate effect INSERT for the same (approval, type) is rejected by the unique constraint", async () => {
    const { store } = makeStore([effect()]);
    await expect(store.insert(effect({ id: "eff_dup" }))).rejects.toThrow(/unique constraint/);
  });

  it("a failing applier retries (backoff) then dead-ends at failed after maxAttempts", async () => {
    const { store, rows } = makeStore([effect({ maxAttempts: 2 })]);
    const appliers: Record<string, ApprovalEffectApplier> = { "source.activate": async () => { throw new Error("db down"); } };
    // attempt 1 -> retry (pending, runAfter set)
    let r = await reconcileApprovalEffects(appliers, { store, recordAudit: async () => {}, now });
    expect(r.retried).toBe(1);
    expect(rows.get("eff_1")!.state).toBe("pending");
    expect(rows.get("eff_1")!.attempts).toBe(1);
    // move the clock past backoff, attempt 2 -> out of attempts -> failed
    const later = new Date(now.getTime() + 10 * 60_000);
    r = await reconcileApprovalEffects(appliers, { store, recordAudit: async () => {}, now: later });
    expect(r.failed).toBe(1);
    expect(rows.get("eff_1")!.state).toBe("failed");
    expect(rows.get("eff_1")!.lastError).toMatch(/db down/);
  });

  it("an effect with no registered applier is marked failed (not silently dropped)", async () => {
    const { store, rows } = makeStore([effect({ effectType: "unknown.effect" })]);
    const r = await reconcileApprovalEffects({}, { store, recordAudit: async () => {}, now });
    expect(r.failed).toBe(1);
    expect(rows.get("eff_1")!.lastError).toMatch(/no applier/);
  });

  it("reconcile can target a single effect (inline fast-path)", async () => {
    const { store, rows } = makeStore([effect({ id: "a" }), effect({ id: "b", approvalId: "ap_2" })]);
    let applied = 0;
    const appliers: Record<string, ApprovalEffectApplier> = { "source.activate": async () => { applied += 1; } };
    await reconcileApprovalEffects(appliers, { store, recordAudit: async () => {}, now, onlyId: "a" });
    expect(applied).toBe(1);
    expect(rows.get("a")!.state).toBe("applied");
    expect(rows.get("b")!.state).toBe("pending"); // untouched
  });
});
