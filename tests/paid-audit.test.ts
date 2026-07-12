import { describe, expect, it } from "vitest";
import { assemblePaidAuditReport, discoverySchema, opportunitySchema, prioritizationSchema, roadmapSchema, reportSchema, parseJsonObject } from "@/lib/domain/paid-audit-graph";
import { runPaidAuditGraph, type PaidAuditRow } from "@/lib/paid-audit-graph";
import { buildGraphCheckpointRow, type GraphCheckpointRow } from "@/lib/domain/graph-checkpoint";
import type { GraphCheckpointStore } from "@/lib/graph-checkpoint";

function makeCheckpointStore() {
  const rows = new Map<string, GraphCheckpointRow>();
  const store: GraphCheckpointStore = {
    listCheckpoints: async (rid) => [...rows.values()].filter((r) => r.graphRunId === rid),
    upsertCheckpoint: async (row) => { rows.set(`${row.graphRunId}::${row.nodeSlug}`, row); },
    deleteCheckpoints: async (rid) => { let n = 0; for (const [k, r] of rows) if (r.graphRunId === rid) { rows.delete(k); n += 1; } return n; },
    deleteExpiredCheckpoints: async () => 0,
  };
  return { store, rows };
}

const now = new Date("2026-07-09T12:00:00Z");

describe("paid audit — domain", () => {
  it("parses node JSON strictly (and rejects junk)", () => {
    expect(parseJsonObject('{"situation":"x","acquisition":[],"delivery":[],"support":[],"bottlenecks":[],"keyMetrics":[]}', discoverySchema)).not.toBeNull();
    expect(parseJsonObject("not json", opportunitySchema)).toBeNull();
  });

  it("assembles a full, deep report from node outputs", () => {
    const discovery = discoverySchema.parse({ situation: "Manual, leaky front desk.", acquisition: [{ step: "Meta ads", pain: "no tracking" }], delivery: [{ step: "manual booking" }], support: [{ step: "phone" }], bottlenecks: [{ area: "front desk", pain: "missed calls", rootCause: "no after-hours", severity: "high", businessImpact: "lost patients" }], keyMetrics: [{ label: "monthly leads", value: "80" }] });
    const opportunities = opportunitySchema.parse({ opportunities: [{ title: "Missed-call text-back", service: "missed-call-text-back-system", description: "auto text", impact: "high", difficulty: "low", kpis: ["recovered calls"] }] });
    const prioritization = prioritizationSchema.parse({ quickWins: ["Missed-call text-back"], bigSwings: [], rationale: "fast ROI" });
    const roadmap = roadmapSchema.parse({ phases: [{ title: "Phase 1", months: "Month 1-3", focus: "quick wins", objectives: ["stop leaks"], deliverables: ["text-back live"], items: ["Missed-call text-back"], expectedOutcome: "fewer missed leads" }] });
    const report = reportSchema.parse({ executiveSummary: "Acme leaks leads at the front desk.", situationSummary: "Manual ops.", roi: { estimatedMonthlyUpsideCents: 1500000, estimatedImplementationCents: 4500000, paybackMonths: 3 }, risks: [{ risk: "adoption", mitigation: "training" }], successMetrics: ["response time"], recommendedTechStack: ["Wobble OS"], nextSteps: ["kickoff"] });

    const full = assemblePaidAuditReport({ businessName: "Acme", industry: "dental", discovery, opportunities, prioritization, roadmap, report });
    expect(full.opportunities).toHaveLength(1);
    expect(full.roadmap[0].deliverables).toContain("text-back live");
    expect(full.risks[0].risk).toBe("adoption");
    expect(full.successMetrics).toContain("response time");
    expect(full.recommendedTechStack).toContain("Wobble OS");
    expect(full.nextSteps).toContain("kickoff");
    expect(full.roi?.estimatedMonthlyUpsideCents).toBe(1500000);
    expect(full.serviceCount).toBe(1);
  });
});

describe("paid audit — orchestrator (mocked agents, no LLM spend)", () => {
  it("runs all 5 nodes, assembles + persists a deep audit", async () => {
    const canned: Record<string, string> = {
      audit_discovery: JSON.stringify({ situation: "3-location dental clinic running manually.", acquisition: [{ step: "Meta ads", detail: "untracked", tool: "Meta", pain: "no attribution" }], delivery: [{ step: "spreadsheet booking", pain: "manual" }], support: [{ step: "phone 9-5", pain: "misses after-hours" }], bottlenecks: [{ area: "front desk", pain: "misses calls after 5pm", rootCause: "no after-hours cover", severity: "high", businessImpact: "lost patients" }], keyMetrics: [{ label: "staff", value: "12" }] }),
      audit_opportunity: JSON.stringify({ opportunities: [
        { title: "Missed-call text-back", area: "front desk", service: "missed-call-text-back-system", description: "auto-text missed calls", howItWorks: "webhook on missed call", expectedOutcome: "recover 30% of after-hours leads", impact: "high", difficulty: "low", monthlyHoursSaved: 20, estimatedMonthlyValueCents: 900000, kpis: ["recovered calls", "response time"] },
        { title: "AI receptionist", area: "front desk", service: "ai-receptionist-system", description: "24/7 answering", howItWorks: "voice agent", expectedOutcome: "never miss a call", impact: "high", difficulty: "high", kpis: ["answer rate"] },
      ] }),
      audit_prioritization: JSON.stringify({ quickWins: ["Missed-call text-back"], bigSwings: ["AI receptionist"], rationale: "text-back is instant ROI" }),
      audit_roadmap: JSON.stringify({ phases: [
        { title: "Phase 1 — Quick wins", months: "Month 1-2", focus: "stop the leaks", objectives: ["recover after-hours leads"], deliverables: ["text-back live", "review asks"], items: ["Missed-call text-back"], expectedOutcome: "fewer missed leads" },
        { title: "Phase 2 — Front desk", months: "Month 3-6", focus: "24/7 cover", objectives: ["full coverage"], deliverables: ["receptionist live"], items: ["AI receptionist"], expectedOutcome: "0 missed calls" },
      ] }),
      audit_report: JSON.stringify({ executiveSummary: "Acme loses ~30% of after-hours leads; a text-back + receptionist recovers most.", situationSummary: "Manual, 3 locations.", roi: { estimatedMonthlyUpsideCents: 1800000, estimatedImplementationCents: 4500000, paybackMonths: 3, breakdown: [{ area: "front desk", monthlyValueCents: 1800000 }] }, risks: [{ risk: "staff adoption", mitigation: "training + phased rollout" }], successMetrics: ["response time < 60s", "answer rate > 95%"], recommendedTechStack: ["Wobble OS", "Zernio"], nextSteps: ["sign SOW", "week-1 kickoff"] }),
    };
    let agentRuns = 0;
    const persisted: PaidAuditRow[] = [];

    const result = await runPaidAuditGraph(
      { businessName: "Acme Dental", industry: "dental", intakeNotes: "misses calls after 5pm, books by hand.", requestedBy: "Moiz", companyId: "co_1" },
      {
        retrieveBrain: async () => [{ title: "offers", content: "AI receptionists..." }],
        runNode: async (input) => { const text = canned[input.role]; if (!text) throw new Error(`no canned output for role ${input.role}`); return { text, runId: `run_${input.role}` }; },
        recordAgentRun: async () => { agentRuns += 1; },
        recordAudit: async () => {},
        persistAudit: async (row) => { persisted.push(row); },
        now,
      },
    );

    expect(result.agentRunCount).toBe(5);
    expect(agentRuns).toBe(5);
    expect(persisted).toHaveLength(1);
    const rep = persisted[0].report;
    expect(rep.opportunities).toHaveLength(2);
    expect(rep.opportunities[0].kpis).toContain("recovered calls");
    expect(rep.roadmap[0].deliverables).toContain("text-back live");
    expect(rep.risks[0].mitigation).toContain("training");
    expect(rep.successMetrics.length).toBeGreaterThan(0);
    expect(rep.recommendedTechStack).toContain("Wobble OS");
    expect(rep.nextSteps).toContain("sign SOW");
    expect(rep.roi?.estimatedMonthlyUpsideCents).toBe(1800000);
  });

  it("threads a validated structured handoff between every node (client-scoped, with lineage)", async () => {
    const canned: Record<string, string> = {
      audit_discovery: JSON.stringify({ situation: "x", acquisition: [], delivery: [], support: [], bottlenecks: [], keyMetrics: [] }),
      audit_opportunity: JSON.stringify({ opportunities: [{ title: "T", service: "missed-call-text-back-system", description: "d", impact: "high", difficulty: "low", kpis: ["k"] }] }),
      audit_prioritization: JSON.stringify({ quickWins: ["T"], bigSwings: [], rationale: "r" }),
      audit_roadmap: JSON.stringify({ phases: [{ title: "P1", months: "1-3", focus: "f", objectives: ["o"], deliverables: ["d"], items: ["T"], expectedOutcome: "e" }] }),
      audit_report: JSON.stringify({ executiveSummary: "E", situationSummary: "s", roi: { estimatedMonthlyUpsideCents: 1, estimatedImplementationCents: 1, paybackMonths: 1 }, risks: [{ risk: "r", mitigation: "m" }], successMetrics: ["s"], recommendedTechStack: ["Wobble OS"], nextSteps: ["n"] }),
    };
    const events: Array<Record<string, unknown>> = [];
    await runPaidAuditGraph(
      { businessName: "Acme", intakeNotes: "x", requestedBy: "Moiz", companyId: "clientA" },
      {
        retrieveBrain: async () => [],
        runNode: async (i) => ({ text: canned[i.role], runId: `r_${i.role}` }),
        recordAudit: async (e) => { events.push(e as unknown as Record<string, unknown>); },
        persistAudit: async () => {},
        now,
      },
    );
    const handoffs = events.filter((e) => e.eventType === "agent.handoff");
    // 4 hops between the 5 nodes, each carrying correlation lineage + the client workspace scope.
    expect(handoffs).toHaveLength(4);
    // Durably persisted through the real handoff backbone (not just audit lines): inject a store below.
    const meta = (h: Record<string, unknown>) => h.metadata as Record<string, unknown>;
    expect(handoffs.every((h) => meta(h).clientWorkspaceId === "clientA")).toBe(true); // client-scoped
    expect(new Set(handoffs.map((h) => meta(h).correlationId)).size).toBe(1); // one workflow correlation
    expect(handoffs.map((h) => `${meta(h).from}->${meta(h).to}`)).toEqual([
      "audit_discovery_mapper->audit_opportunity_finder",
      "audit_opportunity_finder->audit_prioritizer",
      "audit_prioritizer->audit_roadmap_architect",
      "audit_roadmap_architect->audit_report_writer",
    ]);
  });

  it("persists each hop through the durable handoff backbone (delivered → completed), not just audit lines", async () => {
    const canned: Record<string, string> = {
      audit_discovery: JSON.stringify({ situation: "x", acquisition: [], delivery: [], support: [], bottlenecks: [], keyMetrics: [] }),
      audit_opportunity: JSON.stringify({ opportunities: [{ title: "T", service: "missed-call-text-back-system", description: "d", impact: "high", difficulty: "low", kpis: ["k"] }] }),
      audit_prioritization: JSON.stringify({ quickWins: [], bigSwings: [], rationale: "r" }),
      audit_roadmap: JSON.stringify({ phases: [] }),
      audit_report: JSON.stringify({ executiveSummary: "E", situationSummary: "s", roi: { estimatedMonthlyUpsideCents: 1, estimatedImplementationCents: 1, paybackMonths: 1 }, risks: [], successMetrics: ["s"], recommendedTechStack: ["Wobble OS"], nextSteps: ["n"] }),
    };
    // Minimal in-memory HandoffStore: insert + conditional transition are all the graph path needs.
    const byId = new Map<string, { id: string; workflowId: string; idempotencyKey: string; clientWorkspaceId: string | null; deliveryState: string }>();
    const byKey = new Map<string, string>();
    const handoffStore = {
      findByIdempotency: async (wf: string, key: string) => { const id = byKey.get(`${wf}::${key}`); return id ? byId.get(id) : null; },
      insert: async (row: { id: string; workflowId: string; idempotencyKey: string; clientWorkspaceId: string | null; deliveryState: string }) => { byId.set(row.id, { ...row }); byKey.set(`${row.workflowId}::${row.idempotencyKey}`, row.id); },
      getById: async (id: string) => byId.get(id) ?? null,
      transition: async (id: string, from: string, fields: { deliveryState?: string }) => { const r = byId.get(id); if (!r || r.deliveryState !== from) return false; Object.assign(r, fields); return true; },
      claimNext: async () => null, reclaimExpiredLeases: async () => 0, list: async () => [], countByState: async () => ({}), deleteExpired: async () => 0,
    claimNextForDepartment: async () => null,
    } as unknown as import("@/lib/handoff").HandoffStore;

    await runPaidAuditGraph(
      { businessName: "Acme", intakeNotes: "x", requestedBy: "Moiz", companyId: "clientA" },
      { retrieveBrain: async () => [], runNode: async (i) => ({ text: canned[i.role], runId: `r_${i.role}` }), recordAudit: async () => {}, persistAudit: async () => {}, handoffStore, now },
    );

    const states = [...byId.values()];
    expect(states).toHaveLength(5); // one durable handoff DRIVES each node (entry hop drives discovery too)
    expect(states.every((s) => s.deliveryState === "completed")).toBe(true); // delivered → claimed → completed
    expect(states.every((s) => s.clientWorkspaceId === "clientA")).toBe(true); // client-scoped in the store
  });

  it("fails loudly when a node returns unparseable output", async () => {
    await expect(
      runPaidAuditGraph(
        { businessName: "Acme", intakeNotes: "x", requestedBy: "Moiz" },
        { retrieveBrain: async () => [], runNode: async () => ({ text: "garbage not json" }), recordAudit: async () => {}, persistAudit: async () => {}, now },
      ),
    ).rejects.toThrow(/discovery node returned unparseable/);
  });

  it("telemetry: records a FAILED agent_run (with cost + latency on the successful node)", async () => {
    const canned: Record<string, string> = {
      audit_discovery: JSON.stringify({ situation: "x", acquisition: [], delivery: [], support: [], bottlenecks: [], keyMetrics: [] }),
      // no audit_opportunity -> that required node gets "garbage" and fails
    };
    const runs: Record<string, unknown>[] = [];
    await expect(
      runPaidAuditGraph(
        { businessName: "Acme", intakeNotes: "x", requestedBy: "Moiz" },
        {
          retrieveBrain: async () => [],
          runNode: async (input) => ({ text: canned[input.role] ?? "garbage", runId: `run_${input.role}`, cost: 0.01 }),
          recordAgentRun: async (i) => void runs.push(i),
          recordAudit: async () => {},
          persistAudit: async () => {},
          now,
        },
      ),
    ).rejects.toThrow(/opportunity node returned unparseable/);

    // discovery succeeded, opportunity is recorded as FAILED (not silently swallowed).
    expect(runs.map((r) => `${r.agentSlug}:${r.status}`)).toEqual([
      "audit_discovery_mapper:succeeded",
      "audit_opportunity_finder:failed",
    ]);
    expect(runs[0].costEstimate).toBe(0.01);
    expect(typeof runs[0].latencyMs).toBe("number");
    expect(runs[1].error).toMatch(/opportunity node returned unparseable/);
  });

  it("resumes: a late report-node failure preserves the earlier nodes; retry re-runs ONLY the report node", async () => {
    const good: Record<string, string> = {
      audit_discovery: JSON.stringify({ situation: "s", acquisition: [], delivery: [], support: [], bottlenecks: [{ area: "front desk", pain: "p", rootCause: "rc", severity: "high", businessImpact: "b" }], keyMetrics: [] }),
      audit_opportunity: JSON.stringify({ opportunities: [{ title: "T", service: "missed-call-text-back-system", description: "d", impact: "high", difficulty: "low", kpis: ["k"] }] }),
      audit_prioritization: JSON.stringify({ quickWins: ["T"], bigSwings: [], rationale: "r" }),
      audit_roadmap: JSON.stringify({ phases: [{ title: "P1", months: "1-3", focus: "f", objectives: ["o"], deliverables: ["d"], items: ["T"], expectedOutcome: "e" }] }),
      audit_report: JSON.stringify({ executiveSummary: "E", situationSummary: "s", roi: { estimatedMonthlyUpsideCents: 100, estimatedImplementationCents: 200, paybackMonths: 2 }, risks: [{ risk: "r", mitigation: "m" }], successMetrics: ["s"], recommendedTechStack: ["Wobble OS"], nextSteps: ["n"] }),
    };
    const { store, rows } = makeCheckpointStore();
    const runId = "audit_job_1";

    // Round 1 — report node returns junk and fails; the four prior nodes checkpoint.
    const calls1: string[] = [];
    await expect(
      runPaidAuditGraph(
        { businessName: "Acme", intakeNotes: "x", requestedBy: "Moiz", graphRunId: runId },
        { retrieveBrain: async () => [], runNode: async (i) => { calls1.push(i.role); return { text: i.role === "audit_report" ? "garbage" : good[i.role], runId: `r_${i.role}` }; }, recordAudit: async () => {}, persistAudit: async () => {}, checkpointStore: store, now },
      ),
    ).rejects.toThrow(/report node returned unparseable/);
    expect(calls1).toHaveLength(5);
    expect([...rows.values()].map((r) => r.nodeSlug).sort()).toEqual(["discovery", "opportunity", "prioritization", "roadmap"]);

    // Round 2 — same job id; only the report node should call the model.
    const calls2: string[] = [];
    const persisted: PaidAuditRow[] = [];
    const result = await runPaidAuditGraph(
      { businessName: "Acme", intakeNotes: "x", requestedBy: "Moiz", graphRunId: runId },
      { retrieveBrain: async () => [], runNode: async (i) => { calls2.push(i.role); return { text: good[i.role], runId: `r2_${i.role}` }; }, recordAudit: async () => {}, persistAudit: async (row) => { persisted.push(row); }, checkpointStore: store, now },
    );
    expect(calls2).toEqual(["audit_report"]); // ONLY the report node re-ran; discovery/opportunity/prioritization/roadmap resumed
    expect(persisted).toHaveLength(1);
    expect(rows.size).toBe(0); // success cleared the checkpoints
    expect(result.auditId).toBeTruthy();
  });
});
