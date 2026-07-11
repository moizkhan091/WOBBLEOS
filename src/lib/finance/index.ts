import { desc, eq } from "drizzle-orm";
import { invoices as invoicesTable } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  FINANCE_MODULE,
  buildInvoiceRow,
  canTransitionInvoice,
  revenueSummary,
  type CreateInvoiceInput,
  type InvoiceRow,
  type InvoiceStatus,
  type RevenueSummary,
} from "@/lib/domain/finance";
import { listOpportunities } from "@/lib/crm";

/**
 * Finance-lite service (IO). Draft/track invoices, revenue rollups. Guardrail: approve/send/mark-paid
 * are founder actions (routes enforce requireFounder) — AI never moves money on its own.
 */

export interface FinanceStore {
  insertInvoice(row: InvoiceRow): Promise<void>;
  listInvoices(q: { status?: string; limit: number }): Promise<InvoiceRow[]>;
  getInvoice(id: string): Promise<InvoiceRow | null>;
  updateInvoice(id: string, fields: Partial<InvoiceRow>): Promise<void>;
  countInvoices(): Promise<number>;
}

export interface FinanceDeps {
  store?: FinanceStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

async function audit(deps: FinanceDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

function invoiceNumber(seq: number, now: Date): string {
  return `INV-${now.getFullYear()}-${String(seq).padStart(4, "0")}`;
}

/** Draft an invoice (from an opportunity/proposal or standalone). Starts in draft — needs approval to send. */
export async function createInvoice(input: CreateInvoiceInput, deps: FinanceDeps = {}): Promise<InvoiceRow> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const seq = (await store.countInvoices()) + 1;
  const row = buildInvoiceRow(input, { now, invoiceNumber: invoiceNumber(seq, now) });
  await store.insertInvoice(row);
  await audit(deps, { eventType: "finance.invoice_created", module: FINANCE_MODULE, entityType: "invoice", entityId: row.id, actor: row.createdBy ?? "system", metadata: { number: row.invoiceNumber, totalCents: row.totalCents, opportunityId: row.opportunityId } });
  return row;
}

export async function listInvoices(query: { status?: string; limit?: number } = {}, deps: FinanceDeps = {}): Promise<InvoiceRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listInvoices({ status: query.status, limit: Math.min(Math.max(query.limit ?? 200, 1), 5000) });
}

export async function getInvoice(id: string, deps: FinanceDeps = {}): Promise<InvoiceRow | null> {
  return (deps.store ?? defaultStore()).getInvoice(id);
}

export type InvoiceAction = "approve" | "send" | "mark_paid" | "cancel";

/** Founder-gated invoice lifecycle. mark_paid records the payment; never auto-moves money. */
export async function invoiceAction(id: string, action: InvoiceAction, input: { actor: string; paymentReference?: string; amountPaidCents?: number } , deps: FinanceDeps = {}): Promise<InvoiceRow | null> {
  const store = deps.store ?? defaultStore();
  const inv = await store.getInvoice(id);
  if (!inv) return null;
  const now = deps.now ?? new Date();
  const target: InvoiceStatus = action === "approve" ? "approved" : action === "send" ? "sent" : action === "cancel" ? "cancelled" : "paid";
  if (!canTransitionInvoice(inv.status, target)) return null;

  const fields: Partial<InvoiceRow> = { status: target, updatedAt: now };
  if (action === "approve") fields.approvedBy = input.actor;
  if (action === "send") fields.sentAt = now;
  if (action === "mark_paid") {
    // Accumulate against the outstanding balance — a second partial payment must ADD to the
    // amount already recorded, not overwrite it (previously lost the earlier payment).
    const remaining = Math.max(0, inv.totalCents - inv.amountPaidCents);
    const applied = input.amountPaidCents ?? remaining;
    const paid = Math.min(inv.amountPaidCents + applied, inv.totalCents);
    fields.amountPaidCents = paid;
    fields.paymentReference = input.paymentReference ?? inv.paymentReference;
    fields.paidAt = now;
    if (paid < inv.totalCents) fields.status = "partially_paid";
  }
  await store.updateInvoice(id, fields);
  await audit(deps, { eventType: `finance.invoice_${action}`, module: FINANCE_MODULE, entityType: "invoice", entityId: id, actor: input.actor, metadata: { number: inv.invoiceNumber, from: inv.status, to: fields.status } });
  return { ...inv, ...fields };
}

/** Dashboard rollups: pulls invoices + open/won opportunities and computes revenue KPIs. */
export async function getRevenueSummary(deps: FinanceDeps = {}): Promise<RevenueSummary> {
  // Sum up to 5000 invoices/opportunities (years of runway for an agency; add SQL-side aggregation
  // if ever exceeded). Prevents the old silent undercount that capped revenue at 500 invoices.
  const invoices = await listInvoices({ limit: 5000 }, deps);
  const opportunities = await listOpportunities({ limit: 5000 });
  return revenueSummary(
    invoices.map((i) => ({ status: i.status, totalCents: i.totalCents, amountPaidCents: i.amountPaidCents, dueDate: i.dueDate })),
    opportunities.map((o) => ({ status: o.status, stage: o.stage, valueCents: o.valueCents, probability: o.probability, serviceInterest: o.serviceInterest })),
    deps.now ?? new Date(),
  );
}

export function defaultStore(db: Db = getDb()): FinanceStore {
  return {
    async insertInvoice(row) { await db.insert(invoicesTable).values(row); },
    async listInvoices(q) {
      const base = db.select().from(invoicesTable);
      const rows = await (q.status ? base.where(eq(invoicesTable.status, q.status)) : base).orderBy(desc(invoicesTable.createdAt)).limit(q.limit);
      return rows as InvoiceRow[];
    },
    async getInvoice(id) { const r = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1); return (r[0] as InvoiceRow) ?? null; },
    async updateInvoice(id, fields) { await db.update(invoicesTable).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() }).where(eq(invoicesTable.id, id)); },
    async countInvoices() { const r = await db.select().from(invoicesTable); return r.length; },
  };
}
