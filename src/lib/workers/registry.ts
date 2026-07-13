import type { JobHandler, JobHandlerRegistry } from "@/lib/jobs";
import type { JobRow } from "@/lib/domain/jobs";
import { runContentGenerateJobHandler } from "@/lib/content-worker";
import { runContentGraphJobHandler, type ContentGraphResult, type ContentGraphQaOutcome } from "@/lib/content-graph";
import { runQaGate } from "@/lib/qa/gate";
import { contentQualityBoard, contentBrandBoard, buildContentSubmission, paidAuditQaBoard, buildPaidAuditSubmission } from "@/lib/qa/boards";
import { runKnowledgeCompileJobHandler } from "@/lib/knowledge";
import { runLibraryImportJobHandler } from "@/lib/library";
import { runPaidAuditJobHandler, enqueuePaidAuditJob, type PaidAuditResult, type PaidAuditQaOutcome, type RunPaidAuditInput } from "@/lib/paid-audit-graph";
import { dispatchBusinessAuditToProposal } from "@/lib/departments/verticals/paid-audit";
import { getAudit } from "@/lib/free-audit";
import type { PaidAuditReport } from "@/lib/domain/paid-audit-graph";
import type { JobRow as PaidAuditJobRow } from "@/lib/domain/jobs";
import { runScoutJobHandler, runAnalyzeJobHandler, runDreamerJobHandler } from "@/lib/intelligence/jobs";
import { runSourceIntakeJobHandler } from "@/lib/source-intake";

/**
 * Chunk 07: Worker handler registry.
 *
 * Maps a job `type` to the function that runs it. Handlers are data, not
 * hardcoded into the queue — new job types are added here (or by future
 * chunks: content, research, media, etc.). The general worker starts with a
 * couple of safe built-ins so the runtime can be exercised end to end.
 */

const noop: JobHandler = async () => ({});

const echo: JobHandler = async (job: JobRow) => ({ echoed: job.payload });

/**
 * Production paid-audit handler: run the proven graph, then ORIGINATE the department chain by dispatching
 * a business_audit handoff to Proposal (the autonomous consumer loop claims it and produces the proposal).
 * The origination is best-effort — a dispatch failure (unseeded departments / no DB) is logged and never
 * fails the audit, which has already succeeded.
 */
/**
 * LIVE independent audit QA gate + SELECTIVE-REVISION trigger. The paid_audit graph is a linear pipeline of
 * versioned nodes (discovery → opportunity → prioritization → roadmap → report); the QA board's stages map 1:1
 * onto those nodes. On a salvageable `revise`, `openAuditRevision` opens a durable revision cycle over the nodes
 * (the checkpoints are preserved by the graph), and the founder `rerun` re-enqueues the audit bound to the SAME
 * graphRunId so only the failed stages regenerate.
 */
async function livePaidAuditQaGate(artifact: PaidAuditResult, ctx: { workflowId: string; companyId: string | null }): Promise<PaidAuditQaOutcome> {
  const submission = buildPaidAuditSubmission(artifact, { workflowId: ctx.workflowId, taskId: `${ctx.workflowId}:audit_qa`, clientWorkspaceId: ctx.companyId });
  const decision = await runQaGate({ boards: [paidAuditQaBoard], submission }, { raiseEscalation: async () => {} });
  return { released: decision.released, verdict: decision.verdict, failedStages: decision.routingTarget?.failedStages ?? [] };
}

const AUDIT_GRAPH_NODES = [
  { key: "discovery", producedBy: "audit_discovery", dependsOn: [] as string[] },
  { key: "opportunity", producedBy: "audit_opportunity", dependsOn: ["discovery"] },
  { key: "prioritization", producedBy: "audit_prioritization", dependsOn: ["opportunity"] },
  { key: "roadmap", producedBy: "audit_roadmap", dependsOn: ["prioritization"] },
  { key: "report", producedBy: "audit_report", dependsOn: ["roadmap"] },
];

async function openAuditRevision(input: { graphRunId: string; failedStages: string[]; auditId: string; companyId: string | null; input: RunPaidAuditInput }): Promise<void> {
  // The audit QA board's stages ARE the node keys (identity mapping); a failed stage reruns it + its downstream.
  const failedNodes = input.failedStages.filter((s) => AUDIT_GRAPH_NODES.some((n) => n.key === s));
  if (failedNodes.length === 0) return;
  const { openRevisionCycle } = await import("@/lib/selective-revision");
  await openRevisionCycle({
    artifactKind: "paid_audit", artifactRef: input.auditId, graphRunId: input.graphRunId, triggeredBy: "qa_gate:paid_audit",
    components: AUDIT_GRAPH_NODES.map((n) => ({ key: n.key, kind: "graph_node", producedBy: n.producedBy, dependsOn: n.dependsOn, version: 1, status: failedNodes.includes(n.key) ? "failed" : "approved" })),
    failedComponents: failedNodes, clientId: input.companyId,
    reenqueue: { producer: "audit.paid", businessName: input.input.businessName, industry: input.input.industry, intakeNotes: input.input.intakeNotes, freeAuditSummary: input.input.freeAuditSummary, companyId: input.input.companyId, opportunityId: input.input.opportunityId, requestedBy: input.input.requestedBy },
  });
}

async function runPaidAuditWithOriginationJobHandler(job: PaidAuditJobRow): Promise<Record<string, unknown>> {
  const result = await runPaidAuditJobHandler(job, { qaGate: livePaidAuditQaGate, onQaRevise: openAuditRevision });
  const p = (job.payload ?? {}) as { businessName?: string; companyId?: string | null };
  const auditId = result.auditId as string | undefined;
  if (auditId && p.businessName) {
    try {
      // LIVE QA GATE: the independent paid_audit_qa board reviews the finished audit BEFORE it emits to
      // Proposal. Only a PASS releases the business_audit handoff; a non-pass BLOCKS the emission and the
      // gate raises a real founder escalation. (qa deps default to the DB qa_reviews + escalation stores.)
      const auditRow = await getAudit(auditId);
      const qa = auditRow ? { result: { auditId, agentRunCount: Number(result.agentRunCount ?? 0), modelRunIds: [], report: auditRow.report as unknown as PaidAuditReport } as PaidAuditResult } : undefined;
      const routed = await dispatchBusinessAuditToProposal({ auditId, businessName: p.businessName, companyId: p.companyId ?? null }, { qa });
      if (routed.blocked) return { ...result, qaBlocked: true, qaVerdict: routed.qa?.verdict ?? null };
      return { ...result, routedToProposal: routed.handoffId, routedDeduped: routed.deduped };
    } catch (e) {
      console.error("[audit.paid] origination to proposal failed (audit still succeeded):", e instanceof Error ? e.message : e);
    }
  }
  return result;
}

/**
 * LIVE independent content QA gate. Two independent boards (content_quality + content_brand) review every
 * assembled pack BEFORE a founder publish-approval is opened. Only a release (BOTH pass) lets the approval
 * open — a QA-failed pack never reaches the Library / scheduled-posts publishing pipeline, and the gate
 * raises a real founder escalation naming the exact failed stage. Stores default to the DB (qa_reviews +
 * escalations) when DATABASE_URL is set. Deterministic boards → no LLM cost, safe on the hot content path.
 */
export async function liveContentQaGate(
  artifact: ContentGraphResult,
  ctx: { workflowId: string; taskId: string | null; clientWorkspaceId: string | null },
): Promise<ContentGraphQaOutcome> {
  const submission = buildContentSubmission(artifact, { workflowId: ctx.workflowId, taskId: ctx.taskId, clientWorkspaceId: ctx.clientWorkspaceId });
  const decision = await runQaGate({ boards: [contentQualityBoard, contentBrandBoard], submission }, {});
  return {
    released: decision.released,
    verdict: decision.verdict,
    blockingBoardSlug: decision.blockingBoardSlug,
    failedStages: decision.routingTarget?.failedStages ?? [],
    reviewIds: decision.reviews.map((r) => r.id),
    escalationIds: decision.escalationIds,
  };
}

/**
 * Production content-generator Context OS retrieval: pulls WOBBLE's APPROVED trusted-context facts (company
 * scope) and formats them as a grounding block, recording the retrieval as evidence (telemetry). This is the
 * real enforcement point — a production generator retrieves approved scoped context before generating.
 */
async function retrieveContentTrustedContext(): Promise<string | null> {
  const { retrieveTrustedContext } = await import("@/lib/context-os");
  const { assertions } = await retrieveTrustedContext({ type: "company", id: "wobble" }, "social_content", { agentSlug: "content_strategist" });
  if (!assertions.length) return null;
  return "APPROVED WOBBLE CONTEXT (trusted onboarding facts — treat as ground truth, never contradict):\n" + assertions.map((a) => `- ${a.statement}`).join("\n");
}

/**
 * Production SELECTIVE-REVISION trigger for content. The content graph is a linear pipeline of versioned nodes
 * (strategy → research → draft → revise → scoring); the QA boards judge STAGES that map onto those nodes. On a
 * salvageable `revise`, open a durable revision cycle over the nodes so ONLY the failed stages (+ their
 * downstream) rerun and the approved nodes' checkpoints are preserved — the deterministic graphRunId means the
 * next content run for the same track reuses the preserved nodes and regenerates exactly the cleared ones.
 */
const CONTENT_GRAPH_NODES = [
  { key: "strategy", producedBy: "content_strategist", dependsOn: [] as string[] },
  { key: "research", producedBy: "content_researcher", dependsOn: ["strategy"] },
  { key: "draft", producedBy: "content_copywriter", dependsOn: ["research"] },
  { key: "revise", producedBy: "content_editor", dependsOn: ["draft"] },
  { key: "scoring", producedBy: "content_scorer", dependsOn: ["revise"] },
];
const CONTENT_STAGE_TO_NODES: Record<string, string[]> = { strategy: ["strategy"], research: ["research"], copywriting: ["draft", "revise"], scoring: ["scoring"] };

async function openContentRevision(input: { graphRunId: string; failedStages: string[]; trackId: string; clientId: string | null; objective: string; requestedBy: string }): Promise<void> {
  const failedNodes = [...new Set(input.failedStages.flatMap((s) => CONTENT_STAGE_TO_NODES[s] ?? []))];
  if (failedNodes.length === 0) return; // no mappable stage → nothing to selectively rerun
  const { openRevisionCycle } = await import("@/lib/selective-revision");
  await openRevisionCycle({
    artifactKind: "content_graph", artifactRef: input.graphRunId, graphRunId: input.graphRunId, triggeredBy: "qa_gate:content",
    components: CONTENT_GRAPH_NODES.map((n) => ({ key: n.key, kind: "graph_node", producedBy: n.producedBy, dependsOn: n.dependsOn, version: 1, status: failedNodes.includes(n.key) ? "failed" : "approved" })),
    failedComponents: failedNodes, clientId: input.clientId,
    // Re-enqueue context: the founder `rerun` action re-runs content.graph bound to this SAME graphRunId so the
    // preserved nodes' checkpoints are reused and only the cleared (reran) nodes regenerate.
    reenqueue: { producer: "content.graph", contentTrackId: input.trackId, objective: input.objective, requestedBy: input.requestedBy },
  });
}

/** Production content.graph handler: run the graph with the LIVE QA gate + Context OS trusted-context retrieval
 *  + the selective-revision trigger (a `revise` opens a durable cycle instead of a silent full regeneration). */
const contentGraphHandler: JobHandler = (job: JobRow) => runContentGraphJobHandler(job, { qaGate: liveContentQaGate, retrieveTrustedContext: retrieveContentTrustedContext, onQaRevise: openContentRevision });

export const generalRegistry: JobHandlerRegistry = {
  noop,
  "test.echo": echo,
  "content.generate": runContentGenerateJobHandler,
  "content.graph": contentGraphHandler,
  "knowledge.compile": runKnowledgeCompileJobHandler,
  "library.import": runLibraryImportJobHandler,
  "audit.paid": runPaidAuditWithOriginationJobHandler,
  "intelligence.scout": runScoutJobHandler,
  "intelligence.analyze": runAnalyzeJobHandler,
  "intelligence.dream": runDreamerJobHandler,
  "source.intake": runSourceIntakeJobHandler,
};

export function getHandler(type: string, registry: JobHandlerRegistry = generalRegistry): JobHandler | undefined {
  return registry[type];
}

export function hasHandler(type: string, registry: JobHandlerRegistry = generalRegistry): boolean {
  return Boolean(registry[type]);
}

export function knownJobTypes(registry: JobHandlerRegistry = generalRegistry): string[] {
  return Object.keys(registry);
}
