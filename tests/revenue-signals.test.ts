import { describe, expect, it } from "vitest";
import { BRIEF_URGENCY_FLOOR, revenueSignals, signalForClient, type RevenueRow } from "@/lib/domain/revenue-signals";

const row = (over: Partial<RevenueRow> & { companyId: string; name: string }): RevenueRow => ({
  health: { score: 70, band: "healthy", headline: "", daysSinceTouch: 1 },
  next: { kind: "contact", label: "Check in", because: "It has been quiet.", urgency: 60 },
  deal: null,
  qualification: null,
  ...over,
});

describe("what the brief says about one client", () => {
  it("says nothing about a client whose next move is to wait", () => {
    // "Wait for their reply" is the right answer most days and is not news.
    const quiet = row({ companyId: "c1", name: "Quiet Co", next: { kind: "none", label: "Wait for their reply", because: "The ball is with them.", urgency: 5 } });
    expect(signalForClient(quiet)).toBeNull();
  });

  it("says nothing when the urgency sits below the floor", () => {
    expect(signalForClient(row({ companyId: "c1", name: "X", next: { kind: "contact", label: "Check in", because: "b", urgency: BRIEF_URGENCY_FLOOR - 1 } }))).toBeNull();
  });

  it("names the client and the move, not just that something is wrong", () => {
    const s = signalForClient(row({ companyId: "c1", name: "Bright Smile Dental", next: { kind: "chase_proposal", label: "Chase the proposal", because: "Proposal is out and it has been 9 days.", urgency: 90 } }));
    expect(s?.title).toBe("Bright Smile Dental: Chase the proposal");
  });

  it("carries the reason, because a name with no why is a nag", () => {
    const s = signalForClient(row({ companyId: "c1", name: "X", next: { kind: "qualify", label: "Qualify them", because: "They filled the form but nobody has scored the fit.", urgency: 85 } }));
    expect(s?.summary).toContain("nobody has scored the fit");
  });

  it("puts the money on it when there is a deal", () => {
    const s = signalForClient(row({ companyId: "c1", name: "X", deal: { id: "d", name: "d", stage: "proposal", valueCents: 1_200_000, currency: "USD" }, next: { kind: "chase_proposal", label: "Chase", because: "b", urgency: 90 } }));
    expect(s?.summary).toContain("USD 12,000");
  });

  it("says how long it has been silent, and stays quiet when it has not been", () => {
    expect(signalForClient(row({ companyId: "c1", name: "X", health: { score: 60, band: "slipping", headline: "", daysSinceTouch: 21 }, next: { kind: "contact", label: "Check in", because: "b", urgency: 70 } }))?.summary).toContain("21 days ago");
    expect(signalForClient(row({ companyId: "c1", name: "X", health: { score: 60, band: "slipping", headline: "", daysSinceTouch: 1 }, next: { kind: "contact", label: "Check in", because: "b", urgency: 70 } }))?.summary).not.toContain("Last contact");
  });

  it("surfaces the council's weakest filter, which is the thing that kills the deal", () => {
    const s = signalForClient(row({ companyId: "c1", name: "X", qualification: { grade: "B", score: 71, weakest: { role: "will_implement_in_phases", score: 40 } }, next: { kind: "book_call", label: "Book the first call", because: "b", urgency: 78 } }));
    expect(s?.summary).toContain("will implement in phases at 40/100");
  });

  it("shouts loudest about a commitment the founder made and missed", () => {
    const s = signalForClient(row({ companyId: "c1", name: "X", next: { kind: "contact", label: "Do the overdue next action", because: "It was due and has not happened.", urgency: 100 } }));
    expect(s?.severity).toBe("high");
  });

  it("treats a client going cold as high even when nothing is formally overdue", () => {
    const s = signalForClient(row({ companyId: "c1", name: "X", health: { score: 35, band: "at_risk", headline: "", daysSinceTouch: 40 }, next: { kind: "contact", label: "Check in", because: "b", urgency: 60 } }));
    expect(s?.severity).toBe("high");
  });
});

describe("who the brief mentions", () => {
  const many = Array.from({ length: 12 }, (_, i) =>
    row({ companyId: `c${i}`, name: `Client ${i}`, next: { kind: "contact", label: "Check in", because: "b", urgency: 60 + i } }),
  );

  it("puts the most urgent first", () => {
    const { signals } = revenueSignals(many);
    expect(signals[0].companyId).toBe("c11");
  });

  it("caps the list so the brief stays readable", () => {
    expect(revenueSignals(many).signals).toHaveLength(8);
  });

  it("reports what it left out rather than pretending that was everyone", () => {
    // A cap that hides itself reads as "that is everybody who needs you", which is the one belief a
    // founder must not take from this list.
    expect(revenueSignals(many).omitted).toBe(4);
  });

  it("reports nothing omitted when everything fitted", () => {
    expect(revenueSignals(many.slice(0, 3)).omitted).toBe(0);
  });

  it("returns nothing at all on a quiet day", () => {
    const calm = [row({ companyId: "c1", name: "X", next: { kind: "none", label: "Wait", because: "b", urgency: 5 } })];
    expect(revenueSignals(calm)).toEqual({ signals: [], omitted: 0 });
  });

  it("survives an empty worklist", () => {
    expect(revenueSignals([])).toEqual({ signals: [], omitted: 0 });
  });
});
