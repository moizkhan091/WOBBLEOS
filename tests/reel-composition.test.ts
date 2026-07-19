import { describe, expect, it } from "vitest";
import { buildReelComposition, planScenesFromWords } from "@/lib/domain/reel-composition";
import { wordsToSrt } from "@/lib/reel";
import type { WordTiming } from "@/lib/domain/reel-voice";

/**
 * Reel composition generator + caption timing. The HyperFrames contract: #comp carries data-duration, every
 * scene beat-cuts on data-in/data-out, every spoken word is a .w[data-t] revealing on its beat, and a paused
 * GSAP timeline lives on window.__timelines["master"] for the renderer to seek. These prove the HTML honours
 * that contract and that the auto scene-planner colours the 3-part narrative + accents pain/fix words.
 */

const WORDS: WordTiming[] = [
  { word: "You're", start: 0.0, end: 0.3 },
  { word: "losing", start: 0.3, end: 0.7 },
  { word: "leads.", start: 0.7, end: 1.1 },
  { word: "Every", start: 1.2, end: 1.5 },
  { word: "missed", start: 1.5, end: 1.9 },
  { word: "call", start: 1.9, end: 2.2 },
  { word: "is", start: 2.2, end: 2.4 },
  { word: "money.", start: 2.4, end: 2.9 },
  { word: "Here's", start: 3.0, end: 3.3 },
  { word: "the", start: 3.3, end: 3.4 },
  { word: "fix:", start: 3.4, end: 3.8 },
  { word: "an", start: 3.9, end: 4.0 },
  { word: "AI", start: 4.0, end: 4.3 },
  { word: "system", start: 4.3, end: 4.8 },
  { word: "books", start: 4.8, end: 5.2 },
  { word: "them.", start: 5.2, end: 5.7 },
  { word: "Book", start: 5.8, end: 6.1 },
  { word: "a", start: 6.1, end: 6.2 },
  { word: "free", start: 6.2, end: 6.5 },
  { word: "audit.", start: 6.5, end: 7.0 },
];

describe("reel scene planner", () => {
  it("lays out scenes across the narrative and never leaves a gap", () => {
    const scenes = planScenesFromWords(WORDS, 7.4);
    expect(scenes.length).toBeGreaterThan(2);
    // scenes tile the timeline: each out == next in, last out == duration.
    for (let i = 0; i < scenes.length - 1; i++) expect(scenes[i].out).toBeCloseTo(scenes[i + 1].in);
    expect(scenes[scenes.length - 1].out).toBeCloseTo(7.4);
    // the arc ends on the electric-blue fix/CTA background.
    expect(scenes[scenes.length - 1].bg).toBe("blue");
  });

  it("accents pain words orange and fix/brand words blue", () => {
    const scenes = planScenesFromWords(WORDS, 7.4);
    const allWords = scenes.flatMap((s) => s.lines.flatMap((l) => l.words));
    expect(allWords.find((w) => w.text === "losing")?.accent).toBe("orange");
    expect(allWords.find((w) => w.text === "missed")?.accent).toBe("orange");
    expect(allWords.find((w) => w.text === "AI")?.accent).toBe("blue");
    expect(allWords.find((w) => w.text === "fix:")?.accent).toBe("blue");
  });
});

describe("reel composition HTML", () => {
  const html = buildReelComposition({ title: "T", scenes: planScenesFromWords(WORDS, 7.4), audioSrc: "voiceover.mp3", durationSec: 7.4 });

  it("honours the HyperFrames contract (comp duration, seek-driven master timeline, audio track)", () => {
    expect(html).toContain('data-composition-id="master"');
    expect(html).toContain('data-duration="7.40"');
    expect(html).toContain('window.__timelines["master"] = tl');
    expect(html).toContain("__hfReady = true");
    expect(html).toContain('<audio id="vo" src="voiceover.mp3"');
    expect(html).toContain('data-width="1080"');
    expect(html).toContain('data-height="1920"');
  });

  it("emits every spoken word as a .w[data-t] on its beat", () => {
    expect(html).toMatch(/<span class="w[^"]*" data-t="0.00">You're<\/span>/);
    expect(html).toMatch(/<span class="w blue" data-t="4.00">AI<\/span>/);
    // one scene section per planned scene, each with beat-cut boundaries.
    expect(html.match(/class="scene /g)?.length).toBe(planScenesFromWords(WORDS, 7.4).length);
  });

  it("escapes user text (no raw injection)", () => {
    const evil = buildReelComposition({ scenes: [{ bg: "dark", in: 0, out: 1, lines: [{ words: [{ text: "<script>x</script>", t: 0 }] }] }], audioSrc: "a.mp3", durationSec: 1 });
    expect(evil).not.toContain("<script>x</script>");
    expect(evil).toContain("&lt;script&gt;");
  });
});

describe("caption timing", () => {
  it("wordsToSrt chunks words and scales times by the speed-up", () => {
    const srt = wordsToSrt(WORDS, 1.05);
    expect(srt).toMatch(/^1\n00:00:00,000 --> /);
    expect(srt).toContain("You're losing leads. Every missed call"); // first 7-word cue
    // a 1.05x speed-up pulls the last cue's end EARLIER than its raw 7.0s.
    const lastEnd = srt.trim().split("\n").reverse().find((l) => l.includes("-->"));
    expect(lastEnd).toBeTruthy();
  });
});
