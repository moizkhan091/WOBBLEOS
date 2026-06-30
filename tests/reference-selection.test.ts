import { describe, expect, it } from "vitest";
import {
  selectReferenceForAsset,
  selectReferencesForBatch,
  scoreReference,
  collectAvoidTags,
  type CreativeReference,
} from "@/lib/domain/reference-selection";

const refs: CreativeReference[] = [
  { id: "ref1", kind: "static", approvalStatus: "approved", styleTags: ["bold", "dark"], brandFit: 8, platform: "linkedin" },
  { id: "ref2", kind: "static", approvalStatus: "approved", styleTags: ["minimal", "light"], brandFit: 7 },
  { id: "ref3", kind: "static", approvalStatus: "pending", styleTags: ["bold"], brandFit: 9 },
  { id: "ref4", kind: "carousel_set", approvalStatus: "approved", styleTags: ["bold"], slideCount: 8, brandFit: 8 },
  { id: "ref5", kind: "carousel_set", approvalStatus: "approved", styleTags: ["minimal"], slideCount: 4, brandFit: 6 },
  { id: "refNeg", kind: "static", approvalStatus: "approved", negative: true, styleTags: ["clipart", "comic"] },
];

describe("reference selection - core rule (one ref per asset, never blend)", () => {
  it("picks exactly one reference for a static, by best fit", () => {
    const sel = selectReferenceForAsset(
      { assetType: "static", index: 1, desiredStyleTags: ["bold", "dark"], platform: "linkedin" },
      refs,
    );
    expect(sel.reference?.id).toBe("ref1");
    expect(Array.isArray(sel.reference)).toBe(false); // single, not a list
    expect(sel.avoidStyleTags).toEqual(expect.arrayContaining(["clipart", "comic"]));
  });

  it("diversifies a batch of statics across different references", () => {
    const out = selectReferencesForBatch(
      [
        { assetType: "static", index: 1, desiredStyleTags: ["bold", "dark"] },
        { assetType: "static", index: 2, desiredStyleTags: ["minimal"] },
      ],
      refs,
    );
    expect(out).toHaveLength(2);
    expect(out[0].reference?.id).toBe("ref1");
    expect(out[1].reference?.id).toBe("ref2");
    expect(out[0].reference?.id).not.toBe(out[1].reference?.id); // never repeat when avoidable
  });

  it("picks ONE carousel set matched to slide count (never a mix)", () => {
    const sel = selectReferenceForAsset({ assetType: "carousel", index: 1, slideCount: 6, desiredStyleTags: ["bold"] }, refs);
    expect(sel.reference?.id).toBe("ref4"); // 8 slides covers 6; ref5 (4 slides) excluded
    expect(sel.reference?.kind).toBe("carousel_set");
  });

  it("excludes pending/rejected and never selects negative references", () => {
    const sel = selectReferenceForAsset({ assetType: "static", index: 1, desiredStyleTags: ["bold"] }, refs);
    expect(["ref1", "ref2"]).toContain(sel.reference?.id);
    expect(sel.reference?.id).not.toBe("ref3"); // pending
    expect(sel.reference?.id).not.toBe("refNeg"); // negative
  });

  it("honors a founder-pinned reference even if another scores higher", () => {
    const sel = selectReferenceForAsset(
      { assetType: "static", index: 1, desiredStyleTags: ["bold", "dark"], pinnedReferenceId: "ref2" },
      refs,
    );
    expect(sel.reference?.id).toBe("ref2");
    expect(sel.rationale).toMatch(/pinned/i);
  });

  it("returns null with guidance when nothing is eligible", () => {
    const sel = selectReferenceForAsset({ assetType: "video", index: 1 }, refs);
    expect(sel.reference).toBeNull();
    expect(sel.rationale).toMatch(/brand kit/i);
  });
});

describe("scoring + avoid tags", () => {
  it("scores style-tag overlap and brand fit", () => {
    const high = scoreReference(refs[0], { assetType: "static", index: 1, desiredStyleTags: ["bold", "dark"], platform: "linkedin" });
    const low = scoreReference(refs[1], { assetType: "static", index: 1, desiredStyleTags: ["bold", "dark"] });
    expect(high).toBeGreaterThan(low);
  });
  it("collects avoid tags from negative references", () => {
    expect(collectAvoidTags(refs)).toEqual(expect.arrayContaining(["clipart", "comic"]));
  });
});
