/**
 * WOBBLE OS — Agent / LLM Eval Harness (core)
 * ============================================
 *
 * WHY THIS EXISTS
 * ---------------
 * Everything WOBBLE ships to founders and clients is *generated text*: content
 * packets, proposals, audit reports, Ask-WOBBLE answers. Unit tests already
 * prove the plumbing (routing, approvals, budgets) works. What they cannot prove
 * is that the *quality* of the generated text stays good as prompts, models, and
 * context builders drift. This harness is the regression net for OUTPUT QUALITY.
 *
 * TWO TIERS — AND WHY THE SPLIT MATTERS
 * -------------------------------------
 * 1. DETERMINISTIC tier (this file's assertions): pure, in-process checks with
 *    NO network, NO DB, NO paid LLM calls. must_include / must_not_include /
 *    matches_schema / json_parses / must_cite / max_length / non_empty / custom.
 *    Because it is pure and free, it is the tier that gates CI on every push.
 *    A brand-voice regression (e.g. a prompt change that lets "we automate
 *    everything" slip back in) fails the build cheaply and instantly.
 *
 * 2. JUDGE tier (the OPTIONAL `llm_judge` assertion): an LLM grades subjective
 *    quality ("is this actually in WOBBLE's cut-throat voice?"). It costs money
 *    and is non-deterministic, so it is OFF by default and is only evaluated when
 *    the caller INJECTS a `judge` function. Absent a judge, a `llm_judge`
 *    assertion is SKIPPED (never failed) so it can never break CI or spend the
 *    founder's near-empty OpenRouter balance by accident. This harness NEVER
 *    imports or calls a real provider — the judge is always injected from outside.
 *
 * PRODUCERS ARE INJECTED
 * ----------------------
 * `runEvalCase` / `runSuite` take a `produce: (input) => Promise<string>`. In CI
 * we pass a STUB producer that replays recorded fixture outputs (see
 * `scripts/run-evals.ts` + `src/lib/evals/cases/`), so the run is deterministic
 * and free. To evaluate a live model you inject a producer that actually calls
 * it — the assertions are identical either way.
 *
 * No `any`, strict TS. zod is the only (already-present) dependency.
 */

import type { z } from "zod";

// ---------------------------------------------------------------------------
// Assertion kinds (discriminated union on `kind`)
// ---------------------------------------------------------------------------

/** A string or a RegExp; RegExp lets fixtures express case-insensitive / fuzzy matches. */
export type Matcher = string | RegExp;

/** The substring/pattern MUST appear in the output. */
export interface MustIncludeAssertion {
  kind: "must_include";
  value: Matcher;
  /** Optional human label for nicer failure messages. */
  label?: string;
}

/** The substring/pattern MUST NOT appear (forbidden phrases, banned claims). */
export interface MustNotIncludeAssertion {
  kind: "must_not_include";
  value: Matcher;
  label?: string;
}

/**
 * The output (parsed / extracted as JSON) MUST validate against a Zod schema.
 * The schema is passed live in the assertion — the harness stays schema-agnostic.
 */
export interface MatchesSchemaAssertion {
  kind: "matches_schema";
  schema: z.ZodType;
  label?: string;
}

/** The output MUST be valid JSON (raw, fenced, or an embedded JSON block). */
export interface JsonParsesAssertion {
  kind: "json_parses";
  label?: string;
}

/**
 * The output MUST contain at least `min` citation-shaped tokens. Default shape is
 * the inline `[n]` bracketed-number citation Ask WOBBLE emits (see
 * `src/lib/domain/ask.ts` -> buildEvidenceBlock). Override `pattern` for other shapes.
 */
export interface MustCiteAssertion {
  kind: "must_cite";
  min?: number;
  pattern?: RegExp;
  label?: string;
}

/** The output length MUST be <= `max`, counted in chars (default) or words. */
export interface MaxLengthAssertion {
  kind: "max_length";
  max: number;
  unit?: "chars" | "words";
  label?: string;
}

/** The output MUST be non-empty after trimming. */
export interface NonEmptyAssertion {
  kind: "non_empty";
  label?: string;
}

/**
 * Arbitrary pure predicate: return an error string to FAIL, or `null` to PASS.
 * Escape hatch for one-off checks that don't warrant a first-class kind.
 */
export interface CustomAssertion {
  kind: "custom";
  name?: string;
  predicate: (output: string) => string | null;
  label?: string;
}

/**
 * OPTIONAL LLM-judge assertion. Only evaluated when `opts.judge` is injected;
 * otherwise SKIPPED (counted, never failed). Never calls a provider itself.
 */
export interface LlmJudgeAssertion {
  kind: "llm_judge";
  /** The grading rubric handed to the judge. */
  rubric: string;
  /** Minimum score (0..1) required to pass, if the judge returns a score. Default 0.5. */
  threshold?: number;
  /** Build the full judge prompt from the output; defaults to rubric + output. */
  buildPrompt?: (output: string) => string;
  label?: string;
}

export type Assertion =
  | MustIncludeAssertion
  | MustNotIncludeAssertion
  | MatchesSchemaAssertion
  | JsonParsesAssertion
  | MustCiteAssertion
  | MaxLengthAssertion
  | NonEmptyAssertion
  | CustomAssertion
  | LlmJudgeAssertion;

// ---------------------------------------------------------------------------
// Case / result / suite types
// ---------------------------------------------------------------------------

export interface EvalCase {
  id: string;
  description: string;
  /** The input handed to the producer. Opaque to the harness. */
  input: unknown;
  /** Optional golden reference (documentation / future diffing). Not asserted directly. */
  expected?: unknown;
  assertions: Assertion[];
}

export interface EvalResult {
  caseId: string;
  passed: boolean;
  /** One message per FAILED assertion. Empty when the case passes. */
  failures: string[];
  /** Labels of assertions that were SKIPPED (e.g. llm_judge with no judge injected). */
  skipped: string[];
}

export interface EvalSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  /** Total count of skipped assertions across all cases (informational). */
  skipped: number;
  results: EvalResult[];
}

/** Injected LLM judge. Returns a grade; the harness decides pass/fail from it. */
export type JudgeFn = (prompt: string) => Promise<{ score: number; pass: boolean; reason: string }>;

export interface EvalRunOptions {
  /** When provided, `llm_judge` assertions are evaluated; when absent they are SKIPPED. */
  judge?: JudgeFn;
  /** Default citation pattern for `must_cite` assertions that don't set their own. */
  defaultCitationPattern?: RegExp;
}

/** Default citation shape: inline bracketed numbers like `[1]`, `[12]` (Ask WOBBLE's shape). */
export const DEFAULT_CITATION_PATTERN = /\[\d+\]/g;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Extract a JSON value from model text. Handles three real-world shapes:
 *  - raw JSON,
 *  - a ```json fenced block,
 *  - JSON embedded in prose (first balanced {...} or [...] object).
 * Pure and dependency-free. Mirrors the tolerant parsing WOBBLE workers do.
 */
export function extractJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false };

  // 1) Fenced ```json ... ``` (or bare ``` ... ```) block.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidates: string[] = [];
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  candidates.push(trimmed);

  // 3) First balanced object/array embedded in prose.
  const firstBrace = trimmed.search(/[{[]/);
  if (firstBrace >= 0) {
    const lastBrace = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
    if (lastBrace > firstBrace) candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) as unknown };
    } catch {
      // try the next candidate
    }
  }
  return { ok: false };
}

function matcherHit(output: string, matcher: Matcher): boolean {
  if (typeof matcher === "string") return output.includes(matcher);
  // Don't mutate lastIndex on caller-owned regexes: build a fresh, non-global test regex.
  const flags = matcher.flags.replace("g", "");
  return new RegExp(matcher.source, flags).test(output);
}

function describeMatcher(matcher: Matcher): string {
  return typeof matcher === "string" ? JSON.stringify(matcher) : matcher.toString();
}

function countMatches(output: string, pattern: RegExp): number {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const global = new RegExp(pattern.source, flags);
  const matches = output.match(global);
  return matches ? matches.length : 0;
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

// ---------------------------------------------------------------------------
// Assertion evaluation
// ---------------------------------------------------------------------------

type AssertionOutcome =
  | { status: "pass" }
  | { status: "fail"; message: string }
  | { status: "skip"; reason: string };

function labelFor(assertion: Assertion): string {
  return assertion.label ?? assertion.kind;
}

/**
 * Evaluate a single assertion against the output. Pure except for the injected
 * `judge` (which the caller controls). Returns pass / fail(message) / skip(reason).
 */
export async function evaluateAssertion(
  assertion: Assertion,
  output: string,
  opts: EvalRunOptions = {},
): Promise<AssertionOutcome> {
  switch (assertion.kind) {
    case "must_include": {
      return matcherHit(output, assertion.value)
        ? { status: "pass" }
        : { status: "fail", message: `${labelFor(assertion)}: expected output to include ${describeMatcher(assertion.value)}` };
    }

    case "must_not_include": {
      return matcherHit(output, assertion.value)
        ? { status: "fail", message: `${labelFor(assertion)}: forbidden ${describeMatcher(assertion.value)} was present` }
        : { status: "pass" };
    }

    case "json_parses": {
      return extractJson(output).ok
        ? { status: "pass" }
        : { status: "fail", message: `${labelFor(assertion)}: output is not valid or extractable JSON` };
    }

    case "matches_schema": {
      const parsed = extractJson(output);
      if (!parsed.ok) {
        return { status: "fail", message: `${labelFor(assertion)}: output is not valid or extractable JSON` };
      }
      const result = assertion.schema.safeParse(parsed.value);
      return result.success
        ? { status: "pass" }
        : { status: "fail", message: `${labelFor(assertion)}: ${formatZodError(result.error)}` };
    }

    case "must_cite": {
      const min = assertion.min ?? 1;
      const pattern = assertion.pattern ?? opts.defaultCitationPattern ?? DEFAULT_CITATION_PATTERN;
      const found = countMatches(output, pattern);
      return found >= min
        ? { status: "pass" }
        : { status: "fail", message: `${labelFor(assertion)}: expected >= ${min} citation token(s) matching ${pattern.toString()}, found ${found}` };
    }

    case "max_length": {
      const unit = assertion.unit ?? "chars";
      const length = unit === "words" ? (output.trim().match(/\S+/g)?.length ?? 0) : output.length;
      return length <= assertion.max
        ? { status: "pass" }
        : { status: "fail", message: `${labelFor(assertion)}: ${length} ${unit} exceeds max ${assertion.max}` };
    }

    case "non_empty": {
      return output.trim().length > 0
        ? { status: "pass" }
        : { status: "fail", message: `${labelFor(assertion)}: output is empty` };
    }

    case "custom": {
      const error = assertion.predicate(output);
      return error === null
        ? { status: "pass" }
        : { status: "fail", message: `${assertion.name ?? labelFor(assertion)}: ${error}` };
    }

    case "llm_judge": {
      // OPT-IN / OFF BY DEFAULT: with no injected judge this is SKIPPED, never failed,
      // so the paid, non-deterministic tier can never break CI or spend money by accident.
      if (!opts.judge) {
        return { status: "skip", reason: `${labelFor(assertion)}: no judge injected (llm_judge tier is opt-in)` };
      }
      const prompt = assertion.buildPrompt
        ? assertion.buildPrompt(output)
        : `${assertion.rubric}\n\n---\nOUTPUT TO GRADE:\n${output}`;
      const grade = await opts.judge(prompt);
      const threshold = assertion.threshold ?? 0.5;
      const pass = grade.pass && grade.score >= threshold;
      return pass
        ? { status: "pass" }
        : { status: "fail", message: `${labelFor(assertion)}: judge scored ${grade.score} (threshold ${threshold}) — ${grade.reason}` };
    }

    default: {
      // Exhaustiveness guard: if a new kind is added without handling, this fails to compile.
      const _exhaustive: never = assertion;
      return { status: "fail", message: `unknown assertion kind: ${JSON.stringify(_exhaustive)}` };
    }
  }
}

// ---------------------------------------------------------------------------
// Case + suite runners
// ---------------------------------------------------------------------------

/**
 * Run one eval case: produce the output via the INJECTED producer, then evaluate
 * every assertion. A producer that throws is itself a failure (the case did not
 * yield a usable output).
 */
export async function runEvalCase(
  evalCase: EvalCase,
  produce: (input: unknown) => Promise<string>,
  opts: EvalRunOptions = {},
): Promise<EvalResult> {
  const failures: string[] = [];
  const skipped: string[] = [];

  let output: string;
  try {
    output = await produce(evalCase.input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { caseId: evalCase.id, passed: false, failures: [`producer threw: ${message}`], skipped };
  }

  for (const assertion of evalCase.assertions) {
    const outcome = await evaluateAssertion(assertion, output, opts);
    if (outcome.status === "fail") failures.push(outcome.message);
    else if (outcome.status === "skip") skipped.push(outcome.reason);
  }

  return { caseId: evalCase.id, passed: failures.length === 0, failures, skipped };
}

/** Run a whole suite and aggregate the results. Sequential = deterministic ordering. */
export async function runSuite(
  cases: EvalCase[],
  produce: (input: unknown) => Promise<string>,
  opts: EvalRunOptions = {},
): Promise<EvalSuiteSummary> {
  const results: EvalResult[] = [];
  for (const evalCase of cases) {
    results.push(await runEvalCase(evalCase, produce, opts));
  }
  const passed = results.filter((r) => r.passed).length;
  const skipped = results.reduce((sum, r) => sum + r.skipped.length, 0);
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    skipped,
    results,
  };
}
