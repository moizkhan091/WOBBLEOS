import { describe, expect, it } from "vitest";
import {
  buildTranscript,
  classifyCandidateRouting,
  founderBankSlug,
  parseHarvestCandidates,
} from "@/lib/domain/conversations";

describe("founderBankSlug", () => {
  it("maps founder names/ids to their personal bank", () => {
    expect(founderBankSlug("Moiz")).toBe("founder_moiz");
    expect(founderBankSlug("founder_ali")).toBe("founder_ali");
    expect(founderBankSlug("Haad")).toBe("founder_haad");
  });
  it("falls back to shared founder_taste for unknown/empty", () => {
    expect(founderBankSlug("Someone")).toBe("founder_taste");
    expect(founderBankSlug(null)).toBe("founder_taste");
  });
});

describe("buildTranscript", () => {
  it("keeps only user/assistant content", () => {
    const t = buildTranscript([
      { role: "system", content: "sys" },
      { role: "user", content: "I like punchy hooks" },
      { role: "tool", content: "{...}" },
      { role: "assistant", content: "Noted." },
      { role: "assistant", content: null },
    ]);
    expect(t).toBe("Founder: I like punchy hooks\nWOBBLE: Noted.");
  });
});

describe("parseHarvestCandidates", () => {
  it("extracts a JSON array even with surrounding prose", () => {
    const out = parseHarvestCandidates('Sure! Here you go:\n[{"content":"Moiz prefers punchy hooks","scope":"founder","area":"content","confidence":0.9}] done');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ scope: "founder", area: "content" });
  });
  it("returns [] on garbage", () => {
    expect(parseHarvestCandidates("no json here")).toEqual([]);
    expect(parseHarvestCandidates("[not json]")).toEqual([]);
  });
  it("keeps valid candidates and drops invalid ones (one bad item must not nuke all)", () => {
    const out = parseHarvestCandidates('[{"content":"a good durable fact","scope":"founder","area":"content","confidence":0.9},{"content":"x","scope":"founder","area":"content","confidence":0.9}]');
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe("a good durable fact");
  });
});

describe("classifyCandidateRouting", () => {
  it("auto-saves personal (founder) preferences to that founder's bank", () => {
    const r = classifyCandidateRouting({ content: "x", scope: "founder", area: "content", confidence: 0.9 }, { founderBankSlug: "founder_moiz" });
    expect(r).toMatchObject({ action: "auto_save", bankSlugs: ["founder_moiz"] });
  });
  it("proposes brand truth as core tier (never auto-overwrites brand)", () => {
    const r = classifyCandidateRouting({ content: "x", scope: "brand", area: "brand", confidence: 0.9 }, { founderBankSlug: "founder_moiz" });
    expect(r).toMatchObject({ action: "propose", bankSlugs: ["brand"], memoryTier: "core" });
  });
  it("proposes company facts for approval", () => {
    const r = classifyCandidateRouting({ content: "x", scope: "company", area: "strategy", confidence: 0.8 }, { founderBankSlug: "founder_moiz" });
    expect(r).toMatchObject({ action: "propose", bankSlugs: ["company"] });
  });
});
