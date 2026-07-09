import { describe, expect, it } from "vitest";
import { assemblePaidAuditReport, discoverySchema, opportunitySchema, prioritizationSchema, roadmapSchema, reportSchema, parseJsonObject } from "@/lib/domain/paid-audit-graph";
import { runPaidAuditGraph, type PaidAuditRow } from "@/lib/paid-audit-graph";

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

  it("fails loudly when a node returns unparseable output", async () => {
    await expect(
      runPaidAuditGraph(
        { businessName: "Acme", intakeNotes: "x", requestedBy: "Moiz" },
        { retrieveBrain: async () => [], runNode: async () => ({ text: "garbage not json" }), recordAudit: async () => {}, persistAudit: async () => {}, now },
      ),
    ).rejects.toThrow(/discovery node returned unparseable/);
  });
});
