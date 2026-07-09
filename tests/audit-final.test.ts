import { describe, expect, it } from "vitest";
import { runFinalAudit, type FinalAuditDeps } from "@/lib/audit-final";

const now = new Date("2026-07-09T12:00:00Z");

// Canned 5-node graph output so the deep paid-audit graph runs without an LLM.
const canned: Record<string, string> = {
  audit_discovery: JSON.stringify({ situation: "s", acquisition: [], delivery: [], support: [], bottlenecks: [{ area: "front desk", pain: "misses calls", severity: "high" }], keyMetrics: [] }),
  audit_opportunity: JSON.stringify({ opportunities: [{ title: "Text-back", description: "auto text", impact: "high", difficulty: "low" }] }),
  audit_prioritization: JSON.stringify({ quickWins: ["Text-back"], bigSwings: [], rationale: "r" }),
  audit_roadmap: JSON.stringify({ phases: [{ title: "Phase 1", months: "1-3", focus: "quick wins", objectives: [], deliverables: [], items: ["Text-back"] }] }),
  audit_report: JSON.stringify({ executiveSummary: "Final findings for the client.", situationSummary: "s", roi: { estimatedMonthlyUpsideCents: 1000000 }, risks: [], successMetrics: [], recommendedTechStack: [], nextSteps: [] }),
};

function graphDeps(persisted: string[]): FinalAuditDeps {
  return {
    getDoc: async (id) => (id === "audit_pitch" ? { companyId: "co_1", report: { executiveSummary: "Leaky front desk" } } : id === "audit_roadmap" ? { companyId: "co_1", report: { situationSummary: "4-week audit" } } : null),
    retrieveBrain: async () => [],
    runNode: async (input) => ({ text: canned[input.role], runId: `r_${input.role}` }),
    recordAgentRun: async () => {},
    recordAudit: async () => {},
    persistAudit: async (row) => { persisted.push(row.kind); },
    now,
  };
}

describe("audit final (Doc 3)", () => {
  it("gathers this client's pitch + roadmap + findings and runs the deep graph", async () => {
    const persisted: string[] = [];
    const res = await runFinalAudit(
      { businessName: "Bright Dental", companyId: "co_1", pitchAuditId: "audit_pitch", roadmapAuditId: "audit_roadmap", findings: [{ stakeholder: "Owner", notes: "we miss after-hours calls" }], requestedBy: "Moiz" },
      graphDeps(persisted),
    );
    expect(res.auditId).toBeTruthy();
    expect(persisted).toContain("paid");
    expect((res.report as { opportunities: unknown[] }).opportunities).toHaveLength(1);
  });

  it("refuses a referenced doc from a different company (no cross-client leak)", async () => {
    await expect(
      runFinalAudit(
        { businessName: "X", companyId: "co_1", pitchAuditId: "audit_other", requestedBy: "Moiz" },
        { ...graphDeps([]), getDoc: async () => ({ companyId: "co_2", report: {} }) },
      ),
    ).rejects.toThrow(/data isolation/);
  });
});
