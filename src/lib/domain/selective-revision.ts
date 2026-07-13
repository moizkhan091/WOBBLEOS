// Selective artifact revision — pure domain (Phase 7).
//
// A composite artifact (deck, proposal, audit, report, content pack…) is a graph of versioned COMPONENTS,
// each produced by a specialist and possibly depending on others. When only SOME components fail QA, we must
// NOT regenerate the whole artifact: preserve every approved component + its evidence, rerun ONLY the failed
// components and the ones that transitively depend on them (consistency), invoke ONLY those components'
// specialists, then run local QA on the reran components and a final GLOBAL consistency QA before release.
// This module computes that plan + the next versions; checkpoint-resume alone is NOT selective revision.

export interface ArtifactComponent {
  id: string;
  kind: string;
  version: number;
  status: "approved" | "failed" | "pending";
  /** The specialist/agent that produces this component (the one to re-invoke on a rerun). */
  producedBy: string;
  /** Component ids this one depends on — a change upstream forces a downstream rerun for consistency. */
  dependsOn: string[];
}

export interface RevisionPlan {
  /** Components to rerun: the failed ones + everything that transitively depends on them. */
  rerun: string[];
  /** Approved components preserved AS-IS (their evidence + version untouched). */
  preserved: string[];
  /** ONLY the specialists whose components are being rerun (no full-team regeneration). */
  specialists: string[];
  /** Local QA runs on each reran component; a final global consistency QA runs when anything changed. */
  requiresLocalQa: boolean;
  requiresGlobalConsistencyQa: boolean;
  /** The next version number for each reran component (its version + 1). */
  nextVersions: Record<string, number>;
}

/**
 * Plan a selective revision. Pure + deterministic. `failedIds` are the components that failed QA; the plan
 * reruns exactly those plus their transitive dependents, preserves the rest of the approved components, and
 * requires a global consistency QA whenever anything is reran.
 */
export function planSelectiveRevision(components: ArtifactComponent[], failedIds: string[]): RevisionPlan {
  const byId = new Map(components.map((c) => [c.id, c]));
  const rerun = new Set<string>(failedIds.filter((id) => byId.has(id)));

  // Propagate to dependents: any component depending (transitively) on a reran component must rerun too.
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of components) {
      if (rerun.has(c.id)) continue;
      if (c.dependsOn.some((d) => rerun.has(d))) {
        rerun.add(c.id);
        changed = true;
      }
    }
  }

  const rerunList = components.filter((c) => rerun.has(c.id)).map((c) => c.id);
  const preserved = components.filter((c) => !rerun.has(c.id) && c.status === "approved").map((c) => c.id);
  const specialists = [...new Set(components.filter((c) => rerun.has(c.id)).map((c) => c.producedBy))].sort();
  const nextVersions: Record<string, number> = {};
  for (const c of components) if (rerun.has(c.id)) nextVersions[c.id] = c.version + 1;

  return {
    rerun: rerunList,
    preserved,
    specialists,
    requiresLocalQa: rerunList.length > 0,
    requiresGlobalConsistencyQa: rerunList.length > 0,
    nextVersions,
  };
}

/** Apply a completed revision: bump reran components to their next version + approved; preserve the rest. */
export function applyRevision(components: ArtifactComponent[], plan: RevisionPlan): ArtifactComponent[] {
  const rerun = new Set(plan.rerun);
  return components.map((c) => (rerun.has(c.id) ? { ...c, version: plan.nextVersions[c.id] ?? c.version + 1, status: "approved" as const } : c));
}
