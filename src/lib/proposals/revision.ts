import type { AuditEventInput } from "@/lib/domain/audit";
import { getProposal, createProposalFromAudit, type ProposalDeps } from "@/lib/proposals";
import type { ProposalRow } from "@/lib/domain/proposal";
import type { SolutionSynthesis } from "@/lib/departments/verticals/proposal";
import { openRevisionCycle, getRevisionCycle, markRevisionReran, type RevisionDeps } from "@/lib/selective-revision";

/**
 * PROPOSAL selective revision. A proposal is a 2-component artifact: `solution_design` (the solution architect's
 * LLM synthesis, persisted under proposal.metadata.solutionDesign) → `assemble` (the DETERMINISTIC map of the
 * audit → the versioned proposal). `assemble` depends on `solution_design`. When only `assemble` fails QA, the
 * rerun REUSES the passed synthesis (no LLM re-pay) and re-runs the deterministic assemble into a NEW proposal
 * version; when `solution_design` fails, both rerun. The old proposal is retained (founder comparison), and the
 * cycle can be rolled back.
 */

const PROPOSAL_COMPONENTS = [
  { key: "solution_design", producedBy: "proposal_solution_architect", dependsOn: [] as string[] },
  { key: "assemble", producedBy: "proposal_orchestrator", dependsOn: ["solution_design"] },
];

/** TRIGGER: on a proposal QA `revise`, open a durable revision cycle over the proposal's 2 components. Idempotent
 *  per (workflow + audit + failed-stage set) so a duplicated/reclaimed handoff RETRY — which re-runs the department
 *  and mints a fresh proposal id each time — reuses the ONE open cycle for this revision round (see the dedupeKey). */
export async function openProposalRevision(
  input: { proposalId: string; auditId: string; failedStages: string[]; companyId: string | null; requestedBy: string; workflowId: string },
  deps: RevisionDeps = {},
): Promise<void> {
  const failed = input.failedStages.filter((s) => PROPOSAL_COMPONENTS.some((c) => c.key === s));
  if (failed.length === 0) return;
  // Stable across retries: the proposalId changes each retry, so key on the workflow + source audit + failed set.
  const dedupeKey = `proposal:${input.workflowId}:${input.auditId}:${[...failed].sort().join(",")}`.slice(0, 200);
  await openRevisionCycle({
    artifactKind: "proposal", artifactRef: input.proposalId, graphRunId: null, triggeredBy: "qa_gate:proposal", dedupeKey,
    components: PROPOSAL_COMPONENTS.map((c) => ({ key: c.key, kind: "proposal_section", producedBy: c.producedBy, dependsOn: c.dependsOn, version: 1, status: failed.includes(c.key) ? "failed" : "approved" })),
    failedComponents: failed, clientId: input.companyId,
    reenqueue: { producer: "proposal", proposalId: input.proposalId, auditId: input.auditId, companyId: input.companyId, requestedBy: input.requestedBy },
  }, deps);
}

export interface ProposalRevisionDeps extends RevisionDeps {
  proposalDeps?: ProposalDeps;
  /** Re-synthesize the solution design when it must rerun (default: throws unless a synthesizer is supplied — the
   *  API supplies the real/deterministic architect; the assemble-only path never needs it). */
  synthesize?: (input: { auditId: string; businessName: string }) => Promise<SolutionSynthesis>;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
}

/**
 * CONSUMER: re-run the proposal for its reran components, PRESERVING the passed synthesis when only `assemble`
 * reran (reuse the expensive solution-design). Produces a NEW proposal (the old is retained). Returns the new
 * proposal id + whether the synthesis was reused.
 */
export async function rerunProposalRevision(cycleId: string, deps: ProposalRevisionDeps = {}): Promise<{ newProposalId: string; reusedSynthesis: boolean } | null> {
  const cycle = await getRevisionCycle(cycleId, deps);
  if (!cycle || cycle.status !== "planned") return null;
  const re = (cycle.reenqueue ?? {}) as { producer?: string; proposalId?: string; auditId?: string; requestedBy?: string };
  if (re.producer !== "proposal" || !re.proposalId || !re.auditId) return null;

  const old: ProposalRow | null = await getProposal(re.proposalId, deps.proposalDeps);
  if (!old) return null;

  // solution_design is preserved iff it is NOT in the rerun set → reuse the persisted synthesis (no LLM re-pay).
  const solutionPreserved = !cycle.plan.rerun.includes("solution_design");
  let synthesis = (old.metadata as { solutionDesign?: SolutionSynthesis } | undefined)?.solutionDesign;
  if (!solutionPreserved) {
    if (!deps.synthesize) throw new Error("solution_design must rerun but no synthesizer was supplied");
    synthesis = await deps.synthesize({ auditId: re.auditId, businessName: old.title });
  }

  const created = await createProposalFromAudit(re.auditId, { createdBy: re.requestedBy ?? "system", enrichment: synthesis }, deps.proposalDeps);
  if (!created) return null;

  await markRevisionReran(cycleId, deps);
  await (deps.recordAudit ?? (async () => {}))({ eventType: "proposal.revision_reran", module: "proposals", entityType: "proposal", entityId: created.id, actor: re.requestedBy ?? "system", metadata: { cycleId, fromProposalId: re.proposalId, reusedSynthesis: solutionPreserved } });
  return { newProposalId: created.id, reusedSynthesis: solutionPreserved };
}
