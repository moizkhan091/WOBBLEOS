import { describe, expect, it } from "vitest";
import { computeSourceFreshness } from "@/lib/domain/intelligence";

/** Source freshness/staleness (Phase 5 mandate E) — a scheduled source overdue on its cadence is stale. */
describe("computeSourceFreshness", () => {
  const now = new Date("2026-07-13T00:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60_000);

  it("a daily source checked 12h ago is FRESH", () => {
    const f = computeSourceFreshness({ cadence: "daily", lastCheckedAt: new Date(now.getTime() - 12 * 60 * 60_000), nextRunAt: new Date(now.getTime() + 12 * 60 * 60_000) }, now);
    expect(f.isStale).toBe(false);
    expect(f.overdueBy).toBe(0);
  });

  it("a daily source not checked in 3 days is STALE (age > 2x interval)", () => {
    const f = computeSourceFreshness({ cadence: "daily", lastCheckedAt: daysAgo(3), nextRunAt: daysAgo(2) }, now);
    expect(f.isStale).toBe(true);
    expect(f.overdueBy).toBeGreaterThan(0); // overdue vs its nextRunAt
  });

  it("a scheduled source NEVER checked is STALE", () => {
    const f = computeSourceFreshness({ cadence: "weekly", lastCheckedAt: null, nextRunAt: null }, now);
    expect(f.isStale).toBe(true);
    expect(f.ageMs).toBeNull();
  });

  it("a manual / on_trigger source is NEVER stale (not scheduled)", () => {
    expect(computeSourceFreshness({ cadence: "manual", lastCheckedAt: daysAgo(100), nextRunAt: null }, now).isStale).toBe(false);
    expect(computeSourceFreshness({ cadence: "on_trigger", lastCheckedAt: null, nextRunAt: null }, now).isStale).toBe(false);
  });

  it("a weekly source checked 5 days ago is FRESH (within interval)", () => {
    const f = computeSourceFreshness({ cadence: "weekly", lastCheckedAt: daysAgo(5), nextRunAt: new Date(now.getTime() + 2 * 24 * 60 * 60_000) }, now);
    expect(f.isStale).toBe(false);
  });
});
