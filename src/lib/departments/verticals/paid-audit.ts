import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import { runPaidAuditGraph, type RunPaidAuditInput, type PaidAuditResult, type PaidAuditDeps } from "@/lib/paid-audit-graph";
import { runDepartment, type DepartmentPolicy, type DepartmentRunResult, type RunDepartmentDeps } from "@/lib/departments/orchestrator";

/**
 * Paid Audit DEPARTMENT vertical (Phase 3, Batch 5). Wires the existing paid-audit multi-agent graph
 * (which already drives each of its 5 specialists through a claimed handoff — the Phase-2 execution
 * backbone) as the Paid Audit department's POLICY. The shared orchestrator then accepts the inbound
 * department handoff, confirms the specialist team from the registry, runs the graph, and ROUTES the
 * finished business audit downstream to the Proposal department as a real handoff — the first proven
 * end-to-end department vertical.
 */

const AUDIT_MEMORY_SCOPES = ["company", "research", "offer", "brand"];

export interface RunPaidAuditDepartmentDeps extends RunDepartmentDeps {
  /** Deps for the underlying paid-audit graph (runNode, checkpointStore, persistAudit, retrieveBrain…). */
  graph?: PaidAuditDeps;
}

/**
 * Run the Paid Audit department end-to-end: trigger → accept a validated department handoff → run the
 * 5-specialist graph through the handoff runtime → aggregate the audit → route it to Proposal.
 */
export async function runPaidAuditDepartment(
  input: RunPaidAuditInput,
  deps: RunPaidAuditDepartmentDeps = {},
): Promise<DepartmentRunResult<PaidAuditResult>> {
  const now = deps.now ?? new Date();
  const workflowId = input.graphRunId ?? input.companyId ?? input.businessName;

  // The trigger's inbound department handoff (founder/upstream → the Paid Audit orchestrator).
  const envelope = buildHandoffEnvelope(
    {
      workflowId,
      department: "paid_audit",
      sourceAgent: input.requestedBy || "founder",
      destinationAgent: "paid_audit_orchestrator",
      objective: `Run a paid audit for ${input.businessName}`,
      requestedAction: "run_paid_audit",
      expectedOutputSchema: "current_state_map",
      confidence: 0.7,
      companyId: input.companyId ?? null,
      clientWorkspaceId: input.companyId ?? null,
      dataClassification: input.companyId ? "client_confidential" : "internal",
      authorizedMemoryScopes: AUDIT_MEMORY_SCOPES,
      idempotencyKey: `${workflowId}:paid_audit:inbound`,
    },
    { now },
  );
  const receiverCtx = { clientWorkspaceId: input.companyId ?? null, grantedMemoryScopes: AUDIT_MEMORY_SCOPES };

  const policy: DepartmentPolicy<PaidAuditResult> = async (api) => {
    // Confirm the department actually has its discovery specialist registered (real membership, not a
    // label). If the team is missing, escalate rather than silently running degraded.
    if (!api.selectSpecialists({ capability: "discovery" }).length) api.escalate("paid_audit has no registered discovery specialist");

    // Run the graph — it dispatches a CLAIMED handoff per node through the same runtime + store. Every
    // node's provider usage is attributed to THIS unit of work (workflow + the inbound task) so the
    // department budget settles against ACTUAL recorded usage.
    const result = await runPaidAuditGraph(
      { ...input, graphRunId: workflowId },
      {
        ...deps.graph,
        handoffStore: deps.handoffStore ?? deps.graph?.handoffStore,
        recordAudit: deps.graph?.recordAudit,
        usageContext: { departmentSlug: "paid_audit", workflowId, taskId: api.envelope.taskId, companyId: input.companyId ?? null, clientWorkspaceId: input.companyId ?? null },
        now,
      },
    );

    return {
      product: result,
      productSchema: "business_audit",
      outputs: { auditId: result.auditId, opportunities: result.report.opportunities.length, phases: result.report.roadmap.length },
      telemetry: { latencyMs: undefined, qualityScore: undefined },
      confidence: 0.8,
      routeTo: ["proposal"],
    };
  };

  return runDepartment({ departmentSlug: "paid_audit", inbound: { envelope, receiverCtx }, policy }, deps);
}
