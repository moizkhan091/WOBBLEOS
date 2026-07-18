/**
 * Real-DB GOLDEN MISSION for the UPSTREAM commercial spine (execution-order step 21 — release gate). Runs the
 * whole prospect journey end-to-end against live Postgres, with the LLM steps CANNED (injected deterministic
 * providers — no spend, no keys), so it runs in CI's db-proofs gate vs fresh pgvector:
 *
 *   company → QUALIFICATION (8-role A-E) → MEETING + DISCOVERY (typed facts, founder review) →
 *   OFFER + OFFER VALIDATION (11-dimension verdict) → COMMERCIAL JOURNEY assembles the lineage + stage.
 *
 * HARD RULE proven: the judgment (canned) NEVER performs the mutation — the deterministic services persist
 * every row (addCompany / runQualification / addMeeting / extract / addOffer / runOfferValidation). ISOLATED +
 * REPEATABLE + SAFE ON A POPULATED DB: unique ids per run, and everything created is deleted in cleanup.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-commercial-journey-db.ts
 */
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import {
  crmCompanies, meetings as meetingsTable, meetingIntelligence,
  offers as offersTable, offerValidationRuns, offerValidationDimensions,
  qualificationAssessments, qualificationRoles,
} from "@/db/schema";
import { addCompany } from "@/lib/crm";
import { addMeeting } from "@/lib/meetings";
import { addOffer } from "@/lib/offers";
import { runQualification } from "@/lib/qualification";
import { extractMeetingIntelligence } from "@/lib/meeting-intelligence";
import { runOfferValidation } from "@/lib/offer-validation";
import { getCommercialJourney } from "@/lib/commercial-journey";

const noAudit = async () => {};
// Canned providers — deterministic, no network. Each returns STRICT JSON the domain parsers accept.
const qualProvider = async () => ({ text: '{"score": 78, "rationale": "canned council rationale"}' });
const offerProvider = async () => ({ text: '{"score": 72, "rationale": "canned dimension rationale", "evidenceRefs": []}' });
const meetingProvider = async () => ({ text: JSON.stringify({ facts: [
  { kind: "pain", content: "misses ~30 calls/week", confidence: 90, sourceSnippet: "we miss maybe 30 calls" },
  { kind: "authority", content: "owner decides", confidence: 88, sourceSnippet: "I decide" },
  { kind: "next_step", content: "follow up Tuesday", confidence: 95, sourceSnippet: "talk again next Tuesday" },
] }) });

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = Math.abs((Date.now() ^ (process.pid << 8)) | 0).toString(36);
  const created = { companyId: "", meetingId: "", offerId: "", qualIds: [] as string[], factIds: [] as string[], offerRunIds: [] as string[] };

  try {
    // 1) org
    const company = await addCompany({ name: `zz_golden_${uniq}`, industry: "dental / med spa", companySize: "smb", website: "x.example", status: "qualified_prospect", notes: "3 clinics, missed calls, manual front desk.", createdBy: "golden-mission" }, { recordAudit: noAudit });
    created.companyId = company.id;

    // 2) QUALIFICATION (canned council) — deterministic policy + canned LLM → an A-E grade, persisted
    const qual = await runQualification(company.id, { runProvider: qualProvider, recordAudit: noAudit, actor: "golden-mission" });
    created.qualIds.push(qual.assessment.id);
    assert(qual.roles.length === 8, "qualification scored all 8 council roles");
    assert(["A", "B", "C", "D", "E"].includes(qual.assessment.grade), `qualification produced an A-E grade (${qual.assessment.grade})`);
    assert(qual.roles.some((r) => r.policyNote), "at least one role carried a deterministic policy signal");

    // 3) MEETING + DISCOVERY — extract typed facts (canned), each pending_review
    const meeting = await addMeeting({ title: `zz_golden_meeting_${uniq}`, meetingType: "ai_readiness_call", companyId: company.id, notes: "Owner: we miss maybe 30 calls a week. I decide. Let's talk again next Tuesday.", createdBy: "golden-mission" }, { recordAudit: noAudit });
    created.meetingId = meeting.id;
    const facts = await extractMeetingIntelligence(meeting.id, { runProvider: meetingProvider, recordAudit: noAudit, actor: "golden-mission" });
    created.factIds = facts.map((f) => f.id);
    assert(facts.length === 3, "discovery extracted the canned facts");
    assert(facts.every((f) => f.status === "pending_review"), "every discovery fact lands pending_review (nothing trusted until reviewed)");

    // 4) OFFER + OFFER VALIDATION (canned dimensions, no evidence) — an 11-dimension verdict, persisted
    const offer = await addOffer({ name: `zz_golden_offer_${uniq}`, promise: "Never miss a lead", audience: "SMBs", priceModel: "retainer", createdBy: "golden-mission" }, { recordAudit: noAudit });
    created.offerId = offer.id;
    const val = await runOfferValidation(offer.id, { runProvider: offerProvider, searchEvidence: null, recordAudit: noAudit, actor: "golden-mission" });
    created.offerRunIds.push(val.run.id);
    assert(val.dimensions.length === 11, "offer validation scored all 11 dimensions");
    assert(["go", "pivot", "kill"].includes(val.run.verdict), `offer validation produced a verdict (${val.run.verdict})`);

    // 5) COMMERCIAL JOURNEY — the lineage assembles everything by companyId + computes the furthest stage
    const journey = await getCommercialJourney(company.id);
    assert(journey.company.id === company.id, "journey resolves the org");
    assert(journey.qualification?.grade === qual.assessment.grade, "journey surfaces the qualification grade");
    assert(journey.meetings.length === 1 && journey.discoveryFactCount === 3, "journey surfaces the meeting + its 3 discovery facts");
    assert(journey.stage === "discovery", `journey stage is the furthest reached (discovery), got '${journey.stage}'`);

    console.log("\n✅ commercial-journey GOLDEN MISSION passed (org → qualification → discovery → offer validation → journey)");
  } finally {
    // cleanup — delete everything this run created (safe on a populated DB)
    try {
      if (created.factIds.length) await db.delete(meetingIntelligence).where(inArray(meetingIntelligence.id, created.factIds));
      if (created.qualIds.length) { await db.delete(qualificationRoles).where(inArray(qualificationRoles.assessmentId, created.qualIds)); await db.delete(qualificationAssessments).where(inArray(qualificationAssessments.id, created.qualIds)); }
      if (created.offerRunIds.length) { await db.delete(offerValidationDimensions).where(inArray(offerValidationDimensions.runId, created.offerRunIds)); await db.delete(offerValidationRuns).where(inArray(offerValidationRuns.id, created.offerRunIds)); }
      if (created.meetingId) await db.delete(meetingsTable).where(eq(meetingsTable.id, created.meetingId));
      if (created.offerId) await db.delete(offersTable).where(eq(offersTable.id, created.offerId));
      if (created.companyId) await db.delete(crmCompanies).where(eq(crmCompanies.id, created.companyId));
    } catch (e) { console.error("cleanup warning:", e instanceof Error ? e.message : e); }
    await closeDb();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
