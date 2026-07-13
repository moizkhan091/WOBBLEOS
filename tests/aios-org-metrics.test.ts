import { describe, expect, it } from "vitest";
import { makeFinanceOrgMetrics } from "@/lib/aios-value";
import type { AiosValueScope } from "@/lib/domain/aios-value";

const now = new Date("2026-07-14T00:00:00Z");
const inPeriod = new Date(now.getTime() - 5 * 86_400_000);
const outPeriod = new Date(now.getTime() - 60 * 86_400_000);
const company: AiosValueScope = { type: "company", id: null };

// Helper: build injected invoice + payment readers.
function wired(invoices: Array<{ id: string; companyId: string | null; status: string }>, payments: Array<{ invoiceId: string; amountCents: number; createdAt: Date }>) {
  return { listInvoices: async () => invoices, listPayments: async () => payments };
}

describe("makeFinanceOrgMetrics (revenue from the payments ledger)", () => {
  it("sums in-period payments against NON-VOID invoices, excludes out-of-period + void", async () => {
    const org = makeFinanceOrgMetrics({ now, founders: ["a", "b", "c", "d"], ...wired(
      [{ id: "A", companyId: "x", status: "paid" }, { id: "B", companyId: "x", status: "partially_paid" }, { id: "C", companyId: "x", status: "paid" }, { id: "D", companyId: "x", status: "cancelled" }],
      [{ invoiceId: "A", amountCents: 100_000, createdAt: inPeriod }, { invoiceId: "B", amountCents: 50_000, createdAt: inPeriod }, { invoiceId: "C", amountCents: 99_999, createdAt: outPeriod }, { invoiceId: "D", amountCents: 30_000, createdAt: inPeriod }],
    ) });
    const m = await org(company);
    expect(m.revenueCents).toBe(150_000); // A + B; C out-of-period; D cancelled (excluded)
    expect(m.revenueEvidenceTier).toBe("verified-financial");
    expect(m.headcount).toBe(4);
  });

  it("an installment counts only the in-period payment, not the cumulative total", async () => {
    const org = makeFinanceOrgMetrics({ now, ...wired(
      [{ id: "G", companyId: "z", status: "paid" }],
      [{ invoiceId: "G", amountCents: 40_000, createdAt: outPeriod }, { invoiceId: "G", amountCents: 60_000, createdAt: inPeriod }],
    ) });
    expect((await org(company)).revenueCents).toBe(60_000);
  });

  it("keeps revenue NULL when no non-void payment has ever been received (never a fabricated 0)", async () => {
    const org = makeFinanceOrgMetrics({ now, ...wired([{ id: "E", companyId: "x", status: "sent" }], []) });
    const m = await org(company);
    expect(m.revenueCents).toBeNull();
    expect(m.revenueEvidenceTier).toBeNull();
    // A payment ONLY against a void invoice also stays null (not fabricated).
    const org2 = makeFinanceOrgMetrics({ now, ...wired([{ id: "V", companyId: "x", status: "refunded" }], [{ invoiceId: "V", amountCents: 999, createdAt: inPeriod }]) });
    expect((await org2(company)).revenueCents).toBeNull();
  });

  it("scopes revenue to a client's own invoices", async () => {
    const org = makeFinanceOrgMetrics({ now, founders: ["a"], ...wired(
      [{ id: "X1", companyId: "x", status: "paid" }, { id: "Y1", companyId: "y", status: "paid" }],
      [{ invoiceId: "X1", amountCents: 100_000, createdAt: inPeriod }, { invoiceId: "Y1", amountCents: 999_999, createdAt: inPeriod }],
    ) });
    expect((await org({ type: "client", id: "x" })).revenueCents).toBe(100_000);
  });

  it("leaves headcount null when no founders/team are known (honest, not 0)", async () => {
    const org = makeFinanceOrgMetrics({ now, ...wired([{ id: "A", companyId: "x", status: "paid" }], [{ invoiceId: "A", amountCents: 10, createdAt: inPeriod }]) });
    const m = await org(company);
    expect(m.headcount).toBeNull();
    expect(m.founderHourlyRateCents).toBeNull();
  });
});
