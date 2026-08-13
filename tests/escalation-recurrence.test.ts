import { describe, expect, it } from "vitest";
import { noteRecurrence } from "@/lib/departments/escalation";

/**
 * A blocked QA board on the live system raised 52 identical open escalations in three days, one per
 * nightly run, because the dedup key included the task id and every run minted a fresh one. They filled
 * the founder's brief headline with the same sentence and buried everything else.
 */
const AT = new Date("2026-08-13T09:00:00.000Z");

describe("recording that a blockage happened again", () => {
  it("starts a count on the first recurrence", () => {
    const r = noteRecurrence([], AT);
    expect(r.count).toBe(1);
    expect(r.notes).toEqual(["recurred 1 time, most recently 2026-08-13T09:00:00.000Z"]);
  });

  it("counts up instead of adding another line", () => {
    // 52 nightly recurrences must not become 52 notes.
    let notes: string[] = [];
    for (let i = 0; i < 52; i++) notes = noteRecurrence(notes, AT).notes;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("recurred 52 times");
  });

  it("moves the timestamp to the latest occurrence", () => {
    const first = noteRecurrence([], new Date("2026-08-10T00:00:00.000Z")).notes;
    expect(noteRecurrence(first, AT).notes[0]).toContain("2026-08-13T09:00:00.000Z");
  });

  it("leaves the real recovery notes alone", () => {
    // Those describe what was attempted and are the reason a founder can judge the escalation.
    const existing = ["automatic retries exhausted, dead-lettered", "rerouted to research_intelligence"];
    const r = noteRecurrence(existing, AT);
    expect(r.notes.slice(0, 2)).toEqual(existing);
    expect(r.notes).toHaveLength(3);
  });

  it("says time, not times, exactly once", () => {
    expect(noteRecurrence([], AT).notes[0]).toContain("1 time,");
    expect(noteRecurrence(noteRecurrence([], AT).notes, AT).notes[0]).toContain("2 times,");
  });
});
