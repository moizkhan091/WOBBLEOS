/**
 * Tests for the eval harness itself (no DB, no network, no provider).
 *
 * Proves, for EVERY assertion kind, that it PASSES on good output and FAILS on bad,
 * plus: brand forbidden-phrase catching, schema-violation catching, that `llm_judge`
 * is SKIPPED (not failed) when no judge is injected — and evaluated when one is —
 * and that runSuite aggregates correctly. This is the meta-test that keeps the CI
 * gate itself honest.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  evaluateAssertion,
  extractJson,
  runEvalCase,
  runSuite,
  type Assertion,
  type EvalCase,
  type JudgeFn,
} from "@/lib/evals/harness";
import { brandAssertions, citationAssertion, forbiddenPhrases } from "@/lib/evals/wobble-rules";
import { goldenCases, goldenRecordings, replayProducer } from "@/lib/evals/cases";

/** Evaluate one assertion against output and return true iff it passed. */
async function passes(assertion: Assertion, output: string, judge?: JudgeFn): Promise<boolean> {
  const outcome = await evaluateAssertion(assertion, output, judge ? { judge } : {});
  return outcome.status === "pass";
}

describe("evaluateAssertion — each kind passes on good and fails on bad", () => {
  it("must_include (string + regex)", async () => {
    expect(await passes({ kind: "must_include", value: "Wobble" }, "Wobble OS")).toBe(true);
    expect(await passes({ kind: "must_include", value: "Wobble" }, "nothing here")).toBe(false);
    expect(await passes({ kind: "must_include", value: /agenc/i }, "The AGENCY model")).toBe(true);
    expect(await passes({ kind: "must_include", value: /agenc/i }, "no match")).toBe(false);
  });

  it("must_not_include", async () => {
    expect(await passes({ kind: "must_not_include", value: "we automate everything" }, "clean copy")).toBe(true);
    expect(await passes({ kind: "must_not_include", value: "we automate everything" }, "we automate everything!")).toBe(false);
  });

  it("json_parses (raw, fenced, embedded)", async () => {
    expect(await passes({ kind: "json_parses" }, '{"a":1}')).toBe(true);
    expect(await passes({ kind: "json_parses" }, '```json\n{"a":1}\n```')).toBe(true);
    expect(await passes({ kind: "json_parses" }, 'prefix {"a":1} suffix')).toBe(true);
    expect(await passes({ kind: "json_parses" }, "not json at all")).toBe(false);
  });

  it("matches_schema passes on valid shape and FAILS on a shape violation", async () => {
    const schema = z.object({ title: z.string(), count: z.number() });
    expect(await passes({ kind: "matches_schema", schema }, '{"title":"x","count":2}')).toBe(true);
    // wrong type for count -> shape violation
    expect(await passes({ kind: "matches_schema", schema }, '{"title":"x","count":"two"}')).toBe(false);
    // missing field -> shape violation
    expect(await passes({ kind: "matches_schema", schema }, '{"title":"x"}')).toBe(false);
    // not JSON at all -> fails
    expect(await passes({ kind: "matches_schema", schema }, "prose only")).toBe(false);
  });

  it("must_cite counts [n] tokens against min", async () => {
    expect(await passes({ kind: "must_cite", min: 2 }, "claim [1] and claim [2]")).toBe(true);
    expect(await passes({ kind: "must_cite", min: 2 }, "only one [1]")).toBe(false);
    expect(await passes({ kind: "must_cite" }, "no citations here")).toBe(false);
  });

  it("max_length in chars and words", async () => {
    expect(await passes({ kind: "max_length", max: 5, unit: "chars" }, "hello")).toBe(true);
    expect(await passes({ kind: "max_length", max: 5, unit: "chars" }, "hello!")).toBe(false);
    expect(await passes({ kind: "max_length", max: 2, unit: "words" }, "two words")).toBe(true);
    expect(await passes({ kind: "max_length", max: 2, unit: "words" }, "three little words")).toBe(false);
  });

  it("non_empty", async () => {
    expect(await passes({ kind: "non_empty" }, "x")).toBe(true);
    expect(await passes({ kind: "non_empty" }, "   \n  ")).toBe(false);
  });

  it("custom predicate (null passes, string fails)", async () => {
    const noDigits: Assertion = {
      kind: "custom",
      name: "no-digits",
      predicate: (o) => (/\d/.test(o) ? "contains a digit" : null),
    };
    expect(await passes(noDigits, "clean")).toBe(true);
    expect(await passes(noDigits, "has 1 digit")).toBe(false);
  });
});

describe("extractJson", () => {
  it("parses raw, fenced, and embedded JSON; rejects prose", () => {
    expect(extractJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(extractJson('```json\n[1,2,3]\n```')).toEqual({ ok: true, value: [1, 2, 3] });
    expect(extractJson('here: {"a":true} done')).toEqual({ ok: true, value: { a: true } });
    expect(extractJson("just prose").ok).toBe(false);
    expect(extractJson("   ").ok).toBe(false);
  });
});

describe("WOBBLE brand rules", () => {
  it("brandAssertions catch a forbidden phrase (case-insensitive) and pass clean copy", async () => {
    const assertions = brandAssertions();
    const clean = "Wobble installs a custom AI OS inside your business.";
    for (const a of assertions) {
      expect(await passes(a, clean)).toBe(true);
    }
    // A doc-forbidden phrase, in different casing, must trip at least one assertion.
    const dirty = "We Automate Everything and no human needed.";
    const anyFailed = (await Promise.all(assertions.map((a) => passes(a, dirty)))).some((p) => p === false);
    expect(anyFailed).toBe(true);
  });

  it("forbiddenPhrases returns a non-empty, defensively-copied list", () => {
    const list = forbiddenPhrases();
    expect(list.length).toBeGreaterThan(0);
    list.push("mutation");
    expect(forbiddenPhrases()).not.toContain("mutation");
  });

  it("citationAssertion enforces the [n] Ask-WOBBLE shape", async () => {
    expect(await passes(citationAssertion(2), "a [1] b [2]")).toBe(true);
    expect(await passes(citationAssertion(2), "a [1] only")).toBe(false);
  });
});

describe("llm_judge tier", () => {
  const judged: Assertion = {
    kind: "llm_judge",
    rubric: "grade the voice",
    threshold: 0.6,
    label: "voice",
  };

  it("is SKIPPED (not failed) when no judge is injected", async () => {
    const outcome = await evaluateAssertion(judged, "some output", {});
    expect(outcome.status).toBe("skip");
  });

  it("counts toward skipped (never failures) in a case result", async () => {
    const evalCase: EvalCase = {
      id: "judge-skip",
      description: "judge assertion with no judge",
      input: {},
      assertions: [{ kind: "non_empty" }, judged],
    };
    const result = await runEvalCase(evalCase, async () => "hi");
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });

  it("is EVALUATED when a judge is injected (pass and fail paths)", async () => {
    const passJudge: JudgeFn = async () => ({ score: 0.9, pass: true, reason: "great" });
    const failJudge: JudgeFn = async () => ({ score: 0.2, pass: false, reason: "flat" });
    expect(await passes(judged, "output", passJudge)).toBe(true);
    expect(await passes(judged, "output", failJudge)).toBe(false);
  });

  it("fails when score is below threshold even if judge says pass=true", async () => {
    const borderline: JudgeFn = async () => ({ score: 0.4, pass: true, reason: "meh" });
    expect(await passes(judged, "output", borderline)).toBe(false);
  });
});

describe("runEvalCase / runSuite aggregation", () => {
  it("a producer that throws is a failure", async () => {
    const evalCase: EvalCase = {
      id: "throws",
      description: "producer throws",
      input: { unknown: true },
      assertions: [{ kind: "non_empty" }],
    };
    const result = await runEvalCase(evalCase, async () => {
      throw new Error("boom");
    });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("producer threw");
  });

  it("runSuite aggregates passed/failed/total correctly", async () => {
    const cases: EvalCase[] = [
      { id: "good", description: "", input: "g", assertions: [{ kind: "must_include", value: "ok" }] },
      { id: "bad", description: "", input: "b", assertions: [{ kind: "must_include", value: "MISSING" }] },
    ];
    const produce = async (): Promise<string> => "ok";
    const summary = await runSuite(cases, produce);
    expect(summary.total).toBe(2);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.results.find((r) => r.caseId === "bad")?.passed).toBe(false);
  });
});

describe("golden set (the exact suite `npm run eval` gates on)", () => {
  it("has coverage across content, proposal, and ask shapes", () => {
    expect(goldenRecordings.length).toBeGreaterThanOrEqual(8);
    const ids = goldenCases.map((c) => c.id).join(",");
    expect(ids).toMatch(/content-/);
    expect(ids).toMatch(/proposal-/);
    expect(ids).toMatch(/ask-/);
  });

  it("every golden case passes its deterministic assertions against the recorded output", async () => {
    const summary = await runSuite(goldenCases, replayProducer());
    const failed = summary.results.filter((r) => !r.passed);
    // Surface which case + which assertion, if this ever regresses.
    expect(failed.map((r) => `${r.caseId}: ${r.failures.join(" | ")}`)).toEqual([]);
    expect(summary.failed).toBe(0);
  });

  it("golden set exercises the judge tier but skips it deterministically (no judge)", async () => {
    const summary = await runSuite(goldenCases, replayProducer());
    // At least one llm_judge assertion exists in the set and is skipped, not failed.
    expect(summary.skipped).toBeGreaterThanOrEqual(1);
  });
});
