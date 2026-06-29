import { describe, expect, it } from "vitest";
import { rankMemoryChunks } from "@/lib/domain/memory";

describe("rankMemoryChunks", () => {
  it("filters archived chunks unless archived search is requested", () => {
    const ranked = rankMemoryChunks({
      now: new Date("2026-06-26T00:00:00.000Z"),
      queryMode: "current",
      chunks: [
        { id: "fresh", similarity: 0.82, tier: "working", trustLevel: "approved_expert", createdAt: "2026-06-25T00:00:00.000Z", archived: false },
        { id: "old-archived", similarity: 0.99, tier: "episodic", trustLevel: "monitored", createdAt: "2024-01-01T00:00:00.000Z", archived: true },
      ],
    });

    expect(ranked.map((chunk) => chunk.id)).toEqual(["fresh"]);
  });

  it("uses recency to break close similarity ties for current queries", () => {
    const ranked = rankMemoryChunks({
      now: new Date("2026-06-26T00:00:00.000Z"),
      queryMode: "current",
      chunks: [
        { id: "old", similarity: 0.86, tier: "episodic", trustLevel: "monitored", createdAt: "2024-01-01T00:00:00.000Z", archived: false },
        { id: "fresh", similarity: 0.84, tier: "episodic", trustLevel: "monitored", createdAt: "2026-06-25T00:00:00.000Z", archived: false },
      ],
    });

    expect(ranked[0]?.id).toBe("fresh");
  });
});
