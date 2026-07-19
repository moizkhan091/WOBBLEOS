/**
 * Real-DB proof that lead magnets persist + gate on Postgres. Canned generator (no LLM spend); the store +
 * schema + review gate run for real. ISOLATED + finally-cleanup.
 *   DATABASE_URL=... npx tsx src/scripts/verify-lead-magnets-db.ts
 */
import { inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { leadMagnets } from "@/db/schema";
import { generateLeadMagnet, reviewLeadMagnet, listLeadMagnets, type MagnetProvider } from "@/lib/lead-magnets";

const CANNED = JSON.stringify({
  title: "VERIFY Missed-Call Text-Back Pack",
  magnetType: "workflow_pack",
  audience: "clinic owners",
  promise: "text back every missed call in 60s",
  sections: [
    { heading: "What it does", body: "recovers lost bookings" },
    { heading: "Nodes", body: "Twilio webhook → n8n → SMS → CRM log" },
  ],
  deliverable: "n8n: Twilio Webhook → IF landline skip → Twilio SMS → Airtable log; failure route notifies owner",
});
const cannedProvider: MagnetProvider = async () => ({ text: CANNED });

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const ids: string[] = [];
  const deps = { runProvider: cannedProvider, recordAudit: async () => {} };
  try {
    const m = await generateLeadMagnet({ topicTitle: "Missed-call recovery", teachingJob: "text-back flow", pillar: "buildable_automations", requestedBy: "verify" }, deps);
    assert(m != null, "generated a magnet");
    ids.push(m!.id);
    assert(m!.status === "pending_review", "landed pending_review");
    assert(m!.magnetType === "workflow_pack" && Boolean(m!.deliverable), "carries type + a usable deliverable");

    const back = (await listLeadMagnets({ status: "pending_review" }, deps)).find((x) => x.id === m!.id);
    assert(Boolean(back), "reads back from Postgres");
    assert(Array.isArray(back!.sections) && back!.sections.length >= 2, "sections (jsonb) round-tripped");

    const approved = await reviewLeadMagnet({ magnetId: m!.id, decision: "approved", reviewedBy: "moiz" }, deps);
    assert(approved?.status === "approved", "founder approval persisted");
    const again = await reviewLeadMagnet({ magnetId: m!.id, decision: "rejected", reviewedBy: "moiz" }, deps);
    assert(again?.status === "approved", "review idempotent (re-decide is a no-op)");
    const retired = await reviewLeadMagnet({ magnetId: m!.id, decision: "retired", reviewedBy: "moiz" }, deps);
    assert(retired?.status === "retired", "an approved magnet can retire");

    console.log("\nALL REAL-DB LEAD MAGNET CHECKS PASSED ✅");
  } finally {
    if (ids.length) await db.delete(leadMagnets).where(inArray(leadMagnets.id, ids));
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
