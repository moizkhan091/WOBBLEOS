import { describe, expect, it } from "vitest";
import { estimateTextWorstCaseUsd } from "@/lib/providers";

/**
 * The old estimate charged maxTokens in BOTH directions at a flat $0.10 per 1k. Against Sonnet 4.5's
 * real rates that is ~33x too pessimistic on input and ~7x on output, and it charged the output ceiling
 * for a prompt whose length is known exactly. Under a $2 daily cap it started refusing real work: a
 * 6,000-token proposal review priced at $1.20 was blocked, so the guard against overspending became a
 * guard against working.
 */
const SONNET = { usdPerMillionInput: 3, usdPerMillionOutput: 15 };

describe("what a call could cost, before it is allowed to run", () => {
  it("prices the proposal review that used to be blocked at a workable number", () => {
    // ~9,000 characters of prompt, 6,000 tokens of headroom, on Sonnet.
    const cost = estimateTextWorstCaseUsd(6000, { promptChars: 9000, ...SONNET });
    expect(cost).toBeLessThan(0.12);
    expect(cost).toBeGreaterThan(0.05);
  });

  it("is far below the old flat estimate that blocked it", () => {
    const old = 6000 * 2 * 0.0001; // $1.20
    expect(estimateTextWorstCaseUsd(6000, { promptChars: 9000, ...SONNET })).toBeLessThan(old / 8);
  });

  it("still OVER-estimates, because an in-flight call must never cross the stop threshold", () => {
    // A model that writes half its ceiling costs about half this. Erring high is the correct direction.
    const ceiling = estimateTextWorstCaseUsd(6000, { promptChars: 9000, ...SONNET });
    const realistic = estimateTextWorstCaseUsd(3000, { promptChars: 9000, ...SONNET });
    expect(ceiling).toBeGreaterThan(realistic);
  });

  it("charges a cheap model far less than a dear one for identical work", () => {
    const cheap = estimateTextWorstCaseUsd(6000, { promptChars: 9000, usdPerMillionInput: 0.1, usdPerMillionOutput: 0.4 });
    expect(cheap).toBeLessThan(estimateTextWorstCaseUsd(6000, { promptChars: 9000, ...SONNET }) / 10);
  });

  it("falls back to the dearest rates for a model with no listed price", () => {
    const unknown = estimateTextWorstCaseUsd(6000, { promptChars: 9000 });
    expect(unknown).toBeCloseTo(estimateTextWorstCaseUsd(6000, { promptChars: 9000, ...SONNET }), 6);
  });

  it("grows with the prompt, since a long context genuinely costs more", () => {
    const short = estimateTextWorstCaseUsd(1000, { promptChars: 1000, ...SONNET });
    const long = estimateTextWorstCaseUsd(1000, { promptChars: 400_000, ...SONNET });
    expect(long).toBeGreaterThan(short * 5);
  });

  it("never returns zero, so a tiny call is still counted", () => {
    expect(estimateTextWorstCaseUsd(1, { promptChars: 0, ...SONNET })).toBeGreaterThan(0);
  });
});
