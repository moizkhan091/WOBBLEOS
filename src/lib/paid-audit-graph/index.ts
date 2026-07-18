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
import { buildHandoffEnvelope, nextHandoff, validateHandoff, type HandoffEnvelope } from "@/lib/domain/handoff";
import { type HandoffStore } from "@/lib/handoff";
import { runHandoffHop, HandoffAlreadyProcessedError, type HandoffTransportContext } from "@/lib/handoff-transport";
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

/** The outcome of the independent QA gate over a finished audit (before it clears checkpoints / routes on). */
export interface PaidAuditQaOutcome {
  released: boolean;
  verdict?: string;
  failedStages?: string[];
}

export interface PaidAuditDeps {
  retrieveBrain?: () => Promise<Array<{ title: string; content: string }>>;
  /**
   * Opt-in Context OS retrieval: returns a system-message block of the APPROVED trusted-context facts for the
   * audited CLIENT's scope (or null when none / not wired). Injected by the production handler so the audit is
   * grounded in the client's founder-approved facts (never raw/unapproved, never another tenant's); telemetered.
   */
  retrieveTrustedContext?: () => Promise<string | null>;
  runNode?: (input: { role: string; module: string; messages: ProviderMessage[]; linkedEntityId: string }) => Promise<NodeRunResult>;
  recordAgentRun?: (input: Record<string, unknown>) => Promise<unknown>;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  persistAudit?: (row: PaidAuditRow) => Promise<void>;
  /**
   * Opt-in INDEPENDENT QA gate over the finished audit. On a salvageable `revise`, `onQaRevise` opens a durable
   * revision cycle (mapping the audit's QA stages → its 5 graph nodes) and the checkpoints are PRESERVED so a
   * selective rerun regenerates only the failed stages. Injected by the production job handler; omitted in unit
   * tests → no gate (behaviour unchanged).
   */
  qaGate?: (artifact: PaidAuditResult, ctx: { workflowId: string; companyId: string | null }) => Promise<PaidAuditQaOutcome>;
  onQaRevise?: (input: { graphRunId: string; failedStages: string[]; auditId: string; companyId: string | null; input: RunPaidAuditInput }) => Promise<void>;
  checkpointStore?: GraphCheckpointStore;
  /** Durable handoff backbone. Injected in tests; in prod the default DB store is used when DATABASE_URL is set. */
  handoffStore?: HandoffStore;
  /** Attribution context so each node's provider usage is recorded + settled against the department budget. */
  usageContext?: import("@/lib/domain/provider-usage").ProviderUsageContext;
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

function makeDefaultRunNode(usageContext?: import("@/lib/domain/provider-usage").ProviderUsageContext): NonNullable<PaidAuditDeps["runNode"]> {
  return async (input) => {
    const result = await runTextProvider({ role: input.role, module: input.module, messages: input.messages, maxTokens: 8000, temperature: 0.5, linkedEntityType: "audit", linkedEntityId: input.linkedEntityId, usageContext: usageContext ? { ...usageContext, agentSlug: input.role } : undefined });
    return { text: result.text, runId: result.run?.id, cost: result.run?.estimatedCost ? Number(result.run.estimatedCost) : undefined };
  };
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
  const runNode = deps.runNode ?? makeDefaultRunNode(deps.usageContext);
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
    // Context OS: ground the audit in the CLIENT's APPROVED trusted context (never raw/unapproved), telemetered.
    const trustedContextBlock = deps.retrieveTrustedContext ? await deps.retrieveTrustedContext() : null;
    const ctx: AuditContext = { businessName: input.businessName, industry: input.industry, intakeNotes: input.intakeNotes, freeAuditSummary: input.freeAuditSummary, brain };

    // ---- Structured inter-agent handoff (Phase 2): a validated envelope threads the whole graph,
    // carrying client scope + memory authorization + lineage. Validated at ENTRY (tenant isolation +
    // memory-scope authorization) before any node runs; a fresh envelope is emitted at each hop with
    // correlation/causation lineage, so the agent team's communication is real and auditable.
    const AUDIT_MEMORY_SCOPES = ["company", "research", "offer", "brand"];
    let envelope: HandoffEnvelope = buildHandoffEnvelope(
      {
        workflowId: input.graphRunId ?? entityId,
        department: "paid_audit",
        sourceAgent: "paid_audit_orchestrator",
        destinationAgent: PAID_AUDIT_AGENTS.discovery,
        companyId: input.companyId ?? null,
        clientWorkspaceId: input.companyId ?? null,
        actor,
        dataClassification: input.companyId ? "client_confidential" : "internal",
        authorizedMemoryScopes: AUDIT_MEMORY_SCOPES,
        objective: `Map the current state of ${input.businessName}`,
        requestedAction: "produce discovery map",
        expectedOutputSchema: "current_state_map",
        confidence: 0.7,
        // Stable per-node dedup key: a retry re-dispatching node 1 dedups to the existing handoff.
        idempotencyKey: `${input.graphRunId ?? entityId}:${PAID_AUDIT_AGENTS.discovery}`,
      },
      { now },
    );
    const entryCheck = validateHandoff(envelope, { clientWorkspaceId: input.companyId ?? null, grantedMemoryScopes: AUDIT_MEMORY_SCOPES });
    if (!entryCheck.ok) throw new Error(`paid-audit: invalid entry handoff — ${entryCheck.errors.join("; ")}`);

    const handoffStore = deps.handoffStore ?? (process.env.DATABASE_URL ? (await import("@/lib/handoff")).defaultStore() : undefined);
    const transportCtx: HandoffTransportContext | null = handoffStore
      ? { store: handoffStore, clientWorkspaceId: envelope.clientWorkspaceId, grantedMemoryScopes: AUDIT_MEMORY_SCOPES, recordAudit: async (i: AuditEventInput) => { await recordAudit(i); }, now, consumer: "paid_audit" }
      : null;

    // Address the envelope to the NEXT node (fresh causation lineage, stable per-node dedup key so a graph
    // RETRY re-dispatching the same step dedups to the existing handoff instead of churning a new row).
    const advance = async (fromAgent: string, toAgent: string, expectedOutputSchema: string, objective: string, addOutputs: Record<string, unknown>) => {
      envelope = nextHandoff(envelope, { sourceAgent: fromAgent, destinationAgent: toAgent, objective, requestedAction: objective, expectedOutputSchema, addOutputs, idempotencyKey: `${envelope.workflowId}:${toAgent}` }, { now });
      await recordAudit({ eventType: "agent.handoff", module: PAID_AUDIT_MODULE, entityType: "audit", entityId, actor, metadata: { workflowId: envelope.workflowId, correlationId: envelope.correlationId, taskId: envelope.taskId, causationId: envelope.causationId, from: fromAgent, to: toAgent, department: "paid_audit", clientWorkspaceId: envelope.clientWorkspaceId } });
    };

    // Run a node THROUGH the durable handoff: dispatch → claim (lease) → validate → execute → ack →
    // complete. The node body executes only after a valid claim, so no agent runs off an unclaimed
    // handoff. With no handoff store (dev/test without DB) it runs directly. On a retry whose step was
    // already delivered, the handoff dedups and we resume from the node checkpoint (no re-dispatch).
    const consume = async <T>(spec: Omit<GraphNodeSpec<T>, "module">): Promise<{ parsed: T | null; run: NodeRunResult }> => {
      if (!transportCtx) return runAuditNode(deps, runNode, spec);
      try {
        const { result } = await runHandoffHop<{ parsed: T | null; run: NodeRunResult }>(
          envelope,
          async () => {
            const r = await runAuditNode(deps, runNode, spec);
            return { value: r, telemetry: { costEstimate: r.run.cost } };
          },
          transportCtx,
        );
        return result;
      } catch (error) {
        if (error instanceof HandoffAlreadyProcessedError) return runAuditNode(deps, runNode, spec); // resume from checkpoint
        throw error;
      }
    };

    // Node 1 — Discovery / current-state map (driven by the entry handoff orchestrator→discovery).
    const { parsed: discoveryParsed, run: dRun } = await consume({
      slug: PAID_AUDIT_AGENTS.discovery, role: PAID_AUDIT_ROLES.discovery, linkedEntityId: entityId,
      messages: trustedContextBlock ? [{ role: "system", content: trustedContextBlock }, ...buildDiscoveryPrompt(ctx)] : buildDiscoveryPrompt(ctx), parse: (t) => parseJsonObject(t, discoverySchema),
      required: true, parseErr: "paid-audit: discovery node returned unparseable output",
      summarize: (dsc) => ({ inputSummary: input.businessName, outputSummary: `${dsc!.bottlenecks.length} bottlenecks` }),
      checkpoint: bindNodeCheckpoint(cpCtx, "discovery", 0),
    });
    if (dRun.runId) modelRunIds.push(dRun.runId);
    const discovery = discoveryParsed!;
    await advance(PAID_AUDIT_AGENTS.discovery, PAID_AUDIT_AGENTS.opportunity, "opportunity_set", "identify AI/automation opportunities", { discovery });

    // Node 2 — Opportunity identification (grounded in the Wobble service menu)
    const { parsed: oppParsed, run: oRun } = await consume({
      slug: PAID_AUDIT_AGENTS.opportunity, role: PAID_AUDIT_ROLES.opportunity, linkedEntityId: entityId,
      messages: buildOpportunityPrompt(ctx, discovery), parse: (t) => parseJsonObject(t, opportunitySchema),
      required: true, parseErr: "paid-audit: opportunity node returned unparseable output",
      summarize: (op) => ({ inputSummary: "opportunities", outputSummary: `${op!.opportunities.length} opportunities` }),
      checkpoint: bindNodeCheckpoint(cpCtx, "opportunity", 1),
    });
    if (oRun.runId) modelRunIds.push(oRun.runId);
    const opportunities = oppParsed!;
    await advance(PAID_AUDIT_AGENTS.opportunity, PAID_AUDIT_AGENTS.prioritization, "prioritization", "rank opportunities by impact/difficulty", { opportunities });

    // Node 3 — Prioritization (impact / difficulty matrix). Soft: an unparseable result falls back to empty.
    const { parsed: prioParsed, run: prRun } = await consume({
      slug: PAID_AUDIT_AGENTS.prioritization, role: PAID_AUDIT_ROLES.prioritization, linkedEntityId: entityId,
      messages: buildPrioritizationPrompt(opportunities), parse: (t) => parseJsonObject(t, prioritizationSchema),
      required: false, parseErr: "",
      summarize: (p) => ({ inputSummary: "prioritize", outputSummary: `${p?.quickWins.length ?? 0} quick wins` }),
      checkpoint: bindNodeCheckpoint(cpCtx, "prioritization", 2),
    });
    if (prRun.runId) modelRunIds.push(prRun.runId);
    const prioritization = prioParsed ?? { quickWins: [], bigSwings: [], rationale: "" };
    await advance(PAID_AUDIT_AGENTS.prioritization, PAID_AUDIT_AGENTS.roadmap, "roadmap", "sequence a 12-month roadmap", { prioritization });

    // Node 4 — 12-month roadmap. Soft: an unparseable result falls back to no phases.
    const { parsed: roadmapParsed, run: rmRun } = await consume({
      slug: PAID_AUDIT_AGENTS.roadmap, role: PAID_AUDIT_ROLES.roadmap, linkedEntityId: entityId,
      messages: buildRoadmapPrompt(opportunities, prioritization), parse: (t) => parseJsonObject(t, roadmapSchema),
      required: false, parseErr: "",
      summarize: (r) => ({ inputSummary: "roadmap", outputSummary: `${r?.phases.length ?? 0} phases` }),
      checkpoint: bindNodeCheckpoint(cpCtx, "roadmap", 3),
    });
    if (rmRun.runId) modelRunIds.push(rmRun.runId);
    const roadmap = roadmapParsed ?? { phases: [] };
    await advance(PAID_AUDIT_AGENTS.roadmap, PAID_AUDIT_AGENTS.report, "audit_report", "write the executive report + ROI", { roadmap });

    // Node 5 — Executive report + ROI
    const { parsed: reportParsed, run: rpRun } = await consume({
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

    const auditResult: PaidAuditResult = { auditId: row.id, agentRunCount: 5, modelRunIds, report: fullReport };

    // SELECTIVE REVISION trigger: an independent QA gate reviews the finished audit; on a salvageable `revise`,
    // open a durable revision cycle over the audit's 5 nodes and PRESERVE the checkpoints (the cycle's consumer
    // clears only the reran nodes) so a re-run reuses the approved stages. Any other outcome → drop checkpoints.
    let qaOutcome: PaidAuditQaOutcome | undefined;
    if (deps.qaGate) qaOutcome = await deps.qaGate(auditResult, { workflowId: input.graphRunId ?? entityId, companyId: input.companyId ?? null });
    const openedRevision = Boolean(qaOutcome && !qaOutcome.released && qaOutcome.verdict === "revise" && (qaOutcome.failedStages?.length ?? 0) > 0 && input.graphRunId && deps.onQaRevise);
    if (openedRevision) {
      await deps.onQaRevise!({ graphRunId: input.graphRunId!, failedStages: qaOutcome!.failedStages ?? [], auditId: row.id, companyId: input.companyId ?? null, input }).catch((e) => {
        recordAudit({ eventType: "audit.paid_revision_trigger_failed", module: PAID_AUDIT_MODULE, entityType: "audit", entityId: row.id, actor, metadata: { error: e instanceof Error ? e.message : String(e) } }).catch(() => {});
      });
    } else if (input.graphRunId) {
      await clearGraphCheckpoints(input.graphRunId, { store: deps.checkpointStore });
    }

    return auditResult;
  } catch (error) {
    await recordAudit({ eventType: "audit.paid_failed", module: PAID_AUDIT_MODULE, entityType: "audit", entityId, actor, metadata: { reason: error instanceof Error ? error.message : String(error) } });
    throw error;
  }
}

export async function enqueuePaidAuditJob(input: RunPaidAuditInput & { idempotencyKey?: string }, deps: PaidAuditDeps = {}): Promise<unknown> {
  const enqueue = (deps as { enqueueJob?: (i: EnqueueJobInput) => Promise<unknown> }).enqueueJob ?? enqueueJob;
  return enqueue({ queue: PAID_AUDIT_QUEUE, type: PAID_AUDIT_JOB_TYPE, payload: { ...input }, priority: 5, maxAttempts: 1, idempotencyKey: input.idempotencyKey, linkedModule: PAID_AUDIT_MODULE, linkedEntityType: "audit", linkedEntityId: input.companyId ?? input.businessName });
}

export async function runPaidAuditJobHandler(job: JobRow, deps: PaidAuditDeps = {}): Promise<Record<string, unknown>> {
  const p = (job.payload ?? {}) as Partial<RunPaidAuditInput>;
  if (!p.businessName || !p.intakeNotes || !p.requestedBy) throw new Error("audit.paid job requires businessName, intakeNotes, requestedBy");
  const result = await runPaidAuditGraph(
    // A selective-revision rerun binds the PRESERVED graphRunId via the payload so the graph reuses the
    // preserved nodes' checkpoints; otherwise the job id is the stable per-run id.
    { businessName: p.businessName, industry: p.industry, intakeNotes: p.intakeNotes, freeAuditSummary: p.freeAuditSummary, companyId: p.companyId, opportunityId: p.opportunityId, requestedBy: p.requestedBy, graphRunId: p.graphRunId ?? job.id },
    deps,
  );
  return { auditId: result.auditId, agentRunCount: result.agentRunCount };
}
