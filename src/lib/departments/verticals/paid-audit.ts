import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import { dispatchHandoff, defaultStore as defaultHandoffStore, type HandoffStore } from "@/lib/handoff";
import type { AuditEventInput } from "@/lib/domain/audit";
import { runPaidAuditGraph, type RunPaidAuditInput, type PaidAuditResult, type PaidAuditDeps } from "@/lib/paid-audit-graph";
import { runDepartment, type DepartmentPolicy, type DepartmentRunResult, type RunDepartmentDeps } from "@/lib/departments/orchestrator";
import { runQaGate, type QaGateDeps, type QaGateDecision } from "@/lib/qa/gate";
import { paidAuditQaBoard, buildPaidAuditSubmission } from "@/lib/qa/boards";

/**
 * OPT-IN QA gate for the paid-audit → proposal origination. When provided, the independent Paid Audit QA
 * board reviews the FULL audit product before the business_audit handoff is emitted; the handoff is
 * dispatched ONLY on a PASS. A revise/fail/blocked verdict blocks the emission and (via the gate) raises a
 * real founder-visible escalation naming the exact failed stage. Absent this config the behaviour is
 * unchanged (existing unit tests + DB proofs are unaffected) — the gate is default-enabled in production by
 * the caller supplying it, off in tests by omitting it.
 */
export interface AuditProposalQaGate {
  /** The full audit product to review (the board needs the report, not just the auditId). */
  result: PaidAuditResult;
  /** Authoring identity (default `paid_audit_orchestrator`). Must never equal the reviewer identity. */
  authorAgentSlug?: string;
  /** Injectable gate deps (qa store, escalation store, hooks) — DB-backed by default in production. */
  deps?: QaGateDeps;
  /** Explicit off switch (default on when this config is present). */
  enabled?: boolean;
}

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
      // Carry enough on the routed handoff for the downstream Proposal consumer to reconstruct its input
      // (auditId + businessName + companyId) without re-reading the audit — the autonomous consumer loop
      // claims this handoff and runs the Proposal department off these outputs.
      outputs: { auditId: result.auditId, businessName: input.businessName, companyId: input.companyId ?? null, opportunities: result.report.opportunities.length, phases: result.report.roadmap.length },
      telemetry: { latencyMs: undefined, qualityScore: undefined },
      confidence: 0.8,
      routeTo: ["proposal"],
    };
  };

  return runDepartment({ departmentSlug: "paid_audit", inbound: { envelope, receiverCtx }, policy }, deps);
}

/** The Proposal department's authorized memory grant (routing narrows to this — never widens). */
const PROPOSAL_GRANT = ["company", "offer", "research"];

/**
 * ORIGINATE the department chain from a completed production paid audit: dispatch a `business_audit`
 * handoff to the Proposal department so the autonomous consumer loop claims it and produces a proposal
 * draft (with the solution architect's synthesis). Best-effort + non-regressive: a failure here (e.g. the
 * departments aren't seeded, or no DB) is logged by the caller and never fails the audit itself.
 */
export async function dispatchBusinessAuditToProposal(
  audit: { auditId: string; businessName: string; companyId?: string | null },
  opts: { store?: HandoffStore; recordAudit?: (i: AuditEventInput) => Promise<void>; now?: Date; qa?: AuditProposalQaGate } = {},
): Promise<{ handoffId: string; deduped: boolean; blocked?: boolean; qa?: QaGateDecision<PaidAuditResult> }> {
  const now = opts.now ?? new Date();
  const store = opts.store ?? defaultHandoffStore();
  const workflowId = audit.companyId ?? audit.auditId;
  let qaDecision: QaGateDecision<PaidAuditResult> | undefined;

  // QA GATE (opt-in): an INDEPENDENT board reviews the finished audit BEFORE the downstream handoff is
  // emitted. Only a PASS releases the emission; a non-pass blocks it and the gate raises a real escalation
  // with the exact failed stage. `handoffId: ""` signals "not emitted" alongside `blocked` + the decision.
  if (opts.qa && opts.qa.enabled !== false) {
    const submission = buildPaidAuditSubmission(opts.qa.result, {
      workflowId,
      taskId: `${workflowId}:paid_audit->proposal`,
      clientWorkspaceId: audit.companyId ?? null,
      authorAgentSlug: opts.qa.authorAgentSlug,
    });
    qaDecision = await runQaGate({ boards: [paidAuditQaBoard], submission }, { now, recordAudit: opts.recordAudit, ...opts.qa.deps });
    if (!qaDecision.released) return { handoffId: "", deduped: false, blocked: true, qa: qaDecision };
  }

  const envelope = buildHandoffEnvelope(
    {
      workflowId,
      department: "proposal",
      sourceAgent: "paid_audit_orchestrator",
      destinationAgent: "proposal_orchestrator",
      objective: `Design a proposal for ${audit.businessName}`,
      requestedAction: "design_solution",
      expectedOutputSchema: "business_audit",
      confidence: 0.8,
      companyId: audit.companyId ?? null,
      clientWorkspaceId: audit.companyId ?? null,
      dataClassification: audit.companyId ? "client_confidential" : "internal",
      authorizedMemoryScopes: PROPOSAL_GRANT,
      previousAgentOutputs: { auditId: audit.auditId, businessName: audit.businessName, companyId: audit.companyId ?? null },
      idempotencyKey: `${workflowId}:paid_audit->proposal`,
    },
    { now },
  );
  const { handoff, deduped } = await dispatchHandoff(
    envelope,
    { clientWorkspaceId: audit.companyId ?? null, grantedMemoryScopes: PROPOSAL_GRANT, permittedDataClassifications: ["internal", "client_confidential"] },
    { store, recordAudit: opts.recordAudit, now },
  );
  return { handoffId: handoff.id, deduped, qa: qaDecision };
}
