/**
 * Real-DB proof of the MEDIA budget circuit-breaker (Paperclip-style "overspend pauses queued work").
 *
 * Text generation was already budget-governed; media was not, so image jobs could blow past the
 * OpenRouter cap. This proves, against live Postgres, that:
 *   1. when the provider's external budget is exhausted, a claimed media job is BLOCKED (not failed) with
 *      a clear reason and NO attempt consumed — so a top-up + retry resumes it cleanly;
 *   2. a successful media generation RECORDS spend to the same external ledger text uses, so image + text
 *      share one cap and the breaker can see media usage.
 *
 * No paid calls — a fake provider is injected. ISOLATED (unique provider name) + finally-cleanup.
 * Run: DATABASE_URL=... npx tsx src/scripts/verify-media-budget-circuit-db.ts
 */
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { mediaJobs, externalProviderSpend } from "@/db/schema";
import { createMediaJob, dispatchOneMediaJob, defaultStore } from "@/lib/media";
import { recordExternalSpend, PROVIDER_BUDGETS, getProviderSpend } from "@/lib/provider-budget";
import type { MediaProvider } from "@/lib/media";
import type { AuditEventInput } from "@/lib/domain/audit";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const db = getDb();
  const store = defaultStore(db);
  const stamp = Date.now();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const noAudit = async (_: AuditEventInput) => {};
  const noRun = async () => ({});

  // A fake OpenRouter media provider — never makes a real call; returns a fixed cheap "image".
  const fakeOpenrouter: MediaProvider = {
    slug: "openrouter",
    configured: () => true,
    async generate() { return { outputRefs: [`media/fake-${stamp}.png`], actualCostCents: 4 }; },
  } as MediaProvider;
  const providers = { openrouter: fakeOpenrouter, fal: fakeOpenrouter };

  const jobIds: string[] = [];
  const spendItem = `circuit-proof-${stamp}`;
  try {
    // ── 1. EXHAUSTED cap → job is BLOCKED, not failed, no attempt consumed ──────────────────────────
    // Push recorded OpenRouter spend just over the stop threshold so the next call is refused.
    const stop = PROVIDER_BUDGETS.openrouter.stop;
    await recordExternalSpend({ provider: "openrouter", item: spendItem, estimatedMaxCost: stop, actualCost: stop + 0.5, unit: "usd", result: "succeeded", actor: "circuit-proof" }, { db });
    const spentNow = await getProviderSpend("openrouter", { db });
    assert(spentNow > stop, `recorded spend (${spentNow.toFixed(2)}) is over the OpenRouter stop (${stop})`);

    const blockedJob = await createMediaJob({ kind: "image", prompt: `circuit ${stamp}`, provider: "openrouter", estimatedCostCents: 8, budgetCapCents: 20, requestedBy: "Moiz", dedupeKey: `circuit-blocked-${stamp}` }, { store, recordAudit: noAudit });
    if (!blockedJob.ok || !blockedJob.job) throw new Error("failed to create the blocked test job");
    jobIds.push(blockedJob.job.id);
    const r1 = await dispatchOneMediaJob({ store, providers, recordAudit: noAudit, recordProviderRun: noRun, enforceBudget: true, leaseOwner: `proof-${stamp}` });
    assert(r1.status === "blocked", "an exhausted-budget media job is BLOCKED, not attempted");
    const blockedRow = (await db.select().from(mediaJobs).where(eq(mediaJobs.id, blockedJob.job.id)))[0];
    assert(blockedRow.status === "blocked", "the job row is 'blocked'");
    assert((blockedRow.attempts ?? 0) === 0, "no attempt was consumed (resumable after top-up)");
    assert((blockedRow.error ?? "").includes("budget"), "the block reason names the budget");

    // ── 2. WITHIN budget → job succeeds AND records spend to the shared external ledger ─────────────
    // Clear the over-cap spend so this call is allowed.
    await db.delete(externalProviderSpend).where(eq(externalProviderSpend.item, spendItem));
    const before = await getProviderSpend("openrouter", { db });
    const okJob = await createMediaJob({ kind: "image", prompt: `ok ${stamp}`, provider: "openrouter", estimatedCostCents: 8, budgetCapCents: 20, requestedBy: "Moiz", dedupeKey: `circuit-ok-${stamp}` }, { store, recordAudit: noAudit });
    if (!okJob.ok || !okJob.job) throw new Error("failed to create the ok test job");
    jobIds.push(okJob.job.id);
    const r2 = await dispatchOneMediaJob({ store, providers, recordAudit: noAudit, recordProviderRun: noRun, enforceBudget: true, leaseOwner: `proof2-${stamp}` });
    assert(r2.status === "succeeded", "a within-budget media job succeeds");
    const after = await getProviderSpend("openrouter", { db });
    assert(after > before, `media success RECORDED spend to the shared cap (${before.toFixed(2)} → ${after.toFixed(2)})`);

    console.log("\n✅ media budget circuit-breaker proof passed, exhausted pauses (blocks, resumable); success shares the text cap");
  } finally {
    if (jobIds.length) await db.delete(mediaJobs).where(inArray(mediaJobs.id, jobIds)).catch(() => {});
    // Scope cleanup to THIS run's rows only, the shared gate DB holds other proofs' ledger entries.
    await db.delete(externalProviderSpend).where(eq(externalProviderSpend.item, spendItem)).catch(() => {});
    await db.delete(externalProviderSpend).where(eq(externalProviderSpend.item, `media.image`)).catch(() => {});
    await closeDb().catch(() => {});
  }
  process.exit(0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
