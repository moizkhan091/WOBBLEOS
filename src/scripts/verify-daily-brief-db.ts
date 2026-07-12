/**
 * Real-DB proof that the Daily Founder Brief is DURABLE + wired to REAL signals on live Postgres (Doctrine 8).
 *
 * Seeds real source records (an open escalation + an at-risk project), assembles the brief through the REAL
 * wired providers reading the live stores, persists it, and proves:
 *   - a real open escalation surfaces as an evidence-linked, action-required signal (evidence points at the
 *     real escalation id + a drill-to route);
 *   - a real at-risk project surfaces as a delivery_risk signal;
 *   - the brief is PERSISTED to daily_briefs and read back by the founder-surface `getLatestDailyBrief`;
 *   - a department scope filters escalations to that department (real scope filtering);
 *   - a provider that THROWS degrades ONLY its category (honest coverage gap), never the whole brief;
 *   - every signal carries ≥1 evidence link (the anti-fabrication guarantee).
 *
 * Robust against a populated DB: MY signals are found by their evidence ref (not by count). ISOLATED cleanup.
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-daily-brief-db.ts
 */
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { dailyBriefs, escalations, projects } from "@/db/schema";
import { createEscalation } from "@/lib/departments/escalation";
import { addProject } from "@/lib/projects";
import { buildAndStoreDailyBrief, getLatestDailyBrief, createDbDailyBriefStore } from "@/lib/daily-brief";
import { deliveryRisksProvider } from "@/lib/daily-brief/providers";
import type { BriefSignalDraft } from "@/lib/domain/daily-brief";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const now = new Date();
  const stamp = Date.now();
  const dept = `dailybrief_ops_${stamp}`;
  const store = createDbDailyBriefStore(db);
  const briefIds: string[] = [];
  let escId = ""; let projId = "";

  try {
    // ---- seed real sources ----
    const { escalation } = await createEscalation({ departmentSlug: dept, reason: "other", severity: "high", requiredDecision: "Decide whether to re-scope the engagement", workflowId: `wf_${stamp}` }, { now });
    escId = escalation.id;
    const project = await addProject({ name: `At-risk delivery ${stamp}`, status: "at_risk" }, { now, recordAudit: async () => {} });
    projId = project.id;

    // ---- build the company brief through the REAL wired providers ----
    const brief = await buildAndStoreDailyBrief({ type: "company", cadence: "daily" }, { store, now });
    briefIds.push(brief.id);

    const findByEvidence = (ref: string) => brief.sections.flatMap((s) => s.items).map((i) => i.signal).find((sig) => sig.evidence.some((e) => e.ref === ref));
    const escSig = findByEvidence(escId);
    assert(!!escSig && escSig.category === "escalation", "the real open escalation surfaced as an escalation signal");
    assert(escSig!.actionRequired === true && escSig!.evidence[0].href?.includes(escId) === true, "the escalation signal is action-required with a drill-to-evidence link");
    const projSig = findByEvidence(projId);
    assert(!!projSig && projSig.category === "delivery_risk", "the real at-risk project surfaced as a delivery_risk signal");

    // anti-fabrication: EVERY signal in the brief carries at least one evidence link
    const allSignals = brief.sections.flatMap((s) => s.items).map((i) => i.signal);
    assert(allSignals.every((s) => s.evidence.length >= 1), "every signal carries ≥1 evidence link (no fabricated signal)");

    // ---- persisted + read back by the founder surface ----
    const latest = await getLatestDailyBrief({ type: "company", cadence: "daily" }, { store });
    assert(!!latest && latest.brief.id === brief.id, "the brief is persisted to daily_briefs and read back by getLatestDailyBrief");
    assert(latest!.totalSignals === brief.totalSignals && latest!.scopeType === "company", "the persisted projection matches the assembled brief");

    // ---- department scope filters escalations to that department ----
    const deptBrief = await buildAndStoreDailyBrief({ type: "department", id: dept, cadence: "daily" }, { store, now, providers: { escalations: (await import("@/lib/daily-brief/providers")).escalationsProvider } });
    briefIds.push(deptBrief.id);
    const deptEscs = deptBrief.sections.find((s) => s.category === "escalation");
    assert(!!deptEscs && deptEscs.count === 1 && deptEscs.items[0].signal.evidence[0].ref === escId, "a department scope filters escalations to exactly that department's one escalation");

    // ---- a throwing provider degrades ONLY its category ----
    const boom = async (): Promise<BriefSignalDraft[]> => { throw new Error("provider unavailable"); };
    const degraded = await buildAndStoreDailyBrief({ type: "company", cadence: "daily" }, { store, now, providers: { escalations: boom, deliveryRisks: deliveryRisksProvider } });
    briefIds.push(degraded.id);
    assert(degraded.degradedCategories.includes("escalation"), "a throwing provider degrades ONLY its category (honest coverage gap)");
    assert(!degraded.degradedCategories.includes("delivery_risk"), "the other wired category is unaffected by the failure");

    console.log("\nALL REAL-DB DAILY BRIEF CHECKS PASSED ✅");
  } finally {
    if (briefIds.length) await db.delete(dailyBriefs).where(inArray(dailyBriefs.id, briefIds));
    if (escId) await db.delete(escalations).where(eq(escalations.id, escId));
    if (projId) await db.delete(projects).where(eq(projects.id, projId));
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
