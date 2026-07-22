import { describe, expect, it } from "vitest";
import {
  ALLOWED_HEXES,
  COLORS,
  FONT_FILES,
  FONT_STACKS,
  FORMATS,
  LAYOUT,
  LINES,
  TEXT,
  TYPE,
  cardCss,
  contentsRowCss,
  fontFaceCss,
  pageSizeCss,
  scaleFontSize,
  space,
  typeCss,
} from "@/lib/design-system/tokens";
import {
  brandTitle,
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
} from "@/lib/design-system/archetypes";

describe("design tokens", () => {
  it("carries the founder's exact brand values", () => {
    expect(COLORS.black).toBe("#0A0A0A");
    expect(COLORS.lime).toBe("#B8FF2C");
    expect(COLORS.cardSurface).toBe("#141414");
    expect(COLORS.limeHover).toBe("#d4ff7a");
    expect(COLORS.onLime).toBe("#0A0A0A");
    expect(COLORS.mutedOnLime).toBe("rgba(10,10,10,.72)");
  });

  it("carries the exact text ladder on black", () => {
    expect([TEXT.l1, TEXT.l2, TEXT.l3, TEXT.l4, TEXT.l5, TEXT.l6]).toEqual([
      "#fff",
      "rgba(255,255,255,.72)",
      "rgba(255,255,255,.7)",
      "rgba(255,255,255,.62)",
      "rgba(255,255,255,.5)",
      "rgba(255,255,255,.45)",
    ]);
  });

  it("carries the exact hairlines, ghost numeral and lime tint", () => {
    expect(LINES.hairline).toBe("rgba(255,255,255,.13)");
    expect(LINES.hairlineStrong).toBe("rgba(255,255,255,.14)");
    expect(LINES.ghostNumeral).toBe("rgba(184,255,44,.07)");
    expect(LINES.limeTintBg).toBe("rgba(184,255,44,.07)");
    expect(LINES.limeTintBorder).toBe("rgba(184,255,44,.4)");
  });

  it("names Satoshi for display and General Sans for body", () => {
    expect(FONT_STACKS.display.startsWith("'Satoshi'")).toBe(true);
    expect(FONT_STACKS.body.startsWith("'General Sans'")).toBe(true);
    // The stacks must degrade to something readable if a woff2 fails to load.
    expect(FONT_STACKS.display).toContain("sans-serif");
    expect(FONT_STACKS.body).toContain("sans-serif");
  });

  it("carries the exact deck type scale", () => {
    expect(TYPE.coverH1).toMatchObject({ size: 290, weight: 900, lineHeight: 0.8, letterSpacing: "-.04em" });
    expect(TYPE.sectionH2).toMatchObject({ size: 120, lineHeight: 0.92, letterSpacing: "-.03em" });
    expect(TYPE.sectionH2Short.size).toBe(132);
    expect(TYPE.statementH2).toMatchObject({ size: 100, lineHeight: 0.98 });
    expect(TYPE.contentsH2.size).toBe(84);
    expect(TYPE.slideH2).toMatchObject({ size: 62, lineHeight: 1, letterSpacing: "-.02em" });
    expect(TYPE.lead).toMatchObject({ size: 27, lineHeight: 1.5 });
    expect(TYPE.body.size).toBe(23);
    expect(TYPE.bodyLarge.size).toBe(26);
    expect(TYPE.cardBody).toMatchObject({ size: 18, lineHeight: 1.5 });
    expect(TYPE.cardNumeral).toMatchObject({ size: 34, weight: 900 });
    expect(TYPE.ghostNumeral.size).toBe(560);
    expect(TYPE.eyebrow).toMatchObject({ size: 18, weight: 600, letterSpacing: ".26em", uppercase: true });
    expect(TYPE.eyebrowSmall.letterSpacing).toBe(".2em");
    expect(TYPE.eyebrowLarge).toMatchObject({ size: 21, letterSpacing: ".28em" });
  });

  it("carries the exact stage + card + contents layout metrics", () => {
    expect(LAYOUT.stagePaddingY).toBe(78);
    expect(LAYOUT.stagePaddingYWide).toBe(88);
    expect(LAYOUT.stagePaddingX).toBe(100);
    expect(LAYOUT.cardPaddingY).toBe(28);
    expect(LAYOUT.cardPaddingX).toBe(24);
    expect(LAYOUT.cardRuleWidth).toBe(3);
    expect(LAYOUT.contentsRowPaddingY).toBe(13);
    expect(LAYOUT.contentsRowGap).toBe(26);
    expect(LAYOUT.contentsNumeralWidth).toBe(44);
  });

  it("emits the exact card surface + contents row from the deck", () => {
    expect(cardCss("deck16x9")).toBe("background:#141414;border-top:3px solid #B8FF2C;padding:28px 24px;");
    expect(cardCss("deck16x9", { inverted: true })).toBe("background:#B8FF2C;color:#0A0A0A;padding:28px 24px;");
    expect(contentsRowCss("deck16x9")).toContain("border-top:1px solid rgba(255,255,255,.13)");
    expect(contentsRowCss("deck16x9")).toContain("padding:13px 0");
    expect(contentsRowCss("deck16x9")).toContain("gap:26px");
  });

  it("self-hosts both faces with font-display:swap and local paths", () => {
    const css = fontFaceCss();
    expect(FONT_FILES).toHaveLength(8);
    expect(css).toContain("@font-face");
    expect(css).toContain("/fonts/satoshi-900.woff2");
    expect(css).toContain("/fonts/general-sans-600.woff2");
    expect(css).toContain("font-display:swap");
    // Generated documents must render offline — never hotlink the CDN.
    expect(css).not.toContain("fontshare.com");
    expect(css).not.toContain("http");
    expect(fontFaceCss("file:///C:/app/public/fonts")).toContain("file:///C:/app/public/fonts/satoshi-400.woff2");
  });

  it("keeps the allowed palette in sync with the tokens", () => {
    for (const hex of [COLORS.black, COLORS.lime, COLORS.cardSurface, COLORS.limeHover, COLORS.gallery]) {
      expect(ALLOWED_HEXES).toContain(hex.replace("#", "").toLowerCase());
    }
  });
});

describe("format scaling", () => {
  it("gives each format its own page geometry", () => {
    expect(pageSizeCss("deck16x9")).toBe("1920px 1080px");
    expect(pageSizeCss("deckA4")).toBe("595pt 842pt");
    expect(pageSizeCss("document")).toBe("612pt 792pt");
    const sizes = new Set([pageSizeCss("deck16x9"), pageSizeCss("deckA4"), pageSizeCss("document")]);
    expect(sizes.size).toBe(3);
  });

  it("scales display type ~55% for A4 and keeps deck sizes at 1:1", () => {
    expect(scaleFontSize(TYPE.coverH1, "deck16x9")).toBe(290);
    expect(FORMATS.deckA4.displayRatio).toBe(0.55);
    expect(scaleFontSize(TYPE.coverH1, "deckA4")).toBe(159.5);
    expect(scaleFontSize(TYPE.slideH2, "document")).toBeLessThan(scaleFontSize(TYPE.slideH2, "deckA4"));
  });

  it("scales body type on a gentler curve so prose stays legible", () => {
    // The whole reason two ratios exist: 23px * 0.42 would be a 9.7px body.
    expect(scaleFontSize(TYPE.body, "document")).toBeGreaterThan(TYPE.body.size * FORMATS.document.displayRatio);
    expect(scaleFontSize(TYPE.cardBody, "deckA4")).toBeGreaterThan(11);
    expect(scaleFontSize(TYPE.cardBody, "document")).toBeGreaterThan(11);
  });

  it("scales spacing per format", () => {
    expect(space(LAYOUT.stagePaddingX, "deck16x9")).toBe(100);
    expect(space(LAYOUT.stagePaddingX, "deckA4")).toBe(60);
    expect(space(LAYOUT.stagePaddingX, "document")).toBe(60);
  });

  it("emits a complete inline declaration list", () => {
    const css = typeCss(TYPE.eyebrow, "deck16x9");
    expect(css).toContain("font-family:'General Sans'");
    expect(css).toContain("font-weight:600");
    expect(css).toContain("font-size:18px");
    expect(css).toContain("letter-spacing:.26em");
    expect(css).toContain("text-transform:uppercase");
  });
});

describe("brand grammar primitives", () => {
  it("escapes every caller-supplied string", () => {
    expect(esc('Acme <Dental> & "Co"')).toBe("Acme &lt;Dental&gt; &amp; &quot;Co&quot;");
  });

  it("joins eyebrow parts with the brand separator", () => {
    expect(eyebrowText(["Section 01", "Executive Overview"])).toBe("Section 01 · Executive Overview");
    expect(eyebrowText("Confidential · Board of Directors")).toBe("Confidential · Board of Directors");
  });

  it("renders two-digit numerals", () => {
    expect(twoDigit(1)).toBe("01");
    expect(twoDigit(12)).toBe("12");
    expect(twoDigit("→")).toBe("→");
  });

  it("puts a lime period on the end of a title, appending one if the author forgot", () => {
    expect(brandTitle("Contents", COLORS.lime)).toBe('Contents<span style="color:#B8FF2C">.</span>');
    expect(brandTitle("Contents.", COLORS.lime)).toBe('Contents<span style="color:#B8FF2C">.</span>');
    expect(brandTitle("PROPOSAL.", COLORS.lime, ["PRO", "POSAL."])).toBe(
      'PRO<br>POSAL<span style="color:#B8FF2C">.</span>',
    );
  });
});

describe("archetypes", () => {
  const formats = ["deck16x9", "deckA4", "document"] as const;

  it("renders a cover with wordmark, lime period and meta", () => {
    const html = renderCover(
      { eyebrow: ["Integrated Digital Transformation"], title: "PROPOSAL.", titleLines: ["PRO", "POSAL."], subtitle: "One governed partnership.", metaRight: ["Strategic Proposal · July 2026", "Confidential · Board of Directors"] },
      "deck16x9",
    );
    expect(html).toContain('data-archetype="cover"');
    expect(html).toContain("wobble");
    expect(html).toContain("PRO<br>POSAL");
    // Eyebrows are uppercased by CSS, not by mangling the source text.
    expect(html).toContain("Integrated Digital Transformation");
    expect(html).toContain("text-transform:uppercase");
    expect(html).toContain("Confidential · Board of Directors");
  });

  it("renders a full-lime statement", () => {
    const html = renderStatement({ eyebrow: "The Core Proposition", title: "A combined transformation program.", columns: ["A", "B"] }, "deck16x9");
    expect(html).toContain('data-archetype="statement"');
    expect(html).toContain(`background:${COLORS.lime}`);
    expect(html).toContain(`color:${COLORS.onLime}`);
  });

  it("renders a numbered contents index with a highlighted CTA row", () => {
    const html = renderContents(
      { title: "Contents", items: [{ label: "Executive Overview" }, { label: "Roadmap" }, { label: "Scope" }], cta: { label: "Commercial Summary & Approval" } },
      "deck16x9",
    );
    expect(html).toContain('data-archetype="contents"');
    expect(html).toContain(">01<");
    expect(html).toContain(">02<");
    expect(html).toContain("wob-contents-cta");
    expect(html).toContain(LINES.limeTintBg);
    expect(html).toContain("Commercial Summary &amp; Approval");
  });

  it("renders a section divider with the ghost numeral watermark", () => {
    const html = renderSectionDivider({ eyebrow: ["Section 01"], title: "Executive Overview", numeral: 1, lead: "One partnership." }, "deck16x9");
    expect(html).toContain('data-archetype="sectionDivider"');
    expect(html).toContain("wob-ghost-numeral");
    expect(html).toContain(LINES.ghostNumeral);
    expect(html).toContain('>01</div>');
    expect(html).toContain('<span style="color:#B8FF2C">.</span>');
  });

  it("inverts the last card in a card set and can carry a decision callout", () => {
    const html = renderCardGrid(
      {
        eyebrow: ["Section 01", "Executive Overview"],
        title: "What management receives",
        cards: [{ title: "One" }, { title: "Two" }, { title: "Three" }],
        callout: { label: "Management decision", text: "Approve one governed monthly engagement." },
      },
      "deck16x9",
    );
    expect(html).toContain('data-archetype="cardGrid"');
    expect(html).toContain("border-top:3px solid #B8FF2C");
    // Exactly one inverted (lime-background) card — the last one.
    expect(html.match(/background:#B8FF2C;color:#0A0A0A/g)).toHaveLength(1);
    expect(html.indexOf("Three")).toBeGreaterThan(html.indexOf("background:#B8FF2C;color:#0A0A0A"));
    expect(html).toContain("wob-callout");
  });

  it("renders constraints beside outcomes", () => {
    const html = renderConstraintsToOutcomes(
      { eyebrow: "Section 02", title: "From constraints to outcomes", constraints: ["Leads scattered"], outcomes: [{ label: "Sales responsiveness", text: "Every lead enters a pipeline." }] },
      "deck16x9",
    );
    expect(html).toContain('data-archetype="constraintsToOutcomes"');
    expect(html).toContain("Current business constraints");
    expect(html).toContain("Target operating outcomes");
    expect(html.indexOf("Leads scattered")).toBeLessThan(html.indexOf("Every lead enters a pipeline."));
  });

  it("renders a coverage matrix as a real table", () => {
    const html = renderCoverageMatrix({ eyebrow: "Coverage", title: "Coverage", columns: ["Matter", "Envicrete"], rows: [{ label: "Reels", cells: ["8", "7"] }] }, "deck16x9");
    expect(html).toContain('data-archetype="coverageMatrix"');
    expect(html).toContain("<table");
    expect(html).toContain("<thead>");
    expect(html).toContain("Envicrete");
  });

  it("renders a labelled system diagram with numbered nodes", () => {
    const html = renderSystemDiagram({ eyebrow: "Phase 2", title: "Eight connected layers", nodes: [{ title: "Planning" }, { title: "Publishing" }] }, "deck16x9");
    expect(html).toContain('data-archetype="systemDiagram"');
    expect(html).toContain("wob-node");
    expect(html).toContain(">01<");
  });

  it("renders a phased timeline with an inverted future state", () => {
    const html = renderTimeline(
      { eyebrow: "Section 04", title: "Phased delivery", phases: [{ period: "Months 1 to 3", title: "Phase 1" }, { period: "Future", title: "Wobble AIOS", emphasis: "inverted" }] },
      "deck16x9",
    );
    expect(html).toContain('data-archetype="timeline"');
    expect(html).toContain("wob-phase");
    expect(html).toContain("Months 1 to 3");
    expect(html).toContain(`background:${COLORS.lime};color:${COLORS.onLime}`);
  });

  it("renders phase detail with a KPI panel", () => {
    const html = renderPhaseDetail(
      { eyebrow: "Phase 1", title: "Delivery cadence & KPIs", stages: [{ label: "Month 1", body: "Define" }], panel: { label: "Phase 1 operating KPIs", items: [{ title: "Capture completeness" }] } },
      "deck16x9",
    );
    expect(html).toContain('data-archetype="phaseDetail"');
    expect(html).toContain("Phase 1 operating KPIs");
    expect(html).toContain("Capture completeness");
  });

  it("renders a grouped scope list", () => {
    const html = renderScopeList({ eyebrow: "Phase 1", title: "One core, two pipelines", groups: [{ label: "Shared foundation", items: ["Central lead database"], footer: "Enquiry → won" }] }, "deck16x9");
    expect(html).toContain('data-archetype="scopeList"');
    expect(html).toContain("wob-scope-group");
    expect(html).toContain("Central lead database");
    expect(html).toContain("Enquiry → won");
  });

  it("renders capabilities with the last one inverted", () => {
    const html = renderCapabilities({ eyebrow: "Future AIOS", title: "Capabilities", capabilities: [{ title: "Unified data", body: "a" }, { title: "Command centre", body: "b" }] }, "deck16x9");
    expect(html).toContain('data-archetype="capabilities"');
    expect(html.match(/background:#B8FF2C;color:#0A0A0A/g)).toHaveLength(1);
  });

  it("renders a what's-included checklist", () => {
    const html = renderWhatsIncluded({ eyebrow: "Commercial Coverage Summary", title: "Everything in one monthly fee", items: [{ title: "Strategy" }, { title: "AIOS readiness" }] }, "deck16x9");
    expect(html).toContain('data-archetype="whatsIncluded"');
    expect(html).toContain("&#10003;");
  });

  it("renders the investment slide with a lime period on the figure", () => {
    const html = renderInvestment({ eyebrow: "Investment & Approval", title: "Investment", amount: "PKR 300,000", amountLines: ["PKR", "300,000"], splits: [{ label: "Matter", value: "PKR 150,000" }], terms: [{ label: "Billing", value: "Monthly in advance." }] }, "deck16x9");
    expect(html).toContain('data-archetype="investment"');
    expect(html).toContain("PKR<br>300,000");
    expect(html).toContain('<span style="color:#B8FF2C">.</span>');
    expect(html).toContain("Monthly in advance.");
  });

  it("renders an approval sign-off on lime", () => {
    const html = renderApproval({ eyebrow: "Approval", title: "Let's make work wobble", parties: [{ label: "Client approval", fields: ["Name", "Signature"] }] }, "deck16x9");
    expect(html).toContain('data-archetype="approval"');
    expect(html).toContain(`background:${COLORS.lime}`);
    expect(html).toContain("Client approval");
    expect(html).toContain("Signature");
  });

  it("renders every archetype in all three formats without throwing", () => {
    for (const format of formats) {
      const all = [
        renderCover({ eyebrow: "e", title: "Cover." }, format),
        renderStatement({ eyebrow: "e", title: "Statement." }, format),
        renderContents({ items: [{ label: "One" }] }, format),
        renderSectionDivider({ eyebrow: "e", title: "Divider.", numeral: 3 }, format),
        renderCardGrid({ eyebrow: "e", title: "Cards", cards: [{ title: "a" }, { title: "b" }] }, format),
        renderConstraintsToOutcomes({ eyebrow: "e", title: "C→O", constraints: ["x"], outcomes: [{ label: "l", text: "t" }] }, format),
        renderCoverageMatrix({ eyebrow: "e", title: "Matrix", columns: ["A"], rows: [{ label: "r", cells: ["1"] }] }, format),
        renderSystemDiagram({ eyebrow: "e", title: "Diagram", nodes: [{ title: "n" }] }, format),
        renderTimeline({ eyebrow: "e", title: "Timeline", phases: [{ period: "p", title: "t" }] }, format),
        renderPhaseDetail({ eyebrow: "e", title: "Phase", stages: [{ label: "l", body: "b" }] }, format),
        renderScopeList({ eyebrow: "e", title: "Scope", groups: [{ label: "g", items: ["i"] }] }, format),
        renderCapabilities({ eyebrow: "e", title: "Caps", capabilities: [{ title: "c", body: "b" }] }, format),
        renderWhatsIncluded({ eyebrow: "e", title: "Included", items: [{ title: "i" }] }, format),
        renderInvestment({ eyebrow: "e", title: "Investment", amount: "$1,000" }, format),
        renderApproval({ eyebrow: "e", title: "Approval.", parties: [{ label: "p", fields: ["Name"] }] }, format),
      ];
      expect(all).toHaveLength(15);
      for (const html of all) {
        expect(html.startsWith('<section class="wob-stage"')).toBe(true);
        expect(html).toContain("data-archetype=");
      }
    }
  });

  it("gives a stage a fixed height on decks and a natural height in a document", () => {
    expect(renderCardGrid({ eyebrow: "e", title: "t", cards: [{ title: "a" }] }, "deck16x9")).toContain("height:100%");
    expect(renderCardGrid({ eyebrow: "e", title: "t", cards: [{ title: "a" }] }, "document")).not.toContain("height:100%");
  });

  it("shrinks an over-long display headline instead of letting it bleed off the stage", () => {
    const short = renderCover({ eyebrow: "e", title: "ACME." }, "deck16x9");
    const long = renderCover({ eyebrow: "e", title: "Northgate Orthodontic Partners" }, "deck16x9");
    // Short title keeps the full 290px cover H1 and adds no override.
    expect(short).toContain("font-size:290px;line-height:0.8;letter-spacing:-.04em;\">");
    // A 30-character client name is clamped to the 0.3 floor: 290 * 0.3 = 87px.
    expect(long).toContain("font-size:87px;");
  });
});
