import { describe, expect, it } from "vitest";
import {
  buildInvoiceRow,
  canTransitionInvoice,
  lineItemsSubtotalCents,
  revenueSummary,
  type InvoiceRow,
} from "@/lib/domain/finance";

const now = new Date("2026-07-09T12:00:00Z");

describe("finance domain", () => {
  it("computes invoice totals from line items + tax/discount", () => {
    const row = buildInvoiceRow(
      { lineItems: [{ description: "AI OS Audit", quantity: 1, unitPriceCents: 600000 }, { description: "Setup", quantity: 2, unitPriceCents: 50000 }], taxCents: 10000, discountCents: 20000 },
      { now, id: "inv_1", invoiceNumber: "INV-2026-0001" },
    );
    expect(row.subtotalCents).toBe(700000); // 600000 + 2*50000
    expect(row.totalCents).toBe(690000); // + 10000 tax - 20000 discount
    expect(row.status).toBe("draft");
  });

  it("subtotal helper multiplies quantity by unit price", () => {
    expect(lineItemsSubtotalCents([{ description: "x", quantity: 3, unitPriceCents: 1000 }])).toBe(3000);
  });

  it("enforces the invoice status machine", () => {
    expect(canTransitionInvoice("draft", "approved")).toBe(true);
    expect(canTransitionInvoice("approved", "sent")).toBe(true);
    expect(canTransitionInvoice("sent", "paid")).toBe(true);
    expect(canTransitionInvoice("paid", "sent")).toBe(false);
    expect(canTransitionInvoice("draft", "paid")).toBe(false);
  });

  it("rolls up revenue across invoices + opportunities", () => {
    const invoices = [
      { status: "paid", totalCents: 600000, amountPaidCents: 600000, dueDate: null },
      { status: "sent", totalCents: 400000, amountPaidCents: 0, dueDate: new Date("2026-07-01T00:00:00Z") }, // overdue (past now)
      { status: "sent", totalCents: 200000, amountPaidCents: 0, dueDate: new Date("2026-08-01T00:00:00Z") }, // outstanding, not overdue
    ];
    const opps = [
      { status: "open", stage: "proposal_sent", valueCents: 1000000, probability: 50, serviceInterest: ["ai-receptionist"] },
      { status: "won", stage: "won", valueCents: 600000, probability: 100, serviceInterest: ["ai-receptionist"] },
      { status: "won", stage: "won", valueCents: 400000, probability: 100, serviceInterest: ["ai-ads"] },
    ];
    const s = revenueSummary(invoices, opps, now);
    expect(s.paidRevenueCents).toBe(600000);
    expect(s.outstandingCents).toBe(600000); // 400000 + 200000
    expect(s.overdueCents).toBe(400000); // only the past-due sent one
    expect(s.pipelineValueCents).toBe(1000000);
    expect(s.weightedPipelineCents).toBe(500000);
    expect(s.wonValueCents).toBe(1000000);
    expect(s.wonDeals).toBe(2);
    expect(s.avgDealSizeCents).toBe(500000);
    expect(s.revenueByService["ai-receptionist"]).toBe(600000);
  });
});

// ---------------------------------------------------------------- service

import { createInvoice, invoiceAction, type FinanceStore } from "@/lib/finance";

function makeStore() {
  const invoices = new Map<string, InvoiceRow>();
  const store: FinanceStore = {
    insertInvoice: async (r) => void invoices.set(r.id, r),
    listInvoices: async (q) => [...invoices.values()].filter((i) => !q.status || i.status === q.status).slice(0, q.limit),
    getInvoice: async (id) => invoices.get(id) ?? null,
    updateInvoice: async (id, f) => { const i = invoices.get(id); if (i) invoices.set(id, { ...i, ...f }); },
    countInvoices: async () => invoices.size,
  };
  return { store, invoices };
}

describe("finance service", () => {
  it("creates a numbered draft invoice", async () => {
    const { store } = makeStore();
    const inv = await createInvoice({ lineItems: [{ description: "Audit", quantity: 1, unitPriceCents: 600000 }] }, { store, now, recordAudit: async () => {} });
    expect(inv.invoiceNumber).toBe("INV-2026-0001");
    expect(inv.status).toBe("draft");
    expect(inv.totalCents).toBe(600000);
  });

  it("walks the founder-gated lifecycle and records payment", async () => {
    const { store } = makeStore();
    const inv = await createInvoice({ lineItems: [{ description: "Audit", quantity: 1, unitPriceCents: 600000 }] }, { store, now, recordAudit: async () => {} });
    expect((await invoiceAction(inv.id, "approve", { actor: "Moiz" }, { store, now, recordAudit: async () => {} }))?.status).toBe("approved");
    expect((await invoiceAction(inv.id, "send", { actor: "Moiz" }, { store, now, recordAudit: async () => {} }))?.status).toBe("sent");
    const paid = await invoiceAction(inv.id, "mark_paid", { actor: "Moiz", paymentReference: "wire-123" }, { store, now, recordAudit: async () => {} });
    expect(paid?.status).toBe("paid");
    expect(paid?.amountPaidCents).toBe(600000);
    // cannot pay a paid invoice again via send
    expect(await invoiceAction(inv.id, "send", { actor: "Moiz" }, { store, now, recordAudit: async () => {} })).toBeNull();
  });
});
