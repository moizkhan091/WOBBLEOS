/**
 * Deciding which clients the deal team should prepare for, before anyone asks.
 *
 * The four agents are good and entirely manual. The only things that ever call them are two API routes
 * behind buttons, so the objection brief for tomorrow's call exists only if a founder remembers to
 * click, on the day, before the call. That is the OS waiting to be asked instead of helping.
 *
 * The obvious move is "run them all nightly", and it is wrong. There are five dollars on the OpenRouter
 * account, each brief is a real model call, and running them across every client every night would burn
 * the balance producing documents for people nobody is about to speak to.
 *
 * So this is a triage, not a schedule. A brief is prepared when THREE things are true:
 *
 *   1. There is something to reason from. No approved findings means the agent would invent, and an
 *      invented objection brief is worse than none.
 *   2. A conversation is actually coming. The worklist already says what the next move is; only the
 *      moves that involve talking to them qualify.
 *   3. What we have is stale or missing. A brief written after the last finding was approved is still
 *      current, and paying to regenerate it changes nothing.
 *
 * Then it is capped, hard, and what was skipped is reported. A cap that hides itself reads as "everyone
 * is prepared", which is exactly the belief that gets a founder walking into a call with nothing.
 */

/** Next actions that mean a founder is about to be in front of this client. */
const CONVERSATION_COMING = new Set(["book_call", "chase_proposal", "build_proposal", "mine_call", "contact", "reactivate"]);

export interface PrepCandidate {
  companyId: string;
  name: string;
  /** From the worklist, so the OS never disagrees with itself about what is next. */
  nextKind: string;
  urgency: number;
  approvedFindingCount: number;
  /** When the newest approved finding landed. Null when there are none. */
  latestFindingAt: Date | null;
  /** When the stored objection brief was written. Null when there is none. */
  briefGeneratedAt: Date | null;
}

export interface PrepDecision {
  companyId: string;
  name: string;
  /** Why this client and not another, in words that go in the audit event. */
  because: string;
  urgency: number;
}

export interface PrepPlan {
  run: PrepDecision[];
  /** Clients that qualified but did not fit under the cap. Named, never silently dropped. */
  deferred: PrepDecision[];
  /** Why each skipped client was skipped, for the one question a founder will ask. */
  skipped: Array<{ companyId: string; name: string; because: string }>;
}

/**
 * The default cap.
 *
 * Three clients a night is roughly a few cents and covers the realistic case: a founder has one or two
 * live conversations, not twenty. Raising it is a decision, not an accident.
 */
export const DEFAULT_PREP_CAP = 3;

export function planDealTeamPrep(candidates: PrepCandidate[], cap = DEFAULT_PREP_CAP): PrepPlan {
  const eligible: PrepDecision[] = [];
  const skipped: PrepPlan["skipped"] = [];

  for (const c of candidates) {
    if (c.approvedFindingCount === 0) {
      skipped.push({ companyId: c.companyId, name: c.name, because: "No approved findings yet, so an objection brief would be invented rather than read off their own words." });
      continue;
    }
    if (!CONVERSATION_COMING.has(c.nextKind)) {
      skipped.push({ companyId: c.companyId, name: c.name, because: `Next move is "${c.nextKind}", which is not a conversation, so a brief would go stale before it was used.` });
      continue;
    }
    if (c.briefGeneratedAt && c.latestFindingAt && c.briefGeneratedAt.getTime() >= c.latestFindingAt.getTime()) {
      skipped.push({ companyId: c.companyId, name: c.name, because: "The brief already covers everything approved from their calls. Regenerating it would cost money and change nothing." });
      continue;
    }
    eligible.push({
      companyId: c.companyId,
      name: c.name,
      because: c.briefGeneratedAt
        ? "New findings were approved since the last brief was written."
        : `A conversation is next and there is no brief, with ${c.approvedFindingCount} approved finding${c.approvedFindingCount === 1 ? "" : "s"} to read off.`,
      urgency: c.urgency,
    });
  }

  eligible.sort((a, b) => b.urgency - a.urgency || a.companyId.localeCompare(b.companyId));
  return { run: eligible.slice(0, Math.max(0, cap)), deferred: eligible.slice(Math.max(0, cap)), skipped };
}
