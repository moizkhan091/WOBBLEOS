import { describe, expect, it } from "vitest";
import {
  addCadence,
  decideRetainer,
  describeRetainer,
  periodKey,
  retainerScheduleSchema,
  type RetainerSchedule,
} from "@/lib/domain/retainers";

const NOW = new Date("2026-08-11T09:00:00.000Z");
const schedule = (over: Partial<RetainerSchedule> = {}): RetainerSchedule =>
  retainerScheduleSchema.parse({ cadence: "monthly", nextIssueAt: "2026-08-01T09:00:00.000Z", ...over });

describe("the period an invoice covers", () => {
  it("is the month, the quarter, or the year", () => {
    const d = new Date("2026-08-11T00:00:00.000Z");
    expect(periodKey("monthly", d)).toBe("2026-08");
    expect(periodKey("quarterly", d)).toBe("2026-Q3");
    expect(periodKey("annual", d)).toBe("2026");
  });

  it("puts the quarter boundaries where a finance person would", () => {
    expect(periodKey("quarterly", new Date("2026-03-31T23:00:00.000Z"))).toBe("2026-Q1");
    expect(periodKey("quarterly", new Date("2026-04-01T00:00:00.000Z"))).toBe("2026-Q2");
  });
});

describe("moving a schedule forward", () => {
  it("keeps the same day of the month", () => {
    expect(addCadence(new Date("2026-08-15T09:00:00.000Z"), "monthly").toISOString()).toBe("2026-09-15T09:00:00.000Z");
  });

  it("clamps for a short month rather than skipping it", () => {
    expect(addCadence(new Date("2026-01-31T09:00:00.000Z"), "monthly").toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("does not let a 31st retainer drift to the 28th forever", () => {
    // February clamps, but the anchor day restores it in March.
    const feb = addCadence(new Date("2026-01-31T09:00:00.000Z"), "monthly", 31);
    const mar = addCadence(feb, "monthly", 31);
    expect(mar.toISOString().slice(0, 10)).toBe("2026-03-31");
  });

  it("steps a quarter and a year correctly", () => {
    expect(addCadence(new Date("2026-08-15T09:00:00.000Z"), "quarterly").toISOString().slice(0, 10)).toBe("2026-11-15");
    expect(addCadence(new Date("2026-08-15T09:00:00.000Z"), "annual").toISOString().slice(0, 10)).toBe("2027-08-15");
  });
});

describe("deciding whether to raise the next invoice", () => {
  it("raises one that is due and has not been billed", () => {
    const d = decideRetainer(schedule(), NOW);
    expect(d.issue).toBe(true);
    expect(d.periodKey).toBe("2026-08");
    expect(d.nextIssueAt.toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("REFUSES to bill a period that has already been invoiced", () => {
    const d = decideRetainer(schedule({ issued: ["2026-08"] }), NOW);
    expect(d.issue).toBe(false);
    expect(d.because).toContain("bill this client twice");
  });

  it("does not raise one before it is due", () => {
    const d = decideRetainer(schedule({ nextIssueAt: "2026-09-01T09:00:00.000Z" }), NOW);
    expect(d.issue).toBe(false);
    expect(d.because).toContain("Not due until 2026-09-01");
  });

  it("does not raise a paused retainer, and says it is paused", () => {
    expect(decideRetainer(schedule({ active: false }), NOW).because).toBe("The retainer is paused.");
  });

  it("stops after the end date", () => {
    const d = decideRetainer(schedule({ endsAt: "2026-07-01T00:00:00.000Z" }), NOW);
    expect(d.issue).toBe(false);
    expect(d.because).toContain("ended on 2026-07-01");
  });

  it("puts the due date the agreed number of days after issue", () => {
    const d = decideRetainer(schedule({ dueInDays: 30 }), NOW);
    expect(d.dueAt.toISOString().slice(0, 10)).toBe("2026-08-31");
  });

  it("always says why, so a founder asking why it did not bill gets an answer", () => {
    for (const s of [schedule(), schedule({ active: false }), schedule({ issued: ["2026-08"] }), schedule({ nextIssueAt: "2027-01-01T00:00:00.000Z" })]) {
      expect(decideRetainer(s, NOW).because.length).toBeGreaterThan(10);
    }
  });
});

describe("the schedule shape", () => {
  it("defaults to active with a fortnight to pay", () => {
    const s = schedule();
    expect(s.active).toBe(true);
    expect(s.dueInDays).toBe(14);
    expect(s.issued).toEqual([]);
  });

  it("rejects a cadence we do not actually support", () => {
    expect(retainerScheduleSchema.safeParse({ cadence: "weekly", nextIssueAt: "2026-08-01T09:00:00.000Z" }).success).toBe(false);
  });

  it("rejects a next-issue date that is not a real timestamp", () => {
    expect(retainerScheduleSchema.safeParse({ cadence: "monthly", nextIssueAt: "next tuesday" }).success).toBe(false);
  });
});

describe("describing a retainer to a founder", () => {
  it("says the money, the cadence, the next date, and that it is a draft", () => {
    const out = describeRetainer(schedule({ issued: ["2026-06", "2026-07"] }), 250_000, "USD");
    expect(out).toContain("USD 2,500");
    expect(out).toContain("monthly");
    expect(out).toContain("2 already raised");
    expect(out).toContain("draft until a founder sends it");
  });

  it("says so plainly when it is paused", () => {
    expect(describeRetainer(schedule({ active: false }), 250_000, "USD")).toContain("Paused");
  });
});
