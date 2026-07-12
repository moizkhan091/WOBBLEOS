/**
 * Real-DB proof for source value/ROI (Phase 5, mandate G) on live Postgres: a source's value is measured from
 * the REAL findings (insights) that cite its collected items and how the founder judged them.
 *
 * Seeds a source's items + insights (approved / rejected / pending) that cite them, then `getSourceValue`
 * reads them back from Postgres and computes the value. ISOLATED (unique client scope) + finally-cleanup.
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-source-value-db.ts
 */
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { intelligenceInsights, intelligenceItems } from "@/db/schema";
import { createIntelligenceInsight, getSourceValue, recordIntelligenceItem, defaultStore as intelligenceStore } from "@/lib/intelligence";
import type { IntelligenceApprovalStatus } from "@/lib/domain/intelligence";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const clientId = `verify_sv_${uniq}`;
  const targetId = `tgt_sv_${uniq}`;
  const intel = { store: intelligenceStore(db), recordAudit: async () => {} };
  const insightIds: string[] = [];

  try {
    // Two items collected FROM this source (targetId set) + one from a different source.
    const { item: i1 } = await recordIntelligenceItem({ itemType: "competitor_post", scope: "client", clientId, title: "Item 1", summary: "obs 1", approvalStatus: "approved", targetId }, intel);
    const { item: i2 } = await recordIntelligenceItem({ itemType: "competitor_post", scope: "client", clientId, title: "Item 2", summary: "obs 2", approvalStatus: "approved", targetId }, intel);
    const { item: iOther } = await recordIntelligenceItem({ itemType: "competitor_post", scope: "client", clientId, title: "Other", summary: "obs x", approvalStatus: "approved", targetId: `${targetId}_other` }, intel);

    const mk = async (evidence: string[], impact: number, status: IntelligenceApprovalStatus) => {
      const { insight } = await createIntelligenceInsight({ insightType: "content_pattern", scope: "client", clientId, title: `finding ${insightIds.length}`, summary: "s", recommendation: "r", evidenceItemIds: evidence, appliesToModules: ["content_command"], impactScore: impact, confidence: 0.7, approvalStatus: status, createdByAgent: "intelligence_analyst" }, intel);
      insightIds.push(insight.id);
    };
    await mk([i1.id], 80, "approved");
    await mk([i2.id], 60, "approved");
    await mk([i1.id, i2.id], 40, "rejected");
    await mk([i1.id], 50, "pending");
    await mk([iOther.id], 90, "approved"); // cites a DIFFERENT source — must not count for this target

    const v = await getSourceValue(targetId, intel);
    assert(v.itemsCollected === 2, `2 items attributed to this source (got ${v.itemsCollected})`);
    assert(v.findingsProduced === 4, `4 findings cite this source's items (got ${v.findingsProduced})`);
    assert(v.findingsApproved === 2 && v.findingsRejected === 1 && v.findingsPending === 1, "approved/rejected/pending finding counts reflect the real founder judgments");
    assert(v.approvalRate === 0.67, `approval rate = approved/(approved+rejected) (got ${v.approvalRate})`);
    assert(v.falsePositiveRate === 0.25, `false-positive rate = rejected/produced (got ${v.falsePositiveRate})`);
    assert(v.valueScore === 47, `value score is the approval-weighted approved impact (got ${v.valueScore})`);

    console.log("\nALL REAL-DB SOURCE VALUE CHECKS PASSED ✅");
  } finally {
    if (insightIds.length) await db.delete(intelligenceInsights).where(inArray(intelligenceInsights.id, insightIds)).catch(() => {});
    await db.delete(intelligenceInsights).where(eq(intelligenceInsights.clientId, clientId)).catch(() => {});
    await db.delete(intelligenceItems).where(eq(intelligenceItems.clientId, clientId)).catch(() => {});
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
