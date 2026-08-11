/**
 * WOBBLE house style for everything the OS WRITES.
 *
 * Distinct from `wobble-rules.ts`, which bans specific CLAIMS. This file governs how the writing
 * looks, and it exists for one commercial reason: WOBBLE sells AI services to real businesses, so
 * anything it hands a client that reads as machine-written undercuts the pitch. The em dash is the
 * single loudest tell, so it is banned outright, in reports, proposals, questions and emails alike.
 *
 * Two layers, because a prompt instruction alone is not reliable:
 *   1. HOUSE_STYLE_PROMPT is injected into generator system prompts.
 *   2. sanitizeHouseStyle() is a deterministic net applied to generated text before it is stored.
 */

/** Injected into every generator's system prompt. Kept short so it does not crowd the real task. */
export const HOUSE_STYLE_PROMPT = [
  "WRITING STYLE (WOBBLE house rules, non-negotiable):",
  "- NEVER use an em dash or an en dash in prose. Use a comma, a colon, brackets, or two sentences.",
  "  A hyphen inside a compound word (speed-to-lead) and a numeric range (45,000-50,000) are fine.",
  "- Write like a sharp operator talking to a business owner, not like a consultant deck.",
  "- Prefer concrete numbers over adjectives. No filler superlatives.",
].join("\n");

/**
 * Append the house rules to a generator's system prompt.
 *
 * Also sanitises the prompt itself, because a model mirrors the punctuation it is shown: prompts
 * written with em dashes produced reports full of them no matter what the instruction said.
 */
export function withHouseStyle(systemPrompt: string): string {
  return `${sanitizeHouseStyle(systemPrompt)}\n\n${HOUSE_STYLE_PROMPT}`;
}

/** Em dash and en dash. Kept as one place so the detector and the sanitiser can never disagree. */
const DASH_PATTERN = /\s*[—–]\s*/g;

/** True when text still contains a banned dash. Used by the eval assertion and by tests. */
export function containsBannedDash(text: string): boolean {
  return /[—–]/.test(text);
}

/**
 * Replace banned dashes with the punctuation a human would have used.
 *
 * An em dash almost always stands in for a comma, so ", " is the safe substitution. When the dash sits
 * at the very start of a line it is being used as a bullet, so a hyphen is what was meant. Numeric
 * ranges (a common en dash use, "45,000–50,000") become a hyphen rather than a comma, since "45,000,
 * 50,000" would read as two separate figures.
 */
export function sanitizeHouseStyle(text: string): string {
  if (!text) return text;
  return text
    // bullet at line start: "— point" -> "- point"
    .replace(/^[ \t]*[—–][ \t]*/gm, "- ")
    // numeric range: 45,000 – 50,000 -> 45,000-50,000
    .replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2")
    // everything else reads as a comma
    .replace(DASH_PATTERN, ", ")
    // a dash following punctuation would leave ",," or ".,"
    .replace(/([,;:])\s*,\s*/g, "$1 ")
    .replace(/([.!?])\s*,\s*/g, "$1 ");
}

/** Apply the sanitiser to every string in an object, recursively. Arrays and nesting preserved. */
export function sanitizeDeep<T>(value: T): T {
  if (typeof value === "string") return sanitizeHouseStyle(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => sanitizeDeep(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = sanitizeDeep(v);
    return out as T;
  }
  return value;
}
