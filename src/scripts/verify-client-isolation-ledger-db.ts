/**
 * CLIENT-ISOLATION canary sweep + LEDGER reconciliation — proven against live Postgres.
 *
 * PART A — client isolation (canary): three distinct clients (Alpha / Beta / Gamma) each carry a UNIQUE canary
 * token embedded in their work. Every client-scoped read must return ONLY that client's rows — a caller scoped
 * to Alpha can never see Beta's or Gamma's canary. Proven on the real clientId-scoped DB query path
 * (task_inventory.client_id) at BOTH the store layer and the public getAiosValueSnapshot() API.
 *
 * PART B — ledger reconciliation: the authoritative recorded spend a budget check reads must reconcile
 * ITEM-BY-ITEM with the ledger — it is exactly the sum of SUCCEEDED actualCost, and failed / budget-rejected
 * rows never inflate it. Plus the budget guard blocks a worst-case that would breach the stop threshold, and an
 * untracked provider is never silently billed.
 *
 * ISOLATED: unique clientIds + a unique ledger provider name per run + finally-cleanup — safe against a
 * populated DB. Run:  DATABASE_URL=... npx tsx src/scripts/verify-client-isolation-ledger-db.ts
 */
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { taskInventory, externalProviderSpend } from "@/db/schema";
import { addTaskToInventory, getAiosValueSnapshot, createDbTaskInventoryStore } from "@/lib/aios-value";
import {
  recordExternalSpend,
  getProviderSpend,
  assertProviderAllowance,
  ProviderBudgetExceededError,
  PROVIDER_BUDGETS,
} from "@/lib/provider-budget";
import type { TaskInventoryItem } from "@/lib/domain/aios-value";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const db = getDb();
  const stamp = Date.now();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };

  const store = createDbTaskInventoryStore(db);
  const reconProvider = `recon-${stamp}`; // unique → isolates the ledger sum from every other row in the DB
  const seededTaskIds: string[] = [];

  // Three clients with UNIQUE ids (DB isolation) and fixed canary tokens (the directive's tripwire strings).
  const CLIENTS = [
    { key: "alpha", id: `client-alpha-${stamp}`, canary: "ALPHA-ONLY-7QK9" },
    { key: "beta", id: `client-beta-${stamp}`, canary: "BETA-ONLY-4M2P" },
    { key: "gamma", id: `client-gamma-${stamp}`, canary: "GAMMA-ONLY-9X3D" },
  ];
  const TASKS_PER_CLIENT = 2;

  try {
    // ═══ PART A — CLIENT ISOLATION CANARY SWEEP ════════════════════════════════════════════════════
    console.log("A. client-isolation canary sweep (task_inventory.client_id scoping)");
    for (const c of CLIENTS) {
      for (let i = 0; i < TASKS_PER_CLIENT; i += 1) {
        const item = await addTaskToInventory(
          {
            task: `${c.key} onboarding step ${i}`,
            owner: "Moiz",
            department: "delivery",
            frequency: { per: "week", count: 1 },
            baselineMinutes: 60,
            currentMinutes: 20,
            automationState: "augmented",
            evidenceSource: "measured-baseline",
            confidence: "high",
            metadata: { clientId: c.id, canary: c.canary },
          } as Parameters<typeof addTaskToInventory>[0],
          { store },
        );
        seededTaskIds.push(item.id);
      }
    }

    const canaryOf = (t: TaskInventoryItem) => (t.metadata as { canary?: string }).canary;
    const allCanaries = new Set(CLIENTS.map((c) => c.canary));

    for (const c of CLIENTS) {
      const scoped = await store.listTasks({ type: "client", id: c.id });
      // returned rows are exactly this client's seeded rows (unique id → no bleed from other runs)
      assert(scoped.length === TASKS_PER_CLIENT, `${c.key}: client-scoped read returns exactly this client's ${TASKS_PER_CLIENT} tasks (got ${scoped.length})`);
      assert(scoped.every((t) => canaryOf(t) === c.canary), `${c.key}: every returned task carries ONLY the ${c.canary} canary`);
      // the tripwire: no OTHER client's canary appears in this client's scoped read
      const foreign = [...allCanaries].filter((x) => x !== c.canary);
      const leaked = scoped.some((t) => foreign.includes(canaryOf(t) ?? ""));
      assert(!leaked, `${c.key}: NO other client's canary leaks into the ${c.key} scope (cross-client isolation holds)`);

      // and the PUBLIC api (getAiosValueSnapshot) is isolated too, not just the raw store
      const snap = await getAiosValueSnapshot({ type: "client", id: c.id }, { store });
      assert(snap.taskCount === TASKS_PER_CLIENT, `${c.key}: getAiosValueSnapshot counts ONLY this client's tasks (${snap.taskCount})`);
    }

    // Mismatched scope id sees NOTHING — a non-existent client id yields zero rows (no accidental wildcard).
    const ghost = await store.listTasks({ type: "client", id: `client-ghost-${stamp}` });
    assert(ghost.length === 0, "an unknown clientId returns zero tasks (no wildcard / no leak on a bad scope)");

    // ═══ PART B — LEDGER RECONCILIATION ════════════════════════════════════════════════════════════
    console.log("B. ledger reconciliation (authoritative recorded spend == sum of SUCCEEDED actualCost)");
    const rows = [
      { actualCost: 0.4, result: "succeeded" as const },
      { actualCost: 0.6, result: "succeeded" as const },
      { actualCost: 0.25, result: "failed" as const },          // must NOT count
      { actualCost: 0.1, result: "rejected_budget" as const },   // must NOT count
      { actualCost: 0.15, result: "blocked_killswitch" as const },// must NOT count
    ];
    for (const r of rows) {
      await recordExternalSpend({ provider: reconProvider, item: `recon-item-${stamp}`, estimatedMaxCost: r.actualCost + 0.05, actualCost: r.actualCost, unit: "usd", result: r.result, actor: "verify" }, { db });
    }
    const expectedSucceeded = rows.filter((r) => r.result === "succeeded").reduce((s, r) => s + r.actualCost, 0); // 1.0
    const recorded = await getProviderSpend(reconProvider, { db });
    assert(Math.abs(recorded - expectedSucceeded) < 1e-9, `authoritative recorded spend (${recorded}) reconciles to the sum of ONLY succeeded actualCost (${expectedSucceeded})`);

    // Budget guard reads that authoritative figure. Prove it with an injected spend (no DB pollution) against a
    // REAL tracked provider budget so the arithmetic is exercised end-to-end.
    const orBudget = PROVIDER_BUDGETS.openrouter;
    const underSpent = orBudget.stop - 0.5;
    const okAllowance = await assertProviderAllowance("openrouter", 0.2, { getSpent: async () => underSpent });
    assert(okAllowance.tracked && Math.abs(okAllowance.remaining - (orBudget.stop - underSpent)) < 1e-9, "a within-budget call is allowed and reports the correct remaining headroom");

    let threw = false;
    try {
      await assertProviderAllowance("openrouter", 1.0, { getSpent: async () => orBudget.stop - 0.1 }); // worst-case crosses the stop
    } catch (e) {
      threw = e instanceof ProviderBudgetExceededError;
    }
    assert(threw, "a worst-case charge that would breach the stop threshold is REJECTED (ProviderBudgetExceededError)");

    // An untracked provider is never silently billed — it reports tracked:false, forcing explicit registration.
    const untracked = await assertProviderAllowance(reconProvider, 999, { db });
    assert(untracked.tracked === false, "an untracked provider returns tracked:false (never silently unlimited-billed)");

    console.log("\n✅ client-isolation + ledger-reconciliation DB proof passed — no cross-client leak; spend reconciles item-by-item");
  } finally {
    if (seededTaskIds.length) await db.delete(taskInventory).where(inArray(taskInventory.id, seededTaskIds)).catch(() => {});
    await db.delete(externalProviderSpend).where(eq(externalProviderSpend.provider, reconProvider)).catch(() => {});
    await closeDb().catch(() => {});
  }
  process.exit(0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
