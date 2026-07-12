import { buildHandoffEnvelope, type HandoffEnvelope } from "@/lib/domain/handoff";
import type { ProviderUsageContext } from "@/lib/domain/provider-usage";
import { runTextProvider } from "@/lib/providers";
import { getOpportunity, moveOpportunityStage, type CrmDeps } from "@/lib/crm";
import type { OpportunityRow } from "@/lib/domain/crm";
import { runDepartment, type DepartmentPolicy, type DepartmentRunResult, type RunDepartmentDeps } from "@/lib/departments/orchestrator";

/**
 * Sales & CRM DEPARTMENT vertical (Phase 3, commercial chain). Consumes the Proposal department's product
 * (a `proposal_artifact`, produced when a founder ACCEPTS a proposal) and turns the accepted deal into a
 * WON opportunity that the rest of the commercial chain (Delivery + Finance) rides on.
 *
 * Division of labour (HARD RULE): the LLM NEVER performs the state mutation. A revenue-operator AGENT adds
 * real judgment — loss/execution risk + the single next-best-action — with a real input (the live deal
 * context) and a real downstream (it rides on the `won_deal` product for founder review, and a HIGH loss
 * risk raises a real escalation). The DETERMINISTIC crm service does the write: `moveOpportunityStage(…,
 * "won")`. The judgment is advisory only — it never gates the mutation, and a judgment failure degrades the
 * advice without blocking a deal the founder already accepted.
 *
 * Project creation is Delivery's job, so this vertical SUPPRESSES the crm won→delivery auto-hook by default
 * (Delivery is the single authoritative project creator downstream) — no duplicate projects.
 */

const SALES_CRM_MEMORY_SCOPES = ["company", "offer"];

export type RiskLevel = "low" | "medium" | "high";

export interface DealRiskAssessment {
  /** Likelihood the won deal slips / churns before value is delivered. */
  lossRisk: RiskLevel;
  riskFactors: string[];
  /** The single most valuable next action to protect the deal. */
  nextBestAction: string;
  rationale: string;
}

export interface RunSalesCrmDepartmentInput {
  /** The CRM opportunity the accepted proposal is linked to (the deal to advance to won). */
  opportunityId: string;
  /** The accepted proposal that produced this deal (carried for provenance + downstream invoicing). */
  proposalId?: string | null;
  businessName: string;
  companyId?: string | null;
  requestedBy: string;
  workflowId?: string;
}

export interface RunSalesCrmDepartmentDeps extends RunDepartmentDeps {
  /** The revenue operator's judgment step (real LLM by default; injectable/canned in proofs). */
  assessDeal?: (input: { opportunity: OpportunityRow; proposalId: string | null; businessName: string; usageContext: ProviderUsageContext }) => Promise<DealRiskAssessment>;
  /** Deterministic CRM service deps (store, recordAudit, onOpportunityWon override). */
  crmDeps?: CrmDeps;
  /** An already-claimed inbound handoff envelope (from claimNextDepartmentHandoff) to consume. */
  inboundEnvelope?: HandoffEnvelope;
}

/** Default deal-risk assessor: a real revenue-operator LLM call, attributed for actual budget settlement. */
async function defaultAssessDeal(input: { opportunity: OpportunityRow; proposalId: string | null; businessName: string; usageContext: ProviderUsageContext }): Promise<DealRiskAssessment> {
  const o = input.opportunity;
  const r = await runTextProvider({
    role: "content_strategy",
    module: "crm",
    maxTokens: 700,
    messages: [
      { role: "system", content: "You are a senior revenue operator at WOBBLE. Assess a just-won deal's loss/execution risk and the single next-best-action to protect it. Reply as JSON: {\"lossRisk\":\"low\"|\"medium\"|\"high\",\"riskFactors\":string[],\"nextBestAction\":string,\"rationale\":string}." },
      { role: "user", content: `Won deal for ${input.businessName}: value ${o.valueCents}¢, services ${(o.serviceInterest ?? []).join(", ") || "unspecified"}, pain points ${o.painPoints ?? "n/a"}. Assess loss risk and the next best action.` },
    ],
    usageContext: input.usageContext,
  });
  try {
    const j = JSON.parse(r.text.replace(/^```json\s*|\s*```$/g, "")) as DealRiskAssessment;
    const level = (v: unknown): RiskLevel => (v === "high" || v === "medium" || v === "low" ? v : "medium");
    return { lossRisk: level(j.lossRisk), riskFactors: Array.isArray(j.riskFactors) ? j.riskFactors.map(String) : [], nextBestAction: String(j.nextBestAction ?? ""), rationale: String(j.rationale ?? "") };
  } catch {
    return { lossRisk: "medium", riskFactors: [], nextBestAction: r.text.slice(0, 500), rationale: "" };
  }
}

export interface WonDealProduct {
  opportunity: OpportunityRow;
  /** The revenue operator's advisory assessment (null when the judgment step was unavailable). */
  assessment: DealRiskAssessment | null;
}

/**
 * Run the Sales & CRM department: accept the accepted-proposal handoff → the revenue operator assesses the
 * deal (advisory) → the DETERMINISTIC crm service advances the opportunity to WON → the won deal is routed
 * to the declared downstream departments (Delivery + Finance) as real durable handoffs.
 */
export async function runSalesCrmDepartment(input: RunSalesCrmDepartmentInput, deps: RunSalesCrmDepartmentDeps = {}): Promise<DepartmentRunResult<WonDealProduct>> {
  const now = deps.now ?? new Date();
  const workflowId = input.workflowId ?? input.companyId ?? input.opportunityId;
  const assessDeal = deps.assessDeal ?? defaultAssessDeal;
  const crmDeps = deps.crmDeps ?? {};

  const envelope = deps.inboundEnvelope ?? buildHandoffEnvelope(
    {
      workflowId,
      department: "sales_crm",
      sourceAgent: "proposal_orchestrator",
      destinationAgent: "sales_crm_orchestrator",
      objective: `Advance the accepted deal for ${input.businessName}`,
      requestedAction: "advance_deal",
      expectedOutputSchema: "proposal_artifact",
      confidence: 0.8,
      companyId: input.companyId ?? null,
      clientWorkspaceId: input.companyId ?? null,
      dataClassification: input.companyId ? "client_confidential" : "internal",
      authorizedMemoryScopes: SALES_CRM_MEMORY_SCOPES,
      idempotencyKey: `${workflowId}:sales_crm:inbound`,
    },
    { now },
  );
  const receiverCtx = { clientWorkspaceId: input.companyId ?? null, grantedMemoryScopes: SALES_CRM_MEMORY_SCOPES };

  const policy: DepartmentPolicy<WonDealProduct> = async (api) => {
    // Confirm the department actually has a deal specialist (real membership, not a label).
    if (!api.selectSpecialists({ capability: "advance_deal" }).length && !api.selectSpecialists({ capability: "qualify" }).length) {
      api.escalate("sales_crm has no registered deal specialist");
    }

    // Validate the real inbound: the deal it references must exist. A missing deal is a hard failure, not a
    // silent no-op (we will not fabricate a won deal from nothing).
    const opp = await getOpportunity(input.opportunityId, crmDeps);
    if (!opp) throw new Error(`sales_crm: opportunity '${input.opportunityId}' not found`);

    // AGENT judgment (ADVISORY ONLY — never gates the mutation). A judgment failure degrades the advice; it
    // does NOT block advancing a deal the founder has already accepted.
    let assessment: DealRiskAssessment | null = null;
    try {
      assessment = await assessDeal({ opportunity: opp, proposalId: input.proposalId ?? opp.proposalId ?? null, businessName: input.businessName, usageContext: { departmentSlug: "sales_crm", workflowId, taskId: api.envelope.taskId, companyId: input.companyId ?? null, clientWorkspaceId: input.companyId ?? null } });
    } catch (err) {
      api.escalate(`sales_crm deal-risk assessment unavailable (advisory): ${err instanceof Error ? err.message : "error"}`);
    }

    // DETERMINISTIC state mutation (AUTHORITATIVE — the LLM never touches this). Advance the deal to won.
    // Idempotent (moveOpportunityStage no-ops if already won). The crm won→delivery auto-hook is suppressed
    // by default because Delivery is the single authoritative project creator downstream; a caller can
    // re-enable it by passing crmDeps.onOpportunityWon.
    const won = await moveOpportunityStage(
      input.opportunityId,
      "won",
      { actor: input.requestedBy, reason: "proposal accepted — advanced by Sales & CRM" },
      { ...crmDeps, onOpportunityWon: crmDeps.onOpportunityWon ?? (async () => {}) },
    );
    if (!won) throw new Error(`sales_crm: could not advance opportunity '${input.opportunityId}' to won`);

    // A HIGH loss risk on a won deal is a real signal for the founder — escalate it (advisory, POST-mutation
    // so the escalation never affects whether the deal advanced).
    if (assessment?.lossRisk === "high") api.escalate(`sales_crm flags high loss-risk on won deal ${won.name}: ${assessment.riskFactors.join("; ") || assessment.rationale}`);

    return {
      product: { opportunity: won, assessment },
      productSchema: "won_deal",
      outputs: {
        opportunityId: won.id,
        businessName: input.businessName,
        companyId: won.companyId,
        valueCents: won.valueCents,
        proposalId: input.proposalId ?? won.proposalId ?? null,
        assignedOwner: won.assignedOwner,
        serviceInterest: won.serviceInterest,
        lossRisk: assessment?.lossRisk ?? "unknown",
        nextBestAction: assessment?.nextBestAction ?? null,
      },
      confidence: 0.85,
      // Route to the department's DECLARED downstream consumers (Delivery + Finance) — the seed is the
      // single source of truth for the topology.
    };
  };

  return runDepartment({ departmentSlug: "sales_crm", inbound: { envelope, receiverCtx }, policy }, deps);
}
