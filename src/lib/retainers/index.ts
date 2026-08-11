import { eq, isNull, and } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { invoices } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { createInvoice } from "@/lib/finance";
import {
  decideRetainer,
  periodKey,
  retainerScheduleSchema,
  type RetainerSchedule,
} from "@/lib/domain/retainers";

/**
 * Turning one invoice into a standing retainer.
 *
 * A retainer is not a new kind of record: it is an invoice that knows how to produce the next one. The
 * schedule lives on the source invoice's metadata, and each generated invoice points back at it.
 *
 * Two things are non-negotiable here:
 *   - every generated invoice is a DRAFT. Nothing is sent, nothing is charged, and no money moves
 *     without a founder. That boundary is in the governance docs and this does not weaken it.
 *   - a period is issued exactly once. The period key is recorded on the schedule BEFORE the next one
 *     is scheduled, so a sweep that runs twice in a day cannot bill a client twice.
 */

export const RETAINER_MODULE = "finance";

export interface RetainerSweepResult {
  issued: Array<{ sourceInvoiceId: string; newInvoiceId: string; periodKey: string }>;
  skipped: Array<{ sourceInvoiceId: string; because: string }>;
  errors: string[];
}

function readSchedule(metadata: unknown): RetainerSchedule | null {
  const raw = (metadata as Record<string, unknown> | null | undefined)?.retainer;
  if (!raw) return null;
  const parsed = retainerScheduleSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Raise every retainer invoice that has come due.
 *
 * Runs in the daily maintenance tick. One failing schedule never stops the others: a client whose
 * retainer silently stopped billing is a worse outcome than an error in a log.
 */
export async function sweepRetainers(opts: { now?: Date } = {}, db: Db = getDb()): Promise<RetainerSweepResult> {
  const now = opts.now ?? new Date();
  const result: RetainerSweepResult = { issued: [], skipped: [], errors: [] };

  const rows = await db.select().from(invoices).where(isNull(invoices.archivedAt)).limit(2000);
  const sources = rows.filter((r) => readSchedule(r.metadata));

  for (const source of sources) {
    const schedule = readSchedule(source.metadata)!;
    try {
      const anchorDay = new Date(schedule.nextIssueAt).getUTCDate();
      const decision = decideRetainer(schedule, now, anchorDay);
      if (!decision.issue) {
        result.skipped.push({ sourceInvoiceId: source.id, because: decision.because });
        continue;
      }

      // Record the period BEFORE creating the invoice. If the create fails we have skipped a month,
      // which a founder can raise by hand; if it succeeded and we then failed to record it, the next
      // sweep would bill the client again. The safe failure is the one that under-bills.
      const advanced: RetainerSchedule = {
        ...schedule,
        issued: [...schedule.issued, decision.periodKey],
        nextIssueAt: decision.nextIssueAt.toISOString(),
      };
      await db
        .update(invoices)
        .set({ metadata: { ...((source.metadata ?? {}) as Record<string, unknown>), retainer: advanced }, updatedAt: now })
        .where(eq(invoices.id, source.id));

      const created = await createInvoice(
        {
          companyId: source.companyId ?? undefined,
          contactId: source.contactId ?? undefined,
          opportunityId: source.opportunityId ?? undefined,
          proposalId: source.proposalId ?? undefined,
          billingDetails: (source.billingDetails ?? {}) as Record<string, unknown>,
          lineItems: source.lineItems ?? [],
          currency: source.currency,
          taxCents: source.taxCents,
          discountCents: source.discountCents,
          dueDate: decision.dueAt,
          paymentTerms: source.paymentTerms ?? undefined,
          notes: `Retainer, ${decision.periodKey}. Raised automatically from invoice ${source.invoiceNumber}. Draft until a founder sends it.`,
          createdBy: "retainer_sweep",
        },
        { now },
      );

      // Stamp the child so it is traceable both ways and can never be mistaken for a one-off.
      await db
        .update(invoices)
        .set({ metadata: { retainerOf: source.id, periodKey: decision.periodKey }, updatedAt: now })
        .where(eq(invoices.id, created.id));

      await writeAuditEvent({
        eventType: "finance.retainer_invoice_raised",
        module: RETAINER_MODULE,
        entityType: "invoice",
        entityId: created.id,
        actor: "retainer_sweep",
        metadata: { sourceInvoiceId: source.id, periodKey: decision.periodKey, totalCents: created.totalCents, status: created.status },
      });

      result.issued.push({ sourceInvoiceId: source.id, newInvoiceId: created.id, periodKey: decision.periodKey });
    } catch (error) {
      result.errors.push(`${source.id}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  return result;
}

export interface SetRetainerInput {
  invoiceId: string;
  cadence: RetainerSchedule["cadence"];
  nextIssueAt: string;
  endsAt?: string;
  dueInDays?: number;
  active?: boolean;
  actor: string;
}

/** Make an invoice recurring, change its schedule, or pause it. Never issues anything by itself. */
export async function setRetainer(input: SetRetainerInput, db: Db = getDb()): Promise<RetainerSchedule> {
  const [invoice] = await db.select().from(invoices).where(and(eq(invoices.id, input.invoiceId), isNull(invoices.archivedAt))).limit(1);
  if (!invoice) throw new Error("invoice not found");

  const existing = readSchedule(invoice.metadata);
  const schedule = retainerScheduleSchema.parse({
    cadence: input.cadence,
    nextIssueAt: input.nextIssueAt,
    endsAt: input.endsAt,
    dueInDays: input.dueInDays ?? existing?.dueInDays ?? 14,
    active: input.active ?? true,
    // Never reset what has already been billed: that is the only thing standing between a schedule
    // change and a client being invoiced twice for the same month.
    issued: existing?.issued ?? [],
  });

  const now = new Date();
  await db
    .update(invoices)
    .set({ metadata: { ...((invoice.metadata ?? {}) as Record<string, unknown>), retainer: schedule }, updatedAt: now })
    .where(eq(invoices.id, input.invoiceId));

  await writeAuditEvent({
    eventType: "finance.retainer_set",
    module: RETAINER_MODULE,
    entityType: "invoice",
    entityId: input.invoiceId,
    actor: input.actor,
    metadata: { cadence: schedule.cadence, nextIssueAt: schedule.nextIssueAt, active: schedule.active, alreadyIssued: schedule.issued.length },
  });

  return schedule;
}

/** Stop a retainer without losing the record of what it billed. */
export async function pauseRetainer(invoiceId: string, actor: string, db: Db = getDb()): Promise<RetainerSchedule | null> {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) throw new Error("invoice not found");
  const existing = readSchedule(invoice.metadata);
  if (!existing) return null;
  const paused: RetainerSchedule = { ...existing, active: false };
  const now = new Date();
  await db.update(invoices).set({ metadata: { ...((invoice.metadata ?? {}) as Record<string, unknown>), retainer: paused }, updatedAt: now }).where(eq(invoices.id, invoiceId));
  await writeAuditEvent({ eventType: "finance.retainer_paused", module: RETAINER_MODULE, entityType: "invoice", entityId: invoiceId, actor, metadata: { issued: paused.issued.length } });
  return paused;
}

/** Every live retainer, for the container and the finance page. */
export async function listRetainers(db: Db = getDb()): Promise<Array<{ invoiceId: string; invoiceNumber: string; companyId: string | null; totalCents: number; currency: string; schedule: RetainerSchedule }>> {
  const rows = await db.select().from(invoices).where(isNull(invoices.archivedAt)).limit(2000);
  return rows
    .map((r) => ({ row: r, schedule: readSchedule(r.metadata) }))
    .filter((x): x is { row: (typeof rows)[number]; schedule: RetainerSchedule } => Boolean(x.schedule))
    .map(({ row, schedule }) => ({ invoiceId: row.id, invoiceNumber: row.invoiceNumber, companyId: row.companyId, totalCents: row.totalCents, currency: row.currency, schedule }));
}

export { periodKey };
