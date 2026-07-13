/**
 * Real-DB proof (Postgres) that the Intelligence Cockpit AGGREGATES real operational systems — never fabricated:
 *   a baseline cockpit → seed one real media job (queued) + one active autonomy grant + one open escalation →
 *   the cockpit's counts increase by EXACTLY those (media.total +1 & byStatus.queued +1, autonomy.activeGrants +1,
 *   attention.openEscalations +1). Revenue is reported honestly (a tier or null). Injected-reader shape is also checked.
 *
 * ISOLATED + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-cockpit-db.ts
 */
import { inArray, eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { mediaJobs, autonomyPolicies, escalations as escalationsTable, auditLogs } from "@/db/schema";
import { getIntelligenceCockpit } from "@/lib/cockpit";
import { createMediaJob } from "@/lib/media";
import { createAutonomyPolicy } from "@/lib/autonomy";
import { defaultStore as escalationStore } from "@/lib/departments/escalation";
import { buildEscalationRow } from "@/lib/domain/escalation";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const mediaIds: string[] = [];
  const policyIds: string[] = [];
  const escIds: string[] = [];

  try {
    // Injected-reader shape check (pure) — the aggregation math is exact + fabrication-free.
    const nowD = new Date("2026-07-14T00:00:00.000Z");
    const pure = await getIntelligenceCockpit({
      orgMetrics: async () => ({ revenueCents: 150_000, revenueEvidenceTier: "verified-financial", revenuePeriodMonths: 1 }),
      listProposals: async () => [{ status: "proposed" }, { status: "active" }, { status: "rejected" }],
      listActiveGrants: async () => [{ effectiveFrom: new Date(nowD.getTime() - 1000), expiresAt: null }, { effectiveFrom: new Date(nowD.getTime() - 1000), expiresAt: new Date(nowD.getTime() - 1) }], // 2 active, 1 expired
      countOpenEscalations: async () => 1,
      countPendingApprovals: async () => 3,
      listMediaJobs: async () => [{ status: "queued" }, { status: "blocked" }, { status: "queued" }],
      now: () => nowD,
    });
    assert(pure.revenue.revenueCents === 150_000 && pure.optimizer.proposed === 1 && pure.optimizer.active === 1 && pure.optimizer.total === 3, "aggregation shape: revenue + optimizer proposed/active/total are exact");
    assert(pure.autonomy.activeGrants === 1 && pure.attention.openEscalations === 1 && pure.attention.pendingApprovals === 3 && pure.attention.total === 4, "aggregation shape: only IN-EFFECT grants counted (1 of 2; the expired one excluded) + exact escalation/approval counts");
    assert(pure.media.total === 3 && pure.media.byStatus.queued === 2 && pure.media.byStatus.blocked === 1, "aggregation shape: media byStatus counts are exact (never fabricated)");

    // ---- REAL DB: baseline → seed → delta ----
    const before = await getIntelligenceCockpit();

    const mj = await createMediaJob({ kind: "image", prompt: `cockpit ${uniq}`, provider: "deterministic", estimatedCostCents: 0, budgetCapCents: 100, requestedBy: "Moiz" }, {});
    mediaIds.push(mj.job!.id);
    const pol = await createAutonomyPolicy({ category: "notification.internal", grantedLevel: "autonomous", approvedBy: "Moiz", clientId: `cockpit_${uniq}`, maxRiskLevel: "low" }, { db });
    policyIds.push(pol.id);
    const es = escalationStore();
    const escRow = buildEscalationRow({ departmentSlug: `cockpit_${uniq}`, workflowId: `wf_${uniq}`, reason: "other", severity: "low", requiredDecision: "dismiss" }, { id: `esc_${uniq}`, now: new Date() });
    await es.insert(escRow);
    escIds.push(escRow.id);

    const after = await getIntelligenceCockpit();
    assert(after.media.total === before.media.total + 1 && (after.media.byStatus.queued ?? 0) === (before.media.byStatus.queued ?? 0) + 1, "REAL: seeding a queued media job increments cockpit media.total + byStatus.queued by exactly 1");
    assert(after.autonomy.activeGrants === before.autonomy.activeGrants + 1, "REAL: seeding an active grant increments cockpit autonomy.activeGrants by exactly 1");
    assert(after.attention.openEscalations === before.attention.openEscalations + 1, "REAL: seeding an open escalation increments cockpit attention.openEscalations by exactly 1");
    assert(after.revenue.evidenceTier === null || after.revenue.evidenceTier === "verified-financial", "revenue is reported honestly (a real verified-financial actual or null — never fabricated)");

    console.log("\n✅ cockpit DB proof passed");
  } finally {
    if (mediaIds.length) { await db.delete(auditLogs).where(inArray(auditLogs.entityId, mediaIds)); await db.delete(mediaJobs).where(inArray(mediaJobs.id, mediaIds)); }
    if (policyIds.length) { await db.delete(auditLogs).where(inArray(auditLogs.entityId, policyIds)); await db.delete(autonomyPolicies).where(inArray(autonomyPolicies.id, policyIds)); }
    if (escIds.length) { await db.delete(escalationsTable).where(inArray(escalationsTable.id, escIds)); }
    await closeDb();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
