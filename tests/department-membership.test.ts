import { describe, expect, it } from "vitest";
import {
  buildDepartmentMemberRow,
  effectiveMemberTools,
  effectiveMemberMemoryScopes,
  memberCanGrantApproval,
  selectSpecialists,
  type DepartmentMemberRow,
} from "@/lib/domain/department-membership";
import type { DepartmentPermissions } from "@/lib/domain/department";

const now = new Date("2026-07-12T12:00:00.000Z");

function member(over: Partial<DepartmentMemberRow> = {}): DepartmentMemberRow {
  return {
    ...buildDepartmentMemberRow(
      { departmentSlug: "paid_audit", memberType: "agent", memberRef: "audit_discovery_mapper", role: "specialist", responsibility: "map current state" },
      { id: "m1", now },
    ),
    ...over,
  };
}

describe("buildDepartmentMemberRow", () => {
  it("builds a validated membership with defaults", () => {
    const m = member();
    expect(m).toMatchObject({ id: "m1", departmentSlug: "paid_audit", memberType: "agent", active: true, priority: 100 });
    expect(m.toolGrants).toEqual([]);
    expect(m.budgetLimits).toEqual({ operatingBudgetCents: null, tokenBudget: null });
  });

  it("rejects an invalid department slug", () => {
    expect(() => buildDepartmentMemberRow({ departmentSlug: "Paid Audit", memberType: "agent", memberRef: "x", role: "r", responsibility: "y" })).toThrow(/slug/);
  });
});

describe("effective grants — a membership can never widen the department's authorization", () => {
  const perms: DepartmentPermissions = { allowedTools: ["run_node", "retrieve_memory"], deniedTools: ["apply_model_upgrade"], authorizedMemoryScopes: ["company", "research"], permittedDataClassifications: ["internal"] };

  it("effective tools = department-allowed ∩ membership grant (deny wins)", () => {
    const m = member({ toolGrants: ["run_node", "apply_model_upgrade", "some_other_tool"] });
    // apply_model_upgrade denied by dept; some_other_tool not in dept allow-list → both dropped.
    expect(effectiveMemberTools(perms, m)).toEqual(["run_node"]);
  });

  it("effective memory scopes = department-authorized ∩ membership grant", () => {
    const m = member({ memoryGrants: ["company", "finance_secret"] });
    expect(effectiveMemberMemoryScopes(perms, m)).toEqual(["company"]); // finance_secret not authorized by dept
  });

  it("a member granted nothing gets nothing (no ambient authority from the label)", () => {
    const m = member({ toolGrants: [], memoryGrants: [] });
    expect(effectiveMemberTools(perms, m)).toEqual([]);
    expect(effectiveMemberMemoryScopes(perms, m)).toEqual([]);
  });
});

describe("memberCanGrantApproval", () => {
  it("only members with the approval authority can grant it", () => {
    expect(memberCanGrantApproval(member({ approvalAuthority: ["content_packet"] }), "content_packet")).toBe(true);
    expect(memberCanGrantApproval(member({ approvalAuthority: [] }), "content_packet")).toBe(false);
  });
});

describe("selectSpecialists", () => {
  const members = [
    member({ id: "a", memberRef: "audit_discovery_mapper", priority: 10, capabilities: ["discovery"], allowedInputSchemas: ["current_state_map"] }),
    member({ id: "b", memberRef: "audit_opportunity_finder", priority: 20, capabilities: ["opportunity"], allowedInputSchemas: ["opportunity_set"] }),
    member({ id: "c", memberRef: "audit_inactive", priority: 5, active: false, capabilities: ["discovery"] }),
  ];

  it("returns only active members that match the capability, by priority", () => {
    const picked = selectSpecialists(members, { capability: "discovery" });
    expect(picked.map((m) => m.memberRef)).toEqual(["audit_discovery_mapper"]); // inactive one excluded despite lower priority
  });

  it("matches by input schema when capability is not given", () => {
    expect(selectSpecialists(members, { inputSchema: "opportunity_set" }).map((m) => m.memberRef)).toEqual(["audit_opportunity_finder"]);
  });

  it("with no need specified, returns all active members sorted by priority", () => {
    expect(selectSpecialists(members).map((m) => m.memberRef)).toEqual(["audit_discovery_mapper", "audit_opportunity_finder"]);
  });
});
