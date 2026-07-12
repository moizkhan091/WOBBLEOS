import { describe, expect, it } from "vitest";
import { buildDepartmentRow, type DepartmentRow } from "@/lib/domain/department";
import { buildDepartmentMemberRow, type DepartmentMemberRow } from "@/lib/domain/department-membership";
import { buildHandoffEnvelope, type HandoffEnvelope } from "@/lib/domain/handoff";
import { buildHandoffRow, type HandoffDeliveryState, type HandoffRow } from "@/lib/domain/handoff-delivery";
import type { HandoffStore } from "@/lib/handoff";
import { runDepartment, DepartmentRejectedError, type DepartmentPolicy } from "@/lib/departments/orchestrator";

const now = new Date("2026-07-12T12:00:00.000Z");

function makeHandoffStore() {
  const rows = new Map<string, HandoffRow>();
  const key = (r: { workflowId: string; idempotencyKey: string }) => `${r.workflowId}::${r.idempotencyKey}`;
  const store: HandoffStore = {
    findByIdempotency: async (wf, k) => [...rows.values()].find((r) => r.workflowId === wf && r.idempotencyKey === k) ?? null,
    insert: async (row) => { if ([...rows.values()].some((r) => key(r) === key(row))) throw new Error("duplicate key value violates unique constraint"); rows.set(row.id, row); },
    getById: async (id) => rows.get(id) ?? null,
    claimNext: async () => null,
    transition: async (id, from, fields) => { const r = rows.get(id); if (!r || r.deliveryState !== from) return false; rows.set(id, { ...r, ...fields }); return true; },
    reclaimExpiredLeases: async () => 0,
    list: async () => [...rows.values()],
    countByState: async () => ({}),
    deleteExpired: async () => 0,
  };
  return { store, rows };
}

const paidAudit = buildDepartmentRow(
  {
    slug: "paid_audit", name: "Paid Audit", purpose: "p", status: "active", orchestratorAgentSlug: "paid_audit_orchestrator",
    io: { acceptedHandoffSchemas: ["current_state_map"], inboundCapabilities: ["run_paid_audit"], outboundProducts: ["business_audit"], downstreamConsumers: ["proposal"] },
    permissions: { authorizedMemoryScopes: ["company", "research"], permittedDataClassifications: ["internal", "client_confidential"], allowedTools: ["run_node"], deniedTools: ["apply_model_upgrade"] },
    governance: { requiredApprovals: [], escalationRules: [{ condition: "node_failure", escalateTo: "founder_command_centre" }] },
  },
  { now },
);
const proposal = buildDepartmentRow(
  { slug: "proposal", name: "Proposal", purpose: "p", status: "draft", orchestratorAgentSlug: null, io: { acceptedHandoffSchemas: ["business_audit"], inboundCapabilities: ["design_solution"], outboundProducts: [], downstreamConsumers: [] }, permissions: { authorizedMemoryScopes: ["company"], permittedDataClassifications: ["internal", "client_confidential"], allowedTools: [], deniedTools: [] } },
  { now },
);
const members: DepartmentMemberRow[] = [
  buildDepartmentMemberRow({ departmentSlug: "paid_audit", memberType: "agent", memberRef: "audit_discovery_mapper", role: "specialist", responsibility: "map", priority: 10, capabilities: ["discovery"], toolGrants: ["run_node"], memoryGrants: ["company"] }, { now }),
];

const registry = {
  loadDepartment: async (slug: string) => (slug === "paid_audit" ? paidAudit : slug === "proposal" ? proposal : null),
  loadMembers: async (slug: string) => (slug === "paid_audit" ? members : []),
};

function inbound(over: Partial<Parameters<typeof buildHandoffEnvelope>[0]> = {}): { envelope: HandoffEnvelope; receiverCtx: { clientWorkspaceId: string | null; grantedMemoryScopes: string[] } } {
  const envelope = buildHandoffEnvelope(
    { workflowId: "wf1", department: "paid_audit", sourceAgent: "orchestrator", destinationAgent: "paid_audit_orchestrator", objective: "run audit", requestedAction: "audit", expectedOutputSchema: "current_state_map", confidence: 0.8, clientWorkspaceId: "clientA", authorizedMemoryScopes: ["company"], dataClassification: "client_confidential", ...over },
    { now },
  );
  return { envelope, receiverCtx: { clientWorkspaceId: "clientA", grantedMemoryScopes: ["company", "research"] } };
}

const goodPolicy: DepartmentPolicy<{ ok: boolean }> = async (api) => {
  const picked = api.selectSpecialists({ capability: "discovery" });
  api.authorizeMember(picked[0], { tools: ["run_node"], memoryScopes: ["company"] }); // authorized
  return { product: { ok: true }, productSchema: "business_audit", outputs: { audit: "done" }, telemetry: { costEstimate: 0.12, latencyMs: 3400, qualityScore: 8.5 }, confidence: 0.82 };
};

describe("runDepartment — the orchestrator framework", () => {
  it("accepts a valid inbound, runs the policy, ROUTES the product downstream as a real handoff, and records telemetry", async () => {
    const { store, rows } = makeHandoffStore();
    const audits: string[] = [];
    const inb = inbound();
    const res = await runDepartment(
      { departmentSlug: "paid_audit", inbound: inb, policy: goodPolicy },
      { ...registry, handoffStore: store, recordAudit: async (e) => void audits.push(e.eventType), now },
    );

    expect(res.accepted).toBe(true);
    expect(res.product).toEqual({ ok: true });
    expect(res.telemetry).toMatchObject({ costEstimate: 0.12, qualityScore: 8.5, confidence: 0.82 });
    expect(res.routedTo.map((r) => r.department)).toEqual(["proposal"]); // declared downstream consumer

    // A real handoff was dispatched to the proposal department, addressed to it, memory-scoped to its grant.
    const routed = [...rows.values()].find((r) => r.department === "proposal")!;
    expect(routed).toBeTruthy();
    expect(routed.envelope.expectedOutputSchema).toBe("business_audit");
    expect(routed.envelope.authorizedMemoryScopes).toEqual(["company"]); // narrowed to proposal's grant
    expect(routed.causationId).toBe(inb.envelope.taskId); // lineage intact
    expect(audits).toEqual(expect.arrayContaining(["department.accepted", "department.routed", "department.completed"]));
  });

  it("REJECTS an unauthorized inbound (wrong workspace) — policy never runs", async () => {
    let ran = false;
    const policy: DepartmentPolicy<null> = async () => { ran = true; return { product: null, productSchema: "business_audit" }; };
    await expect(
      runDepartment({ departmentSlug: "paid_audit", inbound: inbound({ clientWorkspaceId: "clientB" }), policy }, { ...registry, recordAudit: async () => {}, now }),
    ).rejects.toBeInstanceOf(DepartmentRejectedError);
    expect(ran).toBe(false);
  });

  it("REJECTS an inbound schema the department does not accept", async () => {
    await expect(
      runDepartment({ departmentSlug: "paid_audit", inbound: inbound({ expectedOutputSchema: "unknown" }), policy: goodPolicy }, { ...registry, recordAudit: async () => {}, now }),
    ).rejects.toThrow(/not accepted/);
  });

  it("BLOCKS routing to a destination that does not accept the product (no handoff dispatched)", async () => {
    const { store, rows } = makeHandoffStore();
    const policy: DepartmentPolicy<null> = async () => ({ product: null, productSchema: "wrong_schema", routeTo: ["proposal"] });
    const res = await runDepartment({ departmentSlug: "paid_audit", inbound: inbound(), policy }, { ...registry, handoffStore: store, recordAudit: async () => {}, now });
    expect(res.routedTo).toHaveLength(0);
    expect([...rows.values()].some((r) => r.department === "proposal")).toBe(false);
  });

  it("enforces member authorization — a policy requesting a denied tool throws", async () => {
    const policy: DepartmentPolicy<null> = async (api) => {
      api.authorizeMember(api.members[0], { tools: ["apply_model_upgrade"] }); // denied by dept
      return { product: null, productSchema: "business_audit" };
    };
    await expect(
      runDepartment({ departmentSlug: "paid_audit", inbound: inbound(), policy }, { ...registry, recordAudit: async () => {}, now }),
    ).rejects.toThrow(/unauthorized/);
  });

  it("records escalations raised by the policy", async () => {
    const audits: { type: string; meta: unknown }[] = [];
    const policy: DepartmentPolicy<null> = async (api) => { api.escalate("required node failed"); return { product: null, productSchema: "business_audit", routeTo: [] }; };
    await runDepartment({ departmentSlug: "paid_audit", inbound: inbound(), policy }, { ...registry, recordAudit: async (e) => void audits.push({ type: e.eventType, meta: e.metadata }), now });
    const esc = audits.find((a) => a.type === "department.escalated");
    expect(esc).toBeTruthy();
    expect((esc!.meta as { escalateTo: string }).escalateTo).toBe("founder_command_centre");
  });

  it("is idempotent on the routed handoff (same route dedups)", async () => {
    const { store } = makeHandoffStore();
    const deps = { ...registry, handoffStore: store, recordAudit: async () => {}, now };
    await runDepartment({ departmentSlug: "paid_audit", inbound: inbound(), policy: goodPolicy }, deps);
    const second = await runDepartment({ departmentSlug: "paid_audit", inbound: inbound(), policy: goodPolicy }, deps);
    expect(second.routedTo[0].deduped).toBe(true); // same workflow+route idempotency key → dedup
  });
});
