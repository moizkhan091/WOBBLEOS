/**
 * Deciding which clients the qualification council should score without being asked.
 *
 * A founder added a client, the container said "not qualified", and there was nothing to click. Even
 * with the button back, asking a human to remember is the wrong answer: scoring a new client is the
 * one thing that should always happen, because everything downstream reads it. The worklist ranks by
 * it, the deal team quotes it, the next action depends on it.
 *
 * What stops this being reckless is the same discipline as the deal-team prep. The council is EIGHT
 * model calls, once per client, and the OpenRouter balance is small. So it runs only where it has
 * something real to read, never twice, and never more than a handful in one pass.
 *
 * The rule that matters most: a council with nothing to read does not score low, it INVENTS. Eight
 * filters answered from a company name would produce a confident grade with no evidence under it, and
 * a founder would make a real decision on it. So thin clients are skipped and SAID to be skipped.
 */

export interface QualifyCandidate {
  companyId: string;
  name: string;
  /** Has the council already scored them? Version count, zero when never. */
  assessmentCount: number;
  /** Did they fill in the website readiness form? Their own words are the best evidence there is. */
  hasIntake: boolean;
  /** Findings a founder approved off a call. */
  approvedFindingCount: number;
  /** Thin company-row facts. Enough to be worth scoring only alongside something else. */
  hasIndustry: boolean;
  hasWebsite: boolean;
  /** When they landed, so the newest client is scored first. */
  createdAt: Date;
}

export interface QualifyDecision {
  companyId: string;
  name: string;
  because: string;
}

export interface QualifyPlan {
  run: QualifyDecision[];
  deferred: QualifyDecision[];
  skipped: Array<{ companyId: string; name: string; because: string }>;
}

/**
 * Eight model calls per client, so three per pass. The scheduler ticks every minute, which means a
 * normal day's intake is scored within minutes and a bulk import drains over an hour instead of
 * emptying the account in one go.
 */
export const DEFAULT_QUALIFY_CAP = 3;

/** Is there enough here for a council to reason from rather than invent? */
export function hasEnoughToScore(c: QualifyCandidate): boolean {
  if (c.hasIntake) return true;
  if (c.approvedFindingCount > 0) return true;
  // Neither of the good sources. Industry AND a website is the thin floor: enough for a research-led
  // read, and still weaker than their own words.
  return c.hasIndustry && c.hasWebsite;
}

export function planQualification(candidates: QualifyCandidate[], cap = DEFAULT_QUALIFY_CAP): QualifyPlan {
  const eligible: QualifyDecision[] = [];
  const skipped: QualifyPlan["skipped"] = [];

  for (const c of candidates) {
    if (c.assessmentCount > 0) {
      skipped.push({ companyId: c.companyId, name: c.name, because: "Already scored. Re-running the council costs eight model calls and would not change the grade on its own." });
      continue;
    }
    if (!hasEnoughToScore(c)) {
      skipped.push({
        companyId: c.companyId,
        name: c.name,
        because: "Nothing to score from yet: no form answers, no approved findings, and not enough on the company itself. A council with nothing to read invents a grade rather than admitting it cannot tell.",
      });
      continue;
    }
    eligible.push({
      companyId: c.companyId,
      name: c.name,
      because: c.hasIntake
        ? "They filled in the readiness form, so the council can score their own words."
        : c.approvedFindingCount > 0
          ? `${c.approvedFindingCount} approved finding${c.approvedFindingCount === 1 ? "" : "s"} from their calls to score against.`
          : "Industry and website are known, so the council has something real to read.",
    });
  }

  // Newest first. A client added a minute ago is the one a founder is looking at.
  eligible.sort((a, b) => {
    const ca = candidates.find((x) => x.companyId === a.companyId)!.createdAt.getTime();
    const cb = candidates.find((x) => x.companyId === b.companyId)!.createdAt.getTime();
    return cb - ca || a.companyId.localeCompare(b.companyId);
  });

  return { run: eligible.slice(0, Math.max(0, cap)), deferred: eligible.slice(Math.max(0, cap)), skipped };
}
