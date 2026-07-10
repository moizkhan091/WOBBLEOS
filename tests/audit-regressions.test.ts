import { describe, expect, it } from "vitest";
import { invoiceAction, type InvoiceStore } from "@/lib/finance";
import type { InvoiceRow } from "@/lib/domain/finance";
import { selectApprovedIntelligenceForTask, buildIntelligenceContextPlan } from "@/lib/domain/intelligence";

// Regression: partial payments must ACCUMULATE, not overwrite (audit money-flow finding).
describe("finance mark_paid accumulation", () => {
  function store(inv: InvoiceRow): { store: InvoiceStore; get: () => InvoiceRow } {
    let row = inv;
    return {
      get: () => row,
      store: {
        getInvoice: async () => row,
        updateInvoice: async (_id, fields) => { row = { ...row, ...fields } as InvoiceRow; },
      } as unknown as InvoiceStore,
    };
  }
  const base = { id: "inv_1", status: "sent", totalCents: 10000, amountPaidCents: 0, invoiceNumber: "INV-1" } as unknown as InvoiceRow;

  it("adds a second partial payment to the first instead of replacing it", async () => {
    const { store: s, get } = store(base);
    await invoiceAction("inv_1", "mark_paid", { actor: "Moiz", amountPaidCents: 4000 }, { store: s, recordAudit: async () => {} });
    expect(get().amountPaidCents).toBe(4000);
    expect(get().status).toBe("partially_paid");
    await invoiceAction("inv_1", "mark_paid", { actor: "Moiz", amountPaidCents: 6000 }, { store: s, recordAudit: async () => {} });
    expect(get().amountPaidCents).toBe(10000); // 4000 + 6000, not overwritten to 6000
    expect(get().status).toBe("paid");
  });

  it("never records more than the total", async () => {
    const { store: s, get } = store({ ...base, amountPaidCents: 9000, status: "partially_paid" } as InvoiceRow);
    await invoiceAction("inv_1", "mark_paid", { actor: "Moiz", amountPaidCents: 5000 }, { store: s, recordAudit: async () => {} });
    expect(get().amountPaidCents).toBe(10000); // capped at total
  });
});

// Regression: client-scoped intelligence must NEVER leak to a request without the matching clientId.
describe("intelligence client isolation", () => {
  const clientRow = { id: "it_1", itemType: "competitor_reel", scope: "client", clientId: "clientA", approvalStatus: "approved", freshnessStatus: "current", confidence: "0.8", collectedAt: new Date("2026-07-01"), title: "A reel", summary: "s", extracted: {} };

  it("excludes a client row when the request has no clientId", () => {
    const plan = buildIntelligenceContextPlan({ task: "social_content", scope: "client" });
    const ctx = selectApprovedIntelligenceForTask({ plan, items: [clientRow] as never, insights: [] });
    expect(ctx.items).toHaveLength(0);
  });
  it("excludes a client row for a DIFFERENT client", () => {
    const plan = buildIntelligenceContextPlan({ task: "social_content", scope: "client", clientId: "clientB" });
    const ctx = selectApprovedIntelligenceForTask({ plan, items: [clientRow] as never, insights: [] });
    expect(ctx.items).toHaveLength(0);
  });
  it("includes a client row only for the matching client", () => {
    const plan = buildIntelligenceContextPlan({ task: "social_content", scope: "client", clientId: "clientA" });
    const ctx = selectApprovedIntelligenceForTask({ plan, items: [clientRow] as never, insights: [] });
    expect(ctx.items).toHaveLength(1);
  });
});
