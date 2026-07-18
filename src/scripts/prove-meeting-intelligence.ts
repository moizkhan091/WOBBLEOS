/**
 * Discovery & Meeting Intelligence (execution-order step 8) — ingest a real discovery-call transcript into a
 * meeting, extract typed discovery facts (confidence + verbatim snippet, pending_review), then a founder
 * approves one. Proves the ingest → extract → review chain.
 *
 * Run:  DATABASE_URL=… OPENROUTER_API_KEY=… npx tsx src/scripts/prove-meeting-intelligence.ts
 */
import { closeDb } from "@/db";
import { addMeeting, listMeetings } from "@/lib/meetings";
import { listCompanies } from "@/lib/crm";
import { extractMeetingIntelligence, reviewMeetingFact, listMeetingFacts } from "@/lib/meeting-intelligence";

const TRANSCRIPT = `Owner: Honestly we miss maybe 30 calls a week — front desk is slammed and people just book with whoever answers first.
WOBBLE: What does a missed call cost you?
Owner: A new patient is worth a few hundred dollars over the year, so it adds up fast. Budget isn't the problem if it actually pays back.
Owner: I make the decision here, it's my three clinics.
Owner: Right now it's paper diaries and WhatsApp — nothing connected.
Owner: My only worry is it sounding robotic to patients, that would hurt us.
WOBBLE: Understood. We'd start with the missed-call recovery, prove it, then expand.
Owner: Good. Let's talk again next Tuesday and you show me exactly how it answers.`;

async function main() {
  const TITLE = "AI Readiness Call — Nova Dental (UAT)";
  const company = (await listCompanies({ includeArchived: true, limit: 500 })).find((c) => /Nova Dental/i.test(c.name));
  let meeting = (await listMeetings({ limit: 500 })).find((m) => m.title === TITLE);
  if (!meeting) {
    meeting = await addMeeting({ title: TITLE, meetingType: "ai_readiness_call", companyId: company?.id, notes: TRANSCRIPT, createdBy: "Moiz" });
    console.log(`  created meeting ${meeting.id}${company ? ` (company ${company.id})` : ""}`);
  } else {
    console.log(`  reusing meeting ${meeting.id}`);
  }

  const facts = await extractMeetingIntelligence(meeting.id, { actor: "meeting_intelligence_analyst" });
  console.log(`  extracted ${facts.length} discovery facts (all pending_review):`);
  for (const f of facts) {
    console.log(`    [${String(f.confidence).padStart(3)}] ${f.kind.padEnd(14)} ${f.content.slice(0, 55)}  «${f.sourceSnippet.slice(0, 40)}»`);
  }
  if (!facts.length) throw new Error("no facts extracted");

  // Founder reviews the highest-confidence fact.
  const top = [...facts].sort((a, b) => b.confidence - a.confidence)[0];
  const reviewed = await reviewMeetingFact({ factId: top.id, decision: "approved", reviewedBy: "Moiz" }, {});
  console.log(`  founder APPROVED: [${reviewed?.kind}] ${reviewed?.content.slice(0, 50)} (status=${reviewed?.status}, by=${reviewed?.reviewedBy})`);

  const pending = await listMeetingFacts(meeting.id, "pending_review");
  const approved = await listMeetingFacts(meeting.id, "approved");
  console.log(`  persisted: ${approved.length} approved, ${pending.length} pending review`);
  console.log("  DONE: Discovery & Meeting Intelligence proven live (transcript → typed facts w/ confidence+snippet → founder review).");
}

main().then(() => closeDb()).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
