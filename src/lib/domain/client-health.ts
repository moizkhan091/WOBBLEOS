/**
 * Client health and the next action, computed from facts the OS already holds.
 *
 * No model is called here and none should be: every input is a date, a stage, a count or a level that
 * the database already knows. A health score that costs money per client would not be run often enough
 * to be useful, and a founder cannot argue with a number whose reasons are not written down, so every
 * score carries the signals that produced it in plain language.
 *
 * The scale is deliberately blunt. 100 is "this deal is moving and nothing is waiting on us"; anything
 * under 40 means a founder should look today.
 */

export type HealthBand = "healthy" | "slipping" | "at_risk" | "cold";

export interface HealthSignal {
  /** Short label, shown as a chip. */
  label: string;
  /** How many points this moved the score. Negative hurts. */
  points: number;
  /** Why, in a sentence a founder can act on. */
  detail: string;
}

export interface ClientHealthInput {
  /** Most recent evidence of contact in either direction. */
  lastTouchAt: Date | null;
  /** When the client first landed in the OS. */
  createdAt: Date | null;
  /** Open opportunity, if any. */
  stage: string | null;
  /** When the deal last changed stage. */
  stageSinceAt: Date | null;
  /** Deal status: open / won / lost. */
  dealStatus: string | null;
  /** A next action the founder committed to, and when it is due. */
  nextAction: string | null;
  nextActionAt: Date | null;
  /** Qualification result, when the council has run. */
  qualificationLevel: string | null;
  /** Counts of what exists in the container. */
  meetingCount: number;
  approvedFindingCount: number;
  proposalCount: number;
  /** A proposal has been sent and is neither accepted nor rejected. */
  proposalAwaitingReply: boolean;
  /** The client answered the website form (so we know their words, not just our guesses). */
  hasIntake: boolean;
  /** Whether we have a named decision maker. */
  hasDecisionMaker: boolean;
  now: Date;
}

export interface ClientHealth {
  score: number;
  band: HealthBand;
  /** One line, the headline reason. */
  headline: string;
  signals: HealthSignal[];
  /** Days since the last evidence of contact; null when there has never been any. */
  daysSinceTouch: number | null;
  /** Days the deal has sat in its current stage; null when there is no deal. */
  daysInStage: number | null;
}

const DAY_MS = 86_400_000;

export function daysBetween(from: Date | null, to: Date): number | null {
  if (!from) return null;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

export function bandFor(score: number): HealthBand {
  if (score >= 75) return "healthy";
  if (score >= 55) return "slipping";
  if (score >= 40) return "at_risk";
  return "cold";
}

/** Stages where silence is expensive because the client is waiting on us, not the other way round. */
const OUR_MOVE_STAGES = new Set(["qualified", "discovery", "proposal_sent", "negotiation"]);

/**
 * Score a client. Starts at a neutral 70 and moves on evidence, so a brand new client with nothing
 * against it does not read as either healthy or dying.
 */
export function scoreClientHealth(input: ClientHealthInput): ClientHealth {
  const signals: HealthSignal[] = [];
  let score = 70;

  const add = (label: string, points: number, detail: string) => {
    score += points;
    signals.push({ label, points, detail });
  };

  const daysSinceTouch = daysBetween(input.lastTouchAt, input.now);
  const daysInStage = daysBetween(input.stageSinceAt, input.now);
  const closed = input.dealStatus === "won" || input.dealStatus === "lost";

  // Silence. The single most predictive signal in a small pipeline, and the easiest to fix.
  if (daysSinceTouch === null) {
    const age = daysBetween(input.createdAt, input.now) ?? 0;
    if (age >= 3) add("never contacted", -25, `In the OS for ${age} days with no recorded contact.`);
  } else if (!closed) {
    if (daysSinceTouch >= 30) add("silent 30d+", -30, `No contact for ${daysSinceTouch} days.`);
    else if (daysSinceTouch >= 14) add("silent 14d+", -18, `No contact for ${daysSinceTouch} days.`);
    else if (daysSinceTouch >= 7) add("silent 7d+", -8, `No contact for ${daysSinceTouch} days.`);
    else add("recent contact", 6, `Last contact ${daysSinceTouch === 0 ? "within the last day" : daysSinceTouch === 1 ? "a day ago" : `${daysSinceTouch} days ago`}.`);
  }

  // A deal parked in a stage that is ours to move.
  if (!closed && input.stage && daysInStage !== null && OUR_MOVE_STAGES.has(input.stage)) {
    if (daysInStage >= 21) add("stage stalled", -20, `Sat in ${input.stage.replace(/_/g, " ")} for ${daysInStage} days.`);
    else if (daysInStage >= 10) add("stage slow", -10, `In ${input.stage.replace(/_/g, " ")} for ${daysInStage} days.`);
  }

  // An unanswered proposal is a deal with a clock on it.
  if (input.proposalAwaitingReply) {
    add("proposal unanswered", -12, "A proposal is out and has had no yes or no.");
  }

  // A committed next action that has come and gone is worse than no plan at all.
  if (input.nextActionAt && input.nextActionAt.getTime() < input.now.getTime() && !closed) {
    const overdue = daysBetween(input.nextActionAt, input.now) ?? 0;
    add("action overdue", -15, `"${input.nextAction ?? "next action"}" was due ${overdue} day${overdue === 1 ? "" : "s"} ago.`);
  } else if (input.nextAction) {
    add("next action set", 5, `Next: ${input.nextAction}.`);
  } else if (!closed) {
    add("no next action", -10, "Nothing is scheduled, so nothing will happen.");
  }

  // Depth of what we know. A client we have actually listened to is easier to close.
  if (input.hasIntake) add("told us their words", 6, "Answered the website form, so the pitch can quote them.");
  if (input.meetingCount > 0) add(`${input.meetingCount} call${input.meetingCount === 1 ? "" : "s"}`, 6, "We have been on a call with them.");
  if (input.approvedFindingCount >= 5) add("rich discovery", 8, `${input.approvedFindingCount} approved findings to build on.`);
  else if (input.meetingCount > 0 && input.approvedFindingCount === 0) add("call not mined", -8, "A call happened but no findings were approved from it.");
  if (!input.hasDecisionMaker) add("no decision maker", -8, "No named decision maker, so nobody can say yes.");

  if (input.qualificationLevel === "strong_fit") add("strong fit", 10, "The qualification council rated them a strong fit.");
  else if (input.qualificationLevel === "poor_fit") add("poor fit", -12, "The qualification council rated them a poor fit.");

  if (input.dealStatus === "won") { score = Math.max(score, 90); signals.push({ label: "won", points: 0, detail: "Closed won." }); }
  if (input.dealStatus === "lost") { score = Math.min(score, 20); signals.push({ label: "lost", points: 0, detail: "Closed lost." }); }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const worst = [...signals].sort((a, b) => a.points - b.points)[0];
  const headline = worst && worst.points < 0 ? worst.detail : signals.length ? "Nothing is blocking this one." : "Too new to judge.";

  return { score, band: bandFor(score), headline, signals, daysSinceTouch, daysInStage };
}

// -------------------------------------------------------------------------- next action

export type NextActionKind =
  | "contact"
  | "qualify"
  | "book_call"
  | "mine_call"
  | "send_questions"
  | "build_proposal"
  | "chase_proposal"
  | "run_audit"
  | "close"
  | "none";

export interface NextActionSuggestion {
  kind: NextActionKind;
  /** Imperative, specific, and short enough to be a button label's neighbour. */
  label: string;
  /** Why this and not something else. */
  because: string;
  /** Higher sorts first in the worklist. */
  urgency: number;
}

export interface NextActionInput extends ClientHealthInput {
  hasQuestionSet: boolean;
  hasAudit: boolean;
  auditIsPaid: boolean;
}

/**
 * What to do about this client next.
 *
 * Deterministic on purpose: the founder sees the same recommendation the ranking used, and a rule that
 * turns out to be wrong can be changed here rather than re-prompted. The order below is the sales
 * sequence, checked from the most blocking condition down.
 */
export function suggestNextAction(input: NextActionInput): NextActionSuggestion {
  const closed = input.dealStatus === "won" || input.dealStatus === "lost";
  if (closed) return { kind: "none", label: "Nothing pending", because: `Deal is ${input.dealStatus}.`, urgency: 0 };

  const silent = daysBetween(input.lastTouchAt, input.now);

  if (input.nextActionAt && input.nextActionAt.getTime() < input.now.getTime()) {
    return { kind: "contact", label: input.nextAction ?? "Do the overdue next action", because: "It was due and has not happened.", urgency: 100 };
  }
  if (input.proposalAwaitingReply && (silent ?? 0) >= 4) {
    return { kind: "chase_proposal", label: "Chase the proposal", because: `Proposal is out and it has been ${silent} days.`, urgency: 90 };
  }
  if (input.hasIntake && !input.qualificationLevel) {
    return { kind: "qualify", label: "Qualify them", because: "They filled the form but nobody has scored the fit.", urgency: 85 };
  }
  if (input.meetingCount === 0 && !input.hasQuestionSet) {
    return { kind: "send_questions", label: "Generate the call questions", because: "No call yet and no questions prepared.", urgency: 80 };
  }
  if (input.meetingCount === 0) {
    return { kind: "book_call", label: "Book the first call", because: "Questions are ready and there has been no call.", urgency: 78 };
  }
  if (input.meetingCount > 0 && input.approvedFindingCount === 0) {
    return { kind: "mine_call", label: "Approve the call findings", because: "A call happened but nothing was turned into findings.", urgency: 75 };
  }
  if (input.approvedFindingCount > 0 && !input.hasAudit) {
    return { kind: "run_audit", label: "Run the audit", because: `${input.approvedFindingCount} approved findings are ready to build on.`, urgency: 70 };
  }
  if (input.hasAudit && input.proposalCount === 0) {
    return { kind: "build_proposal", label: "Build the proposal", because: "The audit is done and no proposal exists.", urgency: 68 };
  }
  if ((silent ?? 99) >= 7) {
    return { kind: "contact", label: "Check in", because: `It has been ${silent} days with nothing said.`, urgency: 50 + Math.min(30, silent ?? 0) };
  }
  return { kind: "none", label: "Wait for their reply", because: "The ball is with them and it has not been long.", urgency: 5 };
}
