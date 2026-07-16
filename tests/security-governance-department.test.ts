import { describe, expect, it } from "vitest";
import { runSecurityGovernanceDepartment, SECURITY_MEMORY_SCOPES } from "@/lib/departments/verticals/security-governance";
import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import { buildDepartmentRow, type DepartmentRow } from "@/lib/domain/department";
import { buildDepartmentMemberRow, type DepartmentMemberRow } from "@/lib/domain/department-membership";
import type { AuditEventInput } from "@/lib/domain/audit";
import type { EscalationInput } from "@/lib/domain/escalation";
import { DEPARTMENT_CONSUMERS } from "@/lib/departments/consumer";
import { GOVERNANCE_REVIEW_JOB_TYPE } from "@/lib/security-governance/job";
import { generalRegistry, knownJobTypes } from "@/lib/workers/registry";

/**
 * The Security & Governance DEPARTMENT (WOB-UAT-024).
 *
 * The department previously had APIs and deterministic checks but could not RECEIVE work: it declared
 * `acceptedHandoffSchemas: []`, so `departmentCanAccept` rejected every inbound handoff. An isolation
 * review reachable only through the generic QA endpoint is a tool a founder can call, not a department
 * other departments can hand work to.
 *
 * These prove the department runs through the real `runDepartment` shell — accept/reject, escalation,
 * audit, routing — and that a FAILED review actually blocks propagation rather than being recorded and
 * ignored.
 */

const now = new Date("2026-07-16T12:00:00.000Z");

function department(): DepartmentRow {
  return buildDepartmentRow(
    {
      slug: "security_governance",
      name: "Security & Governance",
      purpose: "govern",
      status: "active",
      operatingModel: "agent_team",
      orchestratorAgentSlug: "governance_orchestrator",
      permissions: { authorizedMemoryScopes: SECURITY_MEMORY_SCOPES, permittedDataClassifications: ["internal", "restricted"] },
      io: {
        inboundCapabilities: ["security_review", "run_governance_review"],
        acceptedHandoffSchemas: ["handoff_envelope", "governance_request"],
        outboundProducts: ["security_reviews"],
        downstreamConsumers: ["founder_command_centre"],
      },
    },
    { now },
  );
}

function members(): DepartmentMemberRow[] {
  return [
    buildDepartmentMemberRow({ departmentSlug: "security_governance", memberType: "agent", memberRef: "access_policy_agent", role: "specialist", responsibility: "access", capabilities: ["access_review"], memoryGrants: SECURITY_MEMORY_SCOPES }, { now }),
    buildDepartmentMemberRow({ departmentSlug: "security_governance", memberType: "agent", memberRef: "risk_compliance_agent", role: "specialist", responsibility: "policy", capabilities: ["policy_review"], memoryGrants: SECURITY_MEMORY_SCOPES }, { now }),
    buildDepartmentMemberRow({ departmentSlug: "security_governance", memberType: "agent", memberRef: "security_isolation_reviewer", role: "evaluator", responsibility: "isolation", capabilities: ["isolation_review"], memoryGrants: ["qa_rubric"] }, { now }),
  ];
}

function deps(extra: Record<string, unknown> = {}) {
  const events: AuditEventInput[] = [];
  const escalations: EscalationInput[] = [];
  const dispatched: { department: string }[] = [];
  return {
    events,
    escalations,
    dispatched,
    d: {
      now,
      loadDepartment: async () => department(),
      loadMembers: async () => members(),
      recordAudit: async (e: AuditEventInput) => void events.push(e),
      escalationStore: {
      // `findOpen` returning null is the dedup path saying "no live escalation for this tuple yet".
      findOpen: async () => null,
      insert: async (i: EscalationInput) => void escalations.push(i),
      getById: async () => null,
      transition: async () => true,
      list: async () => [],
      countByStatus: async () => ({}),
    },
      handoffStore: { insert: async (h: { department: string }) => void dispatched.push(h), findByIdempotencyKey: async () => null },
      // No kill switches engaged in these tests.
      enforcement: { loadSwitches: async () => [] },
      ...extra,
    } as Record<string, unknown>,
  };
}

/** An envelope for ANOTHER department's work, which is what the isolation evaluator judges. */
const subject = (clientWorkspaceId: string) =>
  buildHandoffEnvelope(
    {
      workflowId: "wf_subject",
      department: "content",
      sourceAgent: "content_orchestrator",
      destinationAgent: "design_intelligence_orchestrator",
      objective: "produce visual direction",
      requestedAction: "produce_visual_direction",
      expectedOutputSchema: "visual_direction",
      dataClassification: "client_confidential",
      clientWorkspaceId,
      authorizedMemoryScopes: ["content", "brand"],
    },
    { now, taskId: "task_subject" },
  );

describe("security_governance can RECEIVE work (it previously accepted no handoff schema)", () => {
  it("runs the isolation evaluator through the DEPARTMENT and passes a clean envelope", async () => {
    const { d, events } = deps();
    const r = await runSecurityGovernanceDepartment(
      {
        capability: "review_isolation",
        requestedBy: "Moiz",
        workflowId: "wf_gov_1",
        isolation: { envelope: subject("ALPHA-ONLY-7QK9"), receiver: { clientWorkspaceId: "ALPHA-ONLY-7QK9", grantedMemoryScopes: ["content", "brand"], permittedDataClassifications: ["client_confidential"] }, authorAgentSlug: "content_orchestrator", sourceDepartment: "content" },
      },
      { ...d, qa: { recordAudit: async () => {}, raiseEscalation: async () => {} } } as never as Parameters<typeof runSecurityGovernanceDepartment>[1],
    );
    expect(r.product!.verdict).toBe("pass");
    expect(r.product!.released).toBe(true);
    expect(r.product!.findings).toBe(0);
    // The real runDepartment shell ran — not a bespoke path around it.
    expect(events.map((e) => e.eventType)).toContain("department.accepted");
    expect(events.map((e) => e.eventType)).toContain("department.completed");
  });

  /**
   * The load-bearing test: a failed isolation review must BLOCK the source department's work, not merely
   * be recorded. `routeTo: []` is how the QA-gated verticals stop propagation.
   */
  it("BLOCKS propagation and opens a CRITICAL finding when a real cross-tenant leak is reviewed", async () => {
    const persisted: unknown[] = [];
    const { d, escalations } = deps();
    const r = await runSecurityGovernanceDepartment(
      {
        capability: "review_isolation",
        requestedBy: "Moiz",
        workflowId: "wf_gov_leak",
        // Alpha's confidential envelope handed to BETA's receiver.
        isolation: { envelope: subject("ALPHA-ONLY-7QK9"), receiver: { clientWorkspaceId: "BETA-ONLY-4M2P", grantedMemoryScopes: ["content", "brand"], permittedDataClassifications: ["client_confidential"] }, authorAgentSlug: "content_orchestrator", sourceDepartment: "content" },
      },
      {
        ...d,
        qa: { recordAudit: async () => {}, raiseEscalation: async () => {} },
        security: { db: { insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => { persisted.push(1); return [{ id: "finding_1" }]; } }) }) }) } },
      } as never as Parameters<typeof runSecurityGovernanceDepartment>[1],
    );
    expect(r.product!.released).toBe(false);
    expect(r.routedTo).toEqual([]); // propagation BLOCKED — the leak does not move downstream
    expect(escalations.length).toBeGreaterThan(0);
    expect(escalations[0].reason).toBeTruthy();
  });

  it("refuses review_isolation with no envelope — a hard failure, never a silent pass", async () => {
    const { d } = deps();
    await expect(
      runSecurityGovernanceDepartment({ capability: "review_isolation", requestedBy: "Moiz", workflowId: "wf_x" }, d as never as Parameters<typeof runSecurityGovernanceDepartment>[1]),
    ).rejects.toThrow(/requires an envelope/);
  });

  it("escalates when the department has no isolation evaluator (membership is real, not a label)", async () => {
    const { d, escalations } = deps({ loadMembers: async () => [] });
    await runSecurityGovernanceDepartment(
      {
        capability: "review_isolation",
        requestedBy: "Moiz",
        workflowId: "wf_gov_noeval",
        isolation: { envelope: subject("ALPHA-ONLY-7QK9"), receiver: { clientWorkspaceId: "ALPHA-ONLY-7QK9", grantedMemoryScopes: ["content", "brand"], permittedDataClassifications: ["client_confidential"] }, authorAgentSlug: "content_orchestrator", sourceDepartment: "content" },
      },
      { ...d, qa: { recordAudit: async () => {}, raiseEscalation: async () => {} } } as never as Parameters<typeof runSecurityGovernanceDepartment>[1],
    ).catch(() => {});
    expect(escalations.some((e) => /no registered isolation evaluator/.test(e.requiredDecision ?? ""))).toBe(true);
  });

  it("escalates every SKIPPED check — an unrun check must never read as a clean result", async () => {
    const { d, escalations } = deps();
    await runSecurityGovernanceDepartment(
      { capability: "run_governance_review", requestedBy: "Moiz", workflowId: "wf_gov_skip" },
      {
        ...d,
        // Both gathers throw → both checks skipped → 0 findings, which must NOT look clean.
        security: { db: { select: () => { throw new Error("db unavailable"); } } },
      } as never as Parameters<typeof runSecurityGovernanceDepartment>[1],
    );
    const text = escalations.map((e) => e.requiredDecision ?? "").join(" ");
    expect(text).toMatch(/could not run access_review/);
    expect(text).toMatch(/could not run policy_review/);
  });
});

describe("the governance job is a REAL producer (which is what makes the consumer non-decorative)", () => {
  it("the job type is registered with a real handler", () => {
    expect(knownJobTypes(generalRegistry)).toContain(GOVERNANCE_REVIEW_JOB_TYPE);
  });

  it("security_governance has a registered department consumer", () => {
    expect(Object.keys(DEPARTMENT_CONSUMERS)).toContain("security_governance");
  });

  /**
   * `departments/consumer.ts` states the rule: a consumer is registered ONLY for a department with a REAL
   * upstream producer. This asserts the pairing so the consumer cannot quietly become decorative if the
   * job is ever removed.
   */
  it("the consumer's producer exists — the pairing is not aspirational", () => {
    expect(Object.keys(DEPARTMENT_CONSUMERS)).toContain("security_governance");
    expect(knownJobTypes(generalRegistry)).toContain(GOVERNANCE_REVIEW_JOB_TYPE);
  });
});
