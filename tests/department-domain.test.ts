import { describe, expect, it } from "vitest";
import {
  buildDepartmentRow,
  departmentCanAccept,
  departmentAllowsTool,
  DEPARTMENT_HEALTH_STATUSES,
  type DepartmentRow,
} from "@/lib/domain/department";

const now = new Date("2026-07-12T12:00:00.000Z");

describe("buildDepartmentRow", () => {
  it("builds a validated department with defaults", () => {
    const d = buildDepartmentRow({ slug: "paid_audit", name: "Paid Audit", purpose: "Deliver McKinsey-depth AI audits." }, { id: "dept_pa", now });
    expect(d).toMatchObject({ id: "dept_pa", slug: "paid_audit", status: "draft", version: 1, healthStatus: "unknown" });
    expect(d.permissions).toEqual({ allowedTools: [], deniedTools: [], authorizedMemoryScopes: [], permittedDataClassifications: ["internal"] });
    expect(d.limits.concurrencyLimit).toBe(4);
    expect(d.limits.retryPolicy).toEqual({ maxRetries: 3, backoffMs: 2000 });
    expect(d.budget.providerBudgets).toEqual({});
    expect(d.createdAt).toEqual(now);
  });

  it("rejects an invalid slug", () => {
    expect(() => buildDepartmentRow({ slug: "Paid Audit", name: "x", purpose: "y" })).toThrow(/slug/);
  });

  it("carries the full policy record through when provided", () => {
    const d = buildDepartmentRow({
      slug: "content_strategy",
      name: "Content Strategy",
      purpose: "Own the content strategy.",
      status: "active",
      orchestratorAgentSlug: "content_orchestrator",
      permissions: { authorizedMemoryScopes: ["content", "brand"], permittedDataClassifications: ["internal"], allowedTools: [], deniedTools: ["apply_model_upgrade"] },
      io: { inboundCapabilities: ["produce_strategy"], acceptedHandoffSchemas: ["creative_brief"], outboundProducts: ["content_strategy", "brief", "calendar"], downstreamConsumers: ["copywriting"] },
      governance: { requiredApprovals: ["content_packet"], escalationRules: [{ condition: "quality<6", escalateTo: "founder" }] },
      kpis: [{ key: "approval_rate", target: 0.8, unit: "ratio" }],
      budget: { operatingBudgetCents: 50000, tokenBudget: 1_000_000, providerBudgets: { openrouter: 500000 } },
    }, { id: "dept_cs", now });

    expect(d.status).toBe("active");
    expect(d.io.downstreamConsumers).toEqual(["copywriting"]);
    expect(d.governance.escalationRules[0]).toEqual({ condition: "quality<6", escalateTo: "founder" });
    expect(d.kpis[0]).toEqual({ key: "approval_rate", target: 0.8, unit: "ratio" });
    expect(d.budget.operatingBudgetCents).toBe(50000);
    expect(d.permissions.deniedTools).toEqual(["apply_model_upgrade"]);
  });

  it("exposes the full truthful health enum", () => {
    expect(DEPARTMENT_HEALTH_STATUSES).toContain("degraded");
    expect(DEPARTMENT_HEALTH_STATUSES).toContain("over_budget");
    expect(DEPARTMENT_HEALTH_STATUSES).toContain("misconfigured");
  });
});

describe("departmentCanAccept — real authorization, not a label", () => {
  const dept = (over: Partial<DepartmentRow> = {}): Pick<DepartmentRow, "status" | "io" | "permissions"> => {
    const base = buildDepartmentRow(
      {
        slug: "paid_audit", name: "Paid Audit", purpose: "p", status: "active",
        io: { acceptedHandoffSchemas: ["current_state_map"], inboundCapabilities: [], outboundProducts: [], downstreamConsumers: [] },
        permissions: { authorizedMemoryScopes: ["company", "research"], permittedDataClassifications: ["internal", "client_confidential"], allowedTools: [], deniedTools: [] },
      },
      { now },
    );
    return { ...base, ...over };
  };

  it("accepts a valid inbound handoff", () => {
    const r = departmentCanAccept(dept(), { expectedOutputSchema: "current_state_map", dataClassification: "internal", authorizedMemoryScopes: ["company"] });
    expect(r.ok).toBe(true);
  });

  it("rejects a non-active department", () => {
    const r = departmentCanAccept(dept({ status: "inactive" }), { expectedOutputSchema: "current_state_map" });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/not active/);
  });

  it("rejects an unaccepted handoff schema", () => {
    const r = departmentCanAccept(dept(), { expectedOutputSchema: "some_other_schema" });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/not accepted/);
  });

  it("rejects a data classification the department may not process", () => {
    const r = departmentCanAccept(dept(), { expectedOutputSchema: "current_state_map", dataClassification: "restricted" });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/classification/);
  });

  it("rejects a handoff that authorizes a memory scope beyond the department's grant", () => {
    const r = departmentCanAccept(dept(), { expectedOutputSchema: "current_state_map", authorizedMemoryScopes: ["company", "secret_finance"] });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/secret_finance/);
  });
});

describe("departmentAllowsTool", () => {
  it("deny list wins over allow list", () => {
    expect(departmentAllowsTool({ allowedTools: ["a", "b"], deniedTools: ["b"], authorizedMemoryScopes: [], permittedDataClassifications: [] }, "b")).toBe(false);
  });
  it("empty allow list permits anything not denied", () => {
    expect(departmentAllowsTool({ allowedTools: [], deniedTools: ["danger"], authorizedMemoryScopes: [], permittedDataClassifications: [] }, "safe")).toBe(true);
    expect(departmentAllowsTool({ allowedTools: [], deniedTools: ["danger"], authorizedMemoryScopes: [], permittedDataClassifications: [] }, "danger")).toBe(false);
  });
  it("non-empty allow list is exhaustive", () => {
    expect(departmentAllowsTool({ allowedTools: ["a"], deniedTools: [], authorizedMemoryScopes: [], permittedDataClassifications: [] }, "z")).toBe(false);
  });
});
