import { describe, expect, it } from "vitest";
import { computeSourceValue } from "@/lib/domain/intelligence";

/** Pure source value/ROI (Phase 5 mandate G) — measured from real findings + founder judgments. */
describe("computeSourceValue", () => {
  const items = [
    { id: "it_1", targetId: "tgt_A" },
    { id: "it_2", targetId: "tgt_A" },
    { id: "it_3", targetId: "tgt_B" }, // a different source
  ];
  const mk = (evidence: string[], impactScore: number, approvalStatus: "approved" | "rejected" | "pending") => ({ evidenceItemIds: evidence, impactScore, approvalStatus });

  it("attributes only the findings that cite this source's items, and rates them by founder judgment", () => {
    const insights = [
      mk(["it_1"], 80, "approved"),
      mk(["it_2"], 60, "approved"),
      mk(["it_1", "it_2"], 40, "rejected"),
      mk(["it_1"], 50, "pending"),
      mk(["it_3"], 90, "approved"), // cites tgt_B — must NOT count for tgt_A
    ];
    const v = computeSourceValue("tgt_A", items, insights as never);
    expect(v.itemsCollected).toBe(2);
    expect(v.findingsProduced).toBe(4); // the 4 citing it_1/it_2, not the tgt_B one
    expect(v.findingsApproved).toBe(2);
    expect(v.findingsRejected).toBe(1);
    expect(v.findingsPending).toBe(1);
    expect(v.approvalRate).toBe(0.67); // 2 / (2+1)
    expect(v.falsePositiveRate).toBe(0.25); // 1 rejected / 4 produced
    expect(v.valueScore).toBe(47); // avg approved impact 70 * approvalRate 0.67
  });

  it("returns honest nulls (not zeros) when nothing has been decided", () => {
    const v = computeSourceValue("tgt_A", items, [mk(["it_1"], 50, "pending")] as never);
    expect(v.findingsProduced).toBe(1);
    expect(v.approvalRate).toBeNull(); // nothing approved or rejected yet
    expect(v.valueScore).toBe(0);
  });

  it("a source with no findings is honestly empty", () => {
    const v = computeSourceValue("tgt_A", items, []);
    expect(v.findingsProduced).toBe(0);
    expect(v.approvalRate).toBeNull();
    expect(v.falsePositiveRate).toBeNull();
  });
});
