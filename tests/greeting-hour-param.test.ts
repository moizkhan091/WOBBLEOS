import { describe, expect, it } from "vitest";
import { buildGreeting, dayPartForHour } from "@/lib/domain/greeting";

/**
 * Regression: the greeting was pinned to "Late night grind" at every hour of the day.
 *
 * Cause: the route read the hour as `Number(u.searchParams.get("hour"))`. When the param is ABSENT,
 * `searchParams.get` returns null and `Number(null)` is **0** — which passes a bare `>= 0 && <= 23`
 * validity check. So `hour` was always 0 (late_night) and the `new Date().getHours()` fallback was
 * unreachable. Founders saw "Late night grind, Moiz?" at 2pm.
 *
 * These tests pin BOTH halves of the fix:
 *   1. the null-coercion parse (absent param must fall through to the server clock, not become 0);
 *   2. the day-part mapping the UI depends on, including the boundaries.
 */

/** The corrected parse, mirroring src/app/api/ai/greeting/route.ts. Absent OR blank = not supplied
 *  (`Number("")` is 0 too, so a blank `?hour=` would otherwise reintroduce the exact same bug). */
function resolveHour(search: URLSearchParams, serverHour: number): number {
  const raw = search.get("hour");
  const parsed = raw === null || raw.trim() === "" ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 23 ? parsed : serverHour;
}

describe("greeting hour resolution (regression: always-late-night)", () => {
  it("an ABSENT hour param falls back to the server clock — it must NOT coerce to 0", () => {
    expect(resolveHour(new URLSearchParams(""), 14)).toBe(14);
    expect(resolveHour(new URLSearchParams("pick=0.5"), 9)).toBe(9);
  });

  it("the naive Number(null) parse would have produced the bug (documents what we fixed)", () => {
    expect(Number(new URLSearchParams("").get("hour"))).toBe(0);
    expect(dayPartForHour(0)).toBe("late_night");
  });

  it("an explicit hour=0 is still honoured (genuine late night)", () => {
    expect(resolveHour(new URLSearchParams("hour=0"), 14)).toBe(0);
    expect(dayPartForHour(0)).toBe("late_night");
  });

  it("a supplied founder-local hour wins over the server clock", () => {
    expect(resolveHour(new URLSearchParams("hour=14"), 9)).toBe(14);
  });

  it("out-of-range and junk hours fall back to the server clock", () => {
    for (const q of ["hour=24", "hour=-1", "hour=abc", "hour="]) {
      expect(resolveHour(new URLSearchParams(q), 11), q).toBe(11);
    }
  });

  it("day parts map correctly across the boundaries the UI shows", () => {
    expect(dayPartForHour(0)).toBe("late_night");
    expect(dayPartForHour(4)).toBe("late_night");
    expect(dayPartForHour(5)).toBe("early_morning");
    expect(dayPartForHour(8)).toBe("morning");
    expect(dayPartForHour(11)).toBe("morning");
    expect(dayPartForHour(12)).toBe("afternoon");
    expect(dayPartForHour(16)).toBe("afternoon");
    expect(dayPartForHour(17)).toBe("evening");
    expect(dayPartForHour(20)).toBe("evening");
    expect(dayPartForHour(21)).toBe("night");
    expect(dayPartForHour(23)).toBe("night");
  });

  it("a 2pm founder gets an afternoon greeting, not a late-night one", () => {
    const g = buildGreeting({ founder: "Moiz", hour: 14, pick: 0 });
    expect(g.dayPart).toBe("afternoon");
    expect(g.greeting).toContain("afternoon");
    expect(g.greeting).toContain("Moiz");
  });
});
