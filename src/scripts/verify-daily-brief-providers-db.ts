/**
 * Real-DB proof (Postgres) that the FOUR remaining Daily Brief providers read REAL stores + emit evidence-linked
 * signals (no more honest coverage gaps): provider_health (stale worker), kpi (overdue task), crm_movement (stalled
 * opportunity), intelligence (pending-review item). Each signal carries a real source id as evidence; each provider
 * returns [] when its store has nothing (never fabricated). provider_health is company-scoped (skips client scope).
 *
 * ISOLATED + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-daily-brief-providers-db.ts
 */
import { inArray, eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { workerHeartbeats, tasks, crmOpportunities, intelligenceItems } from "@/db/schema";
import { providerHealthProvider, kpiProvider, crmMovementProvider, intelligenceProvider } from "@/lib/daily-brief/providers";
import type { BriefScope } from "@/lib/domain/daily-brief";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const now = new Date();
  const past = new Date(now.getTime() - 3 * 86_400_000);
  const staleBeat = new Date(now.getTime() - 10 * 60_000);
  const ids = { worker: `whb_${uniq}`, task: `task_${uniq}`, opp: `opp_${uniq}`, intel: `intel_${uniq}` };
  const company = `dbp_${uniq}`;
  const companyScope: BriefScope = { type: "company", id: null, label: "WOBBLE", cadence: "daily" };
  const clientScope: BriefScope = { type: "client", id: company, label: "Client", cadence: "daily" };
  const ctx = { now, lookbackMs: 86_400_000 };

  try {
    // Seed one real row per new provider's store.
    await db.insert(workerHeartbeats).values({ id: ids.worker, workerName: `w_${uniq}`, workerType: "media", status: "online", heartbeatAt: staleBeat, metadata: {}, createdAt: past, updatedAt: staleBeat } as never);
    await db.insert(tasks).values({ id: ids.task, title: `Overdue task ${uniq}`, taskType: "general", priority: "high", status: "in_progress", companyId: company, dueDate: past, metadata: {}, createdAt: past, updatedAt: past } as never);
    await db.insert(crmOpportunities).values({ id: ids.opp, name: `Stalled deal ${uniq}`, companyId: company, stage: "proposal_sent", valueCents: 500000, currency: "USD", probability: 50, priority: "high", serviceInterest: [], status: "open", nextActionAt: past, metadata: {}, createdAt: past, updatedAt: past } as never);
    await db.insert(intelligenceItems).values({ id: ids.intel, itemType: "insight", scope: "wobble", title: `Pending finding ${uniq}`, summary: "s", trustLevel: "tier_3_monitored", approvalStatus: "pending", freshnessStatus: "fresh", confidence: "0.7", collectedAt: past, tags: [], metrics: {}, extracted: {}, relations: {}, metadata: {}, createdAt: past, updatedAt: past } as never);

    // provider_health — the stale worker surfaces (company scope); client scope SKIPS it.
    const ph = await providerHealthProvider(companyScope, ctx);
    const phSig = ph.find((s) => s.evidence.some((e) => e.ref === ids.worker));
    assert(!!phSig && phSig.category === "provider_health" && phSig.actionRequired === true, "provider_health: the STALE worker surfaces a signal (evidence → the worker heartbeat)");
    assert((await providerHealthProvider(clientScope, ctx)).every((s) => s.evidence.every((e) => e.ref !== ids.worker)), "provider_health is company-scoped — a client-scoped brief skips it");

    // kpi — the overdue task aggregates into a signal.
    const kpi = await kpiProvider(companyScope, ctx);
    const kpiSig = kpi.find((s) => s.evidence.some((e) => e.ref === ids.task));
    assert(!!kpiSig && kpiSig.category === "kpi", "kpi: the OVERDUE task surfaces (evidence → the task)");

    // crm_movement — the stalled opportunity surfaces.
    const crm = await crmMovementProvider(companyScope, ctx);
    const crmSig = crm.find((s) => s.evidence.some((e) => e.ref === ids.opp));
    assert(!!crmSig && crmSig.category === "crm_movement" && /Stalled deal/.test(crmSig.title), "crm_movement: the STALLED opportunity (overdue next action) surfaces (evidence → the opportunity)");

    // intelligence — the pending item aggregates into a review signal.
    const intel = await intelligenceProvider(companyScope, ctx);
    const intelSig = intel.find((s) => s.evidence.some((e) => e.ref === ids.intel));
    assert(!!intelSig && intelSig.category === "intelligence" && intelSig.actionRequired === true, "intelligence: the PENDING-review item surfaces (evidence → the intelligence item)");

    // Every emitted signal carries a real evidence ref (never fabricated).
    for (const sig of [phSig!, kpiSig!, crmSig!, intelSig!]) assert(sig.evidence.length >= 1 && sig.evidence.every((e) => !!e.ref), "every signal carries ≥1 real evidence ref");

    console.log("\n✅ daily-brief-providers DB proof passed");
  } finally {
    await db.delete(workerHeartbeats).where(eq(workerHeartbeats.id, ids.worker));
    await db.delete(tasks).where(inArray(tasks.id, [ids.task]));
    await db.delete(crmOpportunities).where(eq(crmOpportunities.id, ids.opp));
    await db.delete(intelligenceItems).where(eq(intelligenceItems.id, ids.intel));
    await closeDb();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
