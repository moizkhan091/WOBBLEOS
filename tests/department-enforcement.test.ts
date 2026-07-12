import { describe, expect, it } from "vitest";
import { buildDepartmentRow, type DepartmentRow, type DepartmentPermissions } from "@/lib/domain/department";
import { buildDepartmentMemberRow } from "@/lib/domain/department-membership";
import { buildHandoffEnvelope, type HandoffEnvelope } from "@/lib/domain/handoff";
import { acceptInboundHandoff, authorizeMemberAction, enforceBudget, planDepartmentRoute } from "@/lib/departments/enforcement";

const now = new Date("2026-07-12T12:00:00.000Z");

function dept(over: Partial<Parameters<typeof buildDepartmentRow>[0]> = {}): DepartmentRow {
  return buildDepartmentRow(
    {
      slug: "paid_audit", name: "Paid Audit", purpose: "p", status: "active",
      io: { acceptedHandoffSchemas: ["current_state_map"], inboundCapabilities: [], outboundProducts: ["business_audit"], downstreamConsumers: ["proposal"] },
      permissions: { authorizedMemoryScopes: ["company", "research"], permittedDataClassifications: ["internal", "client_confidential"], allowedTools: ["run_node", "retrieve_memory"], deniedTools: ["apply_model_upgrade"] },
      ...over,
    },
    { now },
  );
}

function envelope(over: Partial<Parameters<typeof buildHandoffEnvelope>[0]> = {}): HandoffEnvelope {
  return buildHandoffEnvelope(
    { workflowId: "wf1", department: "paid_audit", sourceAgent: "orchestrator", destinationAgent: "audit_discovery_mapper", objective: "map", requestedAction: "map", expectedOutputSchema: "current_state_map", confidence: 0.8, clientWorkspaceId: "clientA", authorizedMemoryScopes: ["company"], dataClassification: "client_confidential", ...over },
    { now },
  );
}

const receiver = { clientWorkspaceId: "clientA", grantedMemoryScopes: ["company", "research"] };

describe("acceptInboundHandoff", () => {
  it("accepts a valid handoff (department gate + runtime gate both pass)", () => {
    expect(acceptInboundHandoff(dept(), envelope(), receiver).ok).toBe(true);
  });

  it("rejects when the department is not active", () => {
    const r = acceptInboundHandoff(dept({ status: "draft" }), envelope(), receiver);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/not active/);
  });

  it("rejects a schema the department does not accept", () => {
    const r = acceptInboundHandoff(dept(), envelope({ expectedOutputSchema: "unknown_schema" }), receiver);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/not accepted/);
  });

  it("rejects on tenant isolation (runtime gate: wrong workspace)", () => {
    const r = acceptInboundHandoff(dept(), envelope({ clientWorkspaceId: "clientB" }), receiver);
    expect(r.ok).toBe(false);
  });

  it("rejects a data classification the department may not process", () => {
    const r = acceptInboundHandoff(dept({ permissions: { authorizedMemoryScopes: ["company"], permittedDataClassifications: ["internal"], allowedTools: [], deniedTools: [] } }), envelope({ dataClassification: "client_confidential" }), { clientWorkspaceId: "clientA", grantedMemoryScopes: ["company"] });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/classification/);
  });
});

describe("authorizeMemberAction", () => {
  const perms: DepartmentPermissions = { authorizedMemoryScopes: ["company", "research"], permittedDataClassifications: ["internal"], allowedTools: ["run_node", "retrieve_memory"], deniedTools: ["apply_model_upgrade"] };
  const member = buildDepartmentMemberRow({ departmentSlug: "paid_audit", memberType: "agent", memberRef: "a", role: "r", responsibility: "x", toolGrants: ["run_node", "apply_model_upgrade"], memoryGrants: ["company", "finance_secret"], approvalAuthority: ["content_packet"] }, { now });

  it("authorizes a granted tool + scope; effective grants are the dept ∩ membership intersection", () => {
    const r = authorizeMemberAction(perms, member, { tools: ["run_node"], memoryScopes: ["company"] });
    expect(r.ok).toBe(true);
    expect(r.grantedTools).toEqual(["run_node"]); // apply_model_upgrade denied by dept → excluded
    expect(r.grantedMemoryScopes).toEqual(["company"]); // finance_secret not authorized by dept → excluded
  });

  it("denies a tool the membership grants but the department denies", () => {
    const r = authorizeMemberAction(perms, member, { tools: ["apply_model_upgrade"] });
    expect(r.ok).toBe(false);
    expect(r.deniedTools).toEqual(["apply_model_upgrade"]);
  });

  it("denies a memory scope beyond the department grant", () => {
    const r = authorizeMemberAction(perms, member, { memoryScopes: ["finance_secret"] });
    expect(r.ok).toBe(false);
    expect(r.deniedMemoryScopes).toEqual(["finance_secret"]);
  });

  it("gates approval authority", () => {
    expect(authorizeMemberAction(perms, member, { approvalType: "content_packet" }).ok).toBe(true);
    expect(authorizeMemberAction(perms, member, { approvalType: "model_upgrade" }).ok).toBe(false);
  });
});

describe("enforceBudget", () => {
  it("blocks over-operating-budget and over-token spend", () => {
    const budget = { operatingBudgetCents: 100, tokenBudget: 1000, providerBudgets: { openrouter: 500 } };
    expect(enforceBudget(budget, { cents: 50, tokens: 500 }).ok).toBe(true);
    expect(enforceBudget(budget, { cents: 150 }).overBudget).toBe(true);
    expect(enforceBudget(budget, { tokens: 2000 }).overBudget).toBe(true);
    expect(enforceBudget(budget, { provider: { id: "openrouter", tokens: 600 } }).overBudget).toBe(true);
  });

  it("null limits are unbounded", () => {
    expect(enforceBudget({ operatingBudgetCents: null, tokenBudget: null, providerBudgets: {} }, { cents: 1e9, tokens: 1e9 }).ok).toBe(true);
  });
});

describe("planDepartmentRoute", () => {
  const to = buildDepartmentRow({ slug: "proposal", name: "Proposal", purpose: "p", status: "draft", io: { acceptedHandoffSchemas: ["business_audit"], inboundCapabilities: [], outboundProducts: [], downstreamConsumers: [] } }, { now });

  it("allows a declared route to a destination that accepts the product schema", () => {
    expect(planDepartmentRoute(dept(), to, "business_audit").ok).toBe(true);
  });

  it("blocks routing to a department that is not a declared downstream consumer", () => {
    const notConsumer = buildDepartmentRow({ slug: "finance", name: "Finance", purpose: "p", status: "active" }, { now });
    const r = planDepartmentRoute(dept(), notConsumer, "business_audit");
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/not a declared downstream consumer/);
  });

  it("blocks routing a product the destination does not accept", () => {
    const r = planDepartmentRoute(dept(), to, "some_other_product");
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/does not accept product schema/);
  });

  it("blocks routing from a non-active source", () => {
    expect(planDepartmentRoute(dept({ status: "inactive" }), to, "business_audit").ok).toBe(false);
  });
});
