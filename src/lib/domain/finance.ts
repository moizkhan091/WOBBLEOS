import { z } from "zod";
import { newId } from "@/lib/ids";

/**
 * Finance-lite (pure). Draft/track invoices linked to opportunities + revenue rollups. Guardrail:
 * AI may DRAFT invoice content, but approving/sending/marking-paid is a founder action (enforced in
 * the routes) — the system never moves money on its own (ERP brief section G + J).
 */

export const FINANCE_MODULE = "finance";

export const INVOICE_STATUSES = ["draft", "needs_approval", "approved", "sent", "viewed", "partially_paid", "paid", "overdue", "cancelled", "refunded", "written_off"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  companyId: string | null;
  contactId: string | null;
  opportunityId: string | null;
  proposalId: string | null;
  billingDetails: Record<string, unknown>;
  lineItems: InvoiceLineItem[];
  currency: string;
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  amountPaidCents: number;
  dueDate: Date | null;
  paymentTerms: string | null;
  status: string;
  sentAt: Date | null;
  paidAt: Date | null;
  paymentReference: string | null;
  notes: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  archivedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const lineItemSchema = z.object({ description: z.string().trim().min(1), quantity: z.number().min(0).default(1), unitPriceCents: z.number().int().min(0) });

export const createInvoiceSchema = z.object({
  companyId: z.string().trim().min(1).optional(),
  contactId: z.string().trim().min(1).optional(),
  opportunityId: z.string().trim().min(1).optional(),
  proposalId: z.string().trim().min(1).optional(),
  billingDetails: z.record(z.string(), z.unknown()).default({}),
  lineItems: z.array(lineItemSchema).min(1),
  currency: z.string().trim().min(1).default("USD"),
  taxCents: z.number().int().min(0).default(0),
  discountCents: z.number().int().min(0).default(0),
  dueDate: z.coerce.date().optional(),
  paymentTerms: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  createdBy: z.string().trim().min(1).optional(),
});
export type CreateInvoiceInput = z.input<typeof createInvoiceSchema>;

export function lineItemsSubtotalCents(items: InvoiceLineItem[]): number {
  return items.reduce((sum, li) => sum + Math.round(li.quantity * li.unitPriceCents), 0);
}

export function buildInvoiceRow(input: CreateInvoiceInput, opts: { now?: Date; id?: string; invoiceNumber: string }): InvoiceRow {
  const p = createInvoiceSchema.parse(input);
  const now = opts.now ?? new Date();
  const subtotal = lineItemsSubtotalCents(p.lineItems);
  const total = Math.max(0, subtotal + p.taxCents - p.discountCents);
  return {
    id: opts.id ?? newId("inv"),
    invoiceNumber: opts.invoiceNumber,
    companyId: p.companyId ?? null,
    contactId: p.contactId ?? null,
    opportunityId: p.opportunityId ?? null,
    proposalId: p.proposalId ?? null,
    billingDetails: p.billingDetails,
    lineItems: p.lineItems,
    currency: p.currency,
    subtotalCents: subtotal,
    taxCents: p.taxCents,
    discountCents: p.discountCents,
    totalCents: total,
    amountPaidCents: 0,
    dueDate: p.dueDate ?? null,
    paymentTerms: p.paymentTerms ?? null,
    status: "draft",
    sentAt: null,
    paidAt: null,
    paymentReference: null,
    notes: p.notes ?? null,
    createdBy: p.createdBy ?? null,
    approvedBy: null,
    archivedAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

// ---- Payments ledger: one row per received payment. amountPaidCents on the invoice is the SUM of
// these (recomputed under a row lock), never a mutated running total — so concurrent partials can't
// lost-update and a duplicate paymentReference (idempotency key) is rejected by a unique index. ----
export interface PaymentRow {
  id: string;
  invoiceId: string;
  amountCents: number;
  paymentReference: string | null;
  method: string;
  note: string | null;
  recordedBy: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export function buildPaymentRow(
  input: { invoiceId: string; amountCents: number; paymentReference?: string | null; method?: string; note?: string | null; recordedBy?: string | null },
  opts: { now?: Date; id?: string } = {},
): PaymentRow {
  return {
    id: opts.id ?? newId("pay"),
    invoiceId: input.invoiceId,
    amountCents: Math.round(input.amountCents),
    paymentReference: input.paymentReference?.trim() || null,
    method: input.method ?? "manual",
    note: input.note ?? null,
    recordedBy: input.recordedBy ?? null,
    metadata: {},
    createdAt: opts.now ?? new Date(),
  };
}

const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ["needs_approval", "approved", "cancelled"],
  needs_approval: ["approved", "draft", "cancelled"],
  approved: ["sent", "cancelled"],
  sent: ["viewed", "partially_paid", "paid", "overdue", "cancelled"],
  viewed: ["partially_paid", "paid", "overdue", "cancelled"],
  partially_paid: ["paid", "overdue", "cancelled"],
  overdue: ["partially_paid", "paid", "cancelled", "written_off"],
  paid: ["refunded"],
  cancelled: [],
  refunded: [],
  written_off: [],
};

export function canTransitionInvoice(from: string, to: InvoiceStatus): boolean {
  const allowed = INVOICE_TRANSITIONS[from as InvoiceStatus];
  return Array.isArray(allowed) && allowed.includes(to);
}

/** Revenue rollups for the finance dashboard (ERP brief section J). Amounts in cents. */
export interface RevenueSummary {
  paidRevenueCents: number;
  outstandingCents: number;
  overdueCents: number;
  pipelineValueCents: number;
  weightedPipelineCents: number;
  wonValueCents: number;
  invoiceCounts: Record<string, number>;
  openDeals: number;
  wonDeals: number;
  avgDealSizeCents: number;
  revenueByService: Record<string, number>;
}

export function revenueSummary(
  invoices: Array<{ status: string; totalCents: number; amountPaidCents: number; dueDate: Date | null }>,
  opportunities: Array<{ status: string; stage: string; valueCents: number; probability: number; serviceInterest: string[] }>,
  now: Date,
): RevenueSummary {
  // Money that was collected then reversed (or never real) is NOT revenue.
  const REVERSED_OR_VOID = new Set(["cancelled", "refunded", "written_off", "draft", "needs_approval"]);
  const invoiceCounts: Record<string, number> = {};
  let paidRevenueCents = 0;
  let outstandingCents = 0;
  let overdueCents = 0;
  for (const inv of invoices) {
    invoiceCounts[inv.status] = (invoiceCounts[inv.status] ?? 0) + 1;
    if (!REVERSED_OR_VOID.has(inv.status)) paidRevenueCents += inv.amountPaidCents;
    const openBalance = Math.max(0, inv.totalCents - inv.amountPaidCents);
    if (["sent", "viewed", "partially_paid", "overdue"].includes(inv.status)) {
      outstandingCents += openBalance;
      if (inv.dueDate && inv.dueDate.getTime() < now.getTime()) overdueCents += openBalance;
    }
  }

  let pipelineValueCents = 0;
  let weightedPipelineCents = 0;
  let wonValueCents = 0;
  let openDeals = 0;
  let wonDeals = 0;
  const revenueByService: Record<string, number> = {};
  for (const o of opportunities) {
    if (o.status === "open") {
      pipelineValueCents += o.valueCents;
      weightedPipelineCents += Math.round((o.valueCents * o.probability) / 100);
      openDeals += 1;
    } else if (o.status === "won") {
      wonValueCents += o.valueCents;
      wonDeals += 1;
      for (const svc of o.serviceInterest.length ? o.serviceInterest : ["unspecified"]) {
        revenueByService[svc] = (revenueByService[svc] ?? 0) + o.valueCents;
      }
    }
  }

  return {
    paidRevenueCents,
    outstandingCents,
    overdueCents,
    pipelineValueCents,
    weightedPipelineCents,
    wonValueCents,
    invoiceCounts,
    openDeals,
    wonDeals,
    avgDealSizeCents: wonDeals ? Math.round(wonValueCents / wonDeals) : 0,
    revenueByService,
  };
}
