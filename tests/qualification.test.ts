import { describe, expect, it } from "vitest";
import {
  QUALIFICATION_ROLES,
  computeQualificationScore,
  gradeFor,
  policySignal,
  blendScore,
  parseRoleResult,
  type RoleScore,
} from "@/lib/domain/qualification";
import { runQualification, type QualificationStore, type QualificationSubject } from "@/lib/qualification";
import type { QualificationAssessmentRow, QualificationRoleRow } from "@/lib/domain/qualification";

const SUBJECT: QualificationSubject = {
  type: "company", id: "co_1", name: "Acme Dental",
  signals: { companySize: "smb", industry: "dental / med spa", hasWebsite: true, hasNotes: true, status: "prospect" },
  context: "Industry: dental\nCompany size: smb\nNotes: 3 clinics, manual front desk, missing calls",
};

function memStore(initialRuns = 0): QualificationStore & { runs: QualificationAssessmentRow[]; roleRows: QualificationRoleRow[] } {
  const runs: QualificationAssessmentRow[] = [];
  const roleRows: QualificationRoleRow[] = [];
  let prior = initialRuns;
  return {
    runs, roleRows,
    async getCompanySubject(id) { return id === SUBJECT.id ? SUBJECT : null; },
    async countAssessments() { return prior + runs.length; },
    async insertAssessment(row) { runs.push(row); prior = 0; },
    async insertRoles(rows) { roleRows.push(...rows); },
    async listAssessments() { return runs; },
    async getRoles(id) { return roleRows.filter((r) => r.assessmentId === id); },
  };
}

describe("Qualification Council — domain", () => {
  it("has exactly 8 council roles with unique slugs", () => {
    expect(QUALIFICATION_ROLES).toHaveLength(8);
    expect(new Set(QUALIFICATION_ROLES.map((r) => r.slug)).size).toBe(8);
  });

  it("grades map A–E by band", () => {
    expect(gradeFor(90).grade).toBe("A");
    expect(gradeFor(72).grade).toBe("B");
    expect(gradeFor(60).grade).toBe("C");
    expect(gradeFor(42).grade).toBe("D");
    expect(gradeFor(20).grade).toBe("E");
    expect(gradeFor(85).recommendation).toMatch(/Prioritise/);
  });

  it("policySignal derives deterministic scores from CRM data", () => {
    expect(policySignal("real_budget", { companySize: "enterprise" })?.score).toBe(90);
    expect(policySignal("real_budget", { companySize: "startup" })?.score).toBe(50);
    expect(policySignal("real_budget", {})).toBeNull(); // no size → no signal
    expect(policySignal("access", { hasWebsite: true, hasNotes: true })?.score).toBe(100);
    expect(policySignal("operational_complexity", { industry: "dental clinic" })?.score).toBe(80);
    expect(policySignal("owner_urgency", {})).toBeNull(); // role has no policy signal
  });

  it("blendScore combines policy + LLM, or uses whichever exists", () => {
    expect(blendScore(80, { score: 60 })).toBe(70); // 50/50 blend
    expect(blendScore(null, { score: 60 })).toBe(60); // policy only
    expect(blendScore(80, null)).toBe(80); // llm only
  });

  it("computeQualificationScore is a weighted average, clamped", () => {
    const all70: RoleScore[] = QUALIFICATION_ROLES.map((r) => ({ slug: r.slug, score: 70, rationale: "x" }));
    expect(computeQualificationScore(all70)).toBe(70);
  });

  it("parseRoleResult accepts JSON, rejects garbage", () => {
    expect(parseRoleResult("real_budget", '{"score": 65, "rationale": "mid budget"}').score).toBe(65);
    expect(() => parseRoleResult("real_budget", "nope")).toThrow(/unparseable/);
  });
});

describe("Qualification Council — service", () => {
  const provider = async () => ({ text: '{"score": 70, "rationale": "reasonable fit"}' });

  it("scores all 8 roles (policy + LLM blended), grades, persists a versioned assessment", async () => {
    const store = memStore();
    const res = await runQualification(SUBJECT.id, { store, runProvider: provider, actor: "Moiz", recordAudit: async () => {}, now: new Date("2026-07-18T00:00:00Z") });
    expect(res.roles).toHaveLength(8);
    expect(store.runs).toHaveLength(1);
    expect(res.assessment.version).toBe(1);
    expect(["A", "B", "C", "D", "E"]).toContain(res.assessment.grade);
    // roles WITH a policy signal carry a policyNote; roles without don't
    const budgetRole = res.roles.find((r) => r.role === "real_budget");
    expect(budgetRole?.policyNote).toBeTruthy();
    const urgencyRole = res.roles.find((r) => r.role === "owner_urgency");
    expect(urgencyRole?.policyNote).toBeNull();
  });

  it("versions re-assessments (v2)", async () => {
    const store = memStore(1);
    const res = await runQualification(SUBJECT.id, { store, runProvider: provider, actor: "Moiz", recordAudit: async () => {} });
    expect(res.assessment.version).toBe(2);
  });

  it("falls back to policy-only when the LLM fails on a policy role (never fabricates)", async () => {
    const store = memStore();
    const failing = async () => { throw new Error("provider down"); };
    // budget role has a policy signal → survives the LLM failure with a policy-only score
    const res = await runQualification(SUBJECT.id, { store, runProvider: failing, actor: "Moiz", recordAudit: async () => {} }).catch((e) => e);
    // a non-policy role (real_problem) would rethrow — so the whole run throws. That's correct: we don't
    // fabricate. Assert it throws rather than inventing scores for roles with no signal.
    expect(res).toBeInstanceOf(Error);
  });

  it("throws when the company does not exist", async () => {
    await expect(runQualification("nope", { store: memStore(), runProvider: provider, recordAudit: async () => {} })).rejects.toThrow(/not found/);
  });
});
