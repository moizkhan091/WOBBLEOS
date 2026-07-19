import { describe, expect, it } from "vitest";
import { validateComposition, extractComposition, buildAnimatorPrompt, REEL_COMPACT_EXEMPLAR } from "@/lib/domain/reel-authoring";
import { reelEffectCatalog, EFFECT_LIBRARY_COUNT } from "@/lib/domain/reel-effects";

/**
 * Reel AUTHORING safety gate. The animator LLM writes the whole composition, so before we render LLM-authored
 * HTML we MUST reject anything that would render broken or non-deterministically under frame-by-frame seeking.
 * These prove the validator catches wall-clock/non-deterministic motion + contract violations, that the compact
 * exemplar we teach from is itself valid, and that the catalog exposes the full effect library.
 */

describe("validateComposition — the seek-safety gate", () => {
  it("accepts our own compact exemplar (it is the reference)", () => {
    const v = validateComposition(REEL_COMPACT_EXEMPLAR);
    expect(v.ok).toBe(true);
    expect(v.issues).toEqual([]);
  });

  it("rejects wall-clock motion (setTimeout / rAF / CSS keyframes)", () => {
    const base = REEL_COMPACT_EXEMPLAR;
    expect(validateComposition(base.replace("const o={v:0}", "setTimeout(()=>{},9); const o={v:0}")).ok).toBe(false);
    expect(validateComposition(base.replace("const o={v:0}", "requestAnimationFrame(()=>{}); const o={v:0}")).ok).toBe(false);
    expect(validateComposition(base.replace("</style>", "@keyframes spin{to{transform:rotate(360deg)}} .x{animation:spin 2s}</style>")).ok).toBe(false);
  });

  it("rejects non-determinism (Math.random / Date.now)", () => {
    expect(validateComposition(REEL_COMPACT_EXEMPLAR.replace("{v:0}", "{v:Math.random()}")).ok).toBe(false);
    expect(validateComposition(REEL_COMPACT_EXEMPLAR.replace("{v:0}", "{v:Date.now()}")).ok).toBe(false);
  });

  it("rejects a missing/unpaused master timeline + a missing GSAP CDN", () => {
    expect(validateComposition(REEL_COMPACT_EXEMPLAR.replace("{ paused: true }", "{}")).ok).toBe(false);
    expect(validateComposition(REEL_COMPACT_EXEMPLAR.replace(/window\.__timelines\["master"\][^\n]*/, "")).ok).toBe(false);
    expect(validateComposition(REEL_COMPACT_EXEMPLAR.replace(/<script src="https:\/\/cdn\.jsdelivr[^>]*><\/script>/, "")).ok).toBe(false);
  });

  it("rejects off-brand purple + empty input", () => {
    expect(validateComposition(REEL_COMPACT_EXEMPLAR.replace("--orange:#FF6B00", "--orange:purple")).ok).toBe(false);
    expect(validateComposition("").ok).toBe(false);
    expect(validateComposition("<html>tiny</html>").ok).toBe(false);
  });
});

describe("extractComposition — pull HTML from the reply", () => {
  it("extracts a fenced ```html document with surrounding prose", () => {
    const out = extractComposition("Here you go:\n```html\n<!doctype html><html><body>x</body></html>\n```\nEnjoy!");
    expect(out).toBe("<!doctype html><html><body>x</body></html>");
  });
  it("extracts a bare document and returns null when there is none", () => {
    expect(extractComposition("<html lang=\"en\"><body>y</body></html>")).toBe("<html lang=\"en\"><body>y</body></html>");
    expect(extractComposition("no html here")).toBeNull();
  });
});

describe("the animator brief carries the full library", () => {
  it("the catalog exposes 200+ real-reel effects", () => {
    expect(EFFECT_LIBRARY_COUNT).toBeGreaterThan(200);
    expect(reelEffectCatalog()).toMatch(/THE FULL LIBRARY \(\d{3} techniques/);
  });
  it("the prompt states the contract, seek-safety, and the word beats", () => {
    const { system, user } = buildAnimatorPrompt({
      topic: "Dead database", narration: "Your CRM is a graveyard.",
      words: [{ word: "Your", start: 0, end: 0.3 }, { word: "CRM", start: 0.3, end: 0.7 }],
      durationSec: 8, audioSrc: "voiceover.mp3", catalog: reelEffectCatalog(),
    });
    expect(system).toMatch(/paused: true/);
    expect(system).toMatch(/SEEK-SAFE ONLY/);
    expect(system).toMatch(/__timelines/);
    expect(user).toContain("0:Your@0.00");
  });
});
