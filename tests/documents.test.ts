import { describe, expect, it } from "vitest";
import {
  buildAuditDocument,
  buildProposalDocument,
  formatMoney,
  orderSections,
  renderAuditDeckHtml,
  renderAuditReportHtml,
  renderDocument,
  renderProposalHtml,
  type DocumentSection,
  type WobbleDocument,
} from "@/lib/documents";
import { runBrandQa } from "@/lib/documents/brand-qa";
import { pdfPageOptions } from "@/lib/documents/pdf";

const SAMPLE_SECTIONS: DocumentSection[] = [
  { type: "cover", eyebrow: ["Wobble", "Proposal"], title: "PROPOSAL.", subtitle: "One governed partnership." },
  { type: "contents", title: "Contents.", items: [{ label: "Executive Overview" }], cta: { label: "Commercial Summary" } },
  { type: "sectionDivider", eyebrow: ["Section 01", "Executive Overview"], title: "Executive Overview.", numeral: 1, lead: "One partnership." },
  {
    type: "cardGrid",
    eyebrow: ["Section 01", "Executive Overview"],
    title: "What management receives",
    cards: [{ title: "Always-on brand operations" }, { title: "System development program" }, { title: "Future integration path" }],
    callout: { label: "Management decision", text: "Approve one governed monthly engagement." },
  },
];

function sampleDoc(overrides?: Partial<WobbleDocument>): WobbleDocument {
  return {
    kind: "proposal",
    client: "Matter & Envicrete",
    title: "Integrated Digital Transformation.",
    sections: SAMPLE_SECTIONS,
    commercials: {
      eyebrow: ["Investment", "Approval"],
      title: "Investment",
      headlineLabel: "Combined monthly professional fee",
      amount: "PKR 300,000",
      splits: [{ label: "Matter", value: "PKR 150,000" }],
      terms: [{ label: "Billing", value: "Monthly in advance." }],
      approval: { eyebrow: "Approval", title: "Let's make work wobble.", parties: [{ label: "Client approval", fields: ["Name", "Signature"] }] },
    },
    ...overrides,
  };
}

describe("renderDocument", () => {
  it("emits a self-contained document with no external requests", () => {
    const html = renderDocument(sampleDoc(), "deck16x9");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("@font-face");
    expect(html).toContain("/fonts/satoshi-900.woff2");
    expect(html).not.toContain("fontshare.com");
    expect(html).not.toContain("<link");
    expect(html).not.toContain("src=\"http");
  });

  it("escapes client-supplied content", () => {
    const html = renderDocument(sampleDoc({ client: "Acme <Dental>" }), "document");
    expect(html).toContain("Acme &lt;Dental&gt;");
    expect(html).not.toContain("Acme <Dental>");
  });

  it("gives each format a different page size and frame", () => {
    const deck = renderDocument(sampleDoc(), "deck16x9");
    const a4 = renderDocument(sampleDoc(), "deckA4");
    const doc = renderDocument(sampleDoc(), "document");

    expect(deck).toContain("@page{size:1920px 1080px;margin:0}");
    expect(a4).toContain("@page{size:595pt 842pt;margin:0}");
    expect(doc).toContain("@page{size:612pt 792pt;margin:0}");

    expect(deck).toContain('class="wob-deck"');
    expect(deck).toContain("ArrowRight"); // present mode survives the rewrite
    expect(a4).toContain('class="wob-page"');
    expect(a4).not.toContain('class="wob-deck"');
    expect(doc).toContain('class="wob-doc"');
    expect(doc).not.toContain('class="wob-slide"');

    const sizes = new Set([
      /@page\{size:([^;]+);/.exec(deck)?.[1],
      /@page\{size:([^;]+);/.exec(a4)?.[1],
      /@page\{size:([^;]+);/.exec(doc)?.[1],
    ]);
    expect(sizes.size).toBe(3);
  });

  it("gives the document format a running WOBBLE / CLIENT header and PAGE n footers", () => {
    const html = renderDocument(sampleDoc({ client: "Matter" }), "document");
    expect(html).toContain('class="wob-running"');
    expect(html).toContain(">WOBBLE<");
    expect(html).toContain(">MATTER<");
    expect(html).toContain("PAGE 01");
    expect(html).toContain("PAGE 02");
  });

  it("always renders commercials last, even when an investment section is passed first", () => {
    const doc = sampleDoc({
      sections: [
        { type: "investment", eyebrow: "Investment", title: "Investment", amount: "PKR 300,000" },
        ...SAMPLE_SECTIONS,
      ],
      commercials: undefined,
    });
    const html = renderDocument(doc, "deck16x9");
    expect(html.indexOf('data-archetype="investment"')).toBeGreaterThan(html.indexOf('data-archetype="cardGrid"'));
    expect(html.indexOf('data-archetype="investment"')).toBeGreaterThan(html.indexOf('data-archetype="cover"'));
  });

  it("renders the commercials block after every authored section", () => {
    const html = renderDocument(sampleDoc(), "deck16x9");
    expect(html.indexOf('data-archetype="investment"')).toBeGreaterThan(html.lastIndexOf('data-archetype="cardGrid"'));
    expect(html.indexOf('data-archetype="approval"')).toBeGreaterThan(html.indexOf('data-archetype="investment"'));
    expect(html).toContain("PKR 300,000");
  });

  it("hoists commercial sections while preserving relative order of the rest", () => {
    const ordered = orderSections([
      { type: "approval", eyebrow: "a", title: "A.", parties: [] },
      { type: "cover", eyebrow: "e", title: "Cover." },
      { type: "investment", eyebrow: "i", title: "I", amount: "$1" },
      { type: "cardGrid", eyebrow: "e", title: "Cards", cards: [{ title: "x" }] },
    ]);
    expect(ordered.map((s) => s.type)).toEqual(["cover", "cardGrid", "investment", "approval"]);
  });
});

describe("invoices", () => {
  const invoice: WobbleDocument = {
    kind: "invoice",
    client: "Matter",
    title: "Invoice",
    subtitle: "For services rendered in July 2026.",
    sections: [],
    commercials: {
      invoiceNumber: "WOB-2026-014",
      issuedDate: "01 July 2026",
      dueDate: "08 July 2026",
      currency: "USD",
      totalCents: 900000,
      billTo: ["Matter Interiors LLC", "Karachi"],
      lineItems: [
        { label: "Monthly operating retainer", detail: "Content + CRM", qty: 1, amountCents: 700000 },
        { label: "Website management", amountCents: 200000 },
        { label: "Quarterly review", detail: "Director session" },
      ],
      paymentTerms: "Payable within 7 calendar days of invoice.",
      paymentDetails: [{ label: "Bank", value: "Meezan Bank" }],
      notes: "External media spend is billed separately at actual cost.",
    },
  };

  it("uses the document layout, not slide archetypes", () => {
    const html = renderDocument(invoice, "deck16x9"); // format is deliberately ignored
    expect(html).toContain('data-archetype="invoice"');
    expect(html).toContain('class="wob-doc"');
    expect(html).not.toContain('class="wob-slide"');
    expect(html).not.toContain('class="wob-deck"');
    expect(html).not.toContain('data-archetype="cover"');
    expect(html).not.toContain('data-archetype="sectionDivider"');
    expect(html).toContain("@page{size:612pt 792pt;margin:0}");
  });

  it("leads with amount due, due date, line items and payment terms", () => {
    const html = renderDocument(invoice, "document");
    expect(html).toContain("Amount due");
    expect(html).toContain("$9,000");
    expect(html).toContain("08 July 2026");
    expect(html).toContain("WOB-2026-014");
    expect(html).toContain("Monthly operating retainer");
    expect(html).toContain("Content + CRM");
    expect(html).toContain("Included"); // priceless line item
    expect(html).toContain("Total due");
    expect(html).toContain("Payment terms");
    expect(html).toContain("Payable within 7 calendar days of invoice.");
    // Amount due must come before the line items, not after.
    expect(html.indexOf("Amount due")).toBeLessThan(html.indexOf("Monthly operating retainer"));
  });
});

describe("brand QA", () => {
  it("passes a well-formed document", () => {
    const doc = sampleDoc();
    const result = runBrandQa(doc, renderDocument(doc, "deck16x9"));
    expect(result.violations.filter((v) => v.severity === "error")).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("catches an off-palette colour in the rendered HTML", () => {
    const doc = sampleDoc();
    const html = `${renderDocument(doc, "deck16x9")}<div style="color:#ff0000">oops</div>`;
    const result = runBrandQa(doc, html);
    expect(result.ok).toBe(false);
    const offPalette = result.violations.filter((v) => v.code === "OFF_PALETTE_COLOR");
    expect(offPalette).toHaveLength(1);
    expect(offPalette[0]?.message).toContain("#ff0000");
  });

  it("catches a title missing its trailing period", () => {
    const doc = sampleDoc({
      title: "Integrated Digital Transformation",
      sections: [{ type: "sectionDivider", eyebrow: "Section 01", title: "Executive Overview", numeral: 1 }],
    });
    const codes = runBrandQa(doc).violations.map((v) => v.code);
    expect(codes.filter((c) => c === "TITLE_MISSING_TRAILING_PERIOD")).toHaveLength(2);
  });

  it("catches a missing eyebrow, empty fields and mis-placed commercials", () => {
    const doc: WobbleDocument = {
      kind: "proposal",
      client: "",
      title: "Proposal.",
      sections: [
        { type: "investment", eyebrow: "Investment", title: "Investment", amount: "$1" },
        { type: "cardGrid", eyebrow: "", title: "Cards", cards: [{ title: "a" }] },
      ],
    };
    const codes = runBrandQa(doc).violations.map((v) => v.code);
    expect(codes).toContain("EMPTY_REQUIRED_FIELD");
    expect(codes).toContain("MISSING_EYEBROW");
    expect(codes).toContain("COMMERCIALS_NOT_LAST");
  });

  it("flags slide sections on an invoice", () => {
    const codes = runBrandQa({ kind: "invoice", client: "Matter", title: "Invoice", sections: SAMPLE_SECTIONS }).violations.map((v) => v.code);
    expect(codes).toContain("INVOICE_HAS_SLIDES");
  });
});

describe("legacy wrappers", () => {
  const REPORT = {
    businessName: "Acme <Dental>",
    executiveSummary: "Leaking leads at the front desk.",
    situationSummary: "Front desk is the bottleneck.",
    currentState: {
      acquisition: ["Meta ads"],
      delivery: ["manual booking"],
      support: ["phone"],
      bottlenecks: [{ area: "front desk", pain: "misses calls", severity: "high" }],
    },
    opportunities: [{ title: "Missed-call text-back", area: "front desk", description: "auto text", impact: "high", difficulty: "low", expectedOutcome: "no lost calls" }],
    roadmap: [{ title: "Phase 1", months: "Month 1-3", focus: "quick wins", objectives: ["Ship text-back"], deliverables: ["Text-back live"] }],
    roi: { estimatedMonthlyUpsideCents: 1500000, estimatedImplementationCents: 900000, paybackMonths: 2 },
    risks: [{ risk: "Adoption", mitigation: "Training" }],
    successMetrics: ["Response time"],
    recommendedTechStack: ["Twilio"],
    nextSteps: ["Kick off"],
  };

  it("renderAuditReportHtml still returns a full HTML document", () => {
    const html = renderAuditReportHtml(REPORT);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Acme &lt;Dental&gt;");
    expect(html).not.toContain("Acme <Dental>");
    expect(html).toContain("Missed-call text-back");
    expect(html).toContain("Phase 1");
    expect(html).toContain("$15,000"); // monthly upside
    expect(html).toContain("Executive Summary");
    expect(html).toContain("Transformation roadmap");
    expect(html).toContain('class="wob-doc"'); // document, not slides
  });

  it("renderAuditDeckHtml still returns a navigable deck", () => {
    const html = renderAuditDeckHtml(REPORT);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('class="wob-deck"');
    expect(html).toContain("ArrowRight");
    expect(html).toContain("Acme &lt;Dental&gt;");
    expect(html).toContain("Missed-call text-back");
    expect(html).toContain("Transformation roadmap");
    expect(html).toContain("@page{size:1920px 1080px;margin:0}");
  });

  it("renderProposalHtml still returns services, totals and terms", () => {
    const html = renderProposalHtml({
      title: "Acme — Wobble AI OS Proposal",
      pricingCents: 900000,
      scope: "Front-desk automation.",
      services: [{ name: "Missed-call text-back", description: "auto text", priceCents: 400000 }, { name: "AI receptionist" }],
      timeline: [{ phase: "Phase 1", months: "Month 1-3", focus: "quick wins" }],
      terms: "Net 7.",
    });
    expect(html).toContain("Acme — Wobble AI OS Proposal");
    expect(html).toContain("Missed-call text-back");
    expect(html).toContain("AI receptionist");
    expect(html).toContain("Included"); // service with no price
    expect(html).toContain("$9,000"); // total
    expect(html).toContain("Total investment");
    expect(html).toContain("Net 7.");
  });

  it("keeps the price after the value in the rebuilt legacy documents", () => {
    const html = renderAuditDeckHtml(REPORT);
    expect(html.indexOf('data-archetype="investment"')).toBeGreaterThan(html.lastIndexOf('data-archetype="timeline"'));
  });

  it("builds models that pass brand QA", () => {
    for (const doc of [buildAuditDocument(REPORT), buildProposalDocument({ title: "Proposal.", pricingCents: 100000 })]) {
      const result = runBrandQa(doc, renderDocument(doc, "deckA4"));
      expect(result.violations.filter((v) => v.severity === "error")).toEqual([]);
    }
  });
});

describe("money + pdf page setup", () => {
  it("formats cents", () => {
    expect(formatMoney(1500000)).toBe("$15,000");
    expect(formatMoney(undefined)).toBe("—");
    expect(formatMoney(0)).toBe("$0");
  });

  it("maps each format to the right printed page (no Chromium involved)", () => {
    expect(pdfPageOptions("deck16x9")).toMatchObject({ width: "1920px", height: "1080px", landscape: true, printBackground: true });
    expect(pdfPageOptions("deckA4")).toMatchObject({ format: "A4", landscape: false, printBackground: true });
    expect(pdfPageOptions("document")).toMatchObject({ format: "Letter", printBackground: true });
  });
});
