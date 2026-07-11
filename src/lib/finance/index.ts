import { desc, eq, sql } from "drizzle-orm";
import { invoices as invoicesTable, payments as paymentsTable } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  FINANCE_MODULE,
  buildInvoiceRow,
  buildPaymentRow,
  canTransitionInvoice,
  revenueSummary,
  type CreateInvoiceInput,
  type InvoiceRow,
  type InvoiceStatus,
  type PaymentRow,
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
  /**
   * Atomically record a payment against an invoice: locks the invoice row (FOR UPDATE), inserts the
   * payment (idempotent on paymentReference), and returns the ledger SUM. `applied=false` means the
   * paymentReference was already recorded (duplicate) — the sum is unchanged, no double-count.
   */
  recordPayment(input: { payment: PaymentRow }): Promise<{ applied: boolean; amountPaidCents: number; totalCents: number } | null>;
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

/** True for a Postgres unique-constraint violation (code 23505) — used to retry invoice numbering. */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code === "23505") return true;
  const msg = error instanceof Error ? error.message.toLowerCase() : "";
  return msg.includes("unique") || msg.includes("duplicate key");
}

/** Draft an invoice (from an opportunity/proposal or standalone). Starts in draft — needs approval to send. */
export async function createInvoice(input: CreateInvoiceInput, deps: FinanceDeps = {}): Promise<InvoiceRow> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  // Concurrency-safe numbering: count → mint → insert, guarded by the unique index on invoice_number.
  // If a concurrent create grabbed the same number (unique violation), recount and retry the next one
  // instead of 500ing. Bounded attempts so a persistent failure still surfaces.
  const MAX_ATTEMPTS = 6;
  let row: InvoiceRow | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const seq = (await store.countInvoices()) + 1;
    const candidate = buildInvoiceRow(input, { now, invoiceNumber: invoiceNumber(seq, now) });
    try {
      await store.insertInvoice(candidate);
      row = candidate;
      break;
    } catch (error) {
      if (attempt < MAX_ATTEMPTS - 1 && isUniqueViolation(error)) continue; // number taken concurrently — retry
      throw error;
    }
  }
  if (!row) throw new Error("could not allocate a unique invoice number after retries");
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
    // Ledger-based, idempotent, concurrency-safe. Record the payment (deduped by paymentReference) and
    // set amount_paid from the recomputed ledger SUM under a row lock — never a read-modify-write of the
    // running total. A duplicate paymentReference is a no-op (applied=false), so a double-submit / webhook
    // retry cannot double-count. Distinct concurrent partials each land and both are summed.
    const amount = input.amountPaidCents ?? Math.max(0, inv.totalCents - inv.amountPaidCents); // default: pay the remainder
    const payment = buildPaymentRow(
      { invoiceId: id, amountCents: amount, paymentReference: input.paymentReference ?? null, recordedBy: input.actor },
      { now },
    );
    const result = await store.recordPayment({ payment });
    if (!result) return null;
    // The invoice's cached amount_paid is the ledger SUM, CAPPED at the total so an overpayment can't
    // inflate revenue (revenueSummary reads this field). The ledger keeps the true, uncapped record.
    fields.amountPaidCents = Math.min(result.amountPaidCents, result.totalCents);
    fields.paymentReference = input.paymentReference ?? inv.paymentReference;
    fields.paidAt = now;
    fields.status = result.amountPaidCents >= result.totalCents ? "paid" : "partially_paid";
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
    async recordPayment({ payment }) {
      return db.transaction(async (tx) => {
        const invRows = await tx.select({ totalCents: invoicesTable.totalCents }).from(invoicesTable).where(eq(invoicesTable.id, payment.invoiceId)).limit(1).for("update");
        if (!invRows[0]) return null;
        let applied = true;
        try {
          await tx.insert(paymentsTable).values(payment);
        } catch (error) {
          if (isUniqueViolation(error)) applied = false; // duplicate paymentReference — already recorded (idempotent)
          else throw error;
        }
        const sumRows = await tx.select({ sum: sql<number>`coalesce(sum(${paymentsTable.amountCents}), 0)` }).from(paymentsTable).where(eq(paymentsTable.invoiceId, payment.invoiceId));
        return { applied, amountPaidCents: Number(sumRows[0]?.sum ?? 0), totalCents: invRows[0].totalCents };
      });
    },
  };
}
