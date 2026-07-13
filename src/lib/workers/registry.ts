import type { JobHandler, JobHandlerRegistry } from "@/lib/jobs";
import type { JobRow } from "@/lib/domain/jobs";
import { runContentGenerateJobHandler } from "@/lib/content-worker";
import { runContentGraphJobHandler, type ContentGraphResult, type ContentGraphQaOutcome } from "@/lib/content-graph";
import { runQaGate } from "@/lib/qa/gate";
import { contentQualityBoard, contentBrandBoard, buildContentSubmission } from "@/lib/qa/boards";
import { runKnowledgeCompileJobHandler } from "@/lib/knowledge";
import { runLibraryImportJobHandler } from "@/lib/library";
import { runPaidAuditJobHandler, type PaidAuditResult } from "@/lib/paid-audit-graph";
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
async function runPaidAuditWithOriginationJobHandler(job: PaidAuditJobRow): Promise<Record<string, unknown>> {
  const result = await runPaidAuditJobHandler(job);
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

/** Production content.graph handler: run the graph with the LIVE QA gate + Context OS trusted-context retrieval. */
const contentGraphHandler: JobHandler = (job: JobRow) => runContentGraphJobHandler(job, { qaGate: liveContentQaGate, retrieveTrustedContext: retrieveContentTrustedContext });

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
