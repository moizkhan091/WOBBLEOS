import { buildHandoffEnvelope, type HandoffEnvelope } from "@/lib/domain/handoff";
import type { ProviderUsageContext } from "@/lib/domain/provider-usage";
import { runTextProvider } from "@/lib/providers";
import { createInvoice, getRevenueSummary, type FinanceDeps } from "@/lib/finance";
import type { InvoiceRow, RevenueSummary } from "@/lib/domain/finance";
import { runDepartment, type DepartmentPolicy, type DepartmentRunResult, type RunDepartmentDeps } from "@/lib/departments/orchestrator";
import type { RiskLevel } from "@/lib/departments/verticals/sales-crm";

/**
 * Finance DEPARTMENT vertical (Phase 3, commercial chain). Consumes a WON deal (from Sales & CRM) and issues
 * the invoice for it, then produces revenue/margin intelligence for the founder.
 *
 * Division of labour (HARD RULE): the LLM NEVER creates or moves money. The DETERMINISTIC finance service
 * does the write — `createInvoice` mints a founder-approvable DRAFT invoice for the deal value (approve/
 * send/mark-paid stay founder actions). A finance-analyst AGENT adds real judgment — margin risk + overdue
 * risk — with a real input (the deal value + the live revenue picture) and a real downstream (it rides on
 * the product for founder review, and a HIGH risk raises a real escalation). The judgment is advisory only:
 * it never gates the invoice write, and a judgment failure degrades the advice without blocking the invoice.
 */

const FINANCE_MEMORY_SCOPES = ["company"];

export interface MarginAssessment {
  marginRisk: RiskLevel;
  overdueRisk: RiskLevel;
  notes: string[];
}

export interface RunFinanceDepartmentInput {
  /** The won deal to invoice (from Sales & CRM). */
  opportunityId?: string | null;
  companyId?: string | null;
  proposalId?: string | null;
  businessName: string;
  /** The invoice amount in cents — the won deal's value. */
  amountCents: number;
  /** Line-item description for the invoice (defaults to the engagement name). */
  description?: string;
  requestedBy: string;
  workflowId?: string;
}

export interface RunFinanceDepartmentDeps extends RunDepartmentDeps {
  /** The finance analyst's judgment step (real LLM by default; injectable/canned in proofs). */
  assessMargin?: (input: { amountCents: number; revenue: RevenueSummary; businessName: string; usageContext: ProviderUsageContext }) => Promise<MarginAssessment>;
  /** Deterministic finance service deps (store, recordAudit). */
  financeDeps?: FinanceDeps;
  /** Revenue rollup seam (defaults to the real getRevenueSummary; canned in DB-free proofs). */
  getRevenue?: (deps: FinanceDeps) => Promise<RevenueSummary>;
  /** An already-claimed inbound handoff envelope (from claimNextDepartmentHandoff) to consume. */
  inboundEnvelope?: HandoffEnvelope;
}

/** Default margin assessor: a real finance-analyst LLM call, attributed for actual budget settlement. */
async function defaultAssessMargin(input: { amountCents: number; revenue: RevenueSummary; businessName: string; usageContext: ProviderUsageContext }): Promise<MarginAssessment> {
  const r = await runTextProvider({
    role: "content_strategy",
    module: "finance",
    maxTokens: 600,
    messages: [
      { role: "system", content: "You are a finance analyst at WOBBLE. Assess the margin risk and overdue (non-payment) risk of a new invoice given the current revenue picture. Reply as JSON: {\"marginRisk\":\"low\"|\"medium\"|\"high\",\"overdueRisk\":\"low\"|\"medium\"|\"high\",\"notes\":string[]}." },
      { role: "user", content: `New invoice for ${input.businessName}: ${input.amountCents}¢. Current outstanding ${input.revenue.outstandingCents}¢, overdue ${input.revenue.overdueCents}¢, paid revenue ${input.revenue.paidRevenueCents}¢. Assess margin + overdue risk.` },
    ],
    usageContext: input.usageContext,
  });
  try {
    const j = JSON.parse(r.text.replace(/^```json\s*|\s*```$/g, "")) as MarginAssessment;
    const level = (v: unknown): RiskLevel => (v === "high" || v === "medium" || v === "low" ? v : "medium");
    return { marginRisk: level(j.marginRisk), overdueRisk: level(j.overdueRisk), notes: Array.isArray(j.notes) ? j.notes.map(String) : [] };
  } catch {
    return { marginRisk: "medium", overdueRisk: "medium", notes: [r.text.slice(0, 400)] };
  }
}

export interface FinanceProduct {
  /** The drafted invoice (null when the deal carried no invoiceable amount). */
  invoice: InvoiceRow | null;
  revenue: RevenueSummary;
  assessment: MarginAssessment | null;
}

/**
 * Run the Finance department: accept the won-deal handoff → the DETERMINISTIC finance service drafts the
 * invoice → the finance analyst assesses margin/overdue risk (advisory) → the invoice + revenue intelligence
 * is routed to the Founder Command Centre as a real durable handoff.
 */
export async function runFinanceDepartment(input: RunFinanceDepartmentInput, deps: RunFinanceDepartmentDeps = {}): Promise<DepartmentRunResult<FinanceProduct>> {
  const now = deps.now ?? new Date();
  const workflowId = input.workflowId ?? input.companyId ?? input.opportunityId ?? input.businessName;
  const assessMargin = deps.assessMargin ?? defaultAssessMargin;
  const financeDeps = deps.financeDeps ?? {};
  const getRevenue = deps.getRevenue ?? ((d: FinanceDeps) => getRevenueSummary(d));

  const envelope = deps.inboundEnvelope ?? buildHandoffEnvelope(
    {
      workflowId,
      department: "finance",
      sourceAgent: "sales_crm_orchestrator",
      destinationAgent: "finance_orchestrator",
      objective: `Invoice the won deal for ${input.businessName}`,
      requestedAction: "invoice",
      expectedOutputSchema: "won_deal",
      confidence: 0.85,
      // Finance operates on INTERNAL financial records (the seed permits internal + restricted, not
      // client_confidential); client isolation is still carried on companyId/clientWorkspaceId.
      companyId: input.companyId ?? null,
      clientWorkspaceId: input.companyId ?? null,
      dataClassification: "internal",
      authorizedMemoryScopes: FINANCE_MEMORY_SCOPES,
      idempotencyKey: `${workflowId}:finance:inbound`,
    },
    { now },
  );
  const receiverCtx = { clientWorkspaceId: input.companyId ?? null, grantedMemoryScopes: FINANCE_MEMORY_SCOPES };

  const policy: DepartmentPolicy<FinanceProduct> = async (api) => {
    // Confirm the department actually has an invoicing specialist (real membership, not a label).
    if (!api.selectSpecialists({ capability: "invoice" }).length) api.escalate("finance has no registered invoicing specialist");

    // DETERMINISTIC write (AUTHORITATIVE — the LLM never creates money). Draft the invoice for the deal
    // value. A non-invoiceable amount (≤ 0) is a real escalation, not a fabricated invoice.
    let invoice: InvoiceRow | null = null;
    if (input.amountCents > 0) {
      invoice = await createInvoice(
        {
          companyId: input.companyId ?? undefined,
          opportunityId: input.opportunityId ?? undefined,
          proposalId: input.proposalId ?? undefined,
          lineItems: [{ description: input.description ?? `${input.businessName} — engagement`, quantity: 1, unitPriceCents: Math.round(input.amountCents) }],
          createdBy: input.requestedBy,
        },
        financeDeps,
      );
    } else {
      api.escalate("finance received a won deal with no invoiceable amount (≤ 0)");
    }

    // Real downstream signal: the live revenue/margin picture the invoice lands into.
    const revenue = await getRevenue(financeDeps);

    // AGENT judgment (ADVISORY ONLY — never gates the invoice write). A judgment failure degrades the advice
    // without blocking the invoice.
    let assessment: MarginAssessment | null = null;
    try {
      assessment = await assessMargin({ amountCents: input.amountCents, revenue, businessName: input.businessName, usageContext: { departmentSlug: "finance", workflowId, taskId: api.envelope.taskId, companyId: input.companyId ?? null, clientWorkspaceId: input.companyId ?? null } });
    } catch (err) {
      api.escalate(`finance margin assessment unavailable (advisory): ${err instanceof Error ? err.message : "error"}`);
    }

    // A HIGH margin/overdue risk is a real signal for the founder — escalate it (advisory, POST-write).
    if (assessment && (assessment.marginRisk === "high" || assessment.overdueRisk === "high")) {
      api.escalate(`finance flags high risk on ${input.businessName} invoice (margin=${assessment.marginRisk}, overdue=${assessment.overdueRisk}): ${assessment.notes.join("; ")}`);
    }

    return {
      product: { invoice, revenue, assessment },
      productSchema: "revenue_margin_intelligence",
      outputs: {
        invoiceId: invoice?.id ?? null,
        invoiceNumber: invoice?.invoiceNumber ?? null,
        totalCents: invoice?.totalCents ?? 0,
        outstandingCents: revenue.outstandingCents,
        marginRisk: assessment?.marginRisk ?? "unknown",
        overdueRisk: assessment?.overdueRisk ?? "unknown",
      },
      telemetry: { qualityScore: undefined },
      confidence: 0.85,
      // Route to the department's DECLARED downstream consumer (Founder Command Centre).
    };
  };

  return runDepartment({ departmentSlug: "finance", inbound: { envelope, receiverCtx }, policy }, deps);
}
