import { describe, expect, it } from "vitest";
import { buildCapabilityRegistry, routeCapability, type DepartmentCapabilityInput } from "@/lib/domain/capability-router";

/**
 * Universal Ask WOBBLE capability router (binding corrections #7–9): route a capability to ONE department,
 * confidence/cost-aware, client-scoped, founder-aware, auditable — NEVER a fan-out to every department.
 */
const DEPTS: DepartmentCapabilityInput[] = [
  { slug: "content", status: "active", operatingModel: "agent_team", inboundCapabilities: ["generate_content_pack"], permittedDataClassifications: ["internal", "client_confidential"] },
  { slug: "free_audit", status: "active", operatingModel: "service_department", inboundCapabilities: ["run_free_audit"], permittedDataClassifications: ["internal", "client_confidential"] },
  { slug: "security_governance", status: "active", operatingModel: "agent_team", inboundCapabilities: ["security_review", "run_governance_review"], permittedDataClassifications: ["internal", "restricted"] },
  { slug: "founder_command_centre", status: "active", operatingModel: "human_control_plane", inboundCapabilities: ["approve"], permittedDataClassifications: ["internal", "client_confidential", "restricted"] },
  { slug: "qa_backup", status: "draft", operatingModel: "agent_team", inboundCapabilities: ["qa_review"], permittedDataClassifications: ["internal"] },
  // a second (active) owner of qa_review to exercise the multi-owner path
  { slug: "quality_assurance", status: "active", operatingModel: "agent_team", inboundCapabilities: ["qa_review"], permittedDataClassifications: ["internal", "client_confidential"] },
];

describe("capability router", () => {
  const reg = buildCapabilityRegistry(DEPTS);

  it("builds capability → owning departments", () => {
    expect(reg["generate_content_pack"].map((o) => o.department)).toEqual(["content"]);
    expect(reg["qa_review"].map((o) => o.department)).toEqual(["qa_backup", "quality_assurance"]);
  });

  it("routes a single-owner capability with HIGH confidence + cost of the operating model", () => {
    const r = routeCapability(reg, "generate_content_pack", { dataClassification: "client_confidential", founder: "Moiz" });
    expect(r.department).toBe("content");
    expect(r.confidence).toBe("high");
    expect(r.cost).toBe("medium"); // agent_team
    expect(r.founder).toBe("Moiz"); // carried for attribution (identity-safe)
    expect(r.alternatives).toEqual([]);
  });

  it("a service_department capability is cost 'low'", () => {
    expect(routeCapability(reg, "run_free_audit", {}).cost).toBe("low");
  });

  it("an UNKNOWN capability is blocked, not fanned out", () => {
    const r = routeCapability(reg, "make_me_a_sandwich", {});
    expect(r.department).toBeNull();
    expect(r.blocked).toBe("unknown_capability");
    expect(r.confidence).toBe("none");
  });

  it("routes to ONE department when several ACTIVE ones own the capability (never a fan-out)", () => {
    const r = routeCapability(reg, "qa_review", { dataClassification: "client_confidential" });
    expect(r.department).toBe("quality_assurance"); // qa_backup is draft → filtered; QA is the only eligible active one
    expect(r.confidence).toBe("high");
  });

  it("with multiple ELIGIBLE owners, picks one (stable) with medium confidence and lists the rest as alternatives", () => {
    const twoActive = buildCapabilityRegistry([
      { slug: "a", status: "active", operatingModel: "agent_team", inboundCapabilities: ["x"], permittedDataClassifications: ["internal"] },
      { slug: "b", status: "active", operatingModel: "agent_team", inboundCapabilities: ["x"], permittedDataClassifications: ["internal"] },
    ]);
    const r = routeCapability(twoActive, "x", { dataClassification: "internal" });
    expect(r.department).toBe("a");
    expect(r.confidence).toBe("medium");
    expect(r.alternatives).toEqual(["b"]); // transparency, NOT a second dispatch
  });

  it("BLOCKS on client scope — no owner may handle the data classification (never routes a leak)", () => {
    // content permits internal/client_confidential but NOT restricted
    const r = routeCapability(reg, "generate_content_pack", { dataClassification: "restricted" });
    expect(r.department).toBeNull();
    expect(r.blocked).toBe("data_classification");
    expect(r.alternatives).toEqual(["content"]); // named, but explicitly NOT routed to
  });

  it("a capability owned only by a DRAFT department cannot receive work", () => {
    const draftOnly = buildCapabilityRegistry([{ slug: "d", status: "draft", operatingModel: "agent_team", inboundCapabilities: ["y"], permittedDataClassifications: ["internal"] }]);
    const r = routeCapability(draftOnly, "y", {});
    expect(r.department).toBeNull();
    expect(r.blocked).toBe("no_active_owner");
  });
});
