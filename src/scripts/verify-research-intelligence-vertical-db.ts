/**
 * Real-DB proof for the Research & Intelligence DEPARTMENT vertical (Phase 3 → Phase-5 foundation),
 * end-to-end against live Postgres: trigger → the department accepts a validated inbound handoff → the
 * registry-loaded team runs — the Intelligence Analyst turns real observations into insights, the Dreamer
 * proposes suggestions (each opening a REAL approval row) → the validated (approval-gated) intelligence is
 * routed to the Founder Command Centre as a real durable handoff.
 *
 * The analyst + dreamer run FOR REAL against Postgres (they read items and write insights/suggestions +
 * approvals); only the LLM call is canned (injected runProvider → no spend). ISOLATED + REPEATABLE: a
 * unique client id scopes every read/write, and a finally block deletes exactly what this run created, so
 * it is safe to run repeatedly against a populated database.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-research-intelligence-vertical-db.ts
 */
import { getDb, closeDb } from "@/db";
import { handoffs, intelligenceItems, intelligenceInsights, intelligenceSuggestions, approvals } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { seedDepartments } from "@/lib/departments/seed";
import { defaultStore as registryStore } from "@/lib/departments/registry";
import { defaultStore as handoffStore } from "@/lib/handoff";
import { defaultStore as intelligenceStore, recordIntelligenceItem } from "@/lib/intelligence";
import { runIntelligenceAnalyst } from "@/lib/intelligence/analyst";
import { runDreamer } from "@/lib/intelligence/dreamer";
import { runResearchIntelligenceDepartment } from "@/lib/departments/verticals/research-intelligence";

const cannedAnalyst = async () => ({
  text: JSON.stringify({ insights: [
    { insightType: "content_pattern", title: "Observation-led hooks win", summary: "Rivals open with a specific, verifiable observation.", recommendation: "Test observation-led hooks.", evidenceItemIds: [], appliesToModules: ["content_command"], impactScore: 72, confidence: 0.7 },
    { insightType: "competitor_pattern", title: "Carousel cadence", summary: "Rivals ship carousels ~3x/week.", recommendation: "Match the cadence.", evidenceItemIds: [], appliesToModules: ["social"], impactScore: 60, confidence: 0.6 },
  ] }),
  run: { id: "canned_analyst" },
});
const cannedDreamer = async () => ({
  text: JSON.stringify({ suggestions: [
    { suggestionType: "content_idea", title: "Observation-led carousel", rationale: "A rising pattern in the evidence.", proposedAction: "Ship one observation-led carousel this week.", evidenceInsightIds: [], evidenceItemIds: [], priority: "high", confidence: 0.7 },
  ] }),
  run: { id: "canned_dreamer" },
});

async function main() {
  const db = getDb();
  const now = new Date();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const clientId = `verify_ri_${uniq}`;
  const wf = `verify_ri_wf_${uniq}`;
  const intel = { store: intelligenceStore(db), recordAudit: async () => {} };
  let suggestionIds: string[] = [];

  try {
    await seedDepartments({ store: registryStore(db), recordAudit: async () => {} });

    // Seed 3 real observations for an ISOLATED client scope (so the analyst reads only this run's data).
    for (let i = 0; i < 3; i++) {
      await recordIntelligenceItem({ itemType: "competitor_post", scope: "client", clientId, title: `Rival post ${i}`, summary: `Observation ${i}: a specific hook drove engagement.`, approvalStatus: "approved" }, intel);
    }

    // Run the department — analyst + dreamer run FOR REAL against Postgres; only the LLM is canned.
    const res = await runResearchIntelligenceDepartment(
      { scope: "client", clientId, requestedBy: "Moiz", workflowId: wf },
      {
        handoffStore: handoffStore(db),
        analyze: (i, d) => runIntelligenceAnalyst(i, { ...d, runProvider: cannedAnalyst }),
        dream: (i, d) => runDreamer(i, { ...d, runProvider: cannedDreamer }),
        intelligenceDeps: intel,
        recordAudit: async () => {},
        now,
      },
    );

    assert(res.accepted, "the Research & Intelligence department accepted the inbound trigger");
    assert(res.product?.analysis.proposedInsights === 2, `the analyst produced 2 insights (got ${res.product?.analysis.proposedInsights})`);
    assert((res.product?.suggestions.proposed ?? 0) >= 1, "the dreamer proposed at least one suggestion");
    assert(res.routedTo.map((r) => r.department).includes("founder_command_centre"), "validated intelligence routed to the Founder Command Centre");

    suggestionIds = res.product?.suggestions.suggestionIds ?? [];

    // The insights + suggestions are REAL rows scoped to this client.
    const insightRows = await db.select().from(intelligenceInsights).where(eq(intelligenceInsights.clientId, clientId));
    assert(insightRows.length === 2, `2 intelligence_insights persisted for this client (got ${insightRows.length})`);
    assert(insightRows.every((r) => r.approvalStatus === "pending"), "insights land PENDING founder approval (nothing auto-trusted)");
    const suggestionRows = await db.select().from(intelligenceSuggestions).where(eq(intelligenceSuggestions.clientId, clientId));
    assert(suggestionRows.length >= 1, "intelligence_suggestions persisted for this client");

    // Each suggestion opened a REAL approval row (the governance gate).
    const approvalRows = suggestionIds.length ? await db.select().from(approvals).where(inArray(approvals.entityId, suggestionIds)) : [];
    assert(approvalRows.length === suggestionIds.length && approvalRows.every((a) => a.approvalType === "intelligence_suggestion"), "every suggestion opened an intelligence_suggestion approval row");

    // The validated intelligence was routed downstream as a real, durable handoff.
    const routed = (await db.select().from(handoffs).where(eq(handoffs.workflowId, wf))).filter((r) => r.department === "founder_command_centre");
    assert(routed.length === 1 && routed[0].deliveryState === "delivered", "one durable handoff delivered to the Founder Command Centre");
    assert((routed[0].envelope as { expectedOutputSchema: string }).expectedOutputSchema === "validated_intelligence", "the routed product schema is validated_intelligence");

    console.log("\nALL REAL-DB RESEARCH & INTELLIGENCE VERTICAL CHECKS PASSED ✅");
  } finally {
    if (suggestionIds.length) await db.delete(approvals).where(inArray(approvals.entityId, suggestionIds)).catch(() => {});
    await db.delete(intelligenceSuggestions).where(eq(intelligenceSuggestions.clientId, clientId)).catch(() => {});
    await db.delete(intelligenceInsights).where(eq(intelligenceInsights.clientId, clientId)).catch(() => {});
    await db.delete(intelligenceItems).where(eq(intelligenceItems.clientId, clientId)).catch(() => {});
    await db.delete(handoffs).where(eq(handoffs.workflowId, wf)).catch(() => {});
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
