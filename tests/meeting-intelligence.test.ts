import { describe, expect, it } from "vitest";
import { parseExtraction, buildMeetingIntelligenceRow, MEETING_INTELLIGENCE_KINDS } from "@/lib/domain/meeting-intelligence";
import { extractMeetingIntelligence, reviewMeetingFact, listMeetingFacts, type MeetingIntelligenceStore, type MeetingSubject } from "@/lib/meeting-intelligence";
import type { MeetingIntelligenceRow } from "@/lib/domain/meeting-intelligence";

const MEETING: MeetingSubject = {
  id: "mtg_1", companyId: "co_1", title: "AI Readiness Call — Nova Dental",
  transcript: "Owner: we miss maybe 30 calls a week and lose bookings. Budget is fine if it pays back. I decide. We use paper diaries. My worry is it sounds robotic. Let's talk again next Tuesday.",
};

function memStore(): MeetingIntelligenceStore & { rows: MeetingIntelligenceRow[] } {
  const rows: MeetingIntelligenceRow[] = [];
  return {
    rows,
    async getMeeting(id) { return id === MEETING.id ? MEETING : null; },
    async insertFacts(r) { rows.push(...r); },
    async listFacts(meetingId, status) { return rows.filter((x) => x.meetingId === meetingId && (!status || x.status === status)); },
    async getFact(id) { return rows.find((x) => x.id === id) ?? null; },
    async updateFact(id, fields) { const i = rows.findIndex((x) => x.id === id); if (i >= 0) rows[i] = { ...rows[i], ...fields }; },
  };
}

describe("Meeting Intelligence — domain", () => {
  it("parseExtraction validates + rounds confidence, drops malformed facts (never invents)", () => {
    const good = parseExtraction('{"facts":[{"kind":"pain","content":"misses 30 calls/wk","confidence":90.4,"sourceSnippet":"we miss maybe 30 calls"}]}');
    expect(good).toHaveLength(1);
    expect(good[0].confidence).toBe(90);
    // a malformed fact (bad kind) is dropped, the valid one kept
    const mixed = parseExtraction('{"facts":[{"kind":"pain","content":"x","confidence":50,"sourceSnippet":"y"},{"kind":"nonsense","content":"z","confidence":10,"sourceSnippet":"q"}]}');
    expect(mixed).toHaveLength(1);
    expect(() => parseExtraction("not json")).toThrow(/unparseable/);
  });

  it("every kind is a known discovery kind", () => {
    expect(MEETING_INTELLIGENCE_KINDS).toContain("pain");
    expect(MEETING_INTELLIGENCE_KINDS).toContain("next_step");
  });

  it("buildMeetingIntelligenceRow lands pending_review, clamps confidence", () => {
    const row = buildMeetingIntelligenceRow({ meetingId: "m", kind: "budget", content: "has budget", confidence: 130, sourceSnippet: "budget is fine" });
    expect(row.status).toBe("pending_review");
    expect(row.confidence).toBe(100);
    expect(row.reviewedBy).toBeNull();
  });
});

describe("Meeting Intelligence — service", () => {
  const provider = async () => ({ text: JSON.stringify({ facts: [
    { kind: "pain", content: "Misses ~30 calls/week, loses bookings", confidence: 90, sourceSnippet: "we miss maybe 30 calls a week" },
    { kind: "authority", content: "Owner is the decision-maker", confidence: 85, sourceSnippet: "I decide" },
    { kind: "objection", content: "Worried it sounds robotic", confidence: 80, sourceSnippet: "sounds robotic" },
    { kind: "next_step", content: "Follow-up next Tuesday", confidence: 95, sourceSnippet: "talk again next Tuesday" },
  ] }) });

  it("extracts typed facts, all pending_review", async () => {
    const store = memStore();
    const facts = await extractMeetingIntelligence(MEETING.id, { store, runProvider: provider, actor: "analyst", recordAudit: async () => {} });
    expect(facts).toHaveLength(4);
    expect(facts.every((f) => f.status === "pending_review")).toBe(true);
    expect(facts.map((f) => f.kind)).toContain("authority");
  });

  it("a founder review approves/rejects a fact (idempotent)", async () => {
    const store = memStore();
    const facts = await extractMeetingIntelligence(MEETING.id, { store, runProvider: provider, recordAudit: async () => {} });
    const approved = await reviewMeetingFact({ factId: facts[0].id, decision: "approved", reviewedBy: "Moiz" }, { store, recordAudit: async () => {} });
    expect(approved?.status).toBe("approved");
    expect(approved?.reviewedBy).toBe("Moiz");
    // idempotent — a second review does not flip it
    const again = await reviewMeetingFact({ factId: facts[0].id, decision: "rejected", reviewedBy: "Moiz" }, { store, recordAudit: async () => {} });
    expect(again?.status).toBe("approved");
    const pending = await listMeetingFacts(MEETING.id, "pending_review", { store });
    expect(pending).toHaveLength(3);
  });

  it("throws (never fabricates) when the meeting has no transcript", async () => {
    const empty = memStore();
    const store: MeetingIntelligenceStore = { ...empty, async getMeeting() { return { id: "m", companyId: null, title: "t", transcript: "" }; } };
    await expect(extractMeetingIntelligence("m", { store, runProvider: provider, recordAudit: async () => {} })).rejects.toThrow(/no transcript/);
  });

  it("throws when the meeting does not exist", async () => {
    await expect(extractMeetingIntelligence("nope", { store: memStore(), runProvider: provider, recordAudit: async () => {} })).rejects.toThrow(/not found/);
  });
});
