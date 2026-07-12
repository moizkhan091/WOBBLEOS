import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import { runContentGraph, type RunContentGraphInput, type ContentGraphResult, type ContentGraphDeps } from "@/lib/content-graph";
import { runDepartment, type DepartmentPolicy, type DepartmentRunResult, type RunDepartmentDeps } from "@/lib/departments/orchestrator";
import { runQaGate, type QaGateDeps } from "@/lib/qa/gate";
import { contentQualityBoard, contentBrandBoard, buildContentSubmission } from "@/lib/qa/boards";

/**
 * OPT-IN QA gate for the content → publishing emission. When provided, TWO independent boards
 * (content_quality_review + content_brand_review) review the finished content pack; the pack is routed to
 * Publishing ONLY when BOTH pass. A non-pass verdict blocks the route to Publishing and (via the gate)
 * raises a real founder-visible escalation naming the exact failed stage. Absent this config the behaviour
 * is unchanged — the gate is opt-in (production supplies it; unit tests omit it).
 */
export interface ContentQaGate {
  /** Injectable gate deps (qa store, escalation store, hooks). */
  deps?: QaGateDeps;
  /** Authoring identity (default `content_orchestrator`). Must never equal a reviewer identity. */
  authorAgentSlug?: string;
  /** Explicit off switch (default on when this config is present). */
  enabled?: boolean;
}

/**
 * Content DEPARTMENT vertical (Phase 3). Wires the existing content multi-agent graph (Strategy →
 * Research → Copywriting[draft→self-revise] → Scoring/QA gate — each node already driven through a claimed
 * handoff, the Phase-2 execution backbone) as the Content department's POLICY. The shared orchestrator
 * accepts the inbound department handoff, confirms the specialist team from the registry, runs the graph,
 * and ROUTES the finished, QA-gated content pack downstream to the Publishing department as a real durable
 * handoff. The pack is founder-approvable (the graph opens the approval); Publishing consumes on approval.
 */

const CONTENT_MEMORY_SCOPES = ["content", "brand", "research", "founder_taste"];

export interface RunContentDepartmentInput extends RunContentGraphInput {
  /** Optional owning company/workspace (client content). Null → internal WOBBLE content. */
  companyId?: string | null;
}

export interface RunContentDepartmentDeps extends RunDepartmentDeps {
  /** Deps for the underlying content graph (getTrack, runNode, retrieve, createPacket, checkpointStore…). */
  graph?: ContentGraphDeps;
  /** OPT-IN independent QA gate over the finished content pack (see ContentQaGate). Omitted → gate off. */
  qa?: ContentQaGate;
}

/**
 * Run the Content department end-to-end: trigger → accept a validated department handoff → run the content
 * graph through the handoff runtime → produce ONE grounded, scored, QA-gated content pack → route it to
 * Publishing.
 */
export async function runContentDepartment(
  input: RunContentDepartmentInput,
  deps: RunContentDepartmentDeps = {},
): Promise<DepartmentRunResult<ContentGraphResult>> {
  const now = deps.now ?? new Date();
  const workflowId = input.graphRunId ?? input.contentTrackId;

  // The trigger's inbound department handoff (founder/upstream → the Content orchestrator).
  const envelope = buildHandoffEnvelope(
    {
      workflowId,
      department: "content",
      sourceAgent: input.requestedBy || "founder",
      destinationAgent: "content_orchestrator",
      objective: `Produce a content pack: ${input.objective}`,
      requestedAction: "generate_content_pack",
      expectedOutputSchema: "creative_brief",
      confidence: 0.7,
      companyId: input.companyId ?? null,
      clientWorkspaceId: input.companyId ?? null,
      dataClassification: input.companyId ? "client_confidential" : "internal",
      authorizedMemoryScopes: CONTENT_MEMORY_SCOPES,
      idempotencyKey: `${workflowId}:content:inbound`,
    },
    { now },
  );
  const receiverCtx = { clientWorkspaceId: input.companyId ?? null, grantedMemoryScopes: CONTENT_MEMORY_SCOPES };

  const policy: DepartmentPolicy<ContentGraphResult> = async (api) => {
    // Confirm the department actually has its strategist registered (real membership, not a label). If the
    // team is missing, escalate rather than silently running degraded.
    if (!api.selectSpecialists({ capability: "strategy" }).length) api.escalate("content has no registered strategist");

    // Run the graph — it dispatches a CLAIMED handoff per node through the same runtime + store, and every
    // node's provider usage is attributed to THIS unit of work (workflow + the inbound task) so the
    // department budget settles against ACTUAL recorded usage.
    const result = await runContentGraph(
      { ...input, graphRunId: workflowId },
      {
        ...deps.graph,
        handoffStore: deps.handoffStore ?? deps.graph?.handoffStore,
        recordAudit: deps.graph?.recordAudit,
        usageContext: { departmentSlug: "content", workflowId, taskId: api.envelope.taskId, companyId: input.companyId ?? null, clientWorkspaceId: input.companyId ?? null },
        now,
      },
    );

    // A QA-failed pack is a real quality-gate escalation, not a silent pass to Publishing.
    if (result.qualityStatus === "failed" || result.qualityStatus === "blocked") api.escalate(`content quality gate failed (${result.qualityStatus})`);

    // OPT-IN independent QA GATE: two independent boards review the pack. Publishing is a downstream
    // emission — it is RELEASED only when BOTH pass. A non-pass verdict blocks the route to Publishing; the
    // gate has already recorded the evidence-backed review + raised a founder-visible escalation with the
    // exact failed stage. Absent deps.qa the route is unchanged (["publishing"]).
    let routeTo = ["publishing"];
    let qaOutputs: Record<string, unknown> = {};
    if (deps.qa && deps.qa.enabled !== false) {
      const submission = buildContentSubmission(result, {
        workflowId,
        taskId: api.envelope.taskId,
        clientWorkspaceId: input.companyId ?? null,
        authorAgentSlug: deps.qa.authorAgentSlug,
      });
      const decision = await runQaGate(
        { boards: [contentQualityBoard, contentBrandBoard], submission },
        { now, recordAudit: deps.recordAudit, escalationStore: deps.escalationStore, ...deps.qa.deps },
      );
      qaOutputs = {
        qaReleased: decision.released,
        qaVerdict: decision.verdict,
        qaBlockingBoard: decision.blockingBoardSlug,
        qaFailedStages: decision.routingTarget?.failedStages ?? [],
        qaReviewIds: decision.reviews.map((r) => r.id),
      };
      if (!decision.released) routeTo = []; // BLOCK the emission to Publishing (the gate raised the escalation).
    }

    return {
      product: result,
      productSchema: "content_pack",
      outputs: { packetId: result.packetId, approvalId: result.approvalId, qualityStatus: result.qualityStatus, ...qaOutputs },
      telemetry: { latencyMs: undefined, qualityScore: result.scores.predictedImpact },
      confidence: 0.8,
      routeTo,
    };
  };

  return runDepartment({ departmentSlug: "content", inbound: { envelope, receiverCtx }, policy }, deps);
}
