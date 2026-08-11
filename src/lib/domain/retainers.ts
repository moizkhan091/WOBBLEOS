import { z } from "zod";

/**
 * Retainers: the same invoice, every month, without anybody remembering to raise it.
 *
 * Invoices existed and recurring did not, so a retainer client was billed whenever a founder happened
 * to think of it. This is the pure half: what a schedule is, when the next one is due, and the period
 * key that makes issuing it twice impossible.
 *
 * The strict rule here is IDEMPOTENCE. Every generated invoice carries the period it covers, and the
 * sweep refuses to issue a period that already exists. Double-billing a client is the one mistake in
 * this system that costs a relationship rather than an afternoon, and a sweep that runs daily will
 * eventually run twice in a day.
 */

export const RETAINER_CADENCES = ["monthly", "quarterly", "annual"] as const;
export type RetainerCadence = (typeof RETAINER_CADENCES)[number];

export const CADENCE_MONTHS: Record<RetainerCadence, number> = { monthly: 1, quarterly: 3, annual: 12 };

export const retainerScheduleSchema = z.object({
  cadence: z.enum(RETAINER_CADENCES),
  /** When the next invoice should be raised. ISO. */
  nextIssueAt: z.string().datetime(),
  /** Stop after this date. Absent means it runs until a founder stops it. */
  endsAt: z.string().datetime().optional(),
  /** How many days after issue the invoice is due. */
  dueInDays: z.number().int().min(0).max(180).default(14),
  /** Set false to pause without losing the schedule. */
  active: z.boolean().default(true),
  /** Period keys already issued, so a rerun cannot bill twice. */
  issued: z.array(z.string().trim().min(4).max(16)).default([]),
});
export type RetainerSchedule = z.infer<typeof retainerScheduleSchema>;

/**
 * The period an invoice covers, as a stable string.
 *
 * Monthly is the year and month; quarterly is the year and quarter; annual is the year. Two invoices
 * for the same client with the same key are the same bill, whatever day the sweep happened to run.
 */
export function periodKey(cadence: RetainerCadence, at: Date): string {
  const y = at.getUTCFullYear();
  if (cadence === "annual") return String(y);
  if (cadence === "quarterly") return `${y}-Q${Math.floor(at.getUTCMonth() / 3) + 1}`;
  return `${y}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Move a date forward by one cadence, keeping the day of month where the month allows it.
 *
 * A retainer started on the 31st must not silently drift to the 28th forever, so the day is clamped
 * for the short month and restored afterwards by anchoring off the original day.
 */
export function addCadence(from: Date, cadence: RetainerCadence, anchorDay?: number): Date {
  const day = anchorDay ?? from.getUTCDate();
  const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + CADENCE_MONTHS[cadence], 1, from.getUTCHours(), from.getUTCMinutes(), 0, 0));
  const lastDayOfMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDayOfMonth));
  return next;
}

export interface RetainerDecision {
  /** Raise an invoice for this period. */
  issue: boolean;
  periodKey: string;
  /** When the one after that falls due. */
  nextIssueAt: Date;
  dueAt: Date;
  /** Why not, when issue is false. */
  because: string;
}

/**
 * Should this schedule raise an invoice now?
 *
 * Refuses on: paused, past its end date, not yet due, or a period already issued. Each refusal names
 * itself, because a founder asking "why did the retainer not bill" deserves an answer rather than
 * silence.
 */
export function decideRetainer(schedule: RetainerSchedule, now: Date, anchorDay?: number): RetainerDecision {
  const nextIssue = new Date(schedule.nextIssueAt);
  const key = periodKey(schedule.cadence, nextIssue);
  const nextAfter = addCadence(nextIssue, schedule.cadence, anchorDay);
  const dueAt = new Date(nextIssue.getTime() + schedule.dueInDays * 86_400_000);
  const base = { periodKey: key, nextIssueAt: nextAfter, dueAt };

  if (!schedule.active) return { ...base, issue: false, because: "The retainer is paused." };
  if (schedule.endsAt && new Date(schedule.endsAt).getTime() < nextIssue.getTime()) {
    return { ...base, issue: false, because: `The retainer ended on ${schedule.endsAt.slice(0, 10)}.` };
  }
  if (nextIssue.getTime() > now.getTime()) {
    return { ...base, issue: false, because: `Not due until ${schedule.nextIssueAt.slice(0, 10)}.` };
  }
  if (schedule.issued.includes(key)) {
    return { ...base, issue: false, because: `${key} has already been invoiced. Issuing it again would bill this client twice.` };
  }
  return { ...base, issue: true, because: `${key} is due and has not been invoiced.` };
}

/** A human line for the container: what this retainer is and when it next bills. */
export function describeRetainer(schedule: RetainerSchedule, totalCents: number, currency: string): string {
  const money = `${currency} ${(totalCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (!schedule.active) return `Paused. Was ${money} ${schedule.cadence}.`;
  const issued = schedule.issued.length;
  return `${money} ${schedule.cadence}, next on ${schedule.nextIssueAt.slice(0, 10)}${issued ? `, ${issued} already raised` : ""}. Each one is a draft until a founder sends it.`;
}
