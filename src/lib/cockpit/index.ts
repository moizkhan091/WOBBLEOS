/**
 * Intelligence Cockpit — a READ-ONLY founder aggregation over the OS's real operational systems. It fabricates
 * NOTHING: each panel reads an existing store through an injectable reader and reports real counts / honest nulls
 * (a panel whose store is empty reports 0 / null, never invented). One call assembles the founder's single glance:
 * revenue (measured), self-optimizer proposals, earned-autonomy grants, what needs attention, and media pipeline.
 */
import { AUTH_FOUNDERS } from "@/lib/auth";

export interface CockpitRevenue { revenueCents: number | null; evidenceTier: string | null; periodMonths: number }
export interface CockpitCounts { [status: string]: number }
export interface IntelligenceCockpit {
  generatedAt: string;
  revenue: CockpitRevenue;
  optimizer: { proposed: number; active: number; total: number };
  autonomy: { activeGrants: number };
  attention: { openEscalations: number; pendingApprovals: number; total: number };
  media: { total: number; byStatus: CockpitCounts };
}

export interface CockpitReaders {
  orgMetrics?: () => Promise<{ revenueCents: number | null; revenueEvidenceTier: string | null; revenuePeriodMonths: number }>;
  listProposals?: () => Promise<Array<{ status: string }>>;
  listActiveGrants?: () => Promise<unknown[]>;
  listOpenEscalations?: () => Promise<unknown[]>;
  listPendingApprovals?: () => Promise<unknown[]>;
  listMediaJobs?: () => Promise<Array<{ status: string }>>;
  now?: () => string;
}

const count = (rows: Array<{ status: string }>, status: string) => rows.filter((r) => r.status === status).length;

/** Assemble the cockpit. Every reader defaults to the real production store; inject deterministic readers in proofs. */
export async function getIntelligenceCockpit(readers: CockpitReaders = {}): Promise<IntelligenceCockpit> {
  const orgMetrics = readers.orgMetrics ?? (async () => {
    const { makeFinanceOrgMetrics } = await import("@/lib/aios-value");
    return makeFinanceOrgMetrics({ founders: [...AUTH_FOUNDERS] })({ type: "company", id: null });
  });
  const listProposals = readers.listProposals ?? (async () => (await import("@/lib/optimizer")).listProposals({ limit: 500 }) as Promise<Array<{ status: string }>>);
  const listActiveGrants = readers.listActiveGrants ?? (async () => (await import("@/lib/autonomy")).listAutonomyPolicies({ status: "active" }));
  const listOpenEscalations = readers.listOpenEscalations ?? (async () => (await import("@/lib/departments/escalation")).listEscalations({ status: "open", limit: 500 }));
  const listPendingApprovals = readers.listPendingApprovals ?? (async () => (await import("@/lib/approvals")).listApprovals({ status: "pending", limit: 500 }));
  const listMediaJobs = readers.listMediaJobs ?? (async () => (await import("@/lib/media")).listMediaJobs({ limit: 500 }) as Promise<Array<{ status: string }>>);

  const [org, proposals, grants, escalations, approvals, media] = await Promise.all([
    orgMetrics(), listProposals(), listActiveGrants(), listOpenEscalations(), listPendingApprovals(), listMediaJobs(),
  ]);

  const byStatus: CockpitCounts = {};
  for (const j of media) byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;

  return {
    generatedAt: readers.now ? readers.now() : new Date().toISOString(),
    revenue: { revenueCents: org.revenueCents, evidenceTier: org.revenueEvidenceTier, periodMonths: org.revenuePeriodMonths },
    optimizer: { proposed: count(proposals, "proposed"), active: count(proposals, "active"), total: proposals.length },
    autonomy: { activeGrants: grants.length },
    attention: { openEscalations: escalations.length, pendingApprovals: approvals.length, total: escalations.length + approvals.length },
    media: { total: media.length, byStatus },
  };
}
