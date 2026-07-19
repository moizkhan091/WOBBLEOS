import { describe, expect, it } from "vitest";
import { resolveReelVoice, stripExpressionTags, reelNarrationGuidance, alignmentToWords, REEL_VOICES } from "@/lib/domain/reel-voice";

/**
 * Reel voice roster + expression handling (VOICE-SETTINGS.md). Moiz = v2, NO tags; Hale/Female = v3 expressive.
 * v3 timestamps return [tags] as characters — captions MUST strip them. These prove the rules + the parser.
 */
describe("reel voice roster", () => {
  it("Moiz is v2, locked settings, NO expressive tags, 1.05x speed-up", () => {
    const v = resolveReelVoice("moiz");
    expect(v.model).toBe("eleven_multilingual_v2");
    expect(v.allowsExpressiveTags).toBe(false);
    expect(v.settings.similarity_boost).toBe(0.75);
    expect(v.speedUp).toBeCloseTo(1.05);
    expect(v.id).toBe("512Jeow4Rpsq80q0SYn7");
  });

  it("Hale is v3 expressive; Female is v3 too", () => {
    expect(resolveReelVoice("hale").model).toBe("eleven_v3");
    expect(resolveReelVoice("hale").allowsExpressiveTags).toBe(true);
    expect(resolveReelVoice("female").allowsExpressiveTags).toBe(true);
    expect(Object.keys(REEL_VOICES)).toEqual(expect.arrayContaining(["moiz", "hale", "female"]));
  });

  it("an unknown voice falls back to Moiz (the safe default)", () => {
    expect(resolveReelVoice("nope").key).toBe("moiz");
    expect(resolveReelVoice(undefined).key).toBe("moiz");
  });

  it("narration guidance forbids tags for Moiz, allows + lists them for Hale", () => {
    expect(reelNarrationGuidance(resolveReelVoice("moiz"))).toMatch(/DO NOT use any \[expression tags\]/);
    const hale = reelNarrationGuidance(resolveReelVoice("hale"));
    expect(hale).toMatch(/\[excited\]/);
    expect(hale).toMatch(/NEVER use a plain \[pause\]/);
  });
});

describe("expression tag handling", () => {
  it("stripExpressionTags removes [tags] and collapses spaces", () => {
    expect(stripExpressionTags("[excited] Your dead database [thoughtful] is a goldmine.")).toBe("Your dead database is a goldmine.");
  });

  it("alignmentToWords produces word timings and SKIPS characters inside [tags]", () => {
    // "[hi]ab cd" — the tag chars must not become caption words; "ab" and "cd" keep their timings.
    const characters = "[hi]ab cd".split("");
    const character_start_times_seconds = characters.map((_, i) => i * 0.1);
    const character_end_times_seconds = characters.map((_, i) => i * 0.1 + 0.1);
    const words = alignmentToWords({ characters, character_start_times_seconds, character_end_times_seconds });
    expect(words.map((w) => w.word)).toEqual(["ab", "cd"]);
    expect(words.every((w) => !w.word.includes("[") && !w.word.includes("]"))).toBe(true);
    expect(words[0].start).toBeCloseTo(0.4); // 'a' is the 5th char (index 4)
  });
});
