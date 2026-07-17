import { describe, expect, it } from "vitest";
import {
  selectReferenceForAsset,
  selectReferencesForBatch,
  scoreReference,
  collectAvoidTags,
  contentFormatNeedsDesign,
  assetsForContentFormat,
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

/**
 * WOB-UAT-023 — the format→design mapping that decides whether a content pack goes to Design Intelligence
 * and what asset it asks for. This is the SINGLE source of truth shared by the content router and the
 * design consumer, so they can never disagree about "does this pack need a visual".
 */
describe("content format → design routing", () => {
  it("visual formats need a design brief; text-only formats do not", () => {
    expect(contentFormatNeedsDesign("static")).toBe(true);
    expect(contentFormatNeedsDesign("carousel")).toBe(true);
    expect(contentFormatNeedsDesign("reel_script")).toBe(true);
    expect(contentFormatNeedsDesign("youtube_script")).toBe(true);
    expect(contentFormatNeedsDesign("text")).toBe(false);
    expect(contentFormatNeedsDesign("thread")).toBe(false);
    expect(contentFormatNeedsDesign(null)).toBe(false);
    expect(contentFormatNeedsDesign(undefined)).toBe(false);
  });

  it("maps each visual format to the right asset type", () => {
    expect(assetsForContentFormat("static")).toEqual([{ assetType: "static", index: 0, platform: undefined }]);
    expect(assetsForContentFormat("reel_script")).toEqual([{ assetType: "video", index: 0, platform: undefined }]);
    expect(assetsForContentFormat("youtube_script")).toEqual([{ assetType: "video", index: 0, platform: undefined }]);
  });

  it("carousel carries its slide count (only when > 0) so reference matching can honor it", () => {
    expect(assetsForContentFormat("carousel", { slideCount: 8, platform: "instagram" })).toEqual([
      { assetType: "carousel", index: 0, platform: "instagram", slideCount: 8 },
    ]);
    // No slides known → no slideCount field rather than a misleading 0.
    expect(assetsForContentFormat("carousel", { slideCount: 0 })).toEqual([{ assetType: "carousel", index: 0, platform: undefined }]);
  });

  it("returns NO assets for a text-only format — the caller must not invent a default image", () => {
    expect(assetsForContentFormat("text")).toEqual([]);
    expect(assetsForContentFormat("thread")).toEqual([]);
  });
});
