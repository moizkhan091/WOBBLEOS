import { describe, expect, it } from "vitest";
import { deterministicRoadmap, parseRoadmapPlan, roadmapToReportShape } from "@/lib/domain/roadmap-graph";
import { runAuditRoadmap } from "@/lib/audit-roadmap";

const now = new Date("2026-07-09T12:00:00Z");

describe("audit roadmap (Doc 2) domain", () => {
  it("parses a plan and rejects junk", () => {
    expect(parseRoadmapPlan('{"interviewPlan":[{"role":"Owner"}]}')).not.toBeNull();
    expect(parseRoadmapPlan("nope")).toBeNull();
  });

  it("deterministic plan covers interviews + a 4-week sequence", () => {
    const plan = deterministicRoadmap("Acme", [{ role: "Founder" }, { name: "Jane", role: "Ops" }]);
    expect(plan.interviewPlan).toHaveLength(2);
    expect(plan.interviewPlan[0].questions.length).toBeGreaterThan(0);
    expect(plan.sequence).toHaveLength(4);
    expect(plan.dataToGather.length).toBeGreaterThan(0);
  });

  it("maps to the report shape (interviews as opportunities, weeks as roadmap)", () => {
    const shape = roadmapToReportShape(deterministicRoadmap("Acme", []), "Acme");
    expect((shape.roadmap as unknown[]).length).toBe(4);
    expect((shape.opportunities as unknown[]).length).toBeGreaterThan(0);
    expect(shape.internal).toBeUndefined(); // set by the service, not the mapper
  });
});

describe("audit roadmap service — data isolation", () => {
  it("reads the client's own pitch and plans interviews (LLM path)", async () => {
    let persistedKind: string | null = null;
    const res = await runAuditRoadmap(
      { businessName: "Bright Dental", companyId: "co_1", pitchAuditId: "audit_pitch_1", stakeholders: [{ name: "Dr Smith", role: "Owner" }], createdBy: "Moiz" },
      {
        getPitch: async (id) => (id === "audit_pitch_1" ? { companyId: "co_1", report: { executiveSummary: "Leaky front desk", whatWeNoticed: ["missed calls"] } } : null),
        runNode: async () => ({ text: JSON.stringify({ overview: "4-week audit", interviewPlan: [{ role: "Owner", name: "Dr Smith", why: "runs it", questions: ["walk me through your day"] }], sequence: [{ week: "Week 1", focus: "discovery", activities: ["interviews"] }], dataToGather: ["monthly leads"], prepNotes: "book interviews" }), runId: "run_1" }),
        recordAudit: async () => {}, recordAgentRun: async () => {},
        persist: async (r) => { persistedKind = "roadmap"; return void r; }, now,
      },
    );
    expect(res.usedLlm).toBe(true);
    expect(res.plan.interviewPlan[0].role).toBe("Owner");
    expect(persistedKind).toBe("roadmap");
  });

  it("refuses a pitch that belongs to a different company (no cross-client leak)", async () => {
    await expect(
      runAuditRoadmap(
        { businessName: "X", companyId: "co_1", pitchAuditId: "audit_other" },
        { getPitch: async () => ({ companyId: "co_2", report: {} }), runNode: async () => ({ text: "{}" }), recordAudit: async () => {}, persist: async () => {}, now },
      ),
    ).rejects.toThrow(/data isolation/);
  });
});
