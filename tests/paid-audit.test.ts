import { describe, expect, it } from "vitest";
import { assemblePaidAuditReport, discoverySchema, opportunitySchema, parseJsonObject } from "@/lib/domain/paid-audit-graph";
import { runPaidAuditGraph, type PaidAuditRow } from "@/lib/paid-audit-graph";

const now = new Date("2026-07-09T12:00:00Z");

describe("paid audit — domain", () => {
  it("parses node JSON strictly (and rejects junk)", () => {
    expect(parseJsonObject('{"acquisition":["ads"],"delivery":[],"support":[],"bottlenecks":[]}', discoverySchema)).not.toBeNull();
    expect(parseJsonObject("not json", opportunitySchema)).toBeNull();
  });

  it("assembles a full report from node outputs", () => {
    const report = assemblePaidAuditReport({
      businessName: "Acme",
      industry: "dental",
      discovery: { acquisition: ["Meta ads"], delivery: ["manual booking"], support: ["phone"], bottlenecks: [{ area: "front desk", pain: "missed calls", severity: "high" }] },
      opportunities: { opportunities: [{ title: "Missed-call text-back", area: "front desk", service: "missed-call-text-back-system", description: "auto text", impact: "high", difficulty: "low" }] },
      prioritization: { quickWins: ["Missed-call text-back"], bigSwings: [], rationale: "fast ROI" },
      roadmap: { phases: [{ title: "Phase 1", months: "Month 1-3", focus: "quick wins", items: ["Missed-call text-back"] }] },
      report: { executiveSummary: "Acme is leaking leads at the front desk.", roi: { estimatedMonthlyUpsideCents: 1500000, estimatedImplementationCents: 800000, paybackMonths: 2 } },
    });
    expect(report.opportunities).toHaveLength(1);
    expect(report.roadmap).toHaveLength(1);
    expect(report.serviceCount).toBe(1);
    expect(report.roi.estimatedMonthlyUpsideCents).toBe(1500000);
  });
});

describe("paid audit — orchestrator (mocked agents, no LLM spend)", () => {
  it("runs all 5 nodes, assembles + persists the audit", async () => {
    const canned: Record<string, string> = {
      audit_discovery: JSON.stringify({ acquisition: ["Meta ads", "referrals"], delivery: ["manual booking"], support: ["phone only"], bottlenecks: [{ area: "front desk", pain: "misses calls after 5pm", severity: "high" }] }),
      audit_opportunity: JSON.stringify({ opportunities: [
        { title: "Missed-call text-back", area: "front desk", service: "missed-call-text-back-system", description: "auto-text missed calls", impact: "high", difficulty: "low", monthlyHoursSaved: 20 },
        { title: "AI receptionist", area: "front desk", service: "ai-receptionist-system", description: "24/7 answering", impact: "high", difficulty: "high" },
      ] }),
      audit_prioritization: JSON.stringify({ quickWins: ["Missed-call text-back"], bigSwings: ["AI receptionist"], rationale: "text-back is instant ROI" }),
      audit_roadmap: JSON.stringify({ phases: [
        { title: "Phase 1 — Quick wins", months: "Month 1-2", focus: "stop the leaks", items: ["Missed-call text-back"] },
        { title: "Phase 2 — Front desk", months: "Month 3-6", focus: "24/7 cover", items: ["AI receptionist"] },
      ] }),
      audit_report: JSON.stringify({ executiveSummary: "Acme loses ~30% of after-hours leads; a text-back + receptionist recovers most.", roi: { estimatedMonthlyUpsideCents: 1800000, estimatedImplementationCents: 900000, paybackMonths: 2 } }),
    };
    let agentRuns = 0;
    const persisted: PaidAuditRow[] = [];
    const audits: string[] = [];

    const result = await runPaidAuditGraph(
      { businessName: "Acme Dental", industry: "dental", intakeNotes: "Owner says they miss calls after 5pm and book by hand.", requestedBy: "Moiz", companyId: "co_1" },
      {
        retrieveBrain: async () => [{ title: "offers", content: "AI receptionists, automations..." }],
        runNode: async (input) => { const text = canned[input.role]; if (!text) throw new Error(`no canned output for role ${input.role}`); return { text, runId: `run_${input.role}` }; },
        recordAgentRun: async () => { agentRuns += 1; },
        recordAudit: async (e) => { audits.push(e.eventType); },
        persistAudit: async (row) => { persisted.push(row); },
        now,
      },
    );

    expect(result.agentRunCount).toBe(5);
    expect(result.modelRunIds).toHaveLength(5);
    expect(agentRuns).toBe(5);
    expect(audits).toContain("audit.paid_started");
    expect(audits).toContain("audit.paid_completed");

    // the persisted paid audit
    expect(persisted).toHaveLength(1);
    const rep = persisted[0].report;
    expect(persisted[0].kind).toBe("paid");
    expect(persisted[0].companyId).toBe("co_1");
    expect(rep.opportunities).toHaveLength(2);
    expect(rep.roadmap).toHaveLength(2);
    expect(rep.currentState.bottlenecks[0].severity).toBe("high");
    expect(rep.roi.estimatedMonthlyUpsideCents).toBe(1800000);
    expect(rep.executiveSummary).toContain("Acme");
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
