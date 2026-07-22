/**
 * The 15 WOBBLE section archetypes — one pure function each, all format-aware.
 *
 * WHY archetypes and not free-form slides: the founder's 30-slide deck is not 30 unique designs,
 * it is 15 repeating shapes filled with different content. Encoding those shapes once means a
 * generated proposal, audit or pitch inherits the brand grammar automatically:
 *
 *   - a trailing LIME period on the big titles (`PROPOSAL.` `Contents.` `Executive Overview.`)
 *   - eyebrows joined with ` · ` (`SECTION 01 · EXECUTIVE OVERVIEW`)
 *   - two-digit numerals (`01 02 03…`)
 *   - the LAST card in a card set inverted to lime for emphasis
 *   - a giant ghost numeral watermark on every section divider
 *
 * Every function is `(props, format) => string`. They never read the DB, never fetch, never
 * mutate. Format-awareness is handled by scaling the ONE type ladder in `tokens.ts` rather than
 * by duplicating markup — so a fix to the card layout fixes it in all three formats at once.
 *
 * Markup contract: every archetype emits exactly one `<section class="wob-stage"
 * data-archetype="…" data-label="…">`. The composer in `src/lib/documents/index.ts` wraps that
 * section in the right page frame; `brand-qa.ts` and the deck nav script key off those attributes.
 */

import {
  COLORS,
  FORMATS,
  LAYOUT,
  LINES,
  TEXT,
  TYPE,
  type DocumentFormat,
  type TypeStyle,
  cardCss,
  contentsRowCss,
  space,
  typeCss,
} from "./tokens";

// ---------------------------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------------------------

/**
 * HTML-escape. Every caller-supplied string goes through this — these documents are generated
 * from LLM output and client-typed CRM fields, so a stray `<` must never become markup.
 */
export function esc(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

/** An eyebrow is either already a string, or the parts we join with the brand's ` · ` separator. */
export type EyebrowValue = string | readonly string[];

export function eyebrowText(value: EyebrowValue): string {
  return Array.isArray(value) ? value.filter(Boolean).join(" · ") : String(value ?? "");
}

/** `1` → `01`, `12` → `12`, `"→"` → `"→"`. Numerals in this brand are always two digits. */
export function twoDigit(value: number | string): string {
  if (typeof value === "number") return value < 10 && value >= 0 ? `0${value}` : String(value);
  return /^\d$/.test(value) ? `0${value}` : value;
}

/**
 * Renders a headline with the brand's trailing lime period.
 *
 * WHY it appends rather than requires: the period is grammar, not content — an author writing
 * "Executive Overview" should still get "Executive Overview." on the page. `brand-qa.ts` checks
 * the *model* for the missing period so authors still get told, but the rendered artefact is
 * never off-brand because someone forgot to type a full stop.
 *
 * `lines` lets a cover break `PRO / POSAL.` across two lines the way the deck does.
 */
export function brandTitle(title: string, accent: string, lines?: readonly string[]): string {
  const parts = lines && lines.length > 0 ? [...lines] : [title];
  const last = parts[parts.length - 1] ?? "";
  const stem = last.replace(/\.\s*$/, "");
  const head = parts.slice(0, -1).map(esc).join("<br>");
  return `${head ? `${head}<br>` : ""}${esc(stem)}<span style="color:${accent}">.</span>`;
}

function eyebrowHtml(value: EyebrowValue, format: DocumentFormat, color: string, style: TypeStyle = TYPE.eyebrow): string {
  const text = eyebrowText(value);
  if (!text) return "";
  return `<div class="wob-eyebrow" style="${typeCss(style, format)}color:${color};margin-bottom:${space(12, format)}px;">${esc(text)}</div>`;
}

interface StageOptions {
  readonly label: string;
  readonly archetype: string;
  readonly background?: string;
  readonly color?: string;
  readonly paddingY?: number;
  readonly paddingX?: number;
  /** Section dividers and covers centre their content block vertically. */
  readonly center?: boolean;
}

/**
 * The stage wrapper every archetype shares.
 *
 * In `deck16x9` / `deckA4` it fills the fixed page frame the composer supplies. In `document`
 * flow it takes its natural height so prose can run long — that is the whole difference between
 * a slide and a report, and it is one branch instead of a second set of renderers.
 */
function stage(format: DocumentFormat, opts: StageOptions, inner: string): string {
  const prose = FORMATS[format].flow === "prose";
  const fill = prose ? "width:100%;" : "width:100%;height:100%;";
  const py = space(opts.paddingY ?? LAYOUT.stagePaddingY, format);
  const px = space(opts.paddingX ?? LAYOUT.stagePaddingX, format);
  const justify = opts.center && !prose ? "justify-content:center;" : "";
  return (
    `<section class="wob-stage" data-archetype="${esc(opts.archetype)}" data-label="${esc(opts.label)}"` +
    ` style="${fill}box-sizing:border-box;background:${opts.background ?? COLORS.black};` +
    `color:${opts.color ?? TEXT.l1};padding:${py}px ${px}px;display:flex;flex-direction:column;` +
    `${justify}position:relative;overflow:hidden;">${inner}</section>`
  );
}

/**
 * Display type in this brand is set enormous (a 290px cover H1). That is beautiful for `PROPOSAL.`
 * and catastrophic for `Northgate Orthodontic Partners`. Rather than let a long client name bleed
 * off the stage, we shrink the headline proportionally once it passes a comfortable character
 * count — the same judgement a designer makes by hand, applied deterministically.
 *
 * Returns a `font-size` declaration that OVERRIDES the one `typeCss` already emitted (later
 * declaration wins), so callers append it rather than replacing the token.
 */
function fitDisplaySize(style: TypeStyle, format: DocumentFormat, lines: readonly string[], comfortable: number): string {
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  if (longest <= comfortable) return "";
  const shrink = Math.max(0.3, comfortable / longest);
  const base = style.size * (style.scale === "display" ? FORMATS[format].displayRatio : FORMATS[format].bodyRatio);
  return `font-size:${Math.round(base * shrink * 10) / 10}px;`;
}

/** Grid column count, clamped per format. A 5-up card row is unreadable on a Letter page. */
function columnsFor(count: number, format: DocumentFormat, preferred?: number): number {
  const wanted = Math.max(1, preferred ?? Math.min(count, 4));
  if (format === "deck16x9") return wanted;
  if (format === "deckA4") return Math.min(wanted, 3);
  return Math.min(wanted, 2);
}

function grid(format: DocumentFormat, columns: number, gap: number, inner: string, grow = true): string {
  return `<div style="display:grid;grid-template-columns:repeat(${columns},1fr);gap:${space(gap, format)}px;${grow && FORMATS[format].flow !== "prose" ? "flex:1;" : ""}">${inner}</div>`;
}

/** The slide headline used by every non-divider archetype. No lime period — the deck has none. */
function slideHeading(title: string, format: DocumentFormat, marginBottom = 34): string {
  return `<h2 style="margin:0 0 ${space(marginBottom, format)}px;${typeCss(TYPE.slideH2, format)}">${esc(title)}</h2>`;
}

function leadParagraph(text: string | undefined, format: DocumentFormat, color: string = TEXT.l3): string {
  if (!text) return "";
  return `<p style="margin:${space(34, format)}px 0 0;max-width:960px;${typeCss(TYPE.lead, format)}color:${color};">${esc(text)}</p>`;
}

// ---------------------------------------------------------------------------------------------
// 01 · Cover
// ---------------------------------------------------------------------------------------------

export interface CoverProps {
  readonly wordmark?: string;
  readonly eyebrow: EyebrowValue;
  readonly title: string;
  /** Optional manual line breaks for the giant H1, e.g. `["PRO", "POSAL."]`. */
  readonly titleLines?: readonly string[];
  readonly subtitle?: string;
  /** Top-right stack, e.g. `["Strategic Proposal · July 2026", "Confidential · Board of Directors"]`. */
  readonly metaRight?: readonly string[];
  readonly footerRight?: readonly string[];
}

export function renderCover(props: CoverProps, format: DocumentFormat): string {
  const wordmark = props.wordmark ?? "wobble";
  const meta = (props.metaRight ?? []).map((line, i) =>
    i === 0 ? esc(line) : `<span style="color:${COLORS.lime}">${esc(line)}</span>`,
  );
  const header =
    `<div style="display:flex;justify-content:space-between;align-items:flex-start;">` +
    `<div style="${typeCss(TYPE.wordmark, format)}">${esc(wordmark)}<span style="color:${COLORS.lime}">.</span></div>` +
    (meta.length
      ? `<div style="text-align:right;${typeCss(TYPE.eyebrowSmall, format)}color:${TEXT.l5};line-height:2;">${meta.join("<br>")}</div>`
      : "") +
    `</div>`;

  const titleLines = props.titleLines && props.titleLines.length > 0 ? props.titleLines : [props.title];
  const headline =
    `<div style="margin-top:auto;">` +
    eyebrowHtml(props.eyebrow, format, COLORS.lime, TYPE.eyebrowLarge) +
    `<h1 style="margin:0;${typeCss(TYPE.coverH1, format)}${fitDisplaySize(TYPE.coverH1, format, titleLines, 9)}">` +
    `${brandTitle(props.title, COLORS.lime, props.titleLines)}</h1>` +
    `</div>`;

  const footer =
    `<div style="margin-top:${space(52, format)}px;display:flex;justify-content:space-between;align-items:flex-end;` +
    `border-top:1px solid ${LINES.hairlineStrong};padding-top:${space(26, format)}px;gap:${space(40, format)}px;">` +
    (props.subtitle
      ? `<div style="max-width:920px;${typeCss(TYPE.body, format)}color:${TEXT.l2};">${esc(props.subtitle)}</div>`
      : "<div></div>") +
    ((props.footerRight ?? []).length
      ? `<div style="${typeCss(TYPE.eyebrowSmall, format)}color:${TEXT.l6};text-align:right;">${(props.footerRight ?? []).map(esc).join("<br>")}</div>`
      : "") +
    `</div>`;

  return stage(
    format,
    { label: "Cover", archetype: "cover", paddingY: 80 },
    `${header}${headline}${footer}`,
  );
}

// ---------------------------------------------------------------------------------------------
// 02 · Statement (full-lime)
// ---------------------------------------------------------------------------------------------

export interface StatementProps {
  readonly eyebrow: EyebrowValue;
  readonly title: string;
  /** One or two supporting columns beneath the black rule. */
  readonly columns?: readonly string[];
}

export function renderStatement(props: StatementProps, format: DocumentFormat): string {
  const cols = props.columns ?? [];
  const support = cols.length
    ? `<div style="display:grid;grid-template-columns:repeat(${columnsFor(cols.length, format, cols.length)},1fr);` +
      `gap:${space(60, format)}px;border-top:2px solid ${COLORS.onLime};padding-top:${space(32, format)}px;">` +
      cols.map((c) => `<div style="${typeCss(TYPE.bodyLarge, format)}">${esc(c)}</div>`).join("") +
      `</div>`
    : "";
  return stage(
    format,
    { label: "Statement", archetype: "statement", background: COLORS.lime, color: COLORS.onLime, paddingY: LAYOUT.stagePaddingYWide },
    `${eyebrowHtml(props.eyebrow, format, COLORS.onLime, TYPE.eyebrow)}` +
      // `padding-bottom` (not margin) so the 0.98 line-height descenders never collide with the
      // black rule the support columns hang from — visible in prose flow, where `margin:auto`
      // collapses to nothing.
      `<div style="margin:auto 0;padding-bottom:${space(30, format)}px;"><h2 style="margin:0;${typeCss(TYPE.statementH2, format)}` +
      `${fitDisplaySize(TYPE.statementH2, format, [props.title], 70)}max-width:1520px;">${brandTitle(props.title, COLORS.onLime)}</h2></div>` +
      support,
  );
}

// ---------------------------------------------------------------------------------------------
// 03 · Contents
// ---------------------------------------------------------------------------------------------

export interface ContentsItem {
  readonly label: string;
  /** Optional page reference, printed right-aligned (A4 / document only carry real page numbers). */
  readonly page?: string;
}

export interface ContentsProps {
  readonly eyebrow?: EyebrowValue;
  readonly title?: string;
  readonly note?: string;
  readonly items: readonly ContentsItem[];
  /** The final, highlighted row. The brand always closes the index with the decision step. */
  readonly cta?: { readonly label: string; readonly marker?: string };
}

export function renderContents(props: ContentsProps, format: DocumentFormat): string {
  const title = props.title ?? "Contents";
  const items = props.items ?? [];
  const rowsPerColumn = Math.ceil(items.length / 2);
  const split = format === "deck16x9" || format === "deckA4";

  const row = (item: ContentsItem, index: number): string =>
    `<div style="${contentsRowCss(format)}">` +
    `<span style="${typeCss(TYPE.contentsNumeral, format)}color:${COLORS.lime};width:${space(LAYOUT.contentsNumeralWidth, format)}px;flex:none;">${twoDigit(index + 1)}</span>` +
    `<span style="${typeCss(TYPE.contentsRow, format)}">${esc(item.label)}</span>` +
    (item.page
      ? `<span style="margin-left:auto;${typeCss(TYPE.contentsNumeral, format)}color:${TEXT.l6};">${esc(item.page)}</span>`
      : "") +
    `</div>`;

  const ctaRow = props.cta
    ? `<div class="wob-contents-cta" style="${contentsRowCss(format)}margin-top:auto;border-top:1px solid ${LINES.limeTintBorder};` +
      `border-bottom:1px solid ${LINES.limeTintBorder};background:${LINES.limeTintBg};">` +
      `<span style="${typeCss(TYPE.contentsNumeral, format)}color:${COLORS.lime};width:${space(LAYOUT.contentsNumeralWidth, format)}px;flex:none;">${esc(props.cta.marker ?? "→")}</span>` +
      `<span style="${typeCss(TYPE.contentsRow, format)}font-weight:600;color:${COLORS.lime};">${esc(props.cta.label)}</span>` +
      `</div>`
    : "";

  const left = items.slice(0, split ? rowsPerColumn : items.length).map(row).join("");
  const right = split ? items.slice(rowsPerColumn).map((it, i) => row(it, i + rowsPerColumn)).join("") : "";

  const header =
    `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:${space(34, format)}px;gap:${space(30, format)}px;">` +
    `<h2 style="margin:0;${typeCss(TYPE.contentsH2, format)}">${brandTitle(title, COLORS.lime)}</h2>` +
    (props.note ? `<div style="${typeCss(TYPE.eyebrowSmall, format)}color:${TEXT.l6};">${esc(props.note)}</div>` : "") +
    `</div>`;

  const body = split
    ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 ${space(90, format)}px;flex:1;">` +
      `<div style="display:flex;flex-direction:column;">${left}</div>` +
      `<div style="display:flex;flex-direction:column;">${right}${ctaRow}</div>` +
      `</div>`
    : `<div style="display:flex;flex-direction:column;">${left}${ctaRow}</div>`;

  return stage(
    format,
    { label: "Contents", archetype: "contents", paddingY: 80 },
    `${props.eyebrow ? eyebrowHtml(props.eyebrow, format, COLORS.lime) : ""}${header}${body}`,
  );
}

// ---------------------------------------------------------------------------------------------
// 04 · Section divider
// ---------------------------------------------------------------------------------------------

export interface SectionDividerProps {
  readonly eyebrow: EyebrowValue;
  readonly title: string;
  readonly titleLines?: readonly string[];
  /** The watermark numeral. Rendered two-digit at .07 lime. */
  readonly numeral: number | string;
  readonly lead?: string;
  /** Flip to a full-lime divider — the deck does this once, for the future-state section. */
  readonly inverted?: boolean;
}

export function renderSectionDivider(props: SectionDividerProps, format: DocumentFormat): string {
  const inverted = props.inverted ?? false;
  const accent = inverted ? COLORS.onLime : COLORS.lime;
  const watermark = inverted ? "rgba(10,10,10,.08)" : LINES.ghostNumeral;
  const headline = props.titleLines && props.titleLines.length > 1 ? TYPE.sectionH2 : TYPE.sectionH2Short;

  const ghost =
    `<div class="wob-ghost-numeral" aria-hidden="true" style="position:absolute;right:${space(20, format)}px;top:50%;` +
    `transform:translateY(-50%);${typeCss(TYPE.ghostNumeral, format)}color:${watermark};pointer-events:none;">${esc(twoDigit(props.numeral))}</div>`;

  const headlineLines = props.titleLines && props.titleLines.length > 0 ? props.titleLines : [props.title];
  const block =
    `<div style="position:relative;z-index:1;">` +
    eyebrowHtml(props.eyebrow, format, accent, TYPE.eyebrowLarge) +
    `<h2 style="margin:0;${typeCss(headline, format)}${fitDisplaySize(headline, format, headlineLines, 20)}">` +
    `${brandTitle(props.title, accent, props.titleLines)}</h2>` +
    leadParagraph(props.lead, format, inverted ? COLORS.mutedOnLime : TEXT.l3) +
    `</div>`;

  return stage(
    format,
    {
      label: `${twoDigit(props.numeral)} · ${props.title}`,
      archetype: "sectionDivider",
      paddingY: LAYOUT.stagePaddingYWide,
      center: true,
      background: inverted ? COLORS.lime : COLORS.black,
      color: inverted ? COLORS.onLime : TEXT.l1,
    },
    `${ghost}${block}`,
  );
}

// ---------------------------------------------------------------------------------------------
// 05 · Card grid
// ---------------------------------------------------------------------------------------------

export interface CardGridCard {
  readonly title: string;
  readonly body?: string;
  /** Override the auto two-digit numeral, or pass `""` to render a numeral-free card. */
  readonly numeral?: string;
}

export interface CardGridProps {
  readonly eyebrow: EyebrowValue;
  readonly title: string;
  readonly lead?: string;
  readonly cards: readonly CardGridCard[];
  readonly columns?: number;
  /** The `MANAGEMENT DECISION · …` callout that closes several of the founder's card slides. */
  readonly callout?: { readonly label: string; readonly text: string };
  /** Set false to keep every card dark (used by archetypes that reuse this shape). */
  readonly invertLast?: boolean;
}

export function renderCardGrid(props: CardGridProps, format: DocumentFormat): string {
  const cards = props.cards ?? [];
  const invertLast = props.invertLast ?? true;
  const cols = columnsFor(cards.length, format, props.columns);

  const cardHtml = cards
    .map((card, i) => {
      const inverted = invertLast && i === cards.length - 1 && cards.length > 1;
      const numeral = card.numeral === undefined ? twoDigit(i + 1) : card.numeral;
      const bodyColor = inverted ? COLORS.mutedOnLime : TEXT.l4;
      return (
        `<div class="wob-card" style="${cardCss(format, { rule: !inverted, inverted })}display:flex;flex-direction:column;">` +
        (numeral
          ? `<div style="${typeCss(TYPE.cardNumeral, format)}color:${inverted ? COLORS.onLime : COLORS.lime};margin-bottom:${space(18, format)}px;">${esc(numeral)}</div>`
          : "") +
        `<div style="${typeCss(TYPE.cardTitle, format)}${inverted ? "font-weight:700;" : ""}margin-bottom:${space(14, format)}px;">${esc(card.title)}</div>` +
        (card.body ? `<div style="${typeCss(TYPE.cardBody, format)}${inverted ? "font-weight:500;" : ""}color:${bodyColor};">${esc(card.body)}</div>` : "") +
        `</div>`
      );
    })
    .join("");

  const callout = props.callout
    ? `<div class="wob-callout" style="margin-top:${space(26, format)}px;display:flex;gap:${space(20, format)}px;align-items:center;` +
      `border-top:1px solid ${LINES.hairline};padding-top:${space(22, format)}px;">` +
      `<div style="${typeCss(TYPE.eyebrowSmall, format)}color:${COLORS.lime};flex:none;">${esc(props.callout.label)}</div>` +
      `<div style="${typeCss(TYPE.body, format)}color:${TEXT.l2};">${esc(props.callout.text)}</div>` +
      `</div>`
    : "";

  const lead = props.lead
    ? `<p style="margin:0 0 ${space(30, format)}px;max-width:1240px;${typeCss(TYPE.bodyMuted, format)}color:${TEXT.l4};">${esc(props.lead)}</p>`
    : "";

  return stage(
    format,
    { label: props.title, archetype: "cardGrid" },
    eyebrowHtml(props.eyebrow, format, COLORS.lime) +
      slideHeading(props.title, format, props.lead ? 14 : 34) +
      lead +
      grid(format, cols, LAYOUT.gridGap, cardHtml) +
      callout,
  );
}

// ---------------------------------------------------------------------------------------------
// 06 · Constraints → Outcomes
// ---------------------------------------------------------------------------------------------

export interface ConstraintsToOutcomesProps {
  readonly eyebrow: EyebrowValue;
  readonly title: string;
  readonly constraintsLabel?: string;
  readonly constraints: readonly string[];
  readonly outcomesLabel?: string;
  readonly outcomes: readonly { readonly label: string; readonly text: string }[];
}

export function renderConstraintsToOutcomes(props: ConstraintsToOutcomesProps, format: DocumentFormat): string {
  const left =
    `<div>` +
    `<div style="${typeCss(TYPE.panelLabel, format)}color:${TEXT.l5};margin-bottom:${space(18, format)}px;">${esc(props.constraintsLabel ?? "Current business constraints")}</div>` +
    `<div style="display:flex;flex-direction:column;gap:${space(14, format)}px;">` +
    props.constraints
      .map(
        (c) =>
          `<div style="${typeCss(TYPE.bodyMuted, format)}color:${TEXT.l2};border-left:2px solid rgba(255,255,255,.2);padding-left:${space(18, format)}px;">${esc(c)}</div>`,
      )
      .join("") +
    `</div></div>`;

  const right =
    `<div style="${cardCss(format, { rule: false })}">` +
    `<div style="${typeCss(TYPE.panelLabel, format)}color:${COLORS.lime};margin-bottom:${space(18, format)}px;">${esc(props.outcomesLabel ?? "Target operating outcomes")}</div>` +
    `<div style="display:flex;flex-direction:column;gap:${space(16, format)}px;">` +
    props.outcomes
      .map(
        (o, i) =>
          `<div style="display:flex;gap:${space(16, format)}px;${i > 0 ? `border-top:1px solid rgba(255,255,255,.1);padding-top:${space(16, format)}px;` : ""}">` +
          `<span style="${typeCss(TYPE.cardTitle, format)}color:${COLORS.lime};width:${space(190, format)}px;flex:none;">${esc(o.label)}</span>` +
          `<span style="${typeCss(TYPE.cardBody, format)}color:${TEXT.l2};">${esc(o.text)}</span>` +
          `</div>`,
      )
      .join("") +
    `</div></div>`;

  const cols = format === "document" ? "1fr" : "1fr 1fr";
  return stage(
    format,
    { label: props.title, archetype: "constraintsToOutcomes" },
    eyebrowHtml(props.eyebrow, format, COLORS.lime) +
      slideHeading(props.title, format) +
      `<div style="display:grid;grid-template-columns:${cols};gap:${space(LAYOUT.columnGap, format)}px;${FORMATS[format].flow !== "prose" ? "flex:1;" : ""}">${left}${right}</div>`,
  );
}

// ---------------------------------------------------------------------------------------------
// 07 · Coverage matrix
// ---------------------------------------------------------------------------------------------

export interface CoverageMatrixProps {
  readonly eyebrow: EyebrowValue;
  readonly title: string;
  readonly columns: readonly string[];
  readonly rows: readonly { readonly label: string; readonly cells: readonly string[] }[];
  readonly note?: string;
}

export function renderCoverageMatrix(props: CoverageMatrixProps, format: DocumentFormat): string {
  const head =
    `<tr>` +
    `<th style="text-align:left;padding:${space(14, format)}px ${space(18, format)}px;${typeCss(TYPE.tableHead, format)}color:${TEXT.l6};border-bottom:1px solid ${LINES.hairline};"></th>` +
    props.columns
      .map(
        (c) =>
          `<th style="text-align:left;padding:${space(14, format)}px ${space(18, format)}px;${typeCss(TYPE.tableHead, format)}color:${COLORS.lime};border-bottom:1px solid ${LINES.hairline};">${esc(c)}</th>`,
      )
      .join("") +
    `</tr>`;

  const body = props.rows
    .map(
      (r) =>
        `<tr>` +
        `<td style="padding:${space(14, format)}px ${space(18, format)}px;${typeCss(TYPE.cardTitle, format)}border-top:1px solid ${LINES.hairline};vertical-align:top;">${esc(r.label)}</td>` +
        r.cells
          .map(
            (cell) =>
              `<td style="padding:${space(14, format)}px ${space(18, format)}px;${typeCss(TYPE.tableCell, format)}color:${TEXT.l2};border-top:1px solid ${LINES.hairline};vertical-align:top;">${esc(cell)}</td>`,
          )
          .join("") +
        `</tr>`,
    )
    .join("");

  const note = props.note
    ? `<div style="margin-top:${space(22, format)}px;${typeCss(TYPE.cardBody, format)}color:${TEXT.l5};">${esc(props.note)}</div>`
    : "";

  return stage(
    format,
    { label: props.title, archetype: "coverageMatrix" },
    eyebrowHtml(props.eyebrow, format, COLORS.lime) +
      slideHeading(props.title, format) +
      `<table class="wob-matrix" style="width:100%;border-collapse:collapse;table-layout:fixed;"><thead>${head}</thead><tbody>${body}</tbody></table>` +
      note,
  );
}

// ---------------------------------------------------------------------------------------------
// 08 · System diagram
// ---------------------------------------------------------------------------------------------

export interface SystemDiagramProps {
  readonly eyebrow: EyebrowValue;
  readonly title: string;
  readonly nodes: readonly { readonly title: string; readonly body?: string; readonly numeral?: string }[];
  readonly note?: string;
  readonly columns?: number;
}

export function renderSystemDiagram(props: SystemDiagramProps, format: DocumentFormat): string {
  const nodes = props.nodes ?? [];
  const cols = columnsFor(nodes.length, format, props.columns ?? Math.min(nodes.length, 4));
  const nodeHtml = nodes
    .map((n, i) => {
      const last = i === nodes.length - 1 && nodes.length > 1;
      return (
        `<div class="wob-node" style="${cardCss(format, { rule: false, inverted: last })}display:flex;flex-direction:column;justify-content:space-between;gap:${space(16, format)}px;">` +
        `<div style="${typeCss(TYPE.nodeNumeral, format)}color:${last ? COLORS.onLime : COLORS.lime};">${esc(n.numeral ?? twoDigit(i + 1))}</div>` +
        `<div><div style="${typeCss(TYPE.cardTitle, format)}${last ? "font-weight:700;" : ""}margin-bottom:${space(8, format)}px;">${esc(n.title)}</div>` +
        (n.body
          ? `<div style="${typeCss(TYPE.cardBody, format)}color:${last ? COLORS.mutedOnLime : TEXT.l4};">${esc(n.body)}</div>`
          : "") +
        `</div></div>`
      );
    })
    .join("");

  const note = props.note
    ? `<div style="margin-top:${space(22, format)}px;${typeCss(TYPE.body, format)}color:${TEXT.l3};text-align:center;">${esc(props.note)}</div>`
    : "";

  return stage(
    format,
    { label: props.title, archetype: "systemDiagram" },
    eyebrowHtml(props.eyebrow, format, COLORS.lime) +
      slideHeading(props.title, format) +
      grid(format, cols, 16, nodeHtml) +
      note,
  );
}

// ---------------------------------------------------------------------------------------------
// 09 · Timeline
// ---------------------------------------------------------------------------------------------

export interface TimelinePhase {
  readonly period: string;
  readonly title: string;
  readonly body?: string;
  readonly numeral?: string;
  /** `inverted` renders the full-lime future-state column the deck closes its roadmap with. */
  readonly emphasis?: "primary" | "muted" | "inverted";
}

export interface TimelineProps {
  readonly eyebrow: EyebrowValue;
  readonly title: string;
  readonly phases: readonly TimelinePhase[];
}

export function renderTimeline(props: TimelineProps, format: DocumentFormat): string {
  const phases = props.phases ?? [];
  const columns = phases
    .map((p, i) => {
      const emphasis = p.emphasis ?? (i === 0 ? "primary" : "muted");
      const inverted = emphasis === "inverted";
      const rule = inverted
        ? ""
        : `border-top:4px solid ${emphasis === "primary" ? COLORS.lime : LINES.limeTintBorder};`;
      const surface = inverted ? `background:${COLORS.lime};color:${COLORS.onLime};` : "";
      const ghost = inverted ? "rgba(10,10,10,.13)" : "rgba(184,255,44,.13)";
      return (
        `<div class="wob-phase" style="flex:1;display:flex;flex-direction:column;justify-content:space-between;${rule}${surface}` +
        `padding:${space(24, format)}px ${space(26, format)}px ${space(22, format)}px;gap:${space(16, format)}px;">` +
        `<div>` +
        `<div style="${typeCss(TYPE.eyebrowSmall, format)}color:${inverted ? COLORS.onLime : COLORS.lime};margin-bottom:${space(10, format)}px;">${esc(p.period)}</div>` +
        `<div style="${typeCss(TYPE.timelineTitle, format)}margin-bottom:${space(16, format)}px;">${esc(p.title)}</div>` +
        (p.body
          ? `<div style="${typeCss(TYPE.cardBody, format)}color:${inverted ? COLORS.mutedOnLime : TEXT.l4};">${esc(p.body)}</div>`
          : "") +
        `</div>` +
        `<div aria-hidden="true" style="${typeCss(TYPE.timelineNumeral, format)}color:${ghost};">${esc(p.numeral ?? twoDigit(i + 1))}</div>` +
        `</div>`
      );
    })
    .join("");

  // In prose flow the five columns stack — a 5-across roadmap on Letter is illegible.
  const wrapper =
    FORMATS[format].flow === "prose"
      ? `<div style="display:flex;flex-direction:column;gap:${space(18, format)}px;">${columns}</div>`
      : `<div style="display:flex;gap:0;flex:1;">${columns}</div>`;

  return stage(
    format,
    { label: props.title, archetype: "timeline" },
    eyebrowHtml(props.eyebrow, format, COLORS.lime) + slideHeading(props.title, format, 40) + wrapper,
  );
}

// ---------------------------------------------------------------------------------------------
// 10 · Phase detail
// ---------------------------------------------------------------------------------------------

export interface PhaseDetailProps {
  readonly eyebrow: EyebrowValue;
  readonly title: string;
  /** Month-by-month cadence across the top. */
  readonly stages: readonly { readonly label: string; readonly body: string }[];
  /** The KPI / measurement panel beneath it. */
  readonly panel?: {
    readonly label: string;
    readonly items: readonly { readonly title: string; readonly body?: string; readonly numeral?: string }[];
  };
}

export function renderPhaseDetail(props: PhaseDetailProps, format: DocumentFormat): string {
  const stages = props.stages ?? [];
  const stageHtml = stages
    .map(
      (s, i) =>
        `<div style="border-top:3px solid ${i === 0 ? COLORS.lime : LINES.limeTintBorder};padding-top:${space(18, format)}px;">` +
        `<div style="${typeCss(TYPE.eyebrowSmall, format)}color:${COLORS.lime};margin-bottom:${space(10, format)}px;">${esc(s.label)}</div>` +
        `<div style="${typeCss(TYPE.cardBody, format)}color:${TEXT.l3};">${esc(s.body)}</div>` +
        `</div>`,
    )
    .join("");

  const panel = props.panel
    ? `<div style="${cardCss(format, { rule: false })}${FORMATS[format].flow !== "prose" ? "flex:1;" : ""}">` +
      `<div style="${typeCss(TYPE.panelLabel, format)}color:${COLORS.lime};margin-bottom:${space(20, format)}px;">${esc(props.panel.label)}</div>` +
      grid(
        format,
        columnsFor(props.panel.items.length, format, Math.min(props.panel.items.length, 5)),
        24,
        props.panel.items
          .map(
            (item, i) =>
              `<div>` +
              `<div style="${typeCss(TYPE.contentsNumeral, format)}color:${COLORS.lime};margin-bottom:${space(8, format)}px;">${esc(item.numeral ?? twoDigit(i + 1))}</div>` +
              `<div style="${typeCss(TYPE.cardTitle, format)}margin-bottom:${space(6, format)}px;">${esc(item.title)}</div>` +
              (item.body ? `<div style="${typeCss(TYPE.cardBody, format)}color:${TEXT.l4};">${esc(item.body)}</div>` : "") +
              `</div>`,
          )
          .join(""),
        false,
      ) +
      `</div>`
    : "";

  return stage(
    format,
    { label: props.title, archetype: "phaseDetail" },
    eyebrowHtml(props.eyebrow, format, COLORS.lime) +
      slideHeading(props.title, format, 32) +
      `<div style="display:grid;grid-template-columns:repeat(${columnsFor(stages.length, format, Math.min(stages.length, 3))},1fr);gap:${space(18, format)}px;margin-bottom:${space(26, format)}px;">${stageHtml}</div>` +
      panel,
  );
}

// ---------------------------------------------------------------------------------------------
// 11 · Scope list
// ---------------------------------------------------------------------------------------------

export interface ScopeListProps {
  readonly eyebrow: EyebrowValue;
  readonly title: string;
  readonly lead?: string;
  readonly groups: readonly { readonly label: string; readonly caption?: string; readonly items: readonly string[]; readonly footer?: string }[];
}

export function renderScopeList(props: ScopeListProps, format: DocumentFormat): string {
  const groups = props.groups ?? [];
  const groupHtml = groups
    .map(
      (g) =>
        `<div class="wob-scope-group" style="${cardCss(format, { rule: false })}display:flex;flex-direction:column;">` +
        `<div style="${typeCss(TYPE.panelLabel, format)}color:${COLORS.lime};margin-bottom:${space(18, format)}px;">${esc(g.label)}</div>` +
        (g.caption ? `<div style="${typeCss(TYPE.cardBody, format)}color:${TEXT.l5};margin-bottom:${space(18, format)}px;">${esc(g.caption)}</div>` : "") +
        `<div style="display:flex;flex-direction:column;gap:${space(11, format)}px;${typeCss(TYPE.cardBody, format)}color:${TEXT.l2};">` +
        g.items.map((it) => `<div>${esc(it)}</div>`).join("") +
        `</div>` +
        (g.footer
          ? `<div style="margin-top:auto;padding-top:${space(22, format)}px;border-top:1px solid rgba(255,255,255,.12);${typeCss(TYPE.cardBody, format)}font-weight:600;color:${COLORS.lime};">${esc(g.footer)}</div>`
          : "") +
        `</div>`,
    )
    .join("");

  return stage(
    format,
    { label: props.title, archetype: "scopeList" },
    eyebrowHtml(props.eyebrow, format, COLORS.lime) +
      slideHeading(props.title, format, props.lead ? 14 : 30) +
      (props.lead
        ? `<p style="margin:0 0 ${space(30, format)}px;max-width:1200px;${typeCss(TYPE.bodyMuted, format)}color:${TEXT.l4};">${esc(props.lead)}</p>`
        : "") +
      grid(format, columnsFor(groups.length, format, Math.min(groups.length, 3)), 22, groupHtml),
  );
}

// ---------------------------------------------------------------------------------------------
// 12 · Capabilities
// ---------------------------------------------------------------------------------------------

export interface CapabilitiesProps {
  readonly eyebrow: EyebrowValue;
  readonly title: string;
  readonly lead?: string;
  readonly capabilities: readonly { readonly title: string; readonly body: string }[];
  readonly columns?: number;
}

export function renderCapabilities(props: CapabilitiesProps, format: DocumentFormat): string {
  const caps = props.capabilities ?? [];
  const cols = columnsFor(caps.length, format, props.columns ?? Math.min(caps.length, 4));
  const html = caps
    .map((c, i) => {
      const last = i === caps.length - 1 && caps.length > 1;
      return (
        `<div class="wob-capability" style="${cardCss(format, { rule: false, inverted: last })}">` +
        `<div style="${typeCss(TYPE.cardTitle, format)}${last ? "font-weight:700;" : `color:${COLORS.lime};`}margin-bottom:${space(8, format)}px;">${esc(c.title)}</div>` +
        `<div style="${typeCss(TYPE.cardBody, format)}color:${last ? COLORS.mutedOnLime : TEXT.l4};">${esc(c.body)}</div>` +
        `</div>`
      );
    })
    .join("");

  return stage(
    format,
    { label: props.title, archetype: "capabilities" },
    eyebrowHtml(props.eyebrow, format, COLORS.lime) +
      slideHeading(props.title, format, 14) +
      (props.lead
        ? `<p style="margin:0 0 ${space(30, format)}px;max-width:1240px;${typeCss(TYPE.bodyMuted, format)}color:${TEXT.l4};">${esc(props.lead)}</p>`
        : "") +
      grid(format, cols, 16, html),
  );
}

// ---------------------------------------------------------------------------------------------
// 13 · What's included
// ---------------------------------------------------------------------------------------------

export interface WhatsIncludedProps {
  readonly eyebrow: EyebrowValue;
  readonly title: string;
  readonly items: readonly { readonly title: string; readonly body?: string }[];
  readonly columns?: number;
}

export function renderWhatsIncluded(props: WhatsIncludedProps, format: DocumentFormat): string {
  const items = props.items ?? [];
  const cols = columnsFor(items.length, format, props.columns ?? 3);
  const html = items
    .map((item, i) => {
      const last = i === items.length - 1 && items.length > 1;
      return (
        `<div class="wob-included" style="display:flex;gap:${space(16, format)}px;align-items:flex-start;${cardCss(format, { rule: false, inverted: last })}">` +
        `<span aria-hidden="true" style="${typeCss(TYPE.cardBody, format)}font-weight:900;color:${last ? COLORS.onLime : COLORS.lime};">&#10003;</span>` +
        `<div><div style="${typeCss(TYPE.cardTitle, format)}${last ? "font-weight:700;" : ""}margin-bottom:${space(4, format)}px;">${esc(item.title)}</div>` +
        (item.body
          ? `<div style="${typeCss(TYPE.cardBody, format)}color:${last ? COLORS.mutedOnLime : TEXT.l4};">${esc(item.body)}</div>`
          : "") +
        `</div></div>`
      );
    })
    .join("");

  return stage(
    format,
    { label: props.title, archetype: "whatsIncluded" },
    eyebrowHtml(props.eyebrow, format, COLORS.lime) + slideHeading(props.title, format) + grid(format, cols, 14, html),
  );
}

// ---------------------------------------------------------------------------------------------
// 14 · Investment
// ---------------------------------------------------------------------------------------------

export interface InvestmentProps {
  readonly eyebrow: EyebrowValue;
  readonly title: string;
  /** Label above the headline figure, e.g. "Combined monthly professional fee". */
  readonly headlineLabel?: string;
  /** Pre-formatted amount, e.g. `PKR 300,000`. The composer formats cents before it reaches here. */
  readonly amount: string;
  /** Optional line breaks inside the giant figure, e.g. `["PKR", "300,000"]`. */
  readonly amountLines?: readonly string[];
  readonly splits?: readonly { readonly label: string; readonly value: string }[];
  readonly terms?: readonly { readonly label: string; readonly value: string }[];
}

export function renderInvestment(props: InvestmentProps, format: DocumentFormat): string {
  const lines = props.amountLines && props.amountLines.length ? props.amountLines : [props.amount];
  const amount =
    `<div class="wob-amount" style="${typeCss(TYPE.amount, format)}${fitDisplaySize(TYPE.amount, format, lines, 11)}">` +
    `${lines.map(esc).join("<br>")}<span style="color:${COLORS.lime}">.</span></div>`;

  const splits = (props.splits ?? []).length
    ? `<div style="display:flex;gap:${space(22, format)}px;margin:${space(30, format)}px 0 ${space(26, format)}px;flex-wrap:wrap;">` +
      (props.splits ?? [])
        .map(
          (s) =>
            `<div style="flex:1;min-width:${space(220, format)}px;${cardCss(format, { rule: false })}">` +
            `<div style="${typeCss(TYPE.eyebrowSmall, format)}color:${COLORS.lime};margin-bottom:${space(8, format)}px;">${esc(s.label)}</div>` +
            `<div style="${typeCss(TYPE.amountSplit, format)}">${esc(s.value)}</div>` +
            `</div>`,
        )
        .join("") +
      `</div>`
    : "";

  const terms = (props.terms ?? []).length
    ? `<div style="display:grid;grid-template-columns:repeat(${columnsFor((props.terms ?? []).length, format, 3)},1fr);` +
      `gap:${space(20, format)}px ${space(44, format)}px;border-top:1px solid ${LINES.hairlineStrong};padding-top:${space(24, format)}px;">` +
      (props.terms ?? [])
        .map(
          (t) =>
            `<div><div style="${typeCss(TYPE.panelLabel, format)}color:${COLORS.lime};margin-bottom:${space(4, format)}px;">${esc(t.label)}</div>` +
            `<div style="${typeCss(TYPE.cardBody, format)}color:${TEXT.l2};">${esc(t.value)}</div></div>`,
        )
        .join("") +
      `</div>`
    : "";

  return stage(
    format,
    { label: props.title, archetype: "investment", paddingY: 80 },
    eyebrowHtml(props.eyebrow, format, COLORS.lime, TYPE.eyebrowLarge) +
      (props.headlineLabel
        ? `<div style="${typeCss(TYPE.body, format)}color:${TEXT.l3};margin-bottom:${space(6, format)}px;">${esc(props.headlineLabel)}</div>`
        : "") +
      amount +
      splits +
      terms,
  );
}

// ---------------------------------------------------------------------------------------------
// 15 · Approval
// ---------------------------------------------------------------------------------------------

export interface ApprovalProps {
  readonly wordmark?: string;
  readonly eyebrow: EyebrowValue;
  readonly title: string;
  readonly titleLines?: readonly string[];
  readonly body?: string;
  readonly parties: readonly { readonly label: string; readonly fields: readonly string[] }[];
}

export function renderApproval(props: ApprovalProps, format: DocumentFormat): string {
  const header =
    `<div style="display:flex;justify-content:space-between;align-items:flex-start;">` +
    `<div style="${typeCss(TYPE.wordmark, format)}">${esc(props.wordmark ?? "wobble")}<span>.</span></div>` +
    `<div style="${typeCss(TYPE.eyebrowSmall, format)}color:${COLORS.mutedOnLime};">${esc(eyebrowText(props.eyebrow))}</div>` +
    `</div>`;

  const headline =
    `<div style="margin:${space(40, format)}px 0;">` +
    `<h2 style="margin:0 0 ${space(22, format)}px;${typeCss(TYPE.statementH2, format)}">${brandTitle(props.title, COLORS.onLime, props.titleLines)}</h2>` +
    (props.body ? `<p style="margin:0;max-width:1020px;${typeCss(TYPE.body, format)}color:${COLORS.mutedOnLime};">${esc(props.body)}</p>` : "") +
    `</div>`;

  const parties =
    `<div style="display:grid;grid-template-columns:repeat(${columnsFor(props.parties.length, format, 2)},1fr);` +
    `gap:${space(60, format)}px;border-top:2px solid ${COLORS.onLime};padding-top:${space(28, format)}px;">` +
    props.parties
      .map(
        (p) =>
          `<div><div style="${typeCss(TYPE.eyebrowSmall, format)}font-weight:700;margin-bottom:${space(22, format)}px;">${esc(p.label)}</div>` +
          `<div style="display:flex;flex-direction:column;gap:${space(20, format)}px;">` +
          p.fields
            .map(
              (f) =>
                `<div style="display:flex;gap:${space(16, format)}px;align-items:flex-end;">` +
                `<span style="${typeCss(TYPE.cardBody, format)}font-weight:600;width:${space(120, format)}px;flex:none;">${esc(f)}</span>` +
                `<span style="flex:1;border-bottom:1.5px solid ${COLORS.onLime};height:${space(26, format)}px;"></span></div>`,
            )
            .join("") +
          `</div></div>`,
      )
      .join("") +
    `</div>`;

  return stage(
    format,
    { label: "Approval", archetype: "approval", background: COLORS.lime, color: COLORS.onLime, paddingY: 80 },
    `${header}${headline}${parties}`,
  );
}
