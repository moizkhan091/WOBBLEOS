import type { z } from "zod";

/**
 * Structured-output parsing for LLM responses — extract, validate, and (optionally) repair.
 *
 * WHY this exists: across the codebase, model JSON is parsed ad-hoc (`text.replace(fences).indexOf('[')
 * … JSON.parse` in a try/catch that throws on failure). Two problems with that:
 *   1. a single malformed field throws away the WHOLE response — no recovery;
 *   2. the shape is never validated, so a syntactically-valid-but-wrong object flows downstream and
 *      fails later, far from the cause.
 * Industry data: native strict json_schema fails <0.1% of the time vs 5–10% for prompt-and-pray JSON,
 * and "a single retry with the error in context resolves most hard failures." This centralises that:
 * one loose extractor + Zod validation (both PURE and free to unit-test), plus an OPT-IN single repair
 * pass that re-prompts the model with the exact validation error. Repair is injected, never hardcoded to
 * a provider, so the pure path stays testable without any paid call.
 */

/**
 * Pull the most likely JSON payload out of a model response: strips ```json code fences and any prose
 * around it, then takes the span from the first opening bracket/brace to its matching last one. Handles
 * both object and array top-levels. Returns the original trimmed text if no bracket is found (so a bare
 * JSON value still parses).
 */
export function extractJson(text: string): string {
  const noFences = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  // Prefer whichever of { or [ appears first, a response may be an object or an array.
  const firstObj = noFences.indexOf("{");
  const firstArr = noFences.indexOf("[");
  const candidates = [firstObj, firstArr].filter((i) => i >= 0);
  if (candidates.length === 0) return noFences;
  const start = Math.min(...candidates);
  const open = noFences[start];
  const close = open === "{" ? "}" : "]";
  const end = noFences.lastIndexOf(close);
  return end > start ? noFences.slice(start, end + 1) : noFences;
}

export interface ParseResult<T> {
  ok: boolean;
  data?: T;
  /** A human/model-readable reason, safe to feed straight back into a repair prompt. */
  error?: string;
}

/**
 * PURE parse+validate: extract the JSON span, JSON.parse it, then validate against a Zod schema. Never
 * throws, returns `{ok:false, error}` so the caller decides whether to repair, default, or fail. This
 * is the free, unit-testable core; no LLM involved.
 */
export function parseStructured<T>(text: string, schema: z.ZodType<T>): ParseResult<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(extractJson(text));
  } catch (e) {
    return { ok: false, error: `output is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    // Compact, model-friendly error: path + message per issue, so a repair prompt can act on it.
    const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    return { ok: false, error: `output did not match the required shape: ${detail}` };
  }
  return { ok: true, data: parsed.data };
}

/**
 * parseStructured + ONE opt-in repair round. If the first parse fails and a `repair` function is given,
 * it is called once with the offending text + the validation error, and its output is re-parsed. A
 * single retry is deliberate, it clears the large majority of failures without turning one bad response
 * into an unbounded (and unbounded-cost) loop. With no `repair`, this is exactly `parseStructured`.
 */
export async function parseStructuredWithRepair<T>(
  text: string,
  schema: z.ZodType<T>,
  opts: { repair?: (badText: string, error: string) => Promise<string> } = {},
): Promise<ParseResult<T>> {
  const first = parseStructured(text, schema);
  if (first.ok || !opts.repair) return first;
  let repaired: string;
  try {
    repaired = await opts.repair(text, first.error ?? "invalid output");
  } catch (e) {
    return { ok: false, error: `repair attempt failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  const second = parseStructured(repaired, schema);
  // If the repair also failed, surface the ORIGINAL error, it's the more informative one.
  return second.ok ? second : { ok: false, error: first.error };
}

/** Build the standard repair instruction fed to a model when its structured output failed validation. */
export function repairInstruction(error: string): string {
  return [
    "Your previous response could not be used. Fix it and return ONLY the corrected JSON, no prose, no code fences.",
    `The problem was: ${error}`,
  ].join("\n");
}
