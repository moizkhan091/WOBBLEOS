import { describe, expect, it } from "vitest";
import { mapDirectedScenes, coerceMockup, parseDirectedPlan, buildReelDirectorPrompt, type DirectedPlan } from "@/lib/domain/reel-director";
import type { WordTiming } from "@/lib/domain/reel-voice";

/**
 * Reel DIRECTOR — the LLM designs a per-topic scene plan by WORD INDEX, and the mapper anchors it to the real VO
 * timings (never the LLM's own times) and fills topic-specific mockups. These prove: index→beat mapping is exact
 * and gap-free, accents match the right words, mockups are coerced strictly (garbage dropped), and the parser
 * tolerates fenced/prose-wrapped JSON. This is what makes each reel bespoke instead of a reused template.
 */

const WORDS: WordTiming[] = [
  { word: "Your", start: 0.0, end: 0.3 },
  { word: "CRM", start: 0.3, end: 0.7 },
  { word: "is", start: 0.7, end: 0.9 },
  { word: "a", start: 0.9, end: 1.0 },
  { word: "graveyard.", start: 1.0, end: 1.6 },
  { word: "An", start: 1.8, end: 2.0 },
  { word: "AI", start: 2.0, end: 2.4 },
  { word: "system", start: 2.4, end: 2.9 },
  { word: "wakes", start: 2.9, end: 3.3 },
  { word: "it.", start: 3.3, end: 3.7 },
];

describe("mapDirectedScenes — timing anchored to real beats", () => {
  const plan: DirectedPlan = {
    scenes: [
      { fromWord: 0, toWord: 5, bg: "dark", accents: [{ word: "graveyard", color: "orange" }] },
      {
        fromWord: 5,
        toWord: 10,
        bg: "blue",
        accents: [{ word: "AI", color: "blue" }],
        mockup: { kind: "kanban", columns: [{ title: "STALLED", cards: [{ name: "R. Khan", meta: "Roofing · 41d", chip: "stuck" }] }] },
      },
    ],
  };

  it("anchors scene in/out to the spoken word start times, gap-free, spanning the reel", () => {
    const scenes = mapDirectedScenes(plan, WORDS, 4.1);
    expect(scenes).toHaveLength(2);
    expect(scenes[0].in).toBeCloseTo(0.0);
    expect(scenes[0].out).toBeCloseTo(WORDS[5].start); // hands off exactly where scene 2 begins
    expect(scenes[1].in).toBeCloseTo(WORDS[5].start);
    expect(scenes[1].out).toBeCloseTo(4.1); // last scene runs to the duration
  });

  it("applies accents to the right words (punctuation-tolerant) and leaves others plain", () => {
    const scenes = mapDirectedScenes(plan, WORDS, 4.1);
    const s0 = scenes[0].lines[0].words;
    expect(s0.find((w) => w.text === "graveyard.")?.accent).toBe("orange"); // matched despite the period
    expect(s0.find((w) => w.text === "Your")?.accent).toBeUndefined();
    expect(scenes[1].lines[0].words.find((w) => w.text === "AI")?.accent).toBe("blue");
  });

  it("carries the topic-specific mockup through onto the right scene", () => {
    const scenes = mapDirectedScenes(plan, WORDS, 4.1);
    expect(scenes[0].mockup).toBeUndefined();
    expect(scenes[1].mockup).toEqual({ kind: "kanban", columns: [{ title: "STALLED", cards: [{ name: "R. Khan", meta: "Roofing · 41d", chip: "stuck" }] }] });
  });

  it("returns [] for an empty/garbage plan so the caller can fall back", () => {
    expect(mapDirectedScenes({ scenes: [] }, WORDS, 4.1)).toEqual([]);
    expect(mapDirectedScenes({ scenes: [{ fromWord: NaN, toWord: 2 }] } as unknown as DirectedPlan, WORDS, 4.1)).toEqual([]);
  });
});

describe("coerceMockup — strict, drops garbage, keeps topic content", () => {
  it("keeps a valid metrics tile with a numeric countTo + a known accent", () => {
    const m = coerceMockup({ kind: "metrics", tiles: [{ value: "64%", label: "fewer no-shows", countTo: 64, accent: "lime" }, { value: "", label: "dropme" }] });
    expect(m).toEqual({ kind: "metrics", tiles: [{ value: "64%", label: "fewer no-shows", countTo: 64, accent: "lime" }] });
  });
  it("drops an unknown mockup kind and an unknown chip", () => {
    expect(coerceMockup({ kind: "hologram" })).toBeUndefined();
    const k = coerceMockup({ kind: "kanban", columns: [{ title: "HOT", cards: [{ name: "Lead", chip: "onfire" }] }] });
    expect(k).toEqual({ kind: "kanban", columns: [{ title: "HOT", cards: [{ name: "Lead", chip: undefined, meta: undefined }] }] });
  });
  it("keeps a chat thread and defaults an unknown sender to 'them'", () => {
    const m = coerceMockup({ kind: "chat", bubbles: [{ from: "robot", text: "Hi!" }, { from: "us", text: "Booked." }] });
    expect(m).toEqual({ kind: "chat", header: undefined, bubbles: [{ from: "them", text: "Hi!" }, { from: "us", text: "Booked." }] });
  });
});

describe("parseDirectedPlan — tolerant JSON", () => {
  it("extracts JSON from a ```json fence with surrounding prose", () => {
    const plan = parseDirectedPlan('Sure!\n```json\n{"scenes":[{"fromWord":0,"toWord":3}]}\n```\nDone.');
    expect(plan?.scenes[0].fromWord).toBe(0);
  });
  it("returns null when there is no scenes array", () => {
    expect(parseDirectedPlan("not json")).toBeNull();
    expect(parseDirectedPlan('{"nope":1}')).toBeNull();
  });
});

describe("buildReelDirectorPrompt", () => {
  it("numbers the words and teaches the mockup vocabulary", () => {
    const { system, user } = buildReelDirectorPrompt({ topic: "Dead database", narration: "Your CRM is a graveyard.", words: WORDS });
    expect(user).toContain("0:Your");
    expect(user).toContain("4:graveyard.");
    expect(system).toMatch(/kanban/);
    expect(system).toMatch(/metrics/);
    expect(system).toMatch(/fromWord/);
  });
});
