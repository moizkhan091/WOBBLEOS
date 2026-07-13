import { describe, expect, it } from "vitest";
import {
  runOptimizerCycle,
  approveProposal,
  activateProposal,
  recordMonitoring,
  rollbackProposal,
  rejectProposal,
  type OptimizerStore,
  type EvidenceCollector,
  type Observation,
} from "@/lib/optimizer";

/** In-memory optimizer store (no IO). */
function makeStore() {
  const cycles = new Map<string, Record<string, unknown>>();
  const observations: Record<string, unknown>[] = [];
  const proposals = new Map<string, Record<string, unknown>>();
  const activations = new Map<string, Record<string, unknown>>();
  const monitoring: Record<string, unknown>[] = [];
  const rollbacks: Record<string, unknown>[] = [];
  const store: OptimizerStore = {
    insertCycle: async (r) => { cycles.set(String(r.id), r); },
    updateCycle: async (id, f) => { cycles.set(id, { ...cycles.get(id), ...f }); },
    insertObservation: async (r) => { observations.push(r); },
    insertProposal: async (r) => { proposals.set(String(r.id), r); },
    getProposal: async (id) => proposals.get(id) ?? null,
    updateProposal: async (id, f) => { const c = proposals.get(id); if (c) proposals.set(id, { ...c, ...f }); },
    listProposals: async (q) => [...proposals.values()].filter((p) => (q.status ? p.status === q.status : true)).slice(0, q.limit),
    listCycles: async (q) => [...cycles.values()].slice(0, q.limit),
    listObservations: async (cid) => observations.filter((o) => o.cycleId === cid),
    insertActivation: async (r) => { activations.set(String(r.id), r); },
    getActiveActivation: async (pid) => [...activations.values()].find((a) => a.proposalId === pid && a.status === "active") ?? null,
    updateActivation: async (id, f) => { const c = activations.get(id); if (c) activations.set(id, { ...c, ...f }); },
    insertMonitoring: async (r) => { monitoring.push(r); },
    insertRollbackEvent: async (r) => { rollbacks.push(r); },
  };
  return { store, cycles, observations, proposals, activations, monitoring, rollbacks };
}

const noAudit = async () => {};
const collector = (obs: Observation[]): EvidenceCollector => async () => obs;

describe("optimizer service — cycle + governance + rollback (no IO)", () => {
  it("a cycle observes, forms only well-evidenced opportunities, and never auto-approves", async () => {
    const { store, proposals } = makeStore();
    const collectors: EvidenceCollector[] = [collector([
      { signalType: "qa_failure", metricKey: "qa_pass_rate", metricValue: 0.5, sampleSize: 10, evidenceRef: {} },   // actionable
      { signalType: "provider_cost", metricKey: "cost_efficiency", metricValue: 0.99, sampleSize: 30, evidenceRef: {} }, // healthy → no opp
      { signalType: "dead_letter", metricKey: "handoff_delivery_health", metricValue: 0.3, sampleSize: 1, evidenceRef: {} }, // under-sampled → no opp
    ])];
    const res = await runOptimizerCycle({ trigger: "manual" }, { store, recordAudit: noAudit, collectors });
    expect(res.observations).toBe(3);
    expect(res.opportunities).toBe(1);
    const p = proposals.get(res.proposalIds[0])!;
    expect(p.status).toBe("proposed"); // never auto-approved
    expect(Number(p.historicalBaselineMetric)).toBe(0.5);
    expect(Number(p.historicalCandidateMetric)).toBe(0.75); // projected, > baseline
  });

  it("governance: approve needs STRONG evidence; activate needs approved; only path to active", async () => {
    const { store, proposals } = makeStore();
    const collectors: EvidenceCollector[] = [collector([{ signalType: "qa_failure", metricKey: "qa_pass_rate", metricValue: 0.4, sampleSize: 12, evidenceRef: {} }])];
    const res = await runOptimizerCycle({ trigger: "manual" }, { store, recordAudit: noAudit, collectors });
    const id = res.proposalIds[0];
    // cannot activate before approval
    expect((await activateProposal(id, { activatedBy: "Moiz" }, { store, recordAudit: noAudit })).ok).toBe(false);
    // approve (strong evidence: 12 samples, health 0.4 clearly below threshold) then activate
    expect((await approveProposal(id, { approvedBy: "Moiz" }, { store, recordAudit: noAudit })).ok).toBe(true);
    const act = await activateProposal(id, { activatedBy: "Moiz" }, { store, recordAudit: noAudit });
    expect(act.ok).toBe(true);
    expect(proposals.get(id)!.status).toBe("active");
  });

  it("the evidence gate is REAL (can fail): a thin or marginal opportunity cannot be approved", async () => {
    const { store } = makeStore();
    // Thin: too few samples.
    await store.insertProposal({ id: "p_thin", pattern: "p", hypothesis: "h", targetType: "parameter", evidence: [], status: "proposed", riskLevel: "low", estimatedValue: "1", estimatedCostCents: 0, version: 1, historicalBaselineMetric: "0.4", historicalCandidateMetric: "0.7", historicalSampleSize: 4 });
    const thin = await approveProposal("p_thin", { approvedBy: "Moiz" }, { store, recordAudit: noAudit });
    expect(thin.ok).toBe(false);
    expect(thin.error).toMatch(/insufficient evidence/);
    // Marginal: well-sampled but only just below the threshold.
    await store.insertProposal({ id: "p_marg", pattern: "p", hypothesis: "h", targetType: "parameter", evidence: [], status: "proposed", riskLevel: "low", estimatedValue: "1", estimatedCostCents: 0, version: 1, historicalBaselineMetric: "0.78", historicalCandidateMetric: "0.89", historicalSampleSize: 20 });
    const marg = await approveProposal("p_marg", { approvedBy: "Moiz" }, { store, recordAudit: noAudit });
    expect(marg.ok).toBe(false);
    expect(marg.error).toMatch(/marginal/);
  });

  it("monitoring below baseline auto-rolls-back; a rollback event is recorded", async () => {
    const { store, rollbacks, activations } = makeStore();
    const collectors: EvidenceCollector[] = [collector([{ signalType: "qa_failure", metricKey: "qa_pass_rate", metricValue: 0.5, sampleSize: 10, evidenceRef: {} }])];
    const res = await runOptimizerCycle({ trigger: "manual" }, { store, recordAudit: noAudit, collectors });
    const id = res.proposalIds[0];
    await approveProposal(id, { approvedBy: "Moiz" }, { store, recordAudit: noAudit });
    await activateProposal(id, { activatedBy: "Moiz" }, { store, recordAudit: noAudit });
    const above = await recordMonitoring(id, { measuredMetric: 0.7 }, { store, recordAudit: noAudit });
    expect(above.degraded).toBe(false);
    const below = await recordMonitoring(id, { measuredMetric: 0.3, autoRollback: true }, { store, recordAudit: noAudit });
    expect(below.degraded).toBe(true);
    expect(below.rolledBack).toBe(true);
    expect(rollbacks.length).toBe(1);
    expect([...activations.values()][0].status).toBe("rolled_back");
  });

  it("a founder can reject a proposed proposal, and cannot roll back a non-active one", async () => {
    const { store } = makeStore();
    await store.insertProposal({ id: "p1", pattern: "p", hypothesis: "h", targetType: "parameter", evidence: [], status: "proposed", riskLevel: "low", estimatedValue: "1", estimatedCostCents: 0, version: 1 });
    expect((await rejectProposal("p1", { rejectedBy: "Moiz", reason: "no" }, { store, recordAudit: noAudit })).ok).toBe(true);
    expect((await rollbackProposal("p1", { rolledBackBy: "Moiz", reason: "x" }, { store, recordAudit: noAudit })).ok).toBe(false);
  });
});
