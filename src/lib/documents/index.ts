/**
 * The WOBBLE document composer — one structured model in, one self-contained HTML file out.
 *
 * WHY this replaced `render.ts`: that file held three hand-rolled renderers (audit report, audit
 * deck, proposal) that each re-declared the brand from scratch. They drifted (wrong lime), they
 * could not produce a third format, and adding a fourth document kind meant a fourth renderer.
 * Here there is ONE model (`WobbleDocument`), ONE set of archetypes, and THREE format targets.
 *
 * Hard rules encoded in this file, not left to callers:
 *   1. COMMERCIAL TERMS ALWAYS LAST. The founder's stated reason: "the decision is evaluated
 *      first on business value". `commercials` renders after every section, and any `investment`
 *      or `approval` section passed mid-document is hoisted to the tail.
 *   2. INVOICES ARE DOCUMENTS, never slides — an invoice must be scannable (amount due, due date,
 *      line items, payment terms), so `kind: "invoice"` takes a completely separate layout that
 *      reuses the tokens but none of the slide archetypes.
 *   3. Output is self-contained: inline CSS, inline `@font-face` pointing at self-hosted woff2,
 *      no external requests. It has to render offline and survive a Chromium print-to-PDF.
 *
 * Everything here is pure. No DB, no fetch, no fs.
 */

import {
  ALLOWED_HEXES,
  COLORS,
  FONT_STACKS,
  FORMATS,
  LAYOUT,
  LINES,
  TEXT,
  TYPE,
  type DocumentFormat,
  cardCss,
  fontFaceCss,
  pageSizeCss,
  space,
  typeCss,
} from "@/lib/design-system/tokens";
import {
  esc,
  eyebrowText,
  renderApproval,
  renderCapabilities,
  renderCardGrid,
  renderContents,
  renderConstraintsToOutcomes,
  renderCover,
  renderCoverageMatrix,
  renderInvestment,
  renderPhaseDetail,
  renderScopeList,
  renderSectionDivider,
  renderStatement,
  renderSystemDiagram,
  renderTimeline,
  renderWhatsIncluded,
  twoDigit,
  type ApprovalProps,
  type CapabilitiesProps,
  type CardGridProps,
  type ConstraintsToOutcomesProps,
  type ContentsProps,
  type CoverProps,
  type CoverageMatrixProps,
  type EyebrowValue,
  type InvestmentProps,
  type PhaseDetailProps,
  type ScopeListProps,
  type SectionDividerProps,
  type StatementProps,
  type SystemDiagramProps,
  type TimelineProps,
  type WhatsIncludedProps,
} from "@/lib/design-system/archetypes";

export type { DocumentFormat };
export { ALLOWED_HEXES };

// ---------------------------------------------------------------------------------------------
// The document model
// ---------------------------------------------------------------------------------------------

/** One variant per archetype. The `type` tag is the discriminant the composer switches on. */
export type DocumentSection =
  | ({ readonly type: "cover" } & CoverProps)
  | ({ readonly type: "statement" } & StatementProps)
  | ({ readonly type: "contents" } & ContentsProps)
  | ({ readonly type: "sectionDivider" } & SectionDividerProps)
  | ({ readonly type: "cardGrid" } & CardGridProps)
  | ({ readonly type: "constraintsToOutcomes" } & ConstraintsToOutcomesProps)
  | ({ readonly type: "coverageMatrix" } & CoverageMatrixProps)
  | ({ readonly type: "systemDiagram" } & SystemDiagramProps)
  | ({ readonly type: "timeline" } & TimelineProps)
  | ({ readonly type: "phaseDetail" } & PhaseDetailProps)
  | ({ readonly type: "scopeList" } & ScopeListProps)
  | ({ readonly type: "capabilities" } & CapabilitiesProps)
  | ({ readonly type: "whatsIncluded" } & WhatsIncludedProps)
  | ({ readonly type: "investment" } & InvestmentProps)
  | ({ readonly type: "approval" } & ApprovalProps);

export type DocumentSectionType = DocumentSection["type"];

/** Section types that carry commercial terms — always hoisted to the end of the document. */
export const COMMERCIAL_SECTION_TYPES: readonly DocumentSectionType[] = ["investment", "approval"];

export interface CommercialsLineItem {
  readonly label: string;
  readonly detail?: string;
  readonly qty?: number;
  readonly amountCents?: number;
}

export interface CommercialsBlock {
  readonly eyebrow?: EyebrowValue;
  readonly title?: string;
  readonly headlineLabel?: string;
  /** ISO-4217 code. Only used when an amount is supplied as cents. */
  readonly currency?: string;
  readonly totalCents?: number;
  /** A literal amount string wins over `totalCents` — the founder writes `PKR 300,000` by hand. */
  readonly amount?: string;
  readonly amountLines?: readonly string[];
  readonly splits?: readonly { readonly label: string; readonly value: string }[];
  readonly terms?: readonly { readonly label: string; readonly value: string }[];
  readonly lineItems?: readonly CommercialsLineItem[];
  /** Invoice-only fields. */
  readonly invoiceNumber?: string;
  readonly issuedDate?: string;
  readonly dueDate?: string;
  readonly billTo?: readonly string[];
  readonly paymentTerms?: string;
  readonly paymentDetails?: readonly { readonly label: string; readonly value: string }[];
  readonly notes?: string;
  /** Sign-off block appended after the investment slide. */
  readonly approval?: ApprovalProps;
}

export interface WobbleDocument {
  readonly kind: "proposal" | "audit" | "quick_pitch" | "invoice";
  readonly client: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly meta?: {
    readonly date?: string;
    readonly audience?: string;
    readonly confidential?: boolean;
    readonly tags?: readonly string[];
  };
  readonly sections: readonly DocumentSection[];
  /** ALWAYS rendered last, regardless of where it sits in the object. */
  readonly commercials?: CommercialsBlock;
}

export interface RenderOptions {
  /**
   * Where the self-hosted woff2 files live. Defaults to `/fonts`, which resolves when the Next app
   * serves the HTML. Pass an absolute `file://` base when printing detached HTML to PDF.
   */
  readonly fontBaseHref?: string;
}

// ---------------------------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------------------------

/** Cents → `$15,000`. Shared by the legacy wrappers, the invoice and the commercials block. */
export function formatMoney(cents: number | undefined | null, currency = "USD"): string {
  if (cents === undefined || cents === null || Number.isNaN(cents)) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    // An unknown/invalid currency code must not take a whole proposal down.
    return `${currency} ${Math.round(cents / 100).toLocaleString("en-US")}`;
  }
}

function upper(value: string): string {
  return value.toLocaleUpperCase("en-US");
}

// ---------------------------------------------------------------------------------------------
// Section dispatch + ordering
// ---------------------------------------------------------------------------------------------

function renderSection(section: DocumentSection, format: DocumentFormat): string {
  switch (section.type) {
    case "cover":
      return renderCover(section, format);
    case "statement":
      return renderStatement(section, format);
    case "contents":
      return renderContents(section, format);
    case "sectionDivider":
      return renderSectionDivider(section, format);
    case "cardGrid":
      return renderCardGrid(section, format);
    case "constraintsToOutcomes":
      return renderConstraintsToOutcomes(section, format);
    case "coverageMatrix":
      return renderCoverageMatrix(section, format);
    case "systemDiagram":
      return renderSystemDiagram(section, format);
    case "timeline":
      return renderTimeline(section, format);
    case "phaseDetail":
      return renderPhaseDetail(section, format);
    case "scopeList":
      return renderScopeList(section, format);
    case "capabilities":
      return renderCapabilities(section, format);
    case "whatsIncluded":
      return renderWhatsIncluded(section, format);
    case "investment":
      return renderInvestment(section, format);
    case "approval":
      return renderApproval(section, format);
    default: {
      // Exhaustiveness guard: adding an archetype without handling it here is a compile error.
      const unreachable: never = section;
      return unreachable;
    }
  }
}

/**
 * Stable ordering that enforces "commercial terms always last".
 *
 * A caller can put the price slide first (LLMs love to lead with the number). We keep their
 * relative order inside each bucket but always push investment/approval to the tail.
 */
export function orderSections(sections: readonly DocumentSection[]): readonly DocumentSection[] {
  const body = sections.filter((s) => !COMMERCIAL_SECTION_TYPES.includes(s.type));
  const investment = sections.filter((s) => s.type === "investment");
  const approval = sections.filter((s) => s.type === "approval");
  return [...body, ...investment, ...approval];
}

/** Turns the `commercials` block into the trailing investment (+ approval) sections. */
function commercialsSections(doc: WobbleDocument): DocumentSection[] {
  const c = doc.commercials;
  if (!c) return [];
  const out: DocumentSection[] = [];
  const amount = c.amount ?? formatMoney(c.totalCents, c.currency ?? "USD");
  out.push({
    type: "investment",
    eyebrow: c.eyebrow ?? "Investment · Approval",
    title: c.title ?? "Investment",
    headlineLabel: c.headlineLabel ?? "Total investment",
    amount,
    ...(c.amountLines ? { amountLines: c.amountLines } : {}),
    ...(c.splits ? { splits: c.splits } : {}),
    ...(c.terms ? { terms: c.terms } : {}),
  });
  // Line items get their own matrix so the number above is never unexplained.
  if (c.lineItems && c.lineItems.length > 0) {
    out.push({
      type: "coverageMatrix",
      eyebrow: "Investment · Breakdown",
      title: "What the investment covers",
      columns: ["Detail", "Amount"],
      rows: c.lineItems.map((li) => ({
        label: li.label,
        cells: [li.detail ?? "—", li.amountCents === undefined ? "Included" : formatMoney(li.amountCents, c.currency ?? "USD")],
      })),
      ...(c.notes ? { note: c.notes } : {}),
    });
  }
  if (c.approval) out.push({ type: "approval", ...c.approval });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Page frames
// ---------------------------------------------------------------------------------------------

function baseCss(format: DocumentFormat, options?: RenderOptions): string {
  return (
    `${fontFaceCss(options?.fontBaseHref)}` +
    `*{box-sizing:border-box}html,body{margin:0;padding:0;background:${COLORS.black};` +
    `-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `h1,h2,h3,p{margin:0;overflow-wrap:break-word}` +
    `a{color:${COLORS.lime};text-decoration:none}a:hover{color:${COLORS.limeHover}}` +
    `::selection{background:${COLORS.lime};color:${COLORS.onLime}}` +
    `.wob-stage{font-family:${FONT_STACKS.display}}` +
    `@page{size:${pageSizeCss(format)};margin:0}`
  );
}

/**
 * Deck chrome: an on-screen present mode (arrow keys / click) plus a print stylesheet that lays
 * every slide out at exactly 1920x1080 so `renderPdf` produces a true 16:9 deck.
 */
function deckCss(): string {
  return (
    `.wob-viewport{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden}` +
    `.wob-deck{width:1920px;height:1080px;position:relative;transform-origin:center center}` +
    `.wob-slide{position:absolute;inset:0;display:none}.wob-slide.is-on{display:block}` +
    `.wob-count{position:fixed;bottom:30px;left:26px;z-index:10;font-family:${FONT_STACKS.body};font-size:13px;color:${TEXT.l6};letter-spacing:.18em}` +
    `.wob-nav{position:fixed;bottom:22px;right:26px;display:flex;gap:8px;z-index:10}` +
    `.wob-nav button{background:${COLORS.lime};color:${COLORS.onLime};border:none;width:40px;height:40px;font-size:20px;font-weight:800;cursor:pointer}` +
    `@media print{.wob-viewport{position:static;display:block;overflow:visible}` +
    `.wob-deck{transform:none!important;width:auto;height:auto}` +
    `.wob-slide{position:static;display:block!important;width:1920px;height:1080px;break-after:page;page-break-after:always}` +
    `.wob-slide:last-child{break-after:auto;page-break-after:auto}` +
    `.wob-nav,.wob-count{display:none}}`
  );
}

function deckScript(): string {
  return (
    `(function(){var d=document.querySelector('.wob-deck');var S=[].slice.call(document.querySelectorAll('.wob-slide'));` +
    `var C=document.querySelector('.wob-count');var i=0;` +
    `function fit(){if(!d)return;var s=Math.min(window.innerWidth/1920,window.innerHeight/1080);d.style.transform='scale('+s+')';}` +
    `function show(n){i=Math.max(0,Math.min(S.length-1,n));S.forEach(function(el,k){el.classList.toggle('is-on',k===i);});` +
    `if(C)C.textContent=(i+1)+' / '+S.length;}` +
    `document.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key===' ')show(i+1);if(e.key==='ArrowLeft')show(i-1);});` +
    `[].slice.call(document.querySelectorAll('.wob-nav button')).forEach(function(b,k){b.addEventListener('click',function(){show(i+(k?1:-1));});});` +
    `window.addEventListener('resize',fit);fit();show(0);})();`
  );
}

function a4Css(): string {
  return (
    `.wob-a4wrap{display:flex;flex-direction:column;align-items:center;gap:34px;padding:40px 20px;background:${COLORS.gallery}}` +
    `.wob-page{width:${FORMATS.deckA4.pageWidth}pt;height:${FORMATS.deckA4.pageHeight}pt;overflow:hidden;position:relative;background:${COLORS.black}}` +
    `@media print{html,body{background:${COLORS.black}}.wob-a4wrap{gap:0;padding:0;background:${COLORS.black}}` +
    `.wob-page{break-after:page;page-break-after:always}.wob-page:last-child{break-after:auto;page-break-after:auto}}`
  );
}

function documentCss(format: DocumentFormat): string {
  const headerHeight = space(64, format);
  return (
    `.wob-doc{width:${FORMATS.document.pageWidth}pt;margin:0 auto;background:${COLORS.black};color:${TEXT.l1};position:relative;padding-top:${headerHeight}px}` +
    `.wob-running{position:fixed;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;` +
    `gap:20px;padding:${space(18, format)}px ${space(LAYOUT.stagePaddingX, format)}px;background:${COLORS.black};` +
    `border-bottom:1px solid ${LINES.hairline};z-index:5}` +
    `.wob-block{break-inside:auto}` +
    `.wob-block+.wob-block{break-before:page;page-break-before:always}` +
    `.wob-doc-foot{display:flex;justify-content:space-between;align-items:center;gap:20px;` +
    `padding:${space(14, format)}px ${space(LAYOUT.stagePaddingX, format)}px ${space(28, format)}px;border-top:1px solid ${LINES.hairline}}` +
    `@media print{.wob-doc{width:auto;padding-top:${headerHeight}px}}`
  );
}

function shell(title: string, css: string, body: string, script?: string): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(title)}</title><style>${css}</style></head><body>${body}` +
    (script ? `<script>${script}</script>` : "") +
    `</body></html>`
  );
}

// ---------------------------------------------------------------------------------------------
// renderDocument
// ---------------------------------------------------------------------------------------------

/**
 * Compose a `WobbleDocument` into a self-contained HTML string.
 *
 * `format` picks the frame; the archetypes inside adapt themselves. `kind: "invoice"` ignores the
 * format-specific slide frames entirely and always renders the scannable invoice document.
 */
export function renderDocument(doc: WobbleDocument, format: DocumentFormat, options?: RenderOptions): string {
  if (doc.kind === "invoice") return renderInvoiceHtml(doc, options);

  const ordered = [...orderSections(doc.sections ?? []), ...commercialsSections(doc)];
  const pieces = ordered.map((s) => renderSection(s, format));
  const docTitle = `${doc.client} — ${doc.title}`;

  if (format === "deck16x9") {
    const slides = pieces.map((html) => `<div class="wob-slide">${html}</div>`).join("");
    const body =
      `<div class="wob-viewport"><div class="wob-deck">${slides}</div></div>` +
      `<div class="wob-count"></div><div class="wob-nav"><button aria-label="Previous slide">&lsaquo;</button><button aria-label="Next slide">&rsaquo;</button></div>`;
    return shell(docTitle, `${baseCss(format, options)}${deckCss()}`, body, deckScript());
  }

  if (format === "deckA4") {
    const pages = pieces.map((html) => `<div class="wob-page">${html}</div>`).join("");
    return shell(docTitle, `${baseCss(format, options)}${a4Css()}`, `<div class="wob-a4wrap">${pages}</div>`);
  }

  // `document` — prose-first. A fixed running header repeats on every printed page (Chromium does
  // not support `@page` margin boxes, so this is the only way to get one from self-contained HTML),
  // and each block carries its own `PAGE nn` footer.
  const running =
    `<div class="wob-running">` +
    `<span style="${typeCss(TYPE.eyebrowSmall, format)}color:${COLORS.lime};">WOBBLE</span>` +
    `<span style="${typeCss(TYPE.eyebrowSmall, format)}color:${TEXT.l6};">${esc(upper(doc.client))}</span>` +
    `</div>`;
  const blocks = pieces
    .map(
      (html, i) =>
        `<article class="wob-block">${html}` +
        `<footer class="wob-doc-foot">` +
        `<span style="${typeCss(TYPE.eyebrowSmall, format)}color:${TEXT.l6};">${esc(upper(doc.client))} · ${esc(upper(doc.title))}</span>` +
        `<span style="${typeCss(TYPE.eyebrowSmall, format)}color:${COLORS.lime};">PAGE ${twoDigit(i + 1)}</span>` +
        `</footer></article>`,
    )
    .join("");
  return shell(
    docTitle,
    `${baseCss(format, options)}${documentCss(format)}`,
    `${running}<main class="wob-doc">${blocks}</main>`,
  );
}

// ---------------------------------------------------------------------------------------------
// Invoice — a document, never a deck
// ---------------------------------------------------------------------------------------------

/**
 * Invoices use the same tokens and typography but their own layout. An invoice is read in ten
 * seconds by someone deciding whether to pay: amount due, due date, what it is for, how to pay.
 * Pushing that through slide archetypes would bury the number that matters behind a cover slide.
 *
 * Any `sections` on an invoice document are deliberately ignored (`brand-qa` reports it).
 */
export function renderInvoiceHtml(doc: WobbleDocument, options?: RenderOptions): string {
  const format: DocumentFormat = "document";
  const c = doc.commercials;
  const currency = c?.currency ?? "USD";
  const total = c?.amount ?? formatMoney(c?.totalCents, currency);
  const pad = `${space(LAYOUT.stagePaddingY, format)}px ${space(LAYOUT.stagePaddingX, format)}px`;

  const header =
    `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:${space(40, format)}px;">` +
    `<div style="${typeCss(TYPE.wordmark, format)}">wobble<span style="color:${COLORS.lime}">.</span></div>` +
    `<div style="text-align:right;${typeCss(TYPE.eyebrowSmall, format)}color:${TEXT.l5};line-height:2;">` +
    `${esc(upper(doc.title || "Invoice"))}<br><span style="color:${COLORS.lime}">${esc(c?.invoiceNumber ?? "—")}</span>` +
    `</div></div>`;

  // The one thing the reader is looking for, at headline size.
  const amountDue =
    `<div class="wob-amount-due" style="border-top:1px solid ${LINES.hairlineStrong};border-bottom:1px solid ${LINES.hairlineStrong};` +
    `padding:${space(30, format)}px 0;margin-bottom:${space(32, format)}px;display:flex;justify-content:space-between;align-items:flex-end;gap:${space(30, format)}px;flex-wrap:wrap;">` +
    `<div><div style="${typeCss(TYPE.eyebrowSmall, format)}color:${COLORS.lime};margin-bottom:${space(10, format)}px;">Amount due</div>` +
    `<div style="${typeCss(TYPE.amount, format)}font-size:${Math.round(72 * FORMATS[format].bodyRatio * 10) / 10}px;">${esc(total)}<span style="color:${COLORS.lime}">.</span></div></div>` +
    `<div style="text-align:right;"><div style="${typeCss(TYPE.eyebrowSmall, format)}color:${COLORS.lime};margin-bottom:${space(10, format)}px;">Due date</div>` +
    `<div style="${typeCss(TYPE.amountSplit, format)}">${esc(c?.dueDate ?? "On receipt")}</div></div>` +
    `</div>`;

  const metaCell = (label: string, value: string): string =>
    `<div><div style="${typeCss(TYPE.panelLabel, format)}color:${TEXT.l6};margin-bottom:${space(6, format)}px;">${esc(label)}</div>` +
    `<div style="${typeCss(TYPE.cardBody, format)}color:${TEXT.l2};">${esc(value)}</div></div>`;

  const meta =
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:${space(20, format)}px ${space(44, format)}px;margin-bottom:${space(34, format)}px;">` +
    metaCell("Billed to", (c?.billTo ?? [doc.client]).join(", ")) +
    metaCell("Issued", c?.issuedDate ?? "—") +
    metaCell("Reference", c?.invoiceNumber ?? "—") +
    metaCell("Currency", currency) +
    `</div>`;

  const items = c?.lineItems ?? [];
  const lineItems =
    `<table class="wob-invoice-items" style="width:100%;border-collapse:collapse;margin-bottom:${space(28, format)}px;">` +
    `<thead><tr>` +
    `<th style="text-align:left;padding:${space(12, format)}px 0;${typeCss(TYPE.tableHead, format)}color:${COLORS.lime};border-bottom:1px solid ${LINES.hairline};">Description</th>` +
    `<th style="text-align:right;width:${space(90, format)}px;padding:${space(12, format)}px 0;${typeCss(TYPE.tableHead, format)}color:${COLORS.lime};border-bottom:1px solid ${LINES.hairline};">Qty</th>` +
    `<th style="text-align:right;width:${space(170, format)}px;padding:${space(12, format)}px 0;${typeCss(TYPE.tableHead, format)}color:${COLORS.lime};border-bottom:1px solid ${LINES.hairline};">Amount</th>` +
    `</tr></thead><tbody>` +
    (items.length
      ? items
          .map(
            (li) =>
              `<tr>` +
              `<td style="padding:${space(14, format)}px 0;border-top:1px solid ${LINES.hairline};vertical-align:top;">` +
              `<div style="${typeCss(TYPE.cardTitle, format)}">${esc(li.label)}</div>` +
              (li.detail ? `<div style="${typeCss(TYPE.cardBody, format)}color:${TEXT.l4};">${esc(li.detail)}</div>` : "") +
              `</td>` +
              `<td style="padding:${space(14, format)}px 0;border-top:1px solid ${LINES.hairline};text-align:right;${typeCss(TYPE.tableCell, format)}color:${TEXT.l2};">${esc(li.qty ?? 1)}</td>` +
              `<td style="padding:${space(14, format)}px 0;border-top:1px solid ${LINES.hairline};text-align:right;${typeCss(TYPE.tableCell, format)}color:${TEXT.l1};">${esc(li.amountCents === undefined ? "Included" : formatMoney(li.amountCents, currency))}</td>` +
              `</tr>`,
          )
          .join("")
      : `<tr><td colspan="3" style="padding:${space(14, format)}px 0;border-top:1px solid ${LINES.hairline};${typeCss(TYPE.tableCell, format)}color:${TEXT.l5};">—</td></tr>`) +
    `</tbody><tfoot><tr>` +
    `<td colspan="2" style="padding:${space(16, format)}px 0;border-top:2px solid ${COLORS.lime};${typeCss(TYPE.panelLabel, format)}color:${COLORS.lime};">Total due</td>` +
    `<td style="padding:${space(16, format)}px 0;border-top:2px solid ${COLORS.lime};text-align:right;${typeCss(TYPE.amountSplit, format)}">${esc(total)}</td>` +
    `</tr></tfoot></table>`;

  // Payment terms are deliberately the loudest panel after the amount — unpaid invoices are
  // usually unclear invoices.
  const terms =
    `<div class="wob-payment-terms" style="${cardCss(format, { rule: true })}margin-bottom:${space(24, format)}px;">` +
    `<div style="${typeCss(TYPE.panelLabel, format)}color:${COLORS.lime};margin-bottom:${space(12, format)}px;">Payment terms</div>` +
    `<div style="${typeCss(TYPE.body, format)}color:${TEXT.l1};">${esc(c?.paymentTerms ?? "Payable on receipt.")}</div>` +
    ((c?.paymentDetails ?? []).length
      ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:${space(14, format)}px ${space(30, format)}px;margin-top:${space(20, format)}px;">` +
        (c?.paymentDetails ?? []).map((d) => metaCell(d.label, d.value)).join("") +
        `</div>`
      : "") +
    `</div>`;

  const notes = c?.notes
    ? `<div style="${typeCss(TYPE.cardBody, format)}color:${TEXT.l5};border-top:1px solid ${LINES.hairline};padding-top:${space(18, format)}px;">${esc(c.notes)}</div>`
    : "";

  const body =
    `<div class="wob-running">` +
    `<span style="${typeCss(TYPE.eyebrowSmall, format)}color:${COLORS.lime};">WOBBLE</span>` +
    `<span style="${typeCss(TYPE.eyebrowSmall, format)}color:${TEXT.l6};">${esc(upper(doc.client))}</span>` +
    `</div>` +
    `<main class="wob-doc"><section class="wob-stage" data-archetype="invoice" data-label="Invoice" ` +
    `style="width:100%;box-sizing:border-box;background:${COLORS.black};color:${TEXT.l1};padding:${pad};display:flex;flex-direction:column;position:relative;">` +
    header +
    (doc.subtitle ? `<p style="margin:0 0 ${space(26, format)}px;${typeCss(TYPE.lead, format)}color:${TEXT.l3};">${esc(doc.subtitle)}</p>` : "") +
    amountDue +
    meta +
    lineItems +
    terms +
    notes +
    `</section>` +
    `<footer class="wob-doc-foot">` +
    `<span style="${typeCss(TYPE.eyebrowSmall, format)}color:${TEXT.l6};">${esc(upper(doc.client))} · ${esc(upper(doc.title))}</span>` +
    `<span style="${typeCss(TYPE.eyebrowSmall, format)}color:${COLORS.lime};">PAGE 01</span>` +
    `</footer></main>`;

  return shell(`${doc.client} — ${doc.title}`, `${baseCss(format, options)}${documentCss(format)}`, body);
}

// ---------------------------------------------------------------------------------------------
// Backward-compatible wrappers
//
// The three legacy renderers keep their exact signatures so existing callers (the audit document,
// audit deck and proposal API routes) keep compiling. They are now thin adapters that build a
// `WobbleDocument` and hand it to the composer — the old bespoke markup is gone.
// ---------------------------------------------------------------------------------------------

type Step = string | { step?: string; detail?: string; tool?: string; pain?: string };

interface Opp {
  title?: string;
  name?: string;
  area?: string;
  service?: string;
  description?: string;
  reason?: string;
  howItWorks?: string;
  expectedOutcome?: string;
  impact?: string;
  difficulty?: string;
  monthlyHoursSaved?: number;
  estimatedMonthlyValueCents?: number;
  kpis?: string[];
}

interface Phase {
  title?: string;
  months?: string;
  focus?: string;
  objectives?: string[];
  deliverables?: string[];
  items?: string[];
  expectedOutcome?: string;
}

export interface AuditReportShape {
  businessName?: string;
  industry?: string | null;
  executiveSummary?: string;
  situationSummary?: string;
  currentState?: {
    acquisition?: Step[];
    delivery?: Step[];
    support?: Step[];
    bottlenecks?: { area?: string; pain?: string; rootCause?: string; severity?: string; businessImpact?: string }[];
    keyMetrics?: { label?: string; value?: string }[];
  };
  opportunities?: Opp[];
  roadmap?: Phase[];
  roi?: {
    estimatedMonthlyUpsideCents?: number;
    estimatedImplementationCents?: number;
    paybackMonths?: number;
    breakdown?: { area?: string; monthlyValueCents?: number }[];
  };
  risks?: { risk?: string; mitigation?: string }[];
  successMetrics?: string[];
  recommendedTechStack?: string[];
  nextSteps?: string[];
}

export interface ProposalShape {
  title?: string;
  currency?: string;
  pricingCents?: number;
  scope?: string | null;
  services?: { name?: string; description?: string; priceCents?: number }[];
  timeline?: { phase?: string; months?: string; focus?: string }[];
  terms?: string | null;
}

function stepText(step: Step): string {
  if (typeof step === "string") return step;
  const head = step.step ?? "";
  const tail = [step.detail, step.tool ? `(${step.tool})` : "", step.pain ? `⚠ ${step.pain}` : ""].filter(Boolean).join(" · ");
  return tail ? `${head} — ${tail}` : head;
}

/** Contents rows are derived from the section dividers so the index can never drift from the body. */
function deriveContents(sections: readonly DocumentSection[]): ContentsProps["items"] {
  return sections.filter((s): s is { type: "sectionDivider" } & SectionDividerProps => s.type === "sectionDivider").map((s) => ({ label: s.title }));
}

/** Builds the shared audit model that both the report and the deck render from. */
export function buildAuditDocument(report: AuditReportShape): WobbleDocument {
  const biz = report.businessName ?? "Client";
  const cs = report.currentState ?? {};
  const opps = report.opportunities ?? [];
  const roadmap = report.roadmap ?? [];
  const roi = report.roi ?? {};
  const risks = report.risks ?? [];
  const metrics = report.successMetrics ?? [];
  const stack = report.recommendedTechStack ?? [];
  const next = report.nextSteps ?? [];
  const bottlenecks = cs.bottlenecks ?? [];
  const hasCurrentState = (cs.acquisition ?? []).length + (cs.delivery ?? []).length + (cs.support ?? []).length > 0;

  const body: DocumentSection[] = [];

  body.push({
    type: "sectionDivider",
    numeral: 1,
    eyebrow: ["Section 01", "Executive Overview"],
    title: "Executive Summary",
    lead: report.executiveSummary ?? "",
  });

  if (roi.estimatedMonthlyUpsideCents !== undefined || roi.estimatedImplementationCents !== undefined) {
    body.push({
      type: "cardGrid",
      eyebrow: ["Section 01", "Executive Overview"],
      title: "The commercial case",
      columns: 3,
      cards: [
        { title: "Estimated monthly upside", body: formatMoney(roi.estimatedMonthlyUpsideCents), numeral: "01" },
        { title: "Implementation", body: formatMoney(roi.estimatedImplementationCents), numeral: "02" },
        { title: "Payback", body: roi.paybackMonths === undefined ? "—" : `${roi.paybackMonths} months`, numeral: "03" },
      ],
      ...(report.situationSummary ? { callout: { label: "The situation", text: report.situationSummary } } : {}),
    });
  }

  if (hasCurrentState || bottlenecks.length > 0) {
    body.push({
      type: "sectionDivider",
      numeral: 2,
      eyebrow: ["Section 02", "Current State"],
      title: "How the business runs today",
      lead: "The acquisition, delivery and support path exactly as it runs now — before anything is automated.",
    });
  }

  if (hasCurrentState) {
    body.push({
      type: "scopeList",
      eyebrow: ["Section 02", "Current State"],
      title: "The operating map",
      groups: [
        { label: "Acquisition", items: (cs.acquisition ?? []).map(stepText) },
        { label: "Delivery", items: (cs.delivery ?? []).map(stepText) },
        { label: "Support", items: (cs.support ?? []).map(stepText) },
      ].filter((g) => g.items.length > 0),
    });
  }

  if (bottlenecks.length > 0 || opps.length > 0) {
    body.push({
      type: "constraintsToOutcomes",
      eyebrow: ["Section 02", "Current State"],
      title: "From constraints to outcomes",
      constraints: bottlenecks.map((b) => [b.area, b.pain, b.businessImpact].filter(Boolean).join(" — ")),
      outcomes: opps.slice(0, 6).map((o) => ({
        label: o.title ?? o.name ?? o.area ?? "Opportunity",
        text: o.expectedOutcome ?? o.description ?? o.reason ?? "",
      })),
    });
  }

  if (opps.length > 0) {
    body.push({
      type: "sectionDivider",
      numeral: 3,
      eyebrow: ["Section 03", "Opportunities"],
      title: "Where the leverage is",
      lead: `${opps.length} prioritised AI opportunities, ordered by impact against effort.`,
    });
    // Chunked so a single slide never has to hold twelve cards.
    for (let i = 0; i < opps.length; i += 6) {
      const chunk = opps.slice(i, i + 6);
      body.push({
        type: "cardGrid",
        eyebrow: ["Section 03", "Opportunities"],
        title: opps.length > 6 ? `AI opportunities ${i + 1}–${i + chunk.length}` : "AI opportunities",
        columns: Math.min(chunk.length, 3),
        invertLast: i + 6 >= opps.length,
        cards: chunk.map((o, j) => ({
          numeral: twoDigit(i + j + 1),
          title: o.title ?? o.name ?? "Opportunity",
          body: [
            o.description ?? o.reason ?? "",
            o.expectedOutcome ? `→ ${o.expectedOutcome}` : "",
            [o.impact ? `impact ${o.impact}` : "", o.difficulty ? `effort ${o.difficulty}` : "", o.monthlyHoursSaved ? `~${o.monthlyHoursSaved}h/mo` : "", o.estimatedMonthlyValueCents ? `${formatMoney(o.estimatedMonthlyValueCents)}/mo` : ""]
              .filter(Boolean)
              .join(" · "),
          ]
            .filter(Boolean)
            .join("  "),
        })),
      });
    }
  }

  if (roadmap.length > 0) {
    body.push({
      type: "sectionDivider",
      numeral: 4,
      eyebrow: ["Section 04", "Roadmap"],
      title: "Transformation roadmap",
      lead: "Phased delivery with a working, documented outcome at the end of every phase.",
    });
    body.push({
      type: "timeline",
      eyebrow: ["Section 04", "Roadmap"],
      title: "Transformation roadmap",
      phases: roadmap.map((p, i) => ({
        period: p.months ?? `Phase ${i + 1}`,
        title: p.title ?? `Phase ${i + 1}`,
        body: [p.focus, ...(p.objectives ?? []), ...(p.deliverables ?? []), ...(p.items ?? []), p.expectedOutcome].filter(Boolean).join(" · "),
        emphasis: i === 0 ? "primary" : i === roadmap.length - 1 && roadmap.length > 1 ? "inverted" : "muted",
      })),
    });
    const first = roadmap[0];
    if (first && ((first.objectives ?? []).length > 0 || (first.deliverables ?? []).length > 0)) {
      body.push({
        type: "phaseDetail",
        eyebrow: ["Section 04", "Roadmap"],
        title: `${first.title ?? "Phase 1"} in detail`,
        stages: [
          ...(first.objectives ?? []).slice(0, 3).map((o, i) => ({ label: `Objective ${twoDigit(i + 1)}`, body: o })),
        ],
        ...((first.deliverables ?? []).length
          ? {
              panel: {
                label: "Deliverables",
                items: (first.deliverables ?? []).slice(0, 5).map((d) => ({ title: d })),
              },
            }
          : {}),
      });
    }
  }

  if (risks.length > 0) {
    body.push({
      type: "coverageMatrix",
      eyebrow: ["Section 05", "Risk"],
      title: "Risks and mitigations",
      columns: ["Mitigation"],
      rows: risks.map((r) => ({ label: r.risk ?? "Risk", cells: [r.mitigation ?? "—"] })),
    });
  }

  if (stack.length > 0) {
    body.push({
      type: "capabilities",
      eyebrow: ["Section 06", "Stack"],
      title: "What we build on",
      capabilities: stack.map((s) => ({ title: s, body: "Part of the recommended WOBBLE stack." })),
    });
  }

  if (metrics.length > 0) {
    body.push({
      type: "whatsIncluded",
      eyebrow: ["Section 06", "Measurement"],
      title: "How we measure it",
      items: metrics.map((m) => ({ title: m })),
    });
  }

  if (next.length > 0) {
    body.push({
      type: "systemDiagram",
      eyebrow: ["Section 07", "Next Steps"],
      title: "Where we start",
      nodes: next.map((n) => ({ title: n })),
      note: "Each step is a working outcome, not a status update.",
    });
  }

  const sections: DocumentSection[] = [
    {
      type: "cover",
      eyebrow: ["Wobble", "AI Transformation Audit"],
      title: biz,
      subtitle:
        report.executiveSummary ??
        `A full AI opportunity audit — current-state map, ${opps.length} prioritised opportunities, a phased roadmap and the commercial case.`,
      metaRight: ["AI Transformation Audit", "Confidential · Prepared by Wobble"],
      footerRight: [report.industry ?? "AI Readiness"],
    },
    { type: "contents", title: "Contents", note: "Findings & roadmap", items: deriveContents(body), cta: { label: "The commercial case" } },
    ...body,
  ];

  return {
    kind: "audit",
    client: biz,
    title: "AI Transformation Audit",
    subtitle: report.situationSummary ?? undefined,
    meta: { confidential: true, audience: "Owner / management" },
    sections,
    commercials: {
      eyebrow: ["Investment", "Approval"],
      title: "The commercial case",
      headlineLabel: "Estimated implementation",
      totalCents: roi.estimatedImplementationCents ?? 0,
      splits: [
        { label: "Est. monthly upside", value: formatMoney(roi.estimatedMonthlyUpsideCents) },
        { label: "Payback", value: roi.paybackMonths === undefined ? "—" : `${roi.paybackMonths} months` },
      ],
      terms: (roi.breakdown ?? []).map((b) => ({ label: b.area ?? "Area", value: `${formatMoney(b.monthlyValueCents)}/mo` })),
      approval: {
        eyebrow: "Approval",
        title: "Let's build it",
        body: "Approval authorises Wobble to sequence the roadmap, confirm access and start Phase 1.",
        parties: [
          { label: "Client approval", fields: ["Name", "Title", "Signature"] },
          { label: "Wobble approval", fields: ["Name", "Title", "Signature"] },
        ],
      },
    },
  };
}

/** Legacy: long-form audit report. Same signature, now rendered as a WOBBLE prose document. */
export function renderAuditReportHtml(report: AuditReportShape): string {
  return renderDocument(buildAuditDocument(report), "document");
}

/** Legacy: present-ready audit deck. Same signature, now a 16:9 WOBBLE stage deck. */
export function renderAuditDeckHtml(report: AuditReportShape): string {
  return renderDocument(buildAuditDocument(report), "deck16x9");
}

/** Builds the proposal model. Exported so callers can render it in any of the three formats. */
export function buildProposalDocument(proposal: ProposalShape): WobbleDocument {
  const title = proposal.title ?? "Proposal";
  const currency = proposal.currency ?? "USD";
  const services = proposal.services ?? [];
  const timeline = proposal.timeline ?? [];

  const body: DocumentSection[] = [];

  if (proposal.scope) {
    body.push({
      type: "sectionDivider",
      numeral: 1,
      eyebrow: ["Section 01", "Overview"],
      title: "The engagement",
      lead: proposal.scope,
    });
  }

  if (services.length > 0) {
    body.push({
      type: "whatsIncluded",
      eyebrow: ["Section 02", "Scope"],
      title: "What's included",
      items: services.map((s) => ({
        title: s.name ?? "Service",
        body: [s.description ?? "", s.priceCents ? formatMoney(s.priceCents, currency) : "Included"].filter(Boolean).join(" · "),
      })),
    });
  }

  if (timeline.length > 0) {
    body.push({
      type: "timeline",
      eyebrow: ["Section 03", "Delivery"],
      title: "How we'll deliver",
      phases: timeline.map((t, i) => ({
        period: t.months ?? `Phase ${i + 1}`,
        title: t.phase ?? `Phase ${i + 1}`,
        ...(t.focus ? { body: t.focus } : {}),
        emphasis: i === 0 ? "primary" : i === timeline.length - 1 && timeline.length > 1 ? "inverted" : "muted",
      })),
    });
  }

  const sections: DocumentSection[] = [
    {
      type: "cover",
      eyebrow: ["Wobble", "Proposal"],
      title,
      subtitle: proposal.scope ?? "Scope, services, timeline and investment for your Wobble AI OS engagement.",
      metaRight: ["Proposal", "Confidential · Valid 30 days"],
      footerRight: ["Prepared by Wobble"],
    },
    { type: "contents", title: "Contents", note: "Scope & investment", items: deriveContents(body), cta: { label: "Investment & approval" } },
    ...body,
  ];

  return {
    kind: "proposal",
    client: title,
    title,
    meta: { confidential: true },
    sections,
    commercials: {
      eyebrow: ["Investment", "Approval"],
      title: "Investment",
      headlineLabel: "Total investment",
      currency,
      totalCents: proposal.pricingCents ?? 0,
      lineItems: services.map((s) => ({
        label: s.name ?? "Service",
        ...(s.description ? { detail: s.description } : {}),
        ...(s.priceCents === undefined ? {} : { amountCents: s.priceCents }),
      })),
      ...(proposal.terms ? { terms: [{ label: "Terms", value: proposal.terms }] } : {}),
      approval: {
        eyebrow: "Approval",
        title: "Let's make work wobble",
        body: "Approval authorises Wobble to confirm the delivery calendar, access checklist and first operating plan.",
        parties: [
          { label: "Client approval", fields: ["Name", "Title", "Signature"] },
          { label: "Wobble approval", fields: ["Name", "Title", "Signature"] },
        ],
      },
    },
  };
}

/** Legacy: proposal document. Same signature, now rendered through the design system. */
export function renderProposalHtml(proposal: ProposalShape): string {
  return renderDocument(buildProposalDocument(proposal), "document");
}

export { esc, eyebrowText, twoDigit };
