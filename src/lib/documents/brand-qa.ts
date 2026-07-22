/**
 * Brand QA — a pure validator over a `WobbleDocument` plus its rendered HTML.
 *
 * WHY it exists: these documents are assembled by agents from CRM fields and LLM output, and the
 * failure mode is not a crash — it is a beautiful, on-brand deck that quietly puts the price on
 * slide three, drops the trailing period off the cover, or slips a `#ff0000` into a card because
 * a model hallucinated an inline style. Those are review findings, not exceptions.
 *
 * It is deliberately NOT wired as a hard gate yet: the first job is to measure how often real
 * documents violate the grammar. Wire it into the QA gate once the violation rate is known.
 *
 * Pure: no DB, no fetch, no fs.
 */

import { ALLOWED_HEXES } from "@/lib/design-system/tokens";
import { eyebrowText } from "@/lib/design-system/archetypes";
import { COMMERCIAL_SECTION_TYPES, type DocumentSection, type WobbleDocument } from "./index";

export type BrandViolationSeverity = "error" | "warning";

export interface BrandViolation {
  /** Stable machine code so a dashboard can trend violations without string-matching messages. */
  readonly code:
    | "OFF_PALETTE_COLOR"
    | "MISSING_EYEBROW"
    | "COMMERCIALS_NOT_LAST"
    | "TITLE_MISSING_TRAILING_PERIOD"
    | "EMPTY_REQUIRED_FIELD"
    | "EMPTY_SECTION"
    | "INVOICE_HAS_SLIDES";
  readonly severity: BrandViolationSeverity;
  readonly message: string;
  /** Where it was found — a section index, a field path, or `html`. */
  readonly where?: string;
}

export interface BrandQaResult {
  readonly ok: boolean;
  readonly violations: readonly BrandViolation[];
}

/**
 * Archetypes whose big titles carry the brand's trailing period (`PROPOSAL.` `Contents.`
 * `Executive Overview.`). Ordinary slide H2s in the founder's deck have no period, so they are
 * deliberately excluded.
 */
const TRAILING_PERIOD_ARCHETYPES: readonly DocumentSection["type"][] = ["cover", "contents", "sectionDivider", "approval", "statement"];

/** Sections that must carry an eyebrow. `contents` is exempt — the founder's index has none. */
const EYEBROW_EXEMPT: readonly DocumentSection["type"][] = ["contents"];

/** `#B8FF2C` / `#fff` → `b8ff2c` / `ffffff`. Returns null for anything that is not a 3/6-digit hex. */
function normalizeHex(raw: string): string | null {
  const hex = raw.replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(hex)) return hex.split("").map((c) => c + c).join("");
  if (/^[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^[0-9a-f]{8}$/.test(hex)) return hex.slice(0, 6);
  return null;
}

function sectionTitle(section: DocumentSection): string | undefined {
  return "title" in section && typeof section.title === "string" ? section.title : undefined;
}

function sectionHasEyebrow(section: DocumentSection): boolean {
  if (!("eyebrow" in section)) return false;
  const value = (section as { eyebrow?: string | readonly string[] }).eyebrow;
  if (value === undefined) return false;
  return eyebrowText(value).trim().length > 0;
}

/**
 * Validate a document + its rendered HTML.
 *
 * `html` is optional so the model alone can be checked before rendering (useful in an authoring
 * loop); the off-palette scan simply does not run without it.
 */
export function runBrandQa(doc: WobbleDocument, html?: string): BrandQaResult {
  const violations: BrandViolation[] = [];
  const push = (v: BrandViolation): void => {
    violations.push(v);
  };

  // ---- required fields -----------------------------------------------------------------------
  if (!doc.client || !doc.client.trim()) {
    push({ code: "EMPTY_REQUIRED_FIELD", severity: "error", message: "Document has no client name.", where: "client" });
  }
  if (!doc.title || !doc.title.trim()) {
    push({ code: "EMPTY_REQUIRED_FIELD", severity: "error", message: "Document has no title.", where: "title" });
  }
  const sections = doc.sections ?? [];
  if (doc.kind !== "invoice" && sections.length === 0) {
    push({ code: "EMPTY_SECTION", severity: "error", message: "Document has no sections.", where: "sections" });
  }

  // ---- brand grammar on the document title ---------------------------------------------------
  if (doc.title && !/\.\s*$/.test(doc.title) && doc.kind !== "invoice") {
    push({
      code: "TITLE_MISSING_TRAILING_PERIOD",
      severity: "warning",
      message: `Document title "${doc.title}" is missing the trailing period. WOBBLE titles read "${doc.title}."`,
      where: "title",
    });
  }

  // ---- per-section checks --------------------------------------------------------------------
  sections.forEach((section, index) => {
    const where = `sections[${index}] (${section.type})`;
    if (!EYEBROW_EXEMPT.includes(section.type) && !sectionHasEyebrow(section)) {
      push({
        code: "MISSING_EYEBROW",
        severity: "warning",
        message: `Section "${sectionTitle(section) ?? section.type}" has no eyebrow. WOBBLE sections are labelled "SECTION 01 · TOPIC".`,
        where,
      });
    }
    const title = sectionTitle(section);
    if (TRAILING_PERIOD_ARCHETYPES.includes(section.type) && title && !/\.\s*$/.test(title)) {
      push({
        code: "TITLE_MISSING_TRAILING_PERIOD",
        severity: "warning",
        message: `"${title}" is missing the trailing period this archetype carries.`,
        where,
      });
    }
    if (title !== undefined && !title.trim()) {
      push({ code: "EMPTY_REQUIRED_FIELD", severity: "error", message: "Section title is empty.", where });
    }
  });

  // ---- commercials must be last ---------------------------------------------------------------
  const commercialIndexes = sections.reduce<number[]>((acc, s, i) => {
    if (COMMERCIAL_SECTION_TYPES.includes(s.type)) acc.push(i);
    return acc;
  }, []);
  if (commercialIndexes.length > 0) {
    // They must occupy the final N slots, in order.
    const expectedStart = sections.length - commercialIndexes.length;
    const atEnd = commercialIndexes.every((idx, k) => idx === expectedStart + k);
    if (!atEnd) {
      push({
        code: "COMMERCIALS_NOT_LAST",
        severity: "warning",
        message:
          "Commercial sections are not at the end of `sections`. The composer hoists them, but the " +
          "authored order should already read business value first, price last.",
        where: `sections[${commercialIndexes[0]}]`,
      });
    }
  }

  // ---- invoices are documents, not decks -------------------------------------------------------
  if (doc.kind === "invoice" && sections.length > 0) {
    push({
      code: "INVOICE_HAS_SLIDES",
      severity: "warning",
      message: `Invoice carries ${sections.length} slide section(s). Invoices render as a document; these are ignored.`,
      where: "sections",
    });
  }

  // ---- off-palette colours in the rendered HTML -------------------------------------------------
  if (html) {
    const seen = new Set<string>();
    for (const match of html.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      const hex = normalizeHex(match[0]);
      if (!hex || ALLOWED_HEXES.includes(hex) || seen.has(hex)) continue;
      seen.add(hex);
      push({
        code: "OFF_PALETTE_COLOR",
        severity: "error",
        message: `Off-palette colour ${match[0]} in the rendered HTML. Use the tokens in src/lib/design-system/tokens.ts.`,
        where: "html",
      });
    }
    // The commercial block must render after the body. Compare document order in the output.
    const investmentAt = html.indexOf('data-archetype="investment"');
    const lastBodyAt = Math.max(
      html.lastIndexOf('data-archetype="cardGrid"'),
      html.lastIndexOf('data-archetype="timeline"'),
      html.lastIndexOf('data-archetype="sectionDivider"'),
      html.lastIndexOf('data-archetype="whatsIncluded"'),
    );
    if (investmentAt !== -1 && lastBodyAt !== -1 && investmentAt < lastBodyAt) {
      push({
        code: "COMMERCIALS_NOT_LAST",
        severity: "error",
        message: "Rendered HTML places the investment block before body content.",
        where: "html",
      });
    }
  }

  return { ok: violations.every((v) => v.severity !== "error"), violations };
}
