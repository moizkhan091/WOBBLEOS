import { buildHandoffEnvelope, type HandoffEnvelope } from "@/lib/domain/handoff";
import { runTextProvider } from "@/lib/providers";
import { createProposalFromAudit, type ProposalDeps } from "@/lib/proposals";
import type { ProposalRow } from "@/lib/domain/proposal";
import { runDepartment, type DepartmentPolicy, type DepartmentRunResult, type RunDepartmentDeps } from "@/lib/departments/orchestrator";

/**
 * Proposal & Solution Design DEPARTMENT vertical (Phase 3). Consumes the Paid Audit department's product
 * (a business audit) and produces a client proposal. AGENTS do the judgment — a solution architect
 * synthesizes the technical solution, integration design, ROI assumptions and risks from the audit;
 * DETERMINISTIC services do the writes — `createProposalFromAudit` maps the audit report into the versioned
 * proposal artifact (services, timeline, scope, pricing) and, on founder ACCEPT, the existing commercial
 * chain fires (invoice draft + opportunity→won + delivery project). No decorative agent calls: the
 * synthesizer has a real input (the audit) and a real downstream (the enriched proposal).
 */

const PROPOSAL_MEMORY_SCOPES = ["company", "offer", "research"];

export interface SolutionSynthesis {
  technicalSolution: string;
  integrationDesign: string;
  roiAssumptions: string;
  risks: string[];
}

export interface RunProposalDepartmentInput {
  /** The audit this proposal is designed from (the Paid Audit department's product). */
  auditId: string;
  businessName: string;
  companyId?: string | null;
  requestedBy: string;
  workflowId?: string;
}

export interface RunProposalDepartmentDeps extends RunDepartmentDeps {
  /** The solution architect's judgment step (real LLM by default; injectable/canned in proofs). */
  synthesize?: (input: { auditId: string; businessName: string; usageContext: import("@/lib/domain/provider-usage").ProviderUsageContext }) => Promise<SolutionSynthesis>;
  /** Deterministic proposal service deps (store, getAuditRow, draftInvoice, advanceOpportunityToWon). */
  proposalDeps?: ProposalDeps;
  /** An already-claimed inbound handoff envelope (from claimNextDepartmentHandoff) to consume. */
  inboundEnvelope?: HandoffEnvelope;
}

/** Default synthesizer: a real solution-architect LLM call, attributed for actual budget settlement. */
async function defaultSynthesize(input: { auditId: string; businessName: string; usageContext: import("@/lib/domain/provider-usage").ProviderUsageContext }): Promise<SolutionSynthesis> {
  const r = await runTextProvider({
    role: "content_strategy",
    module: "proposals",
    maxTokens: 1200,
    messages: [
      { role: "system", content: "You are a senior AI solution architect at WOBBLE. Given a business audit, design the technical solution. Reply as JSON: {\"technicalSolution\":string,\"integrationDesign\":string,\"roiAssumptions\":string,\"risks\":string[]}." },
      { role: "user", content: `Design the solution for ${input.businessName} (audit ${input.auditId}). Ground it in the audit's opportunities; be specific about the systems, integrations, sequencing, ROI assumptions and delivery risks.` },
    ],
    usageContext: input.usageContext,
  });
  try {
    const j = JSON.parse(r.text.replace(/^```json\s*|\s*```$/g, "")) as SolutionSynthesis;
    return { technicalSolution: String(j.technicalSolution ?? ""), integrationDesign: String(j.integrationDesign ?? ""), roiAssumptions: String(j.roiAssumptions ?? ""), risks: Array.isArray(j.risks) ? j.risks.map(String) : [] };
  } catch {
    return { technicalSolution: r.text.slice(0, 2000), integrationDesign: "", roiAssumptions: "", risks: [] };
  }
}

export interface ProposalProduct {
  proposal: ProposalRow;
  synthesis: SolutionSynthesis;
}

/**
 * Run the Proposal department: accept the audit handoff → the solution architect synthesizes the design →
 * the deterministic service creates the versioned proposal artifact (enriched with the synthesis) → the
 * product awaits founder approval (on accept, the commercial chain fires downstream).
 */
export async function runProposalDepartment(input: RunProposalDepartmentInput, deps: RunProposalDepartmentDeps = {}): Promise<DepartmentRunResult<ProposalProduct>> {
  const now = deps.now ?? new Date();
  const workflowId = input.workflowId ?? input.companyId ?? input.auditId;
  const synthesize = deps.synthesize ?? defaultSynthesize;

  const envelope = deps.inboundEnvelope ?? buildHandoffEnvelope(
    {
      workflowId,
      department: "proposal",
      sourceAgent: "paid_audit_orchestrator",
      destinationAgent: "proposal_orchestrator",
      objective: `Design a proposal for ${input.businessName}`,
      requestedAction: "design_solution",
      expectedOutputSchema: "business_audit",
      confidence: 0.75,
      companyId: input.companyId ?? null,
      clientWorkspaceId: input.companyId ?? null,
      dataClassification: input.companyId ? "client_confidential" : "internal",
      authorizedMemoryScopes: PROPOSAL_MEMORY_SCOPES,
      idempotencyKey: `${workflowId}:proposal:inbound`,
    },
    { now },
  );
  const receiverCtx = { clientWorkspaceId: input.companyId ?? null, grantedMemoryScopes: PROPOSAL_MEMORY_SCOPES };

  const policy: DepartmentPolicy<ProposalProduct> = async (api) => {
    // Confirm the department has its solution architect (real membership, not a label).
    if (!api.selectSpecialists({ capability: "solution_design" }).length) api.escalate("proposal has no registered solution architect");

    // AGENT judgment: synthesize the technical solution + risks from the audit.
    const synthesis = await synthesize({ auditId: input.auditId, businessName: input.businessName, usageContext: { departmentSlug: "proposal", workflowId, taskId: api.envelope.taskId, companyId: input.companyId ?? null, clientWorkspaceId: input.companyId ?? null } });

    // DETERMINISTIC write: map the audit → the versioned proposal artifact (services, timeline, scope,
    // pricing). The architect's synthesis is PERSISTED onto the artifact (metadata.solutionDesign + it
    // enriches the visible scope) so the paid judgment is never discarded — it survives for founder review.
    const proposal = await createProposalFromAudit(input.auditId, { createdBy: input.requestedBy, enrichment: synthesis }, deps.proposalDeps);
    if (!proposal) throw new Error(`proposal: audit '${input.auditId}' not found`);

    return {
      product: { proposal, synthesis },
      productSchema: "proposal_artifact",
      outputs: { proposalId: proposal.id, pricingCents: proposal.pricingCents },
      confidence: 0.8,
      // The proposal awaits founder approval; on ACCEPT the deterministic commercial chain fires
      // (invoice + opportunity→won + delivery project) — no durable route needed here.
      routeTo: [],
    };
  };

  return runDepartment({ departmentSlug: "proposal", inbound: { envelope, receiverCtx }, policy }, deps);
}
