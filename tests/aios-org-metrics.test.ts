import { describe, expect, it } from "vitest";
import { makeFinanceOrgMetrics } from "@/lib/aios-value";
import type { AiosValueScope } from "@/lib/domain/aios-value";

const now = new Date("2026-07-14T00:00:00Z");
const inPeriod = new Date(now.getTime() - 5 * 86_400_000);
const outPeriod = new Date(now.getTime() - 60 * 86_400_000);
const company: AiosValueScope = { type: "company", id: null };

function invoices(rows: Array<{ companyId: string | null; amountPaidCents: number; paidAt: Date | null }>) {
  return async () => rows;
}

describe("makeFinanceOrgMetrics (revenue from real paid invoices)", () => {
  it("sums amounts PAID IN PERIOD, excludes out-of-period, tags verified-financial", async () => {
    const org = makeFinanceOrgMetrics({ now, founders: ["a", "b", "c", "d"], listInvoices: invoices([
      { companyId: "x", amountPaidCents: 100_000, paidAt: inPeriod },
      { companyId: "x", amountPaidCents: 50_000, paidAt: inPeriod },
      { companyId: "x", amountPaidCents: 99_999, paidAt: outPeriod }, // excluded
    ]) });
    const m = await org(company);
    expect(m.revenueCents).toBe(150_000);
    expect(m.revenueEvidenceTier).toBe("verified-financial");
    expect(m.headcount).toBe(4); // from the founders
  });

  it("keeps revenue NULL when no invoice has ever been paid (never a fabricated 0)", async () => {
    const org = makeFinanceOrgMetrics({ now, listInvoices: invoices([{ companyId: "x", amountPaidCents: 0, paidAt: null }]) });
    const m = await org(company);
    expect(m.revenueCents).toBeNull();
    expect(m.revenueEvidenceTier).toBeNull();
  });

  it("scopes revenue to a client's own invoices", async () => {
    const org = makeFinanceOrgMetrics({ now, founders: ["a"], listInvoices: invoices([
      { companyId: "x", amountPaidCents: 100_000, paidAt: inPeriod },
      { companyId: "y", amountPaidCents: 999_999, paidAt: inPeriod },
    ]) });
    const m = await org({ type: "client", id: "x" });
    expect(m.revenueCents).toBe(100_000); // only client x's invoice
  });

  it("leaves headcount null when no founders/team are known (honest, not 0)", async () => {
    const org = makeFinanceOrgMetrics({ now, listInvoices: invoices([{ companyId: "x", amountPaidCents: 10, paidAt: inPeriod }]) });
    const m = await org(company);
    expect(m.headcount).toBeNull();
    expect(m.founderHourlyRateCents).toBeNull(); // HR not wired → honest null
  });
});
