/**
 * Real-DB + REAL-PROVIDER proof (Phase 3, L1): a controlled OpenRouter request through the production
 * provider adapter persists ACTUAL normalized usage (real tokens, real model, provider-reported cost when
 * supplied, calculated cost from pricing), a budget reservation settles to that ACTUAL usage (not the
 * estimate), and a retry / duplicate does not double-charge. Isolated (unique ids) + cleanup in finally.
 *
 * Requires OPENROUTER_API_KEY + a seeded openrouter provider connection.
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-provider-usage-db.ts
 */
import { getDb, closeDb } from "@/db";
import { providerUsage, budgetReservations, departments } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { runTextProvider } from "@/lib/providers";
import { createDepartment, defaultStore as registryStore } from "@/lib/departments/registry";
import { reserveBudget, settleReservationFromUsage, defaultBudgetStore } from "@/lib/departments/budget";
import { recordProviderUsage, defaultStore as usageStore } from "@/lib/provider-usage";

async function main() {
  const db = getDb();
  const now = new Date();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const tag = `verify_prov_${Date.now()}`;
  const wf = `${tag}_wf`;
  const task = `${tag}_task`;
  const slug = `${tag}_dept`;

  try {
    // 1. Controlled REAL OpenRouter call through the production adapter (cheap model, tiny prompt).
    const res = await runTextProvider({
      role: "default",
      module: "settings",
      model: "openai/gpt-4o-mini",
      maxTokens: 16,
      messages: [{ role: "user", content: "Reply with the single word: pong" }],
      usageContext: { departmentSlug: slug, workflowId: wf, taskId: task, companyId: `${tag}_co`, clientWorkspaceId: `${tag}_co` },
    });
    assert(typeof res.text === "string" && res.text.length > 0, `real OpenRouter call returned text: "${res.text.trim().slice(0, 20)}"`);
    assert(!!res.run?.providerRunId || !!res.run?.id, "the call produced a model run");

    // 2. The normalized ACTUAL usage was persisted.
    const usage = (await db.select().from(providerUsage).where(and(eq(providerUsage.workflowId, wf), eq(providerUsage.taskId, task))))[0];
    assert(!!usage, "provider_usage row persisted for this unit of work");
    assert(usage.model === "openai/gpt-4o-mini", "actual model persisted");
    assert((usage.inputTokens ?? 0) > 0 && (usage.outputTokens ?? 0) > 0, `actual input+output tokens persisted (${usage.inputTokens}/${usage.outputTokens})`);
    assert(usage.estimationStatus === "actual", "usage marked ACTUAL (not estimated)");
    assert(Number(usage.calculatedCostUsd) >= 0, "internally-calculated cost persisted");
    if (usage.providerReportedCostUsd !== null) { assert(Number(usage.providerReportedCostUsd) >= 0 && usage.verificationStatus === "verified", "provider-reported cost persisted + marked verified"); }
    else { console.log("  · OpenRouter did not return a cost field on this call — calculated cost used, verificationStatus=unverified (honest)"); }
    assert(usage.departmentSlug === slug && usage.clientWorkspaceId === `${tag}_co`, "usage is tenant-scoped (department + client workspace)");

    // 3. A budget reservation settles to the ACTUAL usage, not an estimate.
    await createDepartment({ slug, name: "Verify Provider", purpose: "verify", status: "active", budget: { dailyCents: 100000 } as never }, { store: registryStore(db), recordAudit: async () => {} });
    const r = await reserveBudget({ departmentSlug: slug, workflowId: wf, taskId: task, estimatedCents: 500, estimatedTokens: 1000 }, { budgetStore: defaultBudgetStore(db), store: registryStore(db), recordAudit: async () => {}, now });
    assert(r.ok, "reserved an estimate for the unit");
    const settle = await settleReservationFromUsage(r.reservation!.id, { departmentSlug: slug, workflowId: wf, taskId: task }, 500, { budgetStore: defaultBudgetStore(db), usageStore: usageStore(db), recordAudit: async () => {}, now });
    assert(settle.settled && settle.fromActual, "reservation settled from ACTUAL usage (not the 500¢ estimate)");
    const settledRow = (await db.select().from(budgetReservations).where(eq(budgetReservations.id, r.reservation!.id)))[0];
    const expectedCents = Math.round((usage.providerReportedCostUsd !== null ? Number(usage.providerReportedCostUsd) : Number(usage.calculatedCostUsd)) * 100);
    assert(settledRow.state === "settled" && settledRow.actualCents === expectedCents, `settled actualCents == actual usage cost (${settledRow.actualCents}¢ == ${expectedCents}¢)`);

    // 4. Retry / duplicate callback does not double-charge.
    const before = (await db.select().from(providerUsage).where(eq(providerUsage.workflowId, wf))).length;
    const dup = await recordProviderUsage({ providerRequestId: usage.providerRequestId, attempt: usage.attempt, provider: usage.provider, model: usage.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, context: { departmentSlug: slug, workflowId: wf, taskId: task } }, { store: usageStore(db) });
    assert(dup.deduped, "duplicate usage callback deduped");
    const after = (await db.select().from(providerUsage).where(eq(providerUsage.workflowId, wf))).length;
    assert(before === after, "no duplicate usage row created (no double-charge on retry)");

    console.log("\nALL REAL-PROVIDER USAGE + SETTLEMENT CHECKS PASSED ✅");
  } finally {
    await db.delete(providerUsage).where(eq(providerUsage.workflowId, wf));
    await db.delete(budgetReservations).where(eq(budgetReservations.departmentSlug, slug));
    await db.delete(departments).where(eq(departments.slug, slug));
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
