import { getProposal } from "@/lib/proposals";
import { defaultSynthesize, type SolutionSynthesis } from "@/lib/departments/verticals/proposal";
import { openRevisionCycle, getRevisionCycle, type RevisionDeps } from "@/lib/selective-revision";
import { rerunProposalRevision, type ProposalRevisionDeps } from "@/lib/proposals/revision";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  FOUNDER_REVISION_MODULE,
  classifyRevision,
  componentsForInstruction,
  describeRevision,
  revisionInstructionPrompt,
  type RevisionRequest,
} from "@/lib/domain/founder-revision";

/**
 * "Change this proposal" as a first-class operation.
 *
 * Opens a real revision cycle from a founder's words instead of a QA failure, then drives the existing
 * rerun. Everything the engine already guarantees still holds: the previous proposal is retained, the
 * cycle is versioned and snapshotted, and it can be rolled back.
 */

export interface FounderRevisionResult {
  cycleId: string;
  newProposalId: string;
  fromProposalId: string;
  scope: "presentation" | "substance";
  rerun: string[];
  preserved: string[];
  reusedSynthesis: boolean;
  summary: string;
}

export interface FounderRevisionDeps extends ProposalRevisionDeps {
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  /** Injectable clock only used for the dedupe key, so a test can force a collision. */
  roundKey?: string;
}

/**
 * Revise a proposal from an instruction.
 *
 * The instruction is stored on the cycle AND threaded into the synthesizer, so the re-thought design is
 * an amendment of the previous one rather than a fresh draft that quietly loses what the founder liked.
 */
export async function reviseProposalFromInstruction(
  proposalId: string,
  request: RevisionRequest,
  actor: string,
  deps: FounderRevisionDeps = {},
): Promise<FounderRevisionResult> {
  const proposal = await getProposal(proposalId, deps.proposalDeps);
  if (!proposal) throw new Error(`proposal '${proposalId}' not found`);
  const auditId = (proposal as { auditId?: string | null }).auditId ?? null;
  if (!auditId) throw new Error("this proposal was not built from an audit, so it cannot be re-assembled");

  const scope = request.scope === "auto" ? classifyRevision(request.instruction) : request.scope;
  const roots = componentsForInstruction(request.instruction, request.scope);
  const previousDesign = (proposal.metadata as { solutionDesign?: SolutionSynthesis } | undefined)?.solutionDesign ?? null;

  // A distinct key per ROUND: two different instructions on the same proposal are two revisions, but a
  // double-click of the same one is not.
  const roundKey = deps.roundKey ?? `${proposalId}:${request.instruction.trim().toLowerCase().slice(0, 120)}`;

  const cycle = await openRevisionCycle(
    {
      artifactKind: "proposal",
      artifactRef: proposalId,
      graphRunId: null,
      triggeredBy: "founder_request",
      dedupeKey: `founder:${roundKey}`.slice(0, 200),
      components: [
        { key: "solution_design", kind: "proposal_section", producedBy: "proposal_solution_architect", dependsOn: [], version: 1, status: roots.includes("solution_design") ? "failed" : "approved" },
        { key: "assemble", kind: "proposal_section", producedBy: "proposal_orchestrator", dependsOn: ["solution_design"], version: 1, status: roots.includes("assemble") ? "failed" : "approved" },
      ],
      failedComponents: roots,
      clientId: proposal.companyId ?? null,
      createdBy: actor,
      reenqueue: {
        producer: "proposal",
        proposalId,
        auditId,
        companyId: proposal.companyId ?? null,
        requestedBy: actor,
        // Carried so the rerun, and anyone auditing it later, knows WHY this version exists.
        founderInstruction: request.instruction,
        scope,
      },
    },
    deps as RevisionDeps,
  );

  const out = await rerunProposalRevision(cycle.id, {
    ...deps,
    // The architect is handed the instruction plus the previous design, so it amends rather than restarts.
    synthesize: async ({ auditId: aId, businessName }) =>
      (deps.synthesize ?? defaultSynthesize)({
        auditId: aId,
        businessName,
        trustedContext: revisionInstructionPrompt({ instruction: request.instruction, businessName, previousDesign }),
      }),
  });
  if (!out) throw new Error("the revision cycle opened but could not be rerun");

  const fresh = await getRevisionCycle(cycle.id, deps as RevisionDeps);
  const rerun = fresh?.plan.rerun ?? roots;
  const preserved = fresh?.plan.preserved ?? [];
  const summary = describeRevision({ instruction: request.instruction, scope, rerun, preserved });

  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))({
    eventType: "proposal.revised_by_founder",
    module: FOUNDER_REVISION_MODULE,
    entityType: "proposal",
    entityId: out.newProposalId,
    actor,
    metadata: { cycleId: cycle.id, fromProposalId: proposalId, instruction: request.instruction, scope, rerun, preserved, reusedSynthesis: out.reusedSynthesis },
  });

  return {
    cycleId: cycle.id,
    newProposalId: out.newProposalId,
    fromProposalId: proposalId,
    scope,
    rerun,
    preserved,
    reusedSynthesis: out.reusedSynthesis,
    summary,
  };
}
