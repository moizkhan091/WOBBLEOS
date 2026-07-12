import { describe, expect, it } from "vitest";
import { detectSourceChanges } from "@/lib/domain/intelligence";

/** Change detection + snapshots (Phase 5 mandate D) — a change is a content diff between consecutive snapshots. */
describe("detectSourceChanges", () => {
  const at = (iso: string) => new Date(iso);

  it("detects a change between two consecutive DIFFERING snapshots, evidence-backed by before/after ids", () => {
    const changes = detectSourceChanges([
      { id: "s1", summary: "Pricing: $99/mo", collectedAt: at("2026-07-01T00:00:00Z") },
      { id: "s2", summary: "Pricing: $129/mo", collectedAt: at("2026-07-08T00:00:00Z") },
    ]);
    expect(changes).toHaveLength(1);
    expect(changes[0].beforeItemId).toBe("s1");
    expect(changes[0].afterItemId).toBe("s2");
    expect(changes[0].changedAt).toEqual(at("2026-07-08T00:00:00Z"));
  });

  it("reports NO change when consecutive snapshots are identical (ignoring whitespace/case)", () => {
    expect(detectSourceChanges([
      { id: "s1", summary: "Pricing: $99/mo", collectedAt: at("2026-07-01T00:00:00Z") },
      { id: "s2", summary: "pricing:  $99/mo ", collectedAt: at("2026-07-08T00:00:00Z") },
    ])).toHaveLength(0);
  });

  it("orders by collectedAt and detects each change across a series", () => {
    const changes = detectSourceChanges([
      { id: "s3", summary: "C", collectedAt: at("2026-07-15T00:00:00Z") },
      { id: "s1", summary: "A", collectedAt: at("2026-07-01T00:00:00Z") },
      { id: "s2", summary: "B", collectedAt: at("2026-07-08T00:00:00Z") },
    ]);
    expect(changes.map((c) => `${c.beforeItemId}->${c.afterItemId}`)).toEqual(["s1->s2", "s2->s3"]);
  });

  it("a single snapshot has no change (nothing to diff against)", () => {
    expect(detectSourceChanges([{ id: "s1", summary: "A", collectedAt: at("2026-07-01T00:00:00Z") }])).toHaveLength(0);
  });
});
