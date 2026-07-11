import { enqueueJob } from "@/lib/jobs";
import type { EnqueueJobInput, JobRow } from "@/lib/domain/jobs";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { audits as auditsTable } from "@/db/schema";
import { getDb } from "@/db";
import { listMemoryRecords } from "@/lib/memory";
import { recordAgentRun } from "@/lib/agents";
import { runGraphNode, type GraphNodeSpec } from "@/lib/agents/node-telemetry";
import { loadCheckpointContext, clearGraphCheckpoints, bindNodeCheckpoint, type CheckpointContext, type GraphCheckpointStore } from "@/lib/graph-checkpoint";
import { GRAPH_CHECKPOINT_SCHEMA_VERSION } from "@/lib/domain/graph-checkpoint";
import { runTextProvider, type ProviderMessage } from "@/lib/providers";
import { newId } from "@/lib/ids";
import {
  PAID_AUDIT_AGENTS,
  PAID_AUDIT_JOB_TYPE,
  PAID_AUDIT_MODULE,
  PAID_AUDIT_QUEUE,
  PAID_AUDIT_ROLES,
  assemblePaidAuditReport,
  buildDiscoveryPrompt,
  buildOpportunityPrompt,
  buildPrioritizationPrompt,
  buildRoadmapPrompt,
  buildReportPrompt,
  discoverySchema,
  opportunitySchema,
  parseJsonObject,
  prioritizationSchema,
  reportSchema,
  roadmapSchema,
  type AuditContext,
  type PaidAuditReport,
} from "@/lib/domain/paid-audit-graph";

/**
 * Paid Audit Graph orchestrator (the McKinsey-depth AI audit team). Five distinct agent_runs, each
 * with its own model role, grounded in the intake + Free-Audit summary + brand Brain + the Wobble
 * service catalog. Persists a paid audit to the audits table (kind="paid"). Runs live only when
 * OPENROUTER_API_KEY is set (runTextProvider throws otherwise) — no stub, no silent spend.
 */

export interface NodeRunResult {
  text: string;
  runId?: string;
  cost?: number;
}

export interface PaidAuditDeps {
  retrieveBrain?: () => Promise<Array<{ title: string; content: string }>>;
  runNode?: (input: { role: string; module: string; messages: ProviderMessage[]; linkedEntityId: string }) => Promise<NodeRunResult>;
  recordAgentRun?: (input: Record<string, unknown>) => Promise<unknown>;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  persistAudit?: (row: PaidAuditRow) => Promise<void>;
  checkpointStore?: GraphCheckpointStore;
  now?: Date;
}

export interface RunPaidAuditInput {
  businessName: string;
  industry?: string | null;
  intakeNotes: string;
  freeAuditSummary?: string;
  companyId?: string;
  opportunityId?: string;
  requestedBy: string;
  /** Stable id enabling checkpoint resume (the job id). Omit for one-shot runs with no retry. */
  graphRunId?: string;
}

export interface PaidAuditRow {
  id: string;
  kind: string;
  companyId: string | null;
  opportunityId: string | null;
  businessName: string;
  status: string;
  report: PaidAuditReport;
  input: Record<string, unknown>;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaidAuditResult {
  auditId: string;
  agentRunCount: number;
  modelRunIds: string[];
  report: PaidAuditReport;
}

async function defaultRunNode(input: { role: string; module: string; messages: ProviderMessage[]; linkedEntityId: string }): Promise<NodeRunResult> {
  const result = await runTextProvider({ role: input.role, module: input.module, messages: input.messages, maxTokens: 6000, temperature: 0.5, linkedEntityType: "audit", linkedEntityId: input.linkedEntityId });
  return { text: result.text, runId: result.run?.id, cost: result.run?.estimatedCost ? Number(result.run.estimatedCost) : undefined };
}

async function defaultRetrieveBrain(): Promise<Array<{ title: string; content: string }>> {
  const records = await listMemoryRecords({ memoryTier: "core", status: "active", limit: 30 });
  return records.map((r) => ({ title: r.title, content: r.content }));
}

async function defaultPersistAudit(row: PaidAuditRow): Promise<void> {
  await getDb().insert(auditsTable).values({ ...row, report: row.report as unknown as Record<string, unknown> });
}

async function safeRecordAgentRun(deps: PaidAuditDeps, input: Record<string, unknown>): Promise<void> {
  try {
    await (deps.recordAgentRun ?? ((i: Record<string, unknown>) => recordAgentRun(i as never)))(input);
  } catch {
    /* logging must never fail the audit */
  }
}

/** Thin adapter: bind this graph's deps + module to the shared node-telemetry runner. */
function runAuditNode<T>(
  deps: PaidAuditDeps,
  runNode: NonNullable<PaidAuditDeps["runNode"]>,
  spec: Omit<GraphNodeSpec<T>, "module">,
): Promise<{ parsed: T | null; run: NodeRunResult }> {
  return runGraphNode(runNode, (i) => safeRecordAgentRun(deps, i), { ...spec, module: PAID_AUDIT_MODULE });
}

/** Run the full paid-audit graph → a persisted McKinsey-depth audit. */
export async function runPaidAuditGraph(input: RunPaidAuditInput, deps: PaidAuditDeps = {}): Promise<PaidAuditResult> {
  const actor = input.requestedBy;
  const recordAudit = deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i));
  const runNode = deps.runNode ?? defaultRunNode;
  const now = deps.now ?? new Date();
  const entityId = input.companyId ?? input.businessName;
  const modelRunIds: string[] = [];

  await recordAudit({ eventType: "audit.paid_started", module: PAID_AUDIT_MODULE, entityType: "audit", entityId, actor, metadata: { businessName: input.businessName } });

  // Resume support: with a stable run id (the job id), reuse completed node checkpoints on retry.
  const cpCtx: CheckpointContext | undefined = input.graphRunId
    ? await loadCheckpointContext(
        { graph: "paid_audit", graphRunId: input.graphRunId, schemaVersion: GRAPH_CHECKPOINT_SCHEMA_VERSION.paid_audit },
        { store: deps.checkpointStore, now: deps.now },
      )
    : undefined;

  try {
    const brain = await (deps.retrieveBrain ?? defaultRetrieveBrain)();
    const ctx: AuditContext = { businessName: input.businessName, industry: input.industry, intakeNotes: input.intakeNotes, freeAuditSummary: input.freeAuditSummary, brain };

    // Node 1 — Discovery / current-state map
    const { parsed: discoveryParsed, run: dRun } = await runAuditNode(deps, runNode, {
      slug: PAID_AUDIT_AGENTS.discovery, role: PAID_AUDIT_ROLES.discovery, linkedEntityId: entityId,
      messages: buildDiscoveryPrompt(ctx), parse: (t) => parseJsonObject(t, discoverySchema),
      required: true, parseErr: "paid-audit: discovery node returned unparseable output",
      summarize: (dsc) => ({ inputSummary: input.businessName, outputSummary: `${dsc!.bottlenecks.length} bottlenecks` }),
      checkpoint: bindNodeCheckpoint(cpCtx, "discovery", 0),
    });
    if (dRun.runId) modelRunIds.push(dRun.runId);
    const discovery = discoveryParsed!;

    // Node 2 — Opportunity identification (grounded in the Wobble service menu)
    const { parsed: oppParsed, run: oRun } = await runAuditNode(deps, runNode, {
      slug: PAID_AUDIT_AGENTS.opportunity, role: PAID_AUDIT_ROLES.opportunity, linkedEntityId: entityId,
      messages: buildOpportunityPrompt(ctx, discovery), parse: (t) => parseJsonObject(t, opportunitySchema),
      required: true, parseErr: "paid-audit: opportunity node returned unparseable output",
      summarize: (op) => ({ inputSummary: "opportunities", outputSummary: `${op!.opportunities.length} opportunities` }),
      checkpoint: bindNodeCheckpoint(cpCtx, "opportunity", 1),
    });
    if (oRun.runId) modelRunIds.push(oRun.runId);
    const opportunities = oppParsed!;

    // Node 3 — Prioritization (impact / difficulty matrix). Soft: an unparseable result falls back to empty.
    const { parsed: prioParsed, run: prRun } = await runAuditNode(deps, runNode, {
      slug: PAID_AUDIT_AGENTS.prioritization, role: PAID_AUDIT_ROLES.prioritization, linkedEntityId: entityId,
      messages: buildPrioritizationPrompt(opportunities), parse: (t) => parseJsonObject(t, prioritizationSchema),
      required: false, parseErr: "",
      summarize: (p) => ({ inputSummary: "prioritize", outputSummary: `${p?.quickWins.length ?? 0} quick wins` }),
      checkpoint: bindNodeCheckpoint(cpCtx, "prioritization", 2),
    });
    if (prRun.runId) modelRunIds.push(prRun.runId);
    const prioritization = prioParsed ?? { quickWins: [], bigSwings: [], rationale: "" };

    // Node 4 — 12-month roadmap. Soft: an unparseable result falls back to no phases.
    const { parsed: roadmapParsed, run: rmRun } = await runAuditNode(deps, runNode, {
      slug: PAID_AUDIT_AGENTS.roadmap, role: PAID_AUDIT_ROLES.roadmap, linkedEntityId: entityId,
      messages: buildRoadmapPrompt(opportunities, prioritization), parse: (t) => parseJsonObject(t, roadmapSchema),
      required: false, parseErr: "",
      summarize: (r) => ({ inputSummary: "roadmap", outputSummary: `${r?.phases.length ?? 0} phases` }),
      checkpoint: bindNodeCheckpoint(cpCtx, "roadmap", 3),
    });
    if (rmRun.runId) modelRunIds.push(rmRun.runId);
    const roadmap = roadmapParsed ?? { phases: [] };

    // Node 5 — Executive report + ROI
    const { parsed: reportParsed, run: rpRun } = await runAuditNode(deps, runNode, {
      slug: PAID_AUDIT_AGENTS.report, role: PAID_AUDIT_ROLES.report, linkedEntityId: entityId,
      messages: buildReportPrompt(ctx, discovery, opportunities, roadmap), parse: (t) => parseJsonObject(t, reportSchema),
      required: true, parseErr: "paid-audit: report node returned unparseable output",
      summarize: (rep) => ({ inputSummary: "report", outputSummary: rep!.executiveSummary.slice(0, 160) }),
      checkpoint: bindNodeCheckpoint(cpCtx, "report", 4),
    });
    if (rpRun.runId) modelRunIds.push(rpRun.runId);
    const report = reportParsed!;

    const fullReport = assemblePaidAuditReport({ businessName: input.businessName, industry: input.industry, discovery, opportunities, prioritization, roadmap, report });
    const row: PaidAuditRow = {
      id: newId("audit"),
      kind: "paid",
      companyId: input.companyId ?? null,
      opportunityId: input.opportunityId ?? null,
      businessName: input.businessName,
      status: "complete",
      report: fullReport,
      input: { intakeNotes: input.intakeNotes, industry: input.industry, freeAuditSummary: input.freeAuditSummary },
      createdBy: actor,
      createdAt: now,
      updatedAt: now,
    };
    await (deps.persistAudit ?? defaultPersistAudit)(row);

    await recordAudit({ eventType: "audit.paid_completed", module: PAID_AUDIT_MODULE, entityType: "audit", entityId: row.id, actor, metadata: { agentRunCount: 5, opportunities: fullReport.opportunities.length, phases: fullReport.roadmap.length, modelRunIds } });

    // Success: durably finished — drop this run's checkpoints.
    if (input.graphRunId) await clearGraphCheckpoints(input.graphRunId, { store: deps.checkpointStore });

    return { auditId: row.id, agentRunCount: 5, modelRunIds, report: fullReport };
  } catch (error) {
    await recordAudit({ eventType: "audit.paid_failed", module: PAID_AUDIT_MODULE, entityType: "audit", entityId, actor, metadata: { reason: error instanceof Error ? error.message : String(error) } });
    throw error;
  }
}

export async function enqueuePaidAuditJob(input: RunPaidAuditInput & { idempotencyKey?: string }, deps: PaidAuditDeps = {}): Promise<unknown> {
  const enqueue = (deps as { enqueueJob?: (i: EnqueueJobInput) => Promise<unknown> }).enqueueJob ?? enqueueJob;
  return enqueue({ queue: PAID_AUDIT_QUEUE, type: PAID_AUDIT_JOB_TYPE, payload: { ...input }, priority: 5, maxAttempts: 1, idempotencyKey: input.idempotencyKey, linkedModule: PAID_AUDIT_MODULE, linkedEntityType: "audit", linkedEntityId: input.companyId ?? input.businessName });
}

export async function runPaidAuditJobHandler(job: JobRow): Promise<Record<string, unknown>> {
  const p = (job.payload ?? {}) as Partial<RunPaidAuditInput>;
  if (!p.businessName || !p.intakeNotes || !p.requestedBy) throw new Error("audit.paid job requires businessName, intakeNotes, requestedBy");
  const result = await runPaidAuditGraph({ businessName: p.businessName, industry: p.industry, intakeNotes: p.intakeNotes, freeAuditSummary: p.freeAuditSummary, companyId: p.companyId, opportunityId: p.opportunityId, requestedBy: p.requestedBy, graphRunId: job.id });
  return { auditId: result.auditId, agentRunCount: result.agentRunCount };
}
