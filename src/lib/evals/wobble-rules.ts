/**
 * WOBBLE-specific reusable eval assertions.
 * =========================================
 *
 * These are the brand guardrails, expressed as deterministic assertions the eval
 * harness can run for free in CI. They encode the "what not to say" rules that
 * WOBBLE's own strategy doc already locks down.
 *
 * SOURCE OF TRUTH: docs/WOBBLE_COMPANY_OS.md
 *   - Section 20 "What Not To Say Yet"      -> the core forbidden claims list
 *   - Section 16.3 (labor cost)             -> "Do not promise 'fire your team'"
 *   - Section 5.4 / 11 (payment boundary)   -> "AI can prepare the paperwork. Humans approve the money."
 *
 * We HARDCODE the list here (rather than parsing the markdown at runtime) because:
 *   1. the deterministic tier must have zero I/O — no reading files during a CI check;
 *   2. the doc is prose, so a parser would be brittle and could silently drop a rule.
 * The tradeoff is that this list must be kept in sync with the doc by hand. When the
 * doc's section 20 changes, update WOBBLE_FORBIDDEN_PHRASES below.
 */

import type { Assertion } from "./harness";

/** Escape a literal phrase so it can be embedded in a RegExp safely. */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Phrases WOBBLE must never emit in content, proposals, or answers.
 * Curated from docs/WOBBLE_COMPANY_OS.md §20 (+ §16.3 and §5.4). Matched
 * case-insensitively as substrings, so "We Work With Everyone" is caught too.
 */
export const WOBBLE_FORBIDDEN_PHRASES: readonly string[] = [
  // §20 "What Not To Say Yet"
  "we are a saas company",
  "we work with everyone",
  "we fully replace your employees",
  "we automate everything",
  "we monetize client data",
  "monetize client data",
  "guaranteed results in 30 days",
  "no human needed",
  "ai will handle your payments",
  "all agencies are scammers",
  // §16.3 labor-cost framing — never promise headcount cuts
  "fire your team",
  // §5.4 / §11 payment boundary — AI must never be positioned as moving money
  "ai sending money",
  "ai approving payments",
  "ai moving funds",
];

/** Build a case-insensitive substring RegExp for a forbidden phrase. */
export function forbiddenPhraseMatcher(phrase: string): RegExp {
  return new RegExp(escapeRegExp(phrase), "i");
}

/** Return the forbidden-phrase list (defensively copied so callers can't mutate it). */
export function forbiddenPhrases(): string[] {
  return [...WOBBLE_FORBIDDEN_PHRASES];
}

/**
 * One `must_not_include` assertion per forbidden phrase. Per-phrase (rather than one
 * big regex) so a failure message names exactly which banned claim slipped through.
 * Drop these into any content/proposal/answer eval case.
 */
export function brandAssertions(): Assertion[] {
  return WOBBLE_FORBIDDEN_PHRASES.map((phrase) => ({
    kind: "must_not_include" as const,
    value: forbiddenPhraseMatcher(phrase),
    label: `brand:forbidden("${phrase}")`,
  }));
}

/**
 * Citation assertion matching the shape Ask WOBBLE emits: inline bracketed numbers
 * like `[1]`, `[12]` (see src/lib/domain/ask.ts -> buildEvidenceBlock, which numbers
 * evidence `[1] (memory:...)`, `[2] (source:...)` and instructs the model to
 * "cite serious claims by their [n]"). Requires at least `min` citation tokens.
 */
export function citationAssertion(min = 1): Assertion {
  return {
    kind: "must_cite",
    min,
    pattern: /\[\d+\]/g,
    label: `ask:citations(>=${min})`,
  };
}

/**
 * Payment-boundary assertion (§5.4 / §11): finance-adjacent output must keep humans
 * in the loop on money. Convenience wrapper — pairs well with brandAssertions().
 */
export function humanApprovesMoneyAssertion(): Assertion {
  return {
    kind: "must_include",
    value: /human/i,
    label: "brand:humans-approve-the-money",
  };
}
