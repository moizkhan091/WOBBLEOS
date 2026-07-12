/**
 * Real-DB proof for source DISCOVERY proposals (Phase 5, mandate B) on live Postgres.
 *
 * The Research Department proposes a NEW source; it must land `pending` (a proposal, never auto-active),
 * carry the structured evidence + rationale, be excluded from the scheduler's scout set until approved, and
 * then flow into the SAME granular approval path (approve → scouted). A proposal with no evidence is rejected.
 *
 * ISOLATED (unique client scope) + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-source-discovery-db.ts
 */
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { researchTargets } from "@/db/schema";
import { proposeResearchSource, listResearchTargets, defaultStore as intelligenceStore } from "@/lib/intelligence";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const clientId = `verify_disc_${uniq}`;
  const intel = { store: intelligenceStore(db), recordAudit: async () => {} };

  try {
    const target = await proposeResearchSource({
      targetType: "competitor_account", name: "Discovered Rival", handleOrUrl: "https://example.com/discovered", scope: "client", clientId, cadence: "weekly", addedBy: "research_intelligence_orchestrator",
      proposal: { reason: "This rival's pricing page changes weekly and drives our lost deals.", evidence: ["obs_123", "obs_456"], expectedValue: "Early warning on competitor pricing moves.", intendedDepartments: ["proposal", "content"], collectionMethod: "web_scrape", estimatedCostCents: 500, risk: "low", classification: "internal", confidence: 0.7 },
    }, intel);

    assert(target.approvalStatus === "pending", "a discovered source lands PENDING (a proposal, never auto-active)");
    const meta = target.metadata as { proposal?: { reason?: string; evidence?: string[]; intendedDepartments?: string[]; confidence?: number } };
    assert(!!meta.proposal && meta.proposal.evidence?.length === 2 && meta.proposal.reason?.length! > 0, "the proposal carries the structured evidence + rationale");
    assert((meta.proposal!.intendedDepartments ?? []).includes("proposal"), "the proposal records its intended downstream departments");

    // Excluded from the scheduler's scout set (approved-only) until the founder approves it.
    const scoutSet = await listResearchTargets({ scope: "client", clientId, approvalStatus: "approved", limit: 100 }, intel);
    assert(!scoutSet.some((t) => t.id === target.id), "the proposed source is NOT in the scheduler scout set (never scouted until approved)");

    // Granular approval activates exactly this one → it enters the scout set.
    await intel.store.updateResearchTarget!(target.id, { approvalStatus: "approved" });
    const scoutSet2 = await listResearchTargets({ scope: "client", clientId, approvalStatus: "approved", limit: 100 }, intel);
    assert(scoutSet2.some((t) => t.id === target.id), "after granular approval the source enters the scout set (now scouted on its cadence)");

    // A proposal with NO evidence is refused (a source is never proposed without grounding).
    let refused = false;
    try {
      await proposeResearchSource({ targetType: "website", name: "Ungrounded", handleOrUrl: "https://x.example", scope: "client", clientId, proposal: { reason: "hunch", evidence: [], expectedValue: "?", collectionMethod: "web_scrape" } as never }, intel);
    } catch { refused = true; }
    assert(refused, "a source proposal with NO evidence is refused (never proposed without grounding)");

    console.log("\nALL REAL-DB SOURCE DISCOVERY CHECKS PASSED ✅");
  } finally {
    await db.delete(researchTargets).where(eq(researchTargets.clientId, clientId)).catch(() => {});
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
