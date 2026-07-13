// Controlled Dream / Optimizer engine — pure domain (Phase 8).
//
// The OS may PROPOSE improvements to its own behaviour, but must NEVER silently rewrite production. Every
// improvement follows a governed lifecycle: observe a pattern → gather evidence → estimate value/cost/risk →
// rank → historical-test → propose (versioned) → founder APPROVAL → activation → monitor vs baseline →
// rollback if it degrades. This module is the pure decision core: scoring/ranking, the historical-test gate,
// the governance transitions (the ONLY path to `active` is proposed → approved → active), and the rollback
// signal. There is no auto-activation.

import type { RiskTier } from "@/lib/domain/autonomy";

export const PROPOSAL_STATUSES = ["proposed", "approved", "active", "rejected", "rolled_back", "superseded"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

const RISK_FACTOR: Record<RiskTier, number> = { low: 1, medium: 1.5, high: 2.5, critical: 5 };

export interface ImprovementProposal {
  id: string;
  /** The observed pattern this improvement responds to. */
  pattern: string;
  evidence: string[];
  /** The proposed change. */
  hypothesis: string;
  /** Estimated value 0..100 (an estimate — never presented as a realized actual). */
  estimatedValue: number;
  estimatedCostCents: number;
  riskLevel: RiskTier;
  /** Result of testing the candidate against history (null until tested). */
  historicalTest?: { baselineMetric: number; candidateMetric: number; sampleSize: number } | null;
  status: ProposalStatus;
  version: number;
}

/** Priority score: value per unit of (cost + risk). Higher = a better improvement to pursue first. */
export function scoreProposal(p: Pick<ImprovementProposal, "estimatedValue" | "estimatedCostCents" | "riskLevel">): number {
  const costUnits = 1 + p.estimatedCostCents / 100_000; // $1000 ≈ +1 cost unit
  const denom = costUnits * RISK_FACTOR[p.riskLevel];
  return Math.round((p.estimatedValue / denom) * 100) / 100;
}

/** Rank proposals best-first (score desc; stable tie-break by id). */
export function rankProposals<T extends Pick<ImprovementProposal, "id" | "estimatedValue" | "estimatedCostCents" | "riskLevel">>(proposals: T[]): T[] {
  return [...proposals].sort((a, b) => {
    const d = scoreProposal(b) - scoreProposal(a);
    return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** The historical test PASSES when the candidate beats the baseline. An untested proposal has not passed. */
export function historicalTestPasses(p: Pick<ImprovementProposal, "historicalTest">): boolean {
  if (!p.historicalTest) return false;
  return p.historicalTest.candidateMetric > p.historicalTest.baselineMetric;
}

/** A proposal may be APPROVED only from `proposed` AND only when its historical test has passed. */
export function canApprove(p: Pick<ImprovementProposal, "status" | "historicalTest">): boolean {
  return p.status === "proposed" && historicalTestPasses(p);
}

/** A proposal may be ACTIVATED only from `approved` — the ONLY path to production behaviour change. */
export function canActivate(p: Pick<ImprovementProposal, "status">): boolean {
  return p.status === "approved";
}

/** Rollback signal: an active improvement whose monitored metric drops below its baseline must be rolled back. */
export function shouldRollback(monitoring: { activeMetric: number; baselineMetric: number }): boolean {
  return monitoring.activeMetric < monitoring.baselineMetric;
}

/** The governed next status for a lifecycle action — throws on an illegal transition (never silent). */
export function transitionProposal(
  p: ImprovementProposal,
  action: "approve" | "reject" | "activate" | "rollback",
  monitoring?: { activeMetric: number; baselineMetric: number },
): ProposalStatus {
  switch (action) {
    case "approve":
      if (!canApprove(p)) throw new Error(`cannot approve a '${p.status}' proposal (needs proposed + a passing historical test)`);
      return "approved";
    case "reject":
      if (p.status !== "proposed" && p.status !== "approved") throw new Error(`cannot reject a '${p.status}' proposal`);
      return "rejected";
    case "activate":
      if (!canActivate(p)) throw new Error(`cannot activate a '${p.status}' proposal (must be approved first)`);
      return "active";
    case "rollback":
      if (p.status !== "active") throw new Error(`cannot roll back a '${p.status}' proposal`);
      if (monitoring && !shouldRollback(monitoring)) throw new Error("refusing to roll back an improvement that is not degrading");
      return "rolled_back";
  }
}
