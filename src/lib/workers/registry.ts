import type { JobHandler, JobHandlerRegistry } from "@/lib/jobs";
import type { JobRow } from "@/lib/domain/jobs";
import { runContentGenerateJobHandler } from "@/lib/content-worker";
import { runContentGraphJobHandler } from "@/lib/content-graph";
import { runKnowledgeCompileJobHandler } from "@/lib/knowledge";
import { runLibraryImportJobHandler, runPublishingDispatchJobHandler } from "@/lib/library";
import { runPaidAuditJobHandler } from "@/lib/paid-audit-graph";
import { dispatchBusinessAuditToProposal } from "@/lib/departments/verticals/paid-audit";
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
      const routed = await dispatchBusinessAuditToProposal({ auditId, businessName: p.businessName, companyId: p.companyId ?? null });
      return { ...result, routedToProposal: routed.handoffId, routedDeduped: routed.deduped };
    } catch (e) {
      console.error("[audit.paid] origination to proposal failed (audit still succeeded):", e instanceof Error ? e.message : e);
    }
  }
  return result;
}

export const generalRegistry: JobHandlerRegistry = {
  noop,
  "test.echo": echo,
  "content.generate": runContentGenerateJobHandler,
  "content.graph": runContentGraphJobHandler,
  "knowledge.compile": runKnowledgeCompileJobHandler,
  "publishing.dispatch": runPublishingDispatchJobHandler,
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
