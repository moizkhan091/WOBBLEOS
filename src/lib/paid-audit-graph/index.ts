import { enqueueJob } from "@/lib/jobs";
import type { EnqueueJobInput, JobRow } from "@/lib/domain/jobs";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { audits as auditsTable } from "@/db/schema";
import { getDb } from "@/db";
import { listMemoryRecords } from "@/lib/memory";
import { recordAgentRun } from "@/lib/agents";
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
}

export interface PaidAuditDeps {
  retrieveBrain?: () => Promise<Array<{ title: string; content: string }>>;
  runNode?: (input: { role: string; module: string; messages: ProviderMessage[]; linkedEntityId: string }) => Promise<NodeRunResult>;
  recordAgentRun?: (input: Record<string, unknown>) => Promise<unknown>;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  persistAudit?: (row: PaidAuditRow) => Promise<void>;
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
  const result = await runTextProvider({ role: input.role, module: input.module, messages: input.messages, maxTokens: 2200, temperature: 0.5, linkedEntityType: "audit", linkedEntityId: input.linkedEntityId });
  return { text: result.text, runId: result.run?.id };
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

/** Run the full paid-audit graph → a persisted McKinsey-depth audit. */
export async function runPaidAuditGraph(input: RunPaidAuditInput, deps: PaidAuditDeps = {}): Promise<PaidAuditResult> {
  const actor = input.requestedBy;
  const recordAudit = deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i));
  const runNode = deps.runNode ?? defaultRunNode;
  const now = deps.now ?? new Date();
  const entityId = input.companyId ?? input.businessName;
  const modelRunIds: string[] = [];

  await recordAudit({ eventType: "audit.paid_started", module: PAID_AUDIT_MODULE, entityType: "audit", entityId, actor, metadata: { businessName: input.businessName } });

  try {
    const brain = await (deps.retrieveBrain ?? defaultRetrieveBrain)();
    const ctx: AuditContext = { businessName: input.businessName, industry: input.industry, intakeNotes: input.intakeNotes, freeAuditSummary: input.freeAuditSummary, brain };

    // Node 1 — Discovery / current-state map
    const d = await runNode({ role: PAID_AUDIT_ROLES.discovery, module: PAID_AUDIT_MODULE, messages: buildDiscoveryPrompt(ctx), linkedEntityId: entityId });
    if (d.runId) modelRunIds.push(d.runId);
    const discovery = parseJsonObject(d.text, discoverySchema);
    if (!discovery) throw new Error("paid-audit: discovery node returned unparseable output");
    await safeRecordAgentRun(deps, { agentSlug: PAID_AUDIT_AGENTS.discovery, status: "succeeded", inputSummary: input.businessName, outputSummary: `${discovery.bottlenecks.length} bottlenecks`, modelRunIds: d.runId ? [d.runId] : [] });

    // Node 2 — Opportunity identification (grounded in the Wobble service menu)
    const o = await runNode({ role: PAID_AUDIT_ROLES.opportunity, module: PAID_AUDIT_MODULE, messages: buildOpportunityPrompt(ctx, discovery), linkedEntityId: entityId });
    if (o.runId) modelRunIds.push(o.runId);
    const opportunities = parseJsonObject(o.text, opportunitySchema);
    if (!opportunities) throw new Error("paid-audit: opportunity node returned unparseable output");
    await safeRecordAgentRun(deps, { agentSlug: PAID_AUDIT_AGENTS.opportunity, status: "succeeded", inputSummary: "opportunities", outputSummary: `${opportunities.opportunities.length} opportunities`, modelRunIds: o.runId ? [o.runId] : [] });

    // Node 3 — Prioritization (impact / difficulty matrix)
    const pr = await runNode({ role: PAID_AUDIT_ROLES.prioritization, module: PAID_AUDIT_MODULE, messages: buildPrioritizationPrompt(opportunities), linkedEntityId: entityId });
    if (pr.runId) modelRunIds.push(pr.runId);
    const prioritization = parseJsonObject(pr.text, prioritizationSchema) ?? { quickWins: [], bigSwings: [], rationale: "" };
    await safeRecordAgentRun(deps, { agentSlug: PAID_AUDIT_AGENTS.prioritization, status: "succeeded", inputSummary: "prioritize", outputSummary: `${prioritization.quickWins.length} quick wins`, modelRunIds: pr.runId ? [pr.runId] : [] });

    // Node 4 — 12-month roadmap
    const rm = await runNode({ role: PAID_AUDIT_ROLES.roadmap, module: PAID_AUDIT_MODULE, messages: buildRoadmapPrompt(opportunities, prioritization), linkedEntityId: entityId });
    if (rm.runId) modelRunIds.push(rm.runId);
    const roadmap = parseJsonObject(rm.text, roadmapSchema) ?? { phases: [] };
    await safeRecordAgentRun(deps, { agentSlug: PAID_AUDIT_AGENTS.roadmap, status: "succeeded", inputSummary: "roadmap", outputSummary: `${roadmap.phases.length} phases`, modelRunIds: rm.runId ? [rm.runId] : [] });

    // Node 5 — Executive report + ROI
    const rp = await runNode({ role: PAID_AUDIT_ROLES.report, module: PAID_AUDIT_MODULE, messages: buildReportPrompt(ctx, discovery, opportunities, roadmap), linkedEntityId: entityId });
    if (rp.runId) modelRunIds.push(rp.runId);
    const report = parseJsonObject(rp.text, reportSchema);
    if (!report) throw new Error("paid-audit: report node returned unparseable output");
    await safeRecordAgentRun(deps, { agentSlug: PAID_AUDIT_AGENTS.report, status: "succeeded", inputSummary: "report", outputSummary: report.executiveSummary.slice(0, 160), modelRunIds: rp.runId ? [rp.runId] : [] });

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
  const result = await runPaidAuditGraph({ businessName: p.businessName, industry: p.industry, intakeNotes: p.intakeNotes, freeAuditSummary: p.freeAuditSummary, companyId: p.companyId, opportunityId: p.opportunityId, requestedBy: p.requestedBy });
  return { auditId: result.auditId, agentRunCount: result.agentRunCount };
}
