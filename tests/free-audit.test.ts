import { describe, expect, it } from "vitest";
import { diagnose, buildAuditRow, WOBBLE_SERVICES, type AuditRow } from "@/lib/domain/free-audit";
import { runFreeAudit, type AuditStore } from "@/lib/free-audit";

const now = new Date("2026-07-09T12:00:00Z");

describe("free audit — service catalog + diagnosis", () => {
  it("knows the full Wobble service menu", () => {
    expect(WOBBLE_SERVICES.length).toBeGreaterThanOrEqual(30);
    // no duplicate slugs
    expect(new Set(WOBBLE_SERVICES.map((s) => s.slug)).size).toBe(WOBBLE_SERVICES.length);
  });

  it("maps current-state signals to the right services, quick wins first", () => {
    const report = diagnose({ businessName: "Bright Dental", industry: "dental", signals: ["missed_calls", "no_followup", "few_reviews", "no_show"] });
    const slugs = report.opportunities.map((o) => o.service);
    expect(slugs).toContain("missed-call-text-back-system");
    expect(slugs).toContain("sales-follow-up-system");
    expect(slugs).toContain("review-reputation-system");
    expect(slugs).toContain("no-show-reduction-system");
    // quick wins are surfaced and ordered first
    expect(report.quickWins.length).toBeGreaterThan(0);
    expect(report.opportunities[0].quickWin).toBe(true);
    expect(report.summary).toContain("Bright Dental");
  });

  it("matches free-text problems too", () => {
    const report = diagnose({ businessName: "Acme", problems: ["we keep getting missed calls", "no crm at all"] });
    expect(report.opportunities.map((o) => o.service)).toContain("missed-call-text-back-system");
    expect(report.opportunities.map((o) => o.service)).toContain("crm-pipeline-automation");
  });

  it("estimates monthly upside when lead economics are given", () => {
    const report = diagnose({ businessName: "Acme", signals: ["slow_response"], monthlyLeads: 100, avgDealValueCents: 100000 });
    // ~15% of 100 leads recovered * $1000 = ~$15,000
    expect(report.estimatedMonthlyUpsideCents).toBe(15 * 100000);
  });

  it("is honest when nothing matches", () => {
    const report = diagnose({ businessName: "Acme", signals: [] });
    expect(report.serviceCount).toBe(0);
    expect(report.summary).toMatch(/no clear gaps/i);
  });
});

describe("free audit — service", () => {
  it("runs + persists an audit linked to a company", async () => {
    const rows: AuditRow[] = [];
    const store: AuditStore = {
      insertAudit: async (r) => void rows.push(r),
      listAudits: async () => rows,
      getAudit: async (id) => rows.find((r) => r.id === id) ?? null,
    };
    const audit = await runFreeAudit({ businessName: "Bright Dental", companyId: "co_1", opportunityId: "opp_1", signals: ["missed_calls", "no_followup"] }, { store, now, recordAudit: async () => {} });
    expect(audit.kind).toBe("free");
    expect(audit.companyId).toBe("co_1");
    expect(audit.report.serviceCount).toBeGreaterThan(0);
    expect(rows).toHaveLength(1);
  });
});
