import { describe, expect, it } from "vitest";
import {
  buildHandoffEnvelope,
  validateHandoff,
  nextHandoff,
  handoffEnvelopeSchema,
  HANDOFF_SCHEMA_VERSION,
  type HandoffEnvelope,
} from "@/lib/domain/handoff";

const now = new Date("2026-07-11T12:00:00Z");

function make(overrides: Partial<Parameters<typeof buildHandoffEnvelope>[0]> = {}): HandoffEnvelope {
  return buildHandoffEnvelope(
    {
      workflowId: "wf_1",
      department: "paid_audit",
      sourceAgent: "audit_discovery_mapper",
      destinationAgent: "audit_opportunity_finder",
      objective: "find opportunities",
      requestedAction: "analyze discovery map",
      expectedOutputSchema: "opportunity_set",
      confidence: 0.8,
      ...overrides,
    },
    { now, taskId: "task_1" },
  );
}

describe("handoff envelope — build + schema", () => {
  it("builds a well-formed, schema-valid envelope with lineage + defaults", () => {
    const e = make();
    expect(handoffEnvelopeSchema.safeParse(e).success).toBe(true);
    expect(e).toMatchObject({
      schemaVersion: HANDOFF_SCHEMA_VERSION,
      workflowId: "wf_1",
      taskId: "task_1",
      correlationId: "wf_1", // defaults to workflowId
      department: "paid_audit",
      idempotencyKey: "wf_1:task_1",
      createdAt: now.toISOString(),
    });
  });

  it("rejects an envelope with no destination (agent OR capability required)", () => {
    const e = make({ destinationAgent: null, destinationCapability: null });
    expect(handoffEnvelopeSchema.safeParse(e).success).toBe(false);
  });
});

describe("validateHandoff — schema + isolation + memory authorization", () => {
  it("passes a valid, in-scope, authorized handoff", () => {
    const e = make({ clientWorkspaceId: "clientA", authorizedMemoryScopes: ["company", "client"] });
    const v = validateHandoff(e, { clientWorkspaceId: "clientA", grantedMemoryScopes: ["company", "client", "global"] });
    expect(v).toEqual({ ok: true, errors: [] });
  });

  it("REJECTS a wrong-client handoff (tenant isolation)", () => {
    const e = make({ clientWorkspaceId: "clientA" });
    const v = validateHandoff(e, { clientWorkspaceId: "clientB" });
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toMatch(/client isolation/);
  });

  it("REJECTS an envelope authorizing memory scopes beyond the receiver's grant", () => {
    const e = make({ authorizedMemoryScopes: ["company", "founder_moiz"] });
    const v = validateHandoff(e, { grantedMemoryScopes: ["company"] });
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toMatch(/unauthorized memory scopes: founder_moiz/);
  });

  it("REJECTS when required inputs are missing from previousAgentOutputs", () => {
    const e = make({ requiredInputs: ["discovery"], previousAgentOutputs: {} });
    const v = validateHandoff(e);
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toMatch(/missing required inputs: discovery/);
  });

  it("REJECTS a schema-version mismatch (forward/backward compatibility guard)", () => {
    const e = { ...make(), schemaVersion: 999 };
    const v = validateHandoff(e);
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toMatch(/schemaVersion 999/);
  });

  it("REJECTS a data classification the destination is not permitted to handle (dispatch-time gate)", () => {
    const e = make({ dataClassification: "client_confidential" });
    const v = validateHandoff(e, { permittedDataClassifications: ["internal", "public"] });
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toMatch(/data classification 'client_confidential' is not permitted/);
  });

  it("PASSES a permitted data classification, and is a no-op when the receiver declares none", () => {
    const e = make({ dataClassification: "client_confidential" });
    expect(validateHandoff(e, { permittedDataClassifications: ["internal", "client_confidential"] }).ok).toBe(true);
    expect(validateHandoff(e, {}).ok).toBe(true); // opt-in: no permitted list → not enforced here
  });

  it("REJECTS malformed input (strict schema)", () => {
    expect(validateHandoff({ nonsense: true }).ok).toBe(false);
  });
});

describe("nextHandoff — lineage propagation", () => {
  it("preserves correlationId + workflow, sets causation to the previous task, and carries outputs forward", () => {
    const first = make({ clientWorkspaceId: "clientA", authorizedMemoryScopes: ["client"], previousAgentOutputs: { intake: "notes" } });
    const second = nextHandoff(
      first,
      {
        sourceAgent: "audit_opportunity_finder",
        destinationAgent: "audit_prioritizer",
        objective: "prioritize",
        requestedAction: "rank opportunities",
        expectedOutputSchema: "prioritization",
        addOutputs: { opportunities: ["a", "b"] },
        requiredInputs: ["intake", "opportunities"],
      },
      { now, taskId: "task_2" },
    );
    expect(second.correlationId).toBe(first.correlationId);
    expect(second.workflowId).toBe(first.workflowId);
    expect(second.parentTaskId).toBe("task_1");
    expect(second.causationId).toBe("task_1");
    expect(second.clientWorkspaceId).toBe("clientA"); // scope carried
    expect(second.previousAgentOutputs).toMatchObject({ intake: "notes", opportunities: ["a", "b"] });
    // The next hop validates: required inputs are now present.
    expect(validateHandoff(second, { clientWorkspaceId: "clientA", grantedMemoryScopes: ["client"] }).ok).toBe(true);
  });
});
