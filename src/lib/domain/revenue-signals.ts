/**
 * Turning the client worklist into things a founder is actually told.
 *
 * The worklist is the best thinking in Revenue: it scores every client on evidence, works out the one
 * thing that is blocking each of them, and ranks them by what is most urgent. It only ever existed on
 * a page. Open the Client Workspace and it is all there; do not open it and none of that happened.
 *
 * The daily brief is what reaches a founder, and its CRM provider looked at exactly one thing: an open
 * opportunity whose next action date had passed. A client going quiet for three weeks, a proposal
 * sitting undecided, a deal whose contact cannot sign what is about to be sent, none of it made the
 * brief.
 *
 * This turns worklist rows into brief signals. The rules that keep it useful rather than noisy:
 *
 * - Only rows that are actually blocked. "Wait for their reply" is the correct answer most days and is
 *   not news, so a row at low urgency produces nothing.
 * - One signal per client, never one per problem. A founder reading a brief wants a list of people,
 *   not a list of symptoms.
 * - The reason travels with it. Every signal carries the sentence the worklist already wrote, because
 *   "Bright Smile Dental needs you" without a why is a nag, not a signal.
 */

export type SignalSeverityName = "info" | "low" | "medium" | "high" | "critical";

/** The slice of a worklist row this needs. Kept structural so the domain has no service dependency. */
export interface RevenueRow {
  companyId: string;
  name: string;
  health: { score: number; band: string; headline: string; daysSinceTouch: number | null };
  next: { kind: string; label: string; because: string; urgency: number };
  deal: { id: string; name: string; stage: string; valueCents: number; currency: string } | null;
  qualification: { grade: string; score: number; weakest: { role: string; score: number } | null } | null;
}

export interface RevenueSignal {
  companyId: string;
  title: string;
  summary: string;
  severity: SignalSeverityName;
  /** Sorts the section. Straight from the worklist so the brief and the page can never disagree. */
  urgency: number;
  actionRequired: boolean;
}

/**
 * Below this, the worklist is not saying anything a founder needs to be interrupted for.
 *
 * 50 is "check in, it has been quiet". 45 is "worth going back to a dead one". 5 is "wait for their
 * reply". The line sits at 50 so the brief carries the things with a name and a deadline, and the page
 * keeps the rest.
 */
export const BRIEF_URGENCY_FLOOR = 50;

/**
 * Urgency maps to severity by what it means, not by arithmetic.
 *
 * 100 is an action the founder committed to and missed, which is the only thing here that is properly
 * their fault and therefore the loudest.
 */
function severityFor(row: RevenueRow): SignalSeverityName {
  if (row.next.urgency >= 100) return "high";
  if (row.health.band === "at_risk" || row.health.band === "cold" || row.health.band === "dead") return "high";
  if (row.next.urgency >= 78) return "medium";
  return "low";
}

/** The value on the table, said the way a founder says it. */
function dealNote(row: RevenueRow): string {
  if (!row.deal || row.deal.valueCents <= 0) return "";
  return ` ${row.deal.currency} ${(row.deal.valueCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })} is on the table.`;
}

function quietNote(row: RevenueRow): string {
  const d = row.health.daysSinceTouch;
  if (d === null) return " Nobody has spoken to them yet.";
  if (d <= 2) return "";
  return ` Last contact was ${d} days ago.`;
}

/**
 * What the brief should say about one client.
 *
 * Returns null when the worklist has nothing urgent to report, which on a healthy client is most days
 * and is the correct answer.
 */
export function signalForClient(row: RevenueRow): RevenueSignal | null {
  if (row.next.urgency < BRIEF_URGENCY_FLOOR) return null;
  if (row.next.kind === "none") return null;

  const weak = row.qualification?.weakest ? ` The council's worry is ${row.qualification.weakest.role.replace(/_/g, " ")} at ${row.qualification.weakest.score}/100.` : "";
  return {
    companyId: row.companyId,
    title: `${row.name}: ${row.next.label}`,
    summary: `${row.next.because}${dealNote(row)}${quietNote(row)}${weak}`,
    severity: severityFor(row),
    urgency: row.next.urgency,
    actionRequired: true,
  };
}

/**
 * Every client the brief should mention, most urgent first.
 *
 * Capped, because a brief listing thirty clients is a brief nobody reads. What was left out is
 * reported rather than silently dropped: a cap that hides its own existence reads as "that is
 * everything", which is the one thing a founder must not believe about a list of who needs them.
 */
export function revenueSignals(rows: RevenueRow[], limit = 8): { signals: RevenueSignal[]; omitted: number } {
  const all = rows
    .map(signalForClient)
    .filter((s): s is RevenueSignal => s !== null)
    .sort((a, b) => b.urgency - a.urgency || a.companyId.localeCompare(b.companyId));
  return { signals: all.slice(0, limit), omitted: Math.max(0, all.length - limit) };
}
