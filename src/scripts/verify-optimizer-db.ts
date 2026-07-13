/**
 * Real-DB proof (Postgres) that the Controlled Dream / Optimizer is OPERATIONAL and GOVERNED:
 *   OBSERVE real signals → form EVIDENCE-backed opportunities (only below-threshold + well-sampled) → HISTORICAL
 *   test → founder APPROVAL (requires a passing test) → versioned ACTIVATION (the ONLY path to `active`) → MONITOR
 *   vs baseline → ROLLBACK when degraded. A cycle NEVER auto-approves/activates/changes anything. The real
 *   collectors read real production tables (qa_reviews, revision_cycles, handoffs, provider_usage).
 *
 * ISOLATED + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-optimizer-db.ts
 */
import { inArray, eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { optimizerCycles, optimizerObservations, improvementProposals, optimizerActivations, optimizerMonitoring, optimizerRollbackEvents, auditLogs, qaReviews } from "@/db/schema";
import { runOptimizerCycle, approveProposal, rejectProposal, activateProposal, recordMonitoring, rollbackProposal, listObservations, defaultStore, DEFAULT_COLLECTORS, type EvidenceCollector, type Observation } from "@/lib/optimizer";
import { newId } from "@/lib/ids";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const store = defaultStore(db);
  const cycleIds: string[] = [];
  const proposalIds: string[] = [];
  const qaIds: string[] = [];

  // Deterministic injected collectors: one actionable (below threshold, well-sampled), one healthy (no opportunity),
  // one below-threshold but UNDER-sampled (no opportunity — never fabricate one from thin evidence).
  const injected: EvidenceCollector[] = [async (): Promise<Observation[]> => [
    { signalType: "qa_failure", metricKey: "qa_pass_rate", metricValue: 0.5, sampleSize: 10, evidenceRef: { total: 10, passed: 5 } },
    { signalType: "provider_cost", metricKey: "cost_efficiency", metricValue: 0.95, sampleSize: 20, evidenceRef: {} },
    { signalType: "dead_letter", metricKey: "handoff_delivery_health", metricValue: 0.4, sampleSize: 1, evidenceRef: {} },
  ]];

  try {
    // ---- CYCLE: observe → propose (evidence-backed, historically-tested); never auto-approve/activate ----
    const cyc = await runOptimizerCycle({ trigger: "manual" }, { store, collectors: injected });
    cycleIds.push(cyc.cycleId);
    proposalIds.push(...cyc.proposalIds);
    assert(cyc.observations === 3, "the cycle recorded ALL 3 observations (real evidence, persisted)");
    assert(cyc.opportunities === 1, "only the below-threshold, well-sampled signal became an opportunity (healthy + under-sampled signals did NOT — never fabricated)");
    const obs = await listObservations(cyc.cycleId, { store });
    assert(obs.length === 3, "observations are durably persisted + inspectable by the founder");
    const prop = await store.getProposal(cyc.proposalIds[0]);
    assert(!!prop && prop.status === "proposed", "the opportunity is PROPOSED — the cycle NEVER auto-approves (no silent change)");
    assert(Number(prop!.historicalBaselineMetric) === 0.5 && Number(prop!.historicalCandidateMetric) === 0.75, "the HISTORICAL TEST is recorded: baseline 0.50 → projected candidate 0.75 (a passing, evidence-backed estimate)");
    assert(Array.isArray(prop!.evidence) && (prop!.evidence as string[]).length === 1, "the proposal cites its evidence (the observation id) — auditable basis");

    // ---- GOVERNANCE: approval requires a PASSING historical test; activation only from approved ----
    // A proposal whose historical test FAILS (candidate <= baseline) can NOT be approved.
    const failId = newId("optprop");
    await store.insertProposal({ id: failId, cycleId: cyc.cycleId, pattern: "p", hypothesis: "h", targetType: "parameter", evidence: [], estimatedValue: "5", estimatedCostCents: 0, riskLevel: "low", status: "proposed", version: 1, historicalBaselineMetric: "0.8", historicalCandidateMetric: "0.7", historicalSampleSize: 10, createdAt: new Date(), updatedAt: new Date() });
    proposalIds.push(failId);
    const badApprove = await approveProposal(failId, { approvedBy: "Moiz" }, { store });
    assert(!badApprove.ok && /historical test/.test(badApprove.error ?? ""), "GOVERNANCE: a proposal with a FAILING historical test CANNOT be approved");

    // Cannot activate a merely-proposed (not-yet-approved) proposal.
    const earlyActivate = await activateProposal(cyc.proposalIds[0], { activatedBy: "Moiz" }, { store });
    assert(!earlyActivate.ok && /must be approved/.test(earlyActivate.error ?? ""), "GOVERNANCE: a proposed (un-approved) proposal CANNOT be activated (the only path to active is approve → activate)");

    // Approve the good one (passing test) → approved.
    const approve = await approveProposal(cyc.proposalIds[0], { approvedBy: "Moiz" }, { store });
    assert(approve.ok, "the good proposal (passing historical test) is APPROVED by the founder");
    const reApprove = await approveProposal(cyc.proposalIds[0], { approvedBy: "Moiz" }, { store });
    assert(!reApprove.ok, "GOVERNANCE: re-approving a non-proposed proposal is refused (idempotent guard)");

    // Activate → the ONLY path to active; writes an activation row pinned to the baseline; proposal → active.
    const activate = await activateProposal(cyc.proposalIds[0], { activatedBy: "Moiz", config: { note: "v1" } }, { store });
    assert(activate.ok && !!activate.activationId, "the approved proposal is ACTIVATED (versioned activation row created)");
    const activeProp = await store.getProposal(cyc.proposalIds[0]);
    assert(activeProp!.status === "active", "the proposal is now ACTIVE (proposed → approved → active, founder-driven at every step)");
    const activation = await store.getActiveActivation(cyc.proposalIds[0]);
    assert(!!activation && Number(activation.baselineMetric) === 0.5, "the activation is pinned to the baseline (0.50) it must beat");

    // ---- MONITOR vs baseline → ROLLBACK when degraded ----
    const good = await recordMonitoring(cyc.proposalIds[0], { measuredMetric: 0.6, sampleSize: 8 }, { store });
    assert(good.ok && good.degraded === false, "MONITOR: a measured metric ABOVE baseline is not degraded (no rollback)");
    const bad = await recordMonitoring(cyc.proposalIds[0], { measuredMetric: 0.4, sampleSize: 8, autoRollback: true }, { store });
    assert(bad.ok && bad.degraded === true && bad.rolledBack === true, "MONITOR: a measured metric BELOW baseline is degraded → AUTO-ROLLED-BACK");
    const rolled = await store.getProposal(cyc.proposalIds[0]);
    assert(rolled!.status === "rolled_back", "the degraded improvement is ROLLED BACK (no degrading change persists)");
    const rbEvents = await db.select({ id: optimizerRollbackEvents.id }).from(optimizerRollbackEvents).where(eq(optimizerRollbackEvents.proposalId, cyc.proposalIds[0]));
    assert(rbEvents.length === 1, "a durable, audited ROLLBACK EVENT is recorded");
    const deadActivation = await store.getActiveActivation(cyc.proposalIds[0]);
    assert(!deadActivation, "the activation is no longer active after rollback");

    // reject flow.
    const rej = await rejectProposal(failId, { rejectedBy: "Moiz", reason: "not worth it" }, { store });
    assert(rej.ok, "a proposed proposal can be REJECTED by the founder");

    // Audit trail exists for the governed lifecycle.
    const events = (await db.select({ e: auditLogs.eventType }).from(auditLogs).where(eq(auditLogs.entityId, cyc.proposalIds[0]))).map((r) => r.e);
    assert(["optimizer.opportunity_proposed", "optimizer.proposal_approved", "optimizer.proposal_activated", "optimizer.proposal_rolled_back"].every((e) => events.includes(e)), "the full governed lifecycle is AUDITED (proposed → approved → activated → rolled_back)");

    // ---- REAL COLLECTORS read REAL tables: seed a qa_reviews row, run a DEFAULT-collector cycle, see an observation ----
    const qaId = `optqa_${uniq}`;
    await db.insert(qaReviews).values({ id: qaId, boardSlug: "optimizer_probe", department: "optimizer_probe", artifactSchema: "probe", verdict: "fail", score: "10", independent: true, criteria: [], evidence: {}, summary: "probe", workflowId: `opt_probe_${uniq}`, authorAgentSlug: "x", reviewerAgentSlug: "y", createdAt: new Date() } as never);
    qaIds.push(qaId);
    const realCyc = await runOptimizerCycle({ trigger: "manual" }, { store, collectors: DEFAULT_COLLECTORS });
    cycleIds.push(realCyc.cycleId);
    proposalIds.push(...realCyc.proposalIds);
    const realObs = await listObservations(realCyc.cycleId, { store });
    const qaObs = realObs.find((o) => o.signalType === "qa_failure");
    assert(!!qaObs && Number(qaObs.sampleSize) >= 1, "REAL collector: the qa_failure collector read the real qa_reviews table (sampleSize ≥ 1) — evidence is real, not fabricated");

    console.log("\n✅ optimizer DB proof passed");
  } finally {
    if (proposalIds.length) {
      await db.delete(optimizerMonitoring).where(inArray(optimizerMonitoring.proposalId, proposalIds));
      await db.delete(optimizerRollbackEvents).where(inArray(optimizerRollbackEvents.proposalId, proposalIds));
      await db.delete(optimizerActivations).where(inArray(optimizerActivations.proposalId, proposalIds));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, proposalIds));
      await db.delete(improvementProposals).where(inArray(improvementProposals.id, proposalIds));
    }
    if (cycleIds.length) {
      await db.delete(optimizerObservations).where(inArray(optimizerObservations.cycleId, cycleIds));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, cycleIds));
      await db.delete(optimizerCycles).where(inArray(optimizerCycles.id, cycleIds));
    }
    if (qaIds.length) await db.delete(qaReviews).where(inArray(qaReviews.id, qaIds));
    await closeDb();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
