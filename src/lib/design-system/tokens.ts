/**
 * WOBBLE brand design tokens — the single source of truth for every generated document.
 *
 * WHY this file exists: the three hand-rolled renderers it replaces each carried their own hex
 * codes and font stacks, and they had already drifted from the founder's real deck (they shipped
 * `#B6FF3B`; the actual brand lime is `#B8FF2C`). Every value below is lifted verbatim from the
 * founder's 30-slide proposal deck source, so a machine-generated proposal is indistinguishable
 * from one he built by hand. Renderers must NEVER hand-write a colour, a font stack or a font
 * size — they import from here. If a value is wrong, it is wrong in exactly one place.
 *
 * Nothing in this file touches the filesystem, the network or the DB. It is pure data + pure
 * string helpers so it can be imported from a route handler, a worker or a vitest run alike.
 */

// ---------------------------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------------------------

/**
 * The three shapes a WOBBLE document can take.
 * - `deck16x9`  — the present-ready stage deck (1920x1080), what the founder actually presents.
 * - `deckA4`    — the same slide language printed portrait, for a leave-behind PDF.
 * - `document`  — a flowing prose report (Letter portrait) with a running header + page footers.
 */
export type DocumentFormat = "deck16x9" | "deckA4" | "document";

export interface FormatSpec {
  readonly id: DocumentFormat;
  readonly label: string;
  /** Page box width in `pageUnit`. Drives both `@page{size:…}` and the on-screen page frame. */
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly pageUnit: "px" | "pt";
  readonly orientation: "landscape" | "portrait";
  /**
   * Display type (cover H1, section H2, ghost numerals) scales freely — a headline can shrink to
   * a third of its deck size and still read as a headline.
   */
  readonly displayRatio: number;
  /**
   * Body type scales on its own, gentler curve. WHY two ratios and not one: prose has a hard
   * legibility floor (~11px printed). Applying the display ratio to body copy would render an A4
   * card body at 9.9px and a document body at 9.7px — unreadable. Display type has no such floor,
   * so it keeps the aggressive ratio the brief specifies (~55% for A4).
   */
  readonly bodyRatio: number;
  /** Padding / gap ratio. A4 + document both sit at 0.6 → the 100px deck gutter becomes 60px. */
  readonly spaceRatio: number;
  /** How the composer frames each section: fixed stage, fixed page, or flowing prose block. */
  readonly flow: "stage" | "page" | "prose";
}

export const FORMATS: Readonly<Record<DocumentFormat, FormatSpec>> = {
  deck16x9: {
    id: "deck16x9",
    label: "Deck · 16:9",
    pageWidth: 1920,
    pageHeight: 1080,
    pageUnit: "px",
    orientation: "landscape",
    displayRatio: 1,
    bodyRatio: 1,
    spaceRatio: 1,
    flow: "stage",
  },
  deckA4: {
    id: "deckA4",
    label: "Deck · A4 portrait",
    pageWidth: 595,
    pageHeight: 842,
    pageUnit: "pt",
    orientation: "portrait",
    displayRatio: 0.55,
    bodyRatio: 0.62,
    spaceRatio: 0.6,
    flow: "page",
  },
  document: {
    id: "document",
    label: "Document · Letter portrait",
    pageWidth: 612,
    pageHeight: 792,
    pageUnit: "pt",
    orientation: "portrait",
    displayRatio: 0.42,
    bodyRatio: 0.68,
    spaceRatio: 0.6,
    flow: "prose",
  },
} as const;

/** `595pt`, `1920px` … — used for `@page{size:…}` and for the on-screen page frame. */
export function pageSizeCss(format: DocumentFormat): string {
  const spec = FORMATS[format];
  return `${spec.pageWidth}${spec.pageUnit} ${spec.pageHeight}${spec.pageUnit}`;
}

// ---------------------------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------------------------

export const COLORS = {
  /** Stage / page background. Everything is built on this near-black, never pure #000. */
  black: "#0A0A0A",
  /** The single brand accent. Trailing periods, eyebrows, numerals, inverted cards. */
  lime: "#B8FF2C",
  /** Card surface that sits on top of `black`. */
  cardSurface: "#141414",
  /** Link/hover lime — lighter so it reads as a state change on a dark field. */
  limeHover: "#d4ff7a",
  /** Text colour when the surface is lime. */
  onLime: "#0A0A0A",
  /** Secondary text on a lime surface. */
  mutedOnLime: "rgba(10,10,10,.72)",
  /** The A4 gallery backdrop behind the printed pages (screen only). */
  gallery: "#050505",
} as const;

/**
 * The text ladder on black. Six rungs, used in order: headline → lead → card body → meta.
 * Renderers pick a rung, never an arbitrary rgba().
 */
export const TEXT = {
  l1: "#fff",
  l2: "rgba(255,255,255,.72)",
  l3: "rgba(255,255,255,.7)",
  l4: "rgba(255,255,255,.62)",
  l5: "rgba(255,255,255,.5)",
  l6: "rgba(255,255,255,.45)",
} as const;

export const LINES = {
  /** Hairline between contents rows and card sets. */
  hairline: "rgba(255,255,255,.13)",
  /** Slightly stronger hairline used under the cover header and above the terms grid. */
  hairlineStrong: "rgba(255,255,255,.14)",
  /** The giant watermark numeral on a section divider. */
  ghostNumeral: "rgba(184,255,44,.07)",
  /** Lime tint panel: background + its border. Used for the contents CTA and quality callouts. */
  limeTintBg: "rgba(184,255,44,.07)",
  limeTintBorder: "rgba(184,255,44,.4)",
} as const;

/**
 * Every hex the brand is allowed to emit, lower-cased and expanded to 6 digits. `brand-qa` uses
 * this to catch a renderer that hard-coded an off-palette colour.
 */
export const ALLOWED_HEXES: readonly string[] = ["0a0a0a", "b8ff2c", "141414", "d4ff7a", "ffffff", "050505"];

// ---------------------------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------------------------

/**
 * Both faces are self-hosted from `public/fonts` (see `fontFaceCss`). WHY not the Fontshare CDN:
 * a generated document has to render with no network — it gets printed to PDF by headless
 * Chromium, emailed as a file, and opened offline by a client. A hotlinked webfont silently
 * falls back to Arial in exactly those moments.
 */
export const FONT_STACKS = {
  display: "'Satoshi','Segoe UI',system-ui,-apple-system,Helvetica,Arial,sans-serif",
  body: "'General Sans','Segoe UI',system-ui,-apple-system,Helvetica,Arial,sans-serif",
} as const;

export type FontRole = keyof typeof FONT_STACKS;

/** The woff2 files that must exist in `public/fonts/`. Downloaded from Fontshare (ITF free licence). */
export const FONT_FILES: readonly { readonly family: string; readonly weight: number; readonly file: string }[] = [
  { family: "Satoshi", weight: 400, file: "satoshi-400.woff2" },
  { family: "Satoshi", weight: 500, file: "satoshi-500.woff2" },
  { family: "Satoshi", weight: 700, file: "satoshi-700.woff2" },
  { family: "Satoshi", weight: 900, file: "satoshi-900.woff2" },
  { family: "General Sans", weight: 400, file: "general-sans-400.woff2" },
  { family: "General Sans", weight: 500, file: "general-sans-500.woff2" },
  { family: "General Sans", weight: 600, file: "general-sans-600.woff2" },
  { family: "General Sans", weight: 700, file: "general-sans-700.woff2" },
];

/**
 * Emits the self-hosted `@font-face` block.
 *
 * `baseHref` defaults to `/fonts`, which resolves when the document is served by the Next app.
 * When printing to PDF from a `file://` or `setContent` page, pass an absolute base (e.g.
 * `file:///C:/Wobble%20OS/public/fonts`) so Chromium can actually fetch the faces — otherwise the
 * fallback stack takes over and the PDF quietly ships in Segoe UI.
 */
export function fontFaceCss(baseHref = "/fonts"): string {
  const base = baseHref.replace(/\/+$/, "");
  return FONT_FILES.map(
    (f) =>
      `@font-face{font-family:'${f.family}';src:url('${base}/${f.file}') format('woff2');font-weight:${f.weight};font-style:normal;font-display:swap}`,
  ).join("");
}

export interface TypeStyle {
  /** Size in px measured at the 1920x1080 deck stage. Other formats scale it. */
  readonly size: number;
  readonly weight: number;
  readonly lineHeight: number;
  readonly letterSpacing?: string;
  readonly family: FontRole;
  /** Which per-format ratio applies. See `FormatSpec.displayRatio` for why there are two. */
  readonly scale: "display" | "body";
  readonly uppercase?: boolean;
}

/**
 * The type ladder, measured off the founder's deck at 1920x1080. Sizes that appear as a range in
 * the brand notes are pinned to the value the deck actually uses most often, with the variants
 * kept as their own entries (`eyebrowSmall` / `eyebrow` / `eyebrowLarge`).
 */
export const TYPE = {
  /** `wobble.` in the cover / approval corner. */
  wordmark: { size: 34, weight: 700, lineHeight: 1, letterSpacing: "-.02em", family: "body", scale: "display" },
  /** Cover headline — `PRO / POSAL.` */
  coverH1: { size: 290, weight: 900, lineHeight: 0.8, letterSpacing: "-.04em", family: "display", scale: "display" },
  /** Section-divider headline. The deck uses 120 for two-line titles, 132 for short ones. */
  sectionH2: { size: 120, weight: 900, lineHeight: 0.92, letterSpacing: "-.03em", family: "display", scale: "display" },
  sectionH2Short: { size: 132, weight: 900, lineHeight: 0.92, letterSpacing: "-.03em", family: "display", scale: "display" },
  /** The full-lime statement slide. */
  statementH2: { size: 100, weight: 900, lineHeight: 0.98, letterSpacing: "-.03em", family: "display", scale: "display" },
  contentsH2: { size: 84, weight: 900, lineHeight: 1, letterSpacing: "-.03em", family: "display", scale: "display" },
  /** Every ordinary slide headline. */
  slideH2: { size: 62, weight: 900, lineHeight: 1, letterSpacing: "-.02em", family: "display", scale: "display" },
  /** The investment figure. Deliberately enormous — it is the one number that matters. */
  amount: { size: 200, weight: 900, lineHeight: 0.86, letterSpacing: "-.04em", family: "display", scale: "display" },
  amountSplit: { size: 36, weight: 900, lineHeight: 1.1, family: "display", scale: "body" },
  /** The watermark numeral behind a section divider. */
  ghostNumeral: { size: 560, weight: 900, lineHeight: 0.7, letterSpacing: "-.04em", family: "display", scale: "display" },
  /** The numeral inside a card in a card set. */
  cardNumeral: { size: 34, weight: 900, lineHeight: 1, family: "display", scale: "body" },
  /** The oversized numeral in a system-diagram node. */
  nodeNumeral: { size: 56, weight: 900, lineHeight: 0.9, family: "display", scale: "body" },
  /** The half-ghosted numeral inside a timeline column. */
  timelineNumeral: { size: 130, weight: 900, lineHeight: 0.7, letterSpacing: "-.04em", family: "display", scale: "display" },
  timelineTitle: { size: 28, weight: 900, lineHeight: 1.05, family: "display", scale: "body" },
  /** Lead paragraph under a section-divider headline. */
  lead: { size: 27, weight: 500, lineHeight: 1.5, family: "body", scale: "body" },
  bodyLarge: { size: 26, weight: 500, lineHeight: 1.5, family: "body", scale: "body" },
  body: { size: 23, weight: 500, lineHeight: 1.5, family: "body", scale: "body" },
  bodyMuted: { size: 20, weight: 400, lineHeight: 1.4, family: "body", scale: "body" },
  cardTitle: { size: 23, weight: 600, lineHeight: 1.2, family: "body", scale: "body" },
  /** Card copy sits at the .62 rung — see `TEXT.l4`. */
  cardBody: { size: 18, weight: 400, lineHeight: 1.5, family: "body", scale: "body" },
  /** Section eyebrow — `SECTION 01 · EXECUTIVE OVERVIEW`. */
  eyebrow: { size: 18, weight: 600, lineHeight: 1.2, letterSpacing: ".26em", family: "body", scale: "body", uppercase: true },
  eyebrowLarge: { size: 21, weight: 600, lineHeight: 1.2, letterSpacing: ".28em", family: "body", scale: "body", uppercase: true },
  eyebrowSmall: { size: 15, weight: 600, lineHeight: 1.4, letterSpacing: ".2em", family: "body", scale: "body", uppercase: true },
  /** Small uppercase label inside a panel (`CURRENT BUSINESS CONSTRAINTS`). */
  panelLabel: { size: 16, weight: 600, lineHeight: 1.3, letterSpacing: ".16em", family: "body", scale: "body", uppercase: true },
  contentsRow: { size: 25, weight: 500, lineHeight: 1.2, family: "body", scale: "body" },
  contentsNumeral: { size: 23, weight: 900, lineHeight: 1.2, family: "display", scale: "body" },
  tableCell: { size: 18, weight: 400, lineHeight: 1.35, family: "body", scale: "body" },
  tableHead: { size: 16, weight: 600, lineHeight: 1.3, letterSpacing: ".14em", family: "body", scale: "body", uppercase: true },
} as const satisfies Record<string, TypeStyle>;

export type TypeToken = keyof typeof TYPE;

/** The px size a token renders at in a given format, rounded to 0.1px to keep CSS tidy. */
export function scaleFontSize(style: TypeStyle, format: DocumentFormat): number {
  const spec = FORMATS[format];
  const ratio = style.scale === "display" ? spec.displayRatio : spec.bodyRatio;
  return Math.round(style.size * ratio * 10) / 10;
}

/** A type token rendered as an inline CSS declaration list (no selector, no braces). */
export function typeCss(style: TypeStyle, format: DocumentFormat): string {
  const out = [
    `font-family:${FONT_STACKS[style.family]}`,
    `font-weight:${style.weight}`,
    `font-size:${scaleFontSize(style, format)}px`,
    `line-height:${style.lineHeight}`,
  ];
  if (style.letterSpacing) out.push(`letter-spacing:${style.letterSpacing}`);
  if (style.uppercase) out.push("text-transform:uppercase");
  return `${out.join(";")};`;
}

// ---------------------------------------------------------------------------------------------
// Space + surfaces
// ---------------------------------------------------------------------------------------------

export const LAYOUT = {
  /** Stage padding measured on the deck: 78px vertical on dense slides, 88px on dividers. */
  stagePaddingY: 78,
  stagePaddingYWide: 88,
  stagePaddingX: 100,
  /** Card set: dark surface, 3px lime rule on top, generous inner padding. */
  cardPaddingY: 28,
  cardPaddingX: 24,
  cardRuleWidth: 3,
  /** Contents index rows. */
  contentsRowPaddingY: 13,
  contentsRowGap: 26,
  contentsNumeralWidth: 44,
  /** Default gutters between cards / columns. */
  gridGap: 20,
  columnGap: 44,
} as const;

/** Scale a deck-measured spacing value into the target format, rounded to whole px. */
export function space(value: number, format: DocumentFormat): number {
  return Math.round(value * FORMATS[format].spaceRatio);
}

/** The card surface as an inline declaration list. `accent` toggles the lime top rule. */
export function cardCss(format: DocumentFormat, options?: { rule?: boolean; inverted?: boolean }): string {
  const rule = options?.rule ?? true;
  const inverted = options?.inverted ?? false;
  const pad = `${space(LAYOUT.cardPaddingY, format)}px ${space(LAYOUT.cardPaddingX, format)}px`;
  if (inverted) return `background:${COLORS.lime};color:${COLORS.onLime};padding:${pad};`;
  return `background:${COLORS.cardSurface};${rule ? `border-top:${LAYOUT.cardRuleWidth}px solid ${COLORS.lime};` : ""}padding:${pad};`;
}

/** The contents-row rule + rhythm as an inline declaration list. */
export function contentsRowCss(format: DocumentFormat): string {
  return `display:flex;gap:${space(LAYOUT.contentsRowGap, format)}px;align-items:baseline;padding:${space(
    LAYOUT.contentsRowPaddingY,
    format,
  )}px 0;border-top:1px solid ${LINES.hairline};`;
}
