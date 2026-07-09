import { describe, expect, it } from "vitest";
import { buildMeetingRow, canTransitionMeeting, type MeetingRow } from "@/lib/domain/meeting";
import { addMeeting, transitionMeeting, listMeetings, type MeetingStore } from "@/lib/meetings";

const now = new Date("2026-07-09T12:00:00Z");

describe("meeting domain", () => {
  it("builds a scheduled meeting", () => {
    const m = buildMeetingRow({ title: "AI Readiness Call", meetingType: "ai_readiness_call", opportunityId: "opp_1", createdBy: "Moiz" }, { now, id: "mtg_1" });
    expect(m).toMatchObject({ id: "mtg_1", status: "scheduled", meetingType: "ai_readiness_call", followUpRequired: false });
  });
  it("enforces the status machine", () => {
    expect(canTransitionMeeting("scheduled", "completed")).toBe(true);
    expect(canTransitionMeeting("scheduled", "no_show")).toBe(true);
    expect(canTransitionMeeting("completed", "scheduled")).toBe(false);
  });
});

function makeStore() {
  const meetings = new Map<string, MeetingRow>();
  const store: MeetingStore = {
    insertMeeting: async (r) => void meetings.set(r.id, r),
    listMeetings: async (q) => [...meetings.values()].filter((m) => (!q.status || m.status === q.status) && (!q.opportunityId || m.opportunityId === q.opportunityId) && (q.includeArchived || !m.archivedAt)).slice(0, q.limit),
    getMeeting: async (id) => meetings.get(id) ?? null,
    updateMeeting: async (id, f) => { const m = meetings.get(id); if (m) meetings.set(id, { ...m, ...f }); },
  };
  return { store, meetings };
}

describe("meeting service", () => {
  it("books and completes a meeting with an outcome", async () => {
    const { store } = makeStore();
    const m = await addMeeting({ title: "Call", meetingType: "ai_readiness_call" }, { store, now, recordAudit: async () => {} });
    const done = await transitionMeeting(m.id, "completed", { outcome: "Interested, sending proposal", followUpRequired: true }, { store, now, recordAudit: async () => {} });
    expect(done?.status).toBe("completed");
    expect(done?.outcome).toContain("proposal");
    expect(done?.followUpRequired).toBe(true);
    expect(await listMeetings({ status: "completed" }, { store })).toHaveLength(1);
  });
});
