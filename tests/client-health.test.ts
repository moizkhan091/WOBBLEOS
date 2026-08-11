import { describe, expect, it } from "vitest";
import { bandFor, daysBetween, scoreClientHealth, suggestNextAction, type ClientHealthInput, type NextActionInput } from "@/lib/domain/client-health";
import { contactCanSayYes } from "@/lib/domain/crm";

const NOW = new Date("2026-08-11T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const base: ClientHealthInput = {
  lastTouchAt: daysAgo(1),
  createdAt: daysAgo(30),
  stage: "discovery",
  stageSinceAt: daysAgo(2),
  dealStatus: "open",
  nextAction: "Send the audit scope",
  nextActionAt: new Date(NOW.getTime() + 86_400_000),
  qualificationLevel: null,
  meetingCount: 1,
  approvedFindingCount: 6,
  proposalCount: 0,
  proposalAwaitingReply: false,
  hasIntake: true,
  hasDecisionMaker: true,
  now: NOW,
};

const nextBase: NextActionInput = { ...base, hasQuestionSet: true, hasAudit: false, auditIsPaid: false };

describe("client health — silence is the signal that matters", () => {
  it("a client contacted yesterday reads healthy", () => {
    const h = scoreClientHealth(base);
    expect(h.band).toBe("healthy");
    expect(h.daysSinceTouch).toBe(1);
  });

  it("gets worse the longer nobody talks to them", () => {
    const week = scoreClientHealth({ ...base, lastTouchAt: daysAgo(8) }).score;
    const fortnight = scoreClientHealth({ ...base, lastTouchAt: daysAgo(15) }).score;
    const month = scoreClientHealth({ ...base, lastTouchAt: daysAgo(40) }).score;
    expect(week).toBeGreaterThan(fortnight);
    expect(fortnight).toBeGreaterThan(month);
  });

  it("says how long it has been, in the words a founder would use", () => {
    const h = scoreClientHealth({ ...base, lastTouchAt: daysAgo(40) });
    expect(h.headline).toContain("40 days");
  });

  it("does not punish a client who has only just arrived", () => {
    const h = scoreClientHealth({ ...base, lastTouchAt: null, createdAt: daysAgo(1) });
    expect(h.signals.some((s) => s.label === "never contacted")).toBe(false);
  });

  it("does punish one who arrived and was never called", () => {
    const h = scoreClientHealth({ ...base, lastTouchAt: null, createdAt: daysAgo(10) });
    expect(h.signals.some((s) => s.label === "never contacted")).toBe(true);
  });

  it("stops counting silence against a deal that is already closed", () => {
    const h = scoreClientHealth({ ...base, lastTouchAt: daysAgo(90), dealStatus: "won" });
    expect(h.score).toBeGreaterThanOrEqual(90);
  });
});

describe("client health — what else moves the number", () => {
  it("an overdue commitment is worse than never having made one", () => {
    const overdue = scoreClientHealth({ ...base, nextActionAt: daysAgo(3) }).score;
    const none = scoreClientHealth({ ...base, nextAction: null, nextActionAt: null }).score;
    expect(overdue).toBeLessThan(none);
  });

  it("a deal parked in one stage for three weeks is flagged", () => {
    const h = scoreClientHealth({ ...base, stageSinceAt: daysAgo(25) });
    expect(h.daysInStage).toBe(25);
    expect(h.signals.some((s) => s.label === "stage stalled")).toBe(true);
  });

  it("does not flag a stage the client owns, only the ones we owe", () => {
    const h = scoreClientHealth({ ...base, stage: "closed_won", stageSinceAt: daysAgo(60), dealStatus: "won" });
    expect(h.signals.some((s) => s.label.startsWith("stage"))).toBe(false);
  });

  it("counts a call that was never mined against us, not against them", () => {
    const h = scoreClientHealth({ ...base, meetingCount: 2, approvedFindingCount: 0 });
    expect(h.signals.some((s) => s.label === "call not mined")).toBe(true);
  });

  it("never leaves the 0-100 range however bad it gets", () => {
    const h = scoreClientHealth({
      ...base,
      lastTouchAt: daysAgo(200), stageSinceAt: daysAgo(200), nextActionAt: daysAgo(200),
      qualificationLevel: "poor_fit", meetingCount: 1, approvedFindingCount: 0,
      proposalAwaitingReply: true, hasIntake: false, hasDecisionMaker: false,
    });
    expect(h.score).toBeGreaterThanOrEqual(0);
    expect(h.score).toBeLessThanOrEqual(100);
    expect(h.band).toBe("cold");
  });

  it("every signal explains itself", () => {
    const h = scoreClientHealth({ ...base, lastTouchAt: daysAgo(40) });
    for (const s of h.signals) expect(s.detail.length, s.label).toBeGreaterThan(10);
  });
});

describe("client health — bands", () => {
  it("splits at the documented thresholds", () => {
    expect(bandFor(100)).toBe("healthy");
    expect(bandFor(75)).toBe("healthy");
    expect(bandFor(74)).toBe("slipping");
    expect(bandFor(55)).toBe("slipping");
    expect(bandFor(54)).toBe("at_risk");
    expect(bandFor(40)).toBe("at_risk");
    expect(bandFor(39)).toBe("cold");
  });

  it("daysBetween never goes negative on a future date", () => {
    expect(daysBetween(new Date(NOW.getTime() + 5 * 86_400_000), NOW)).toBe(0);
    expect(daysBetween(null, NOW)).toBeNull();
  });
});

describe("next action — the sales sequence, in order", () => {
  it("an overdue commitment beats everything else", () => {
    const n = suggestNextAction({ ...nextBase, nextActionAt: daysAgo(2) });
    expect(n.kind).toBe("contact");
    expect(n.urgency).toBe(100);
  });

  it("chases a proposal that has been out with no reply", () => {
    const n = suggestNextAction({ ...nextBase, nextActionAt: null, nextAction: null, proposalCount: 1, proposalAwaitingReply: true, lastTouchAt: daysAgo(6) });
    expect(n.kind).toBe("chase_proposal");
  });

  it("qualifies a form submission nobody has scored", () => {
    const n = suggestNextAction({ ...nextBase, nextActionAt: null, nextAction: null, hasIntake: true, qualificationLevel: null });
    expect(n.kind).toBe("qualify");
  });

  it("generates questions before asking for a call", () => {
    const n = suggestNextAction({ ...nextBase, nextActionAt: null, nextAction: null, qualificationLevel: "strong_fit", meetingCount: 0, hasQuestionSet: false });
    expect(n.kind).toBe("send_questions");
  });

  it("books the call once the questions exist", () => {
    const n = suggestNextAction({ ...nextBase, nextActionAt: null, nextAction: null, qualificationLevel: "strong_fit", meetingCount: 0, hasQuestionSet: true });
    expect(n.kind).toBe("book_call");
  });

  it("mines a call that produced nothing", () => {
    const n = suggestNextAction({ ...nextBase, nextActionAt: null, nextAction: null, qualificationLevel: "strong_fit", meetingCount: 1, approvedFindingCount: 0 });
    expect(n.kind).toBe("mine_call");
  });

  it("runs the audit once there are findings to build on", () => {
    const n = suggestNextAction({ ...nextBase, nextActionAt: null, nextAction: null, qualificationLevel: "strong_fit", approvedFindingCount: 4, hasAudit: false });
    expect(n.kind).toBe("run_audit");
  });

  it("builds the proposal once the audit is done", () => {
    const n = suggestNextAction({ ...nextBase, nextActionAt: null, nextAction: null, qualificationLevel: "strong_fit", hasAudit: true, proposalCount: 0 });
    expect(n.kind).toBe("build_proposal");
  });

  it("has nothing to say about a closed deal", () => {
    const n = suggestNextAction({ ...nextBase, dealStatus: "lost", nextActionAt: daysAgo(30) });
    expect(n.kind).toBe("none");
    expect(n.urgency).toBe(0);
  });

  it("always explains itself, so the ranking is arguable", () => {
    const n = suggestNextAction(nextBase);
    expect(n.because.length).toBeGreaterThan(10);
  });
});

describe("who counts as able to say yes", () => {
  it("counts the founder, the CEO, a partner, and an explicit decision maker", () => {
    for (const relationshipType of ["founder", "ceo", "partner", "decision_maker"]) {
      expect(contactCanSayYes({ relationshipType }), relationshipType).toBe(true);
    }
  });

  it("does not count someone who cannot sign", () => {
    for (const relationshipType of ["influencer", "client_team_member", "vendor", "other"]) {
      expect(contactCanSayYes({ relationshipType }), relationshipType).toBe(false);
    }
  });

  it("trusts what the website form recorded about their role", () => {
    // The form asks for their role and stores the answer; the enum alone missed founders.
    expect(contactCanSayYes({ relationshipType: "other", metadata: { isDecisionMaker: true } })).toBe(true);
    expect(contactCanSayYes({ relationshipType: "other", metadata: { isDecisionMaker: false } })).toBe(false);
    expect(contactCanSayYes({ relationshipType: null, metadata: null })).toBe(false);
  });
});

describe("the health score does not overstate how recent contact was", () => {
  it("says within the last day, not today, for contact 23 hours ago", () => {
    const h = scoreClientHealth({ ...base, lastTouchAt: new Date(NOW.getTime() - 23 * 3_600_000) });
    const recent = h.signals.find((s) => s.label === "recent contact");
    expect(recent?.detail).toContain("within the last day");
  });

  it("says a day ago at one day, in the singular", () => {
    const h = scoreClientHealth({ ...base, lastTouchAt: daysAgo(1) });
    expect(h.signals.find((s) => s.label === "recent contact")?.detail).toContain("a day ago");
  });
});
