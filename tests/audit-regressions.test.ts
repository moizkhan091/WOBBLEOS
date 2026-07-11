import { describe, expect, it } from "vitest";
import { invoiceAction, type FinanceStore } from "@/lib/finance";
import type { InvoiceRow } from "@/lib/domain/finance";
import { selectApprovedIntelligenceForTask, buildIntelligenceContextPlan } from "@/lib/domain/intelligence";

// Regression: partial payments ACCUMULATE via the payments ledger (SUM), never overwrite, and the
// cached invoice amount is capped at the total (audit money-flow finding).
describe("finance mark_paid accumulation", () => {
  function store(inv: InvoiceRow, seedPaidCents = 0): { store: FinanceStore; get: () => InvoiceRow } {
    let row = inv;
    let ledger = seedPaidCents; // models SUM(payments) for this invoice
    return {
      get: () => row,
      store: {
        getInvoice: async () => row,
        updateInvoice: async (_id: string, fields: Partial<InvoiceRow>) => { row = { ...row, ...fields } as InvoiceRow; },
        recordPayment: async ({ payment }: { payment: { amountCents: number } }) => {
          ledger += payment.amountCents;
          return { applied: true, amountPaidCents: ledger, totalCents: row.totalCents };
        },
      } as unknown as FinanceStore,
    };
  }
  const base = { id: "inv_1", status: "sent", totalCents: 10000, amountPaidCents: 0, invoiceNumber: "INV-1" } as unknown as InvoiceRow;

  it("adds a second partial payment to the first instead of replacing it", async () => {
    const { store: s, get } = store(base);
    await invoiceAction("inv_1", "mark_paid", { actor: "Moiz", amountPaidCents: 4000 }, { store: s, recordAudit: async () => {} });
    expect(get().amountPaidCents).toBe(4000);
    expect(get().status).toBe("partially_paid");
    await invoiceAction("inv_1", "mark_paid", { actor: "Moiz", amountPaidCents: 6000 }, { store: s, recordAudit: async () => {} });
    expect(get().amountPaidCents).toBe(10000); // 4000 + 6000 from the ledger, not overwritten to 6000
    expect(get().status).toBe("paid");
  });

  it("caps the cached invoice amount at the total (overpayment can't inflate revenue)", async () => {
    const { store: s, get } = store({ ...base, amountPaidCents: 9000, status: "partially_paid" } as InvoiceRow, 9000);
    await invoiceAction("inv_1", "mark_paid", { actor: "Moiz", amountPaidCents: 5000 }, { store: s, recordAudit: async () => {} });
    expect(get().amountPaidCents).toBe(10000); // ledger sum 14000 capped to total for the cached field
    expect(get().status).toBe("paid");
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

// Regression: idempotency race — a unique-violation on insert must dedupe, not crash.
import { enqueueJob, type JobStore } from "@/lib/jobs";
import { runWorker } from "@/lib/workers/runtime";

describe("jobs idempotency race", () => {
  it("returns the winning job (deduped) when insert hits a unique violation", async () => {
    let inserts = 0;
    const winner = { id: "job_win", queue: "q", type: "t", idempotencyKey: "k" };
    const store = {
      findActiveByIdempotencyKey: async () => (inserts === 0 ? null : winner),
      insert: async () => { inserts++; throw new Error("duplicate key value violates unique constraint"); },
      reclaimStalled: async () => 0,
    } as unknown as JobStore;
    const res = await enqueueJob({ queue: "q", type: "t", idempotencyKey: "k" }, { store, recordAudit: async () => {} });
    expect(res.deduped).toBe(true);
    expect(res.job.id).toBe("job_win");
  });
});

describe("worker stalled-job reaper", () => {
  it("runs the reaper every N idle cycles", async () => {
    let reclaimCalls = 0; let cycles = 0;
    await runWorker({
      queue: "q", registry: {}, reclaimEveryIdleCycles: 3,
      process: async () => ({ processed: false }),
      reclaimStalled: async () => { reclaimCalls++; return 0; },
      sleep: async () => {},
      heartbeat: async () => {},
      shouldStop: () => ++cycles > 7,
    });
    expect(reclaimCalls).toBe(2); // fires on idle cycles 3 and 6
  });
});
