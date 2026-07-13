import { loadDotEnv } from "./load-env";
loadDotEnv(); // must precede the first `@/db` import so getPool() sees DATABASE_URL.

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { and, eq, inArray, like } from "drizzle-orm";
import { getDb, closeDb, schema } from "@/db";
import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import { buildHandoffRow, type HandoffRow, type HandoffDeliveryState } from "@/lib/domain/handoff-delivery";
import { defaultStore as handoffStore } from "@/lib/handoff";
import { buildEscalationRow } from "@/lib/domain/escalation";
import { defaultStore as escalationStore } from "@/lib/departments/escalation";
import { reserveBudget } from "@/lib/departments/budget";
import { recordProviderUsage } from "@/lib/provider-usage";
import { seedDepartments } from "@/lib/departments/seed";
import { buildCompanyRow, buildOpportunityRow } from "@/lib/domain/crm";
import { buildProposalRow } from "@/lib/domain/proposal";
import { AGENTS, DECISIONS, E2E_DEPARTMENT, E2E_WORKSPACE, IDS, PROPOSAL, PROVIDER_USAGE_REQ_ID, WF } from "./constants";

/** Fixed graph-run ids for the selective-revision fixtures (cleaned + reseeded every run). */
const E2E_REVISION_RUN = "e2e_rev_run";
const E2E_AUDIT_REVISION_RUN = "e2e_audit_rev_run";
const E2E_PROPOSAL_AUDIT_ID = "e2e_prop_audit";

/**
 * Deterministic E2E fixture builder. Every row is written through the REAL domain builders + stores the
 * app uses in production (buildHandoffEnvelope → buildHandoffRow → handoff store; buildEscalationRow →
 * escalation store; reserveBudget; recordProviderUsage) so the browser gate exercises the true code
 * paths — the escalation actions genuinely redrive/cancel these handoffs, and the effects read back.
 *
 * Idempotent + repeatable: `cleanupE2E()` deletes the fixed-id / E2E-workflow rows, then `seedE2E()`
 * re-inserts them, so the suite can run over and over against the same (isolated) workspace.
 *
 *   tsx e2e/fixtures/seed.ts          # seed
 *   tsx e2e/fixtures/seed.ts cleanup  # remove all E2E fixtures
 */

function e2eHandoff(opts: { id: string; workflowId: string; sourceAgent: string; destinationAgent: string; state: HandoffDeliveryState }): HandoffRow {
  const now = new Date();
  const envelope = buildHandoffEnvelope(
    {
      workflowId: opts.workflowId,
      department: E2E_DEPARTMENT,
      sourceAgent: opts.sourceAgent,
      destinationAgent: opts.destinationAgent,
      objective: "E2E gate fixture handoff",
      requestedAction: "noop (seeded for the browser gate)",
      expectedOutputSchema: "opportunity_set",
      confidence: 0.8,
      clientWorkspaceId: E2E_WORKSPACE,
      authorizedMemoryScopes: ["company"],
    },
    { now, taskId: `${opts.workflowId}_task` },
  );
  const row = buildHandoffRow(envelope, { now, id: opts.id });
  if (opts.state === "dead_lettered") {
    // Retriable/resumable via redrive (dead_lettered → delivered), exactly like a real exhausted handoff.
    return { ...row, deliveryState: "dead_lettered", retryCount: row.maxRetries, deadLetteredAt: now, failureReason: "e2e: automatic retries exhausted → dead-lettered" };
  }
  return { ...row, deliveryState: opts.state };
}

export async function cleanupE2E(): Promise<void> {
  const db = getDb();
  const wfIds = Object.values(WF);
  await db.delete(schema.providerUsage).where(eq(schema.providerUsage.providerRequestId, PROVIDER_USAGE_REQ_ID));
  await db.delete(schema.budgetReservations).where(inArray(schema.budgetReservations.workflowId, wfIds));
  await db.delete(schema.escalations).where(inArray(schema.escalations.id, [IDS.escResume, IDS.escTerminate, IDS.escDismiss]));
  // Also clear any escalation the scheduler tick auto-raised for the seeded dead-lettered handoffs (the
  // proposal-accept spec drives real ticks) — keyed by the fixture workflow ids.
  await db.delete(schema.escalations).where(inArray(schema.escalations.workflowId, wfIds));
  await db.delete(schema.handoffs).where(inArray(schema.handoffs.id, [IDS.handoffRetry, IDS.handoffCancel, IDS.handoffResume, IDS.handoffTerminate]));
  // Proposal-accept fixture + everything its autonomous chain produces (keyed by the opportunity id).
  await db.delete(schema.budgetReservations).where(eq(schema.budgetReservations.workflowId, PROPOSAL.opportunityId));
  await db.delete(schema.escalations).where(eq(schema.escalations.workflowId, PROPOSAL.opportunityId));
  await db.delete(schema.handoffs).where(eq(schema.handoffs.workflowId, PROPOSAL.opportunityId));
  await db.delete(schema.tasks).where(eq(schema.tasks.opportunityId, PROPOSAL.opportunityId));
  await db.delete(schema.projects).where(eq(schema.projects.opportunityId, PROPOSAL.opportunityId));
  await db.delete(schema.invoices).where(eq(schema.invoices.opportunityId, PROPOSAL.opportunityId));
  await db.delete(schema.proposals).where(eq(schema.proposals.id, PROPOSAL.proposalId));
  await db.delete(schema.crmOpportunities).where(eq(schema.crmOpportunities.id, PROPOSAL.opportunityId));
  await db.delete(schema.crmCompanies).where(eq(schema.crmCompanies.id, PROPOSAL.companyId));
  // Context OS fixture scope (the context-os browser spec creates + approves assertions here).
  await db.delete(schema.contextRetrievals).where(and(eq(schema.contextRetrievals.scopeType, "company"), eq(schema.contextRetrievals.scopeId, "e2e_ctx")));
  await db.delete(schema.contextAssertions).where(and(eq(schema.contextAssertions.scopeType, "company"), eq(schema.contextAssertions.scopeId, "e2e_ctx")));
  await db.delete(schema.contextSources).where(and(eq(schema.contextSources.scopeType, "company"), eq(schema.contextSources.scopeId, "e2e_ctx")));
  // Earned-autonomy policies the autonomy browser spec grants (isolated test category prefix).
  await db.delete(schema.autonomyPolicies).where(like(schema.autonomyPolicies.category, "e2e.autonomy.%"));
  // QA reviews the Phase 4 QA-gate browser spec runs (isolated workflow-id prefix).
  await db.delete(schema.qaReviews).where(like(schema.qaReviews.workflowId, "e2e_qa_%"));
  // Selective-revision fixtures (content + audit + proposal): cycle + components + version snapshots + runs.
  // Proposal cycles are keyed by the (dynamic) proposal id, so collect them by kind+tenant as well.
  const graphCycles = await db.select({ id: schema.revisionCycles.id }).from(schema.revisionCycles).where(inArray(schema.revisionCycles.artifactRef, [E2E_REVISION_RUN, E2E_AUDIT_REVISION_RUN]));
  const propCycles = await db.select({ id: schema.revisionCycles.id }).from(schema.revisionCycles).where(and(eq(schema.revisionCycles.artifactKind, "proposal"), eq(schema.revisionCycles.clientId, E2E_WORKSPACE)));
  const ids = [...graphCycles, ...propCycles].map((c) => c.id);
  if (ids.length) {
    await db.delete(schema.revisionComponentVersions).where(inArray(schema.revisionComponentVersions.cycleId, ids));
    await db.delete(schema.revisionComponents).where(inArray(schema.revisionComponents.cycleId, ids));
    await db.delete(schema.revisionCycles).where(inArray(schema.revisionCycles.id, ids));
  }
  await db.delete(schema.graphCheckpoints).where(inArray(schema.graphCheckpoints.graphRunId, [E2E_REVISION_RUN, E2E_AUDIT_REVISION_RUN]));
  await db.delete(schema.proposals).where(eq(schema.proposals.auditId, E2E_PROPOSAL_AUDIT_ID));
  await db.delete(schema.audits).where(eq(schema.audits.id, E2E_PROPOSAL_AUDIT_ID));
  // The content.graph job the revision `rerun` action re-enqueues (bound to the preserved graphRunId).
  await db.delete(schema.jobs).where(like(schema.jobs.idempotencyKey, "revision_rerun:%"));
}

export async function seedE2E(): Promise<void> {
  // The department must exist for the grid + budget/kpi endpoints (idempotent upsert — safe every run).
  // Skippable via E2E_FIXTURES_ONLY for the per-test reseed (departments already exist from global setup),
  // which keeps the reseed fast and light on the DB.
  if (process.env.E2E_FIXTURES_ONLY !== "1") await seedDepartments({ recordAudit: async () => {} });
  await cleanupE2E();

  const db = getDb();
  const hs = handoffStore();
  // 1) retriable handoff — dead-lettered ⇒ the UI offers "retry" (redrive → delivered).
  await hs.insert(e2eHandoff({ id: IDS.handoffRetry, workflowId: WF.retry, sourceAgent: AGENTS.retrySrc, destinationAgent: AGENTS.retryDst, state: "dead_lettered" }));
  // 2) cancellable handoff — delivered ⇒ the UI offers "cancel" (→ cancelled).
  await hs.insert(e2eHandoff({ id: IDS.handoffCancel, workflowId: WF.cancel, sourceAgent: AGENTS.cancelSrc, destinationAgent: AGENTS.cancelDst, state: "delivered" }));
  // 3) handoff linked to the RESUME escalation — dead-lettered ⇒ resume redrives it back to delivered.
  await hs.insert(e2eHandoff({ id: IDS.handoffResume, workflowId: WF.resume, sourceAgent: AGENTS.resumeSrc, destinationAgent: AGENTS.resumeDst, state: "dead_lettered" }));
  // 4) handoff in the TERMINATE escalation's workflow — delivered ⇒ terminate cancels it.
  await hs.insert(e2eHandoff({ id: IDS.handoffTerminate, workflowId: WF.terminate, sourceAgent: AGENTS.terminateSrc, destinationAgent: AGENTS.terminateDst, state: "delivered" }));

  const es = escalationStore();
  const now = new Date();
  await es.insert(
    buildEscalationRow(
      { departmentSlug: E2E_DEPARTMENT, workflowId: WF.resume, reason: "dead_lettered", severity: "high", handoffId: IDS.handoffResume, requiredDecision: DECISIONS.resume },
      { id: IDS.escResume, now },
    ),
  );
  await es.insert(
    buildEscalationRow(
      { departmentSlug: E2E_DEPARTMENT, workflowId: WF.terminate, reason: "sla_breach", severity: "medium", handoffId: IDS.handoffTerminate, requiredDecision: DECISIONS.terminate },
      { id: IDS.escTerminate, now },
    ),
  );
  await es.insert(
    buildEscalationRow(
      { departmentSlug: E2E_DEPARTMENT, workflowId: WF.dismiss, reason: "other", severity: "low", requiredDecision: DECISIONS.dismiss },
      { id: IDS.escDismiss, now },
    ),
  );

  // Proposal-accept autonomous-chain fixture: a real company + opportunity + a `sent` proposal linked to
  // the opportunity. Accepting the proposal (in the browser gate) atomically emits the Sales/CRM outbox
  // handoff; the consumer chain then drives won → invoice → project. Built through the REAL domain builders.
  await db.insert(schema.crmCompanies).values(buildCompanyRow({ name: PROPOSAL.businessName }, { id: PROPOSAL.companyId }) as typeof schema.crmCompanies.$inferInsert);
  await db.insert(schema.crmOpportunities).values(buildOpportunityRow({ name: `${PROPOSAL.businessName} engagement`, companyId: PROPOSAL.companyId, stage: "proposal_sent", valueCents: PROPOSAL.valueCents, serviceInterest: ["ai_automation"] }, { id: PROPOSAL.opportunityId }) as typeof schema.crmOpportunities.$inferInsert);
  const proposalRow = buildProposalRow({ title: PROPOSAL.businessName, companyId: PROPOSAL.companyId, opportunityId: PROPOSAL.opportunityId, pricingCents: PROPOSAL.valueCents, scope: "E2E proposal scope", createdBy: "Moiz" }, { id: PROPOSAL.proposalId });
  await db.insert(schema.proposals).values({ ...proposalRow, status: "sent" } as typeof schema.proposals.$inferInsert);

  // Real budget usage + a real, provider-reported (verified) usage row so the budget/KPI strip renders
  // non-zero TRUTH, not zeros. This is what the budget + provider-usage assertions read back.
  await reserveBudget({ departmentSlug: E2E_DEPARTMENT, workflowId: WF.budget, taskId: `${WF.budget}_task`, estimatedCents: 500, estimatedTokens: 1000, provider: "openrouter", reason: "e2e budget fixture" });
  await recordProviderUsage({
    providerRequestId: PROVIDER_USAGE_REQ_ID,
    provider: "openrouter",
    model: "openai/gpt-4o-mini",
    inputTokens: 1000,
    outputTokens: 500,
    providerReportedCostUsd: 0.02, // present ⇒ verificationStatus "verified", estimationStatus "actual"
    latencyMs: 850,
    context: { departmentSlug: E2E_DEPARTMENT, workflowId: WF.budget, taskId: `${WF.budget}_task`, clientWorkspaceId: E2E_WORKSPACE, role: "audit_report", module: "departments" },
  });

  // Selective-revision fixture: a real content-graph revision cycle (opened exactly as the production `revise`
  // trigger does) bound to a checkpointed run, so the browser spec can inspect the plan + drive rerun/rollback.
  const cpStore = (await import("@/lib/graph-checkpoint")).defaultCheckpointStore(db);
  const { buildGraphCheckpointRow } = await import("@/lib/domain/graph-checkpoint");
  const REV_NODES = ["strategy", "research", "draft", "revise", "scoring"];
  for (let i = 0; i < REV_NODES.length; i++) {
    await cpStore.upsertCheckpoint(buildGraphCheckpointRow({ graphRunId: E2E_REVISION_RUN, graph: "content_graph", nodeSlug: REV_NODES[i], nodeIndex: i, schemaVersion: 1, outputText: `${REV_NODES[i]}-out` }));
  }
  const { openRevisionCycle } = await import("@/lib/selective-revision");
  await openRevisionCycle({
    artifactKind: "content_graph", artifactRef: E2E_REVISION_RUN, graphRunId: E2E_REVISION_RUN, triggeredBy: "qa_gate:content",
    components: [
      { key: "strategy", kind: "graph_node", producedBy: "content_strategist", dependsOn: [] },
      { key: "research", kind: "graph_node", producedBy: "content_researcher", dependsOn: ["strategy"] },
      { key: "draft", kind: "graph_node", producedBy: "content_copywriter", dependsOn: ["research"], status: "failed" },
      { key: "revise", kind: "graph_node", producedBy: "content_editor", dependsOn: ["draft"] },
      { key: "scoring", kind: "graph_node", producedBy: "content_scorer", dependsOn: ["revise"] },
    ],
    failedComponents: ["draft"], clientId: E2E_WORKSPACE,
    // Re-enqueue context so the browser `rerun` action exercises the real re-enqueue-under-preserved-graphRunId hop.
    reenqueue: { producer: "content.graph", contentTrackId: "track_wobble_company", objective: "e2e selective revision", requestedBy: "Moiz" },
  }, { db, recordAudit: async () => {} });

  // Selective-revision fixture for the AUDIT-REPORT artifact (paid_audit graph, 5 nodes, `opportunity` failed).
  const AUDIT_NODES = ["discovery", "opportunity", "prioritization", "roadmap", "report"];
  for (let i = 0; i < AUDIT_NODES.length; i++) {
    await cpStore.upsertCheckpoint(buildGraphCheckpointRow({ graphRunId: E2E_AUDIT_REVISION_RUN, graph: "paid_audit", nodeSlug: AUDIT_NODES[i], nodeIndex: i, schemaVersion: 1, outputText: `${AUDIT_NODES[i]}-out` }));
  }
  await openRevisionCycle({
    artifactKind: "paid_audit", artifactRef: E2E_AUDIT_REVISION_RUN, graphRunId: E2E_AUDIT_REVISION_RUN, triggeredBy: "qa_gate:paid_audit",
    components: AUDIT_NODES.map((k, i) => ({ key: k, kind: "graph_node", producedBy: `audit_${k}`, dependsOn: i === 0 ? [] : [AUDIT_NODES[i - 1]], status: k === "opportunity" ? "failed" : "approved" })),
    failedComponents: ["opportunity"], clientId: E2E_WORKSPACE,
    reenqueue: { producer: "audit.paid", businessName: "E2E Audit Co", intakeNotes: "misses calls", requestedBy: "Moiz" },
  }, { db, recordAudit: async () => {} });

  // Selective-revision fixture for the PROPOSAL artifact (no graph checkpoints; the rerun re-assembles a NEW
  // proposal REUSING the persisted synthesis when only `assemble` failed). A real audit + proposal are seeded so
  // the founder `rerun` action's re-assemble runs against real rows.
  await db.insert(schema.audits).values({ id: E2E_PROPOSAL_AUDIT_ID, kind: "paid", companyId: E2E_WORKSPACE, businessName: "E2E Proposal Co", status: "complete", report: { opportunities: [{ title: "Text-back", description: "auto-text" }], roadmap: [{ title: "P1", months: "1-2", focus: "leaks" }], roi: { estimatedImplementationCents: 4500000 }, executiveSummary: "Recover leads." }, createdBy: "Moiz" } as typeof schema.audits.$inferInsert);
  const { createProposalFromAudit } = await import("@/lib/proposals");
  const { openProposalRevision } = await import("@/lib/proposals/revision");
  const seededProposal = await createProposalFromAudit(E2E_PROPOSAL_AUDIT_ID, { createdBy: "Moiz", enrichment: { technicalSolution: "S".repeat(200), integrationDesign: "I".repeat(80), roiAssumptions: "R".repeat(50), risks: ["adoption"] } }, {});
  if (seededProposal) {
    await openProposalRevision({ proposalId: seededProposal.id, auditId: E2E_PROPOSAL_AUDIT_ID, failedStages: ["assemble"], companyId: E2E_WORKSPACE, requestedBy: "Moiz", workflowId: "e2e_prop_wf" }, { db, recordAudit: async () => {} });
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "seed";
  try {
    if (mode === "cleanup") {
      await cleanupE2E();
      console.log("e2e_seed=cleaned");
    } else {
      await seedE2E();
      console.log("e2e_seed=ok");
    }
  } catch (err) {
    console.error("e2e_seed=failed");
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

// Only auto-run when invoked directly (`tsx e2e/fixtures/seed.ts …`) — importing the fns must not run it.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main();
}
