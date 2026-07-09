import { describe, expect, it } from "vitest";
import { renderAuditDeckHtml, renderAuditReportHtml, renderProposalHtml } from "@/lib/documents/render";

describe("document renderer", () => {
  it("renders a premium audit report with the key sections + escapes HTML", () => {
    const html = renderAuditReportHtml({
      businessName: "Acme <Dental>",
      executiveSummary: "Leaking leads at the front desk.",
      currentState: { acquisition: ["Meta ads"], delivery: ["manual booking"], support: ["phone"], bottlenecks: [{ area: "front desk", pain: "misses calls", severity: "high" }] },
      opportunities: [{ title: "Missed-call text-back", area: "front desk", service: "missed-call-text-back-system", description: "auto text", impact: "high", difficulty: "low" }],
      roadmap: [{ title: "Phase 1", months: "Month 1-3", focus: "quick wins", items: ["Text-back"] }],
      roi: { estimatedMonthlyUpsideCents: 1500000, estimatedImplementationCents: 900000, paybackMonths: 2 },
    });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Acme &lt;Dental&gt;"); // escaped
    expect(html).not.toContain("Acme <Dental>"); // raw not present
    expect(html).toContain("Missed-call text-back");
    expect(html).toContain("Phase 1");
    expect(html).toContain("$15,000"); // monthly upside formatted
    expect(html).toContain("Executive Summary");
    expect(html).toContain("Transformation roadmap");
  });

  it("renders a self-contained slide deck with nav script", () => {
    const html = renderAuditDeckHtml({
      businessName: "Acme",
      executiveSummary: "Leaking leads.",
      opportunities: [{ title: "Text-back", impact: "high", difficulty: "low" }],
      roadmap: [{ title: "Phase 1", months: "Month 1-3" }],
      roi: { estimatedMonthlyUpsideCents: 1500000 },
    });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("class=\"deck\"");
    expect(html).toContain("ArrowRight"); // keyboard nav
    expect(html).toContain("Acme");
    expect(html).toContain("Text-back");
    expect(html).toContain("Transformation Roadmap");
  });

  it("renders a proposal document with services + total", () => {
    const html = renderProposalHtml({
      title: "Acme — Wobble AI OS Proposal",
      pricingCents: 900000,
      scope: "Front-desk automation.",
      services: [{ name: "Missed-call text-back", description: "auto text", priceCents: 400000 }, { name: "AI receptionist" }],
      timeline: [{ phase: "Phase 1", months: "Month 1-3", focus: "quick wins" }],
    });
    expect(html).toContain("Acme — Wobble AI OS Proposal");
    expect(html).toContain("Missed-call text-back");
    expect(html).toContain("AI receptionist");
    expect(html).toContain("Included"); // service with no price
    expect(html).toContain("$9,000"); // total
    expect(html).toContain("Total investment");
  });
});
