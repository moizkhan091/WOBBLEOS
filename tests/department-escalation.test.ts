import { describe, expect, it } from "vitest";
import { buildEscalationRow, isEscalationOverdue, type EscalationRow } from "@/lib/domain/escalation";
import { createEscalation, acknowledgeEscalation, resolveEscalation, dismissEscalation, resumeEscalation, terminateEscalation, rerouteEscalation, listEscalations, escalationStatusCounts, escalateDeadLetteredHandoffs, type EscalationStore } from "@/lib/departments/escalation";
import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import { buildHandoffRow, type HandoffRow } from "@/lib/domain/handoff-delivery";
import { buildDepartmentRow, type DepartmentRow } from "@/lib/domain/department";

const now = new Date("2026-07-12T12:00:00.000Z");

function makeStore(seed: EscalationRow[] = []) {
  const rows = new Map<string, EscalationRow>(seed.map((r) => [r.id, r]));
  const store: EscalationStore = {
    findOpen: async (dept, wf, task, reason) => [...rows.values()].find((r) => r.departmentSlug === dept && r.workflowId === wf && r.taskId === task && r.reason === reason && r.status === "open") ?? null,
    insert: async (row) => { rows.set(row.id, row); },
    getById: async (id) => rows.get(id) ?? null,
    transition: async (id, from, fields) => { const r = rows.get(id); if (!r || !from.includes(r.status)) return false; rows.set(id, { ...r, ...fields }); return true; },
    list: async (q) => [...rows.values()].filter((r) => (!q.departmentSlug || r.departmentSlug === q.departmentSlug) && (!q.status || r.status === q.status) && (!q.reason || r.reason === q.reason)).slice(0, q.limit),
    countByStatus: async () => { const o: Record<string, number> = {}; for (const r of rows.values()) o[r.status] = (o[r.status] ?? 0) + 1; return o; },
  };
  return { store, rows };
}

const deps = (store: EscalationStore) => ({ store, recordAudit: async () => {}, now });
const input = (over = {}) => ({ departmentSlug: "paid_audit", workflowId: "wf1", taskId: "t1", reason: "budget_exhausted" as const, severity: "high" as const, requiredDecision: "raise budget or hold", ...over });

describe("workflow.retry earned autonomy — dead-letter sweep", () => {
  const dead = (over = {}) => ({ id: "h1", department: "paid_audit", workflowId: "wf1", taskId: "t1", clientWorkspaceId: "clientA", sourceAgent: "a", failureReason: "timeout", metadata: {} as Record<string, unknown>, ...over });

  it("a `workflow.retry` grant AUTO-REDRIVES a dead-lettered handoff once (no escalation)", async () => {
    const { store, rows } = makeStore();
    const redriven: string[] = [];
    const r = await escalateDeadLetteredHandoffs({
      store, recordAudit: async () => {}, now, enforceAutonomy: true,
      listDeadLettered: async () => [dead()],
      mayActAutonomously: async (a) => a.category === "workflow.retry" && a.clientId === "clientA",
      autoRedrive: async (id, _actor, opts) => { redriven.push(`${id}:${opts.markAutoRetried}`); return true; },
    });
    expect(r.autoRetried).toBe(1);
    expect(r.escalated).toBe(0);
    expect(redriven).toEqual(["h1:true"]); // redriven WITH the bounded-retry marker
    expect(rows.size).toBe(0); // no escalation raised
  });

  it("BOUNDED: an already-auto-retried handoff (marker set) ESCALATES instead of auto-retrying again", async () => {
    const { store } = makeStore();
    let redriven = 0;
    const r = await escalateDeadLetteredHandoffs({
      store, recordAudit: async () => {}, now, enforceAutonomy: true,
      listDeadLettered: async () => [dead({ metadata: { autoRetriedAt: now.toISOString() } })],
      mayActAutonomously: async () => true,
      autoRedrive: async () => { redriven += 1; return true; },
    });
    expect(redriven).toBe(0); // NOT auto-retried a second time
    expect(r.autoRetried).toBe(0);
    expect(r.escalated).toBe(1); // escalated to the founder instead
  });

  it("SAFETY: a handoff for a NON-idempotent-allow-listed department escalates even WITH a grant", async () => {
    const { store } = makeStore();
    let redriven = 0;
    const r = await escalateDeadLetteredHandoffs({
      store, recordAudit: async () => {}, now, enforceAutonomy: true,
      listDeadLettered: async () => [dead({ department: "some_future_department" })],
      mayActAutonomously: async () => true, // grant would apply, but the department isn't vetted-idempotent
      autoRedrive: async () => { redriven += 1; return true; },
    });
    expect(redriven).toBe(0); // never auto-redriven (cap-safe against a future irreversible consumer)
    expect(r.escalated).toBe(1);
  });

  it("NO grant → escalates (baseline), never auto-retries", async () => {
    const { store } = makeStore();
    let redriven = 0;
    const r = await escalateDeadLetteredHandoffs({
      store, recordAudit: async () => {}, now, enforceAutonomy: true,
      listDeadLettered: async () => [dead()],
      mayActAutonomously: async () => false, // no grant
      autoRedrive: async () => { redriven += 1; return true; },
    });
    expect(redriven).toBe(0);
    expect(r.escalated).toBe(1);
  });
});

describe("escalation domain", () => {
  it("builds an open escalation with an SLA from severity", () => {
    const e = buildEscalationRow(input(), { now });
    expect(e).toMatchObject({ status: "open", reason: "budget_exhausted", severity: "high", assignee: "founder_command_centre" });
    expect(e.slaDueAt!.getTime()).toBe(now.getTime() + 4 * 60 * 60_000); // high = 4h
  });
  it("flags an overdue open escalation", () => {
    const e = buildEscalationRow(input({ severity: "critical" }), { now });
    expect(isEscalationOverdue(e, new Date(now.getTime() + 2 * 60 * 60_000))).toBe(true); // critical SLA 1h
    expect(isEscalationOverdue({ ...e, status: "resolved" }, new Date(now.getTime() + 99 * 60 * 60_000))).toBe(false);
  });
});

describe("escalation service", () => {
  it("creates an escalation and dedups a second OPEN for the same blocked step", async () => {
    const { store, rows } = makeStore();
    const a = await createEscalation(input(), deps(store));
    expect(a.deduped).toBe(false);
    const b = await createEscalation(input(), deps(store)); // same dept/wf/task/reason, still open
    expect(b.deduped).toBe(true);
    expect(b.escalation.id).toBe(a.escalation.id);
    expect(rows.size).toBe(1);
  });

  it("acknowledge → resolve with an action the workflow can read (resume/reroute/blocked/terminate)", async () => {
    const { store, rows } = makeStore();
    const { escalation } = await createEscalation(input(), deps(store));
    expect(await acknowledgeEscalation(escalation.id, "Moiz", deps(store))).toBe(true);
    expect(rows.get(escalation.id)!.status).toBe("acknowledged");
    expect(await resolveEscalation(escalation.id, { action: "resume", resolution: "budget raised, resume", resolvedBy: "Moiz" }, deps(store))).toBe(true);
    const r = rows.get(escalation.id)!;
    expect(r.status).toBe("resolved");
    expect(r.resolutionAction).toBe("resume");
    expect(r.resolvedBy).toBe("Moiz");
  });

  it("a 'blocked' resolution keeps it acknowledged (work stays blocked), not resolved", async () => {
    const { store, rows } = makeStore();
    const { escalation } = await createEscalation(input(), deps(store));
    await resolveEscalation(escalation.id, { action: "blocked", resolution: "hold until next week", resolvedBy: "Moiz" }, deps(store));
    expect(rows.get(escalation.id)!.status).toBe("acknowledged");
    expect(rows.get(escalation.id)!.resolutionAction).toBe("blocked");
  });

  it("re-escalation is allowed after resolution (a new OPEN for the same step)", async () => {
    const { store, rows } = makeStore();
    const first = await createEscalation(input(), deps(store));
    await resolveEscalation(first.escalation.id, { action: "resume", resolution: "done", resolvedBy: "Moiz" }, deps(store));
    const second = await createEscalation(input(), deps(store)); // same step blocks again
    expect(second.deduped).toBe(false);
    expect(rows.size).toBe(2);
  });

  it("lists + counts by status", async () => {
    const { store } = makeStore();
    await createEscalation(input({ taskId: "a" }), deps(store));
    await createEscalation(input({ taskId: "b", reason: "dead_lettered" }), deps(store));
    expect(await listEscalations({ departmentSlug: "paid_audit" }, deps(store))).toHaveLength(2);
    expect(await listEscalations({ reason: "dead_lettered" }, deps(store))).toHaveLength(1);
    expect((await escalationStatusCounts(deps(store))).open).toBe(2);
  });

  it("dismiss closes a non-actionable escalation (work stays blocked)", async () => {
    const { store, rows } = makeStore();
    const { escalation } = await createEscalation(input(), deps(store));
    expect(await dismissEscalation(escalation.id, "Moiz", "not a real problem", deps(store))).toBe(true);
    expect(rows.get(escalation.id)!.status).toBe("dismissed");
  });
});

describe("real escalation action semantics — control the actual workflow", () => {
  const dlInput = () => ({ departmentSlug: "paid_audit", workflowId: "wf1", taskId: "t1", reason: "dead_lettered" as const, severity: "high" as const, requiredDecision: "resume/terminate", handoffId: "handoff_x" });

  it("RESUME redrives the linked handoff and resolves with action=resume", async () => {
    const { store, rows } = makeStore();
    const { escalation } = await createEscalation(dlInput(), deps(store));
    let redriven: string | null = null;
    const r = await resumeEscalation(escalation.id, "Moiz", { ...deps(store), getHandoffState: async () => "dead_lettered", redriveHandoff: async (id) => { redriven = id; return true; } });
    expect(r.ok).toBe(true);
    expect(redriven).toBe("handoff_x"); // the REAL handoff was redriven
    expect(rows.get(escalation.id)!.status).toBe("resolved");
    expect(rows.get(escalation.id)!.resolutionAction).toBe("resume");
  });

  it("RESUME fails clearly when the handoff is not resumable (completed/cancelled)", async () => {
    const { store, rows } = makeStore();
    const { escalation } = await createEscalation(dlInput(), deps(store));
    const r = await resumeEscalation(escalation.id, "Moiz", { ...deps(store), getHandoffState: async () => "completed", redriveHandoff: async () => true });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not resumable/);
    expect(rows.get(escalation.id)!.status).toBe("open"); // unchanged
  });

  it("RESUME is idempotent — a second resume on a resolved escalation is a no-op success", async () => {
    const { store } = makeStore();
    const { escalation } = await createEscalation(dlInput(), deps(store));
    const seams = { ...deps(store), getHandoffState: async () => "dead_lettered", redriveHandoff: async () => true };
    await resumeEscalation(escalation.id, "Moiz", seams);
    const again = await resumeEscalation(escalation.id, "Moiz", seams);
    expect(again.ok).toBe(true); // idempotent
  });

  it("TERMINATE cancels every non-terminal handoff of the workflow + releases the reservation", async () => {
    const { store, rows } = makeStore();
    const { escalation } = await createEscalation({ ...dlInput(), budgetReservationId: "res_1" }, deps(store));
    const cancelled: string[] = [];
    let released: string | null = null;
    const r = await terminateEscalation(escalation.id, "Moiz", {
      ...deps(store),
      listWorkflowHandoffs: async () => [{ id: "h_a", deliveryState: "delivered" }, { id: "h_b", deliveryState: "completed" }, { id: "h_c", deliveryState: "processing" }],
      cancelHandoff: async (id) => { cancelled.push(id); return true; },
      releaseReservation: async (id) => { released = id; return true; },
    });
    expect(r.ok).toBe(true);
    expect(r.cancelled).toBe(2); // h_a (delivered) + h_c (processing); h_b already completed → skipped
    expect(cancelled.sort()).toEqual(["h_a", "h_c"]);
    expect(released).toBe("res_1"); // budget reservation released
    expect(rows.get(escalation.id)!.resolutionAction).toBe("terminate");
  });
});

describe("rerouteEscalation — REAL alternate-route execution (not a label)", () => {
  const blockedEnvelope = () => buildHandoffEnvelope(
    { workflowId: "wf_rr", department: "paid_audit", sourceAgent: "paid_audit_orchestrator", destinationAgent: "proposal_orchestrator", objective: "o", requestedAction: "consume business_audit", expectedOutputSchema: "business_audit", confidence: 0.7, companyId: "clientA", clientWorkspaceId: "clientA", dataClassification: "client_confidential", authorizedMemoryScopes: ["company", "offer", "research"], previousAgentOutputs: { auditId: "aud_1" }, idempotencyKey: "wf_rr:paid_audit->proposal" },
    { now },
  );
  const blockedHandoff = (deliveryState = "dead_lettered"): HandoffRow => ({ ...buildHandoffRow(blockedEnvelope(), { now }), deliveryState: deliveryState as HandoffRow["deliveryState"] });
  const dest = (over: Partial<Parameters<typeof buildDepartmentRow>[0]> = {}): DepartmentRow => buildDepartmentRow(
    { slug: "delivery", name: "Delivery", purpose: "p", status: "active", orchestratorAgentSlug: "delivery_orchestrator",
      io: { acceptedHandoffSchemas: ["business_audit"], inboundCapabilities: ["run_project"], outboundProducts: [], downstreamConsumers: [] },
      permissions: { authorizedMemoryScopes: ["company", "offer", "research", "client"], permittedDataClassifications: ["internal", "client_confidential"], allowedTools: [], deniedTools: [] }, ...over },
    { now },
  );
  const rrDeps = (store: EscalationStore, over: Record<string, unknown> = {}) => ({
    ...deps(store),
    getHandoff: async () => blockedHandoff(),
    loadDepartment: async () => dest(),
    dispatchHandoff: async (_env: unknown, _ctx: unknown) => ({ handoff: { id: "h_new_1" }, deduped: false }),
    cancelHandoff: async () => true,
    ...over,
  });
  const rrEsc = async (store: EscalationStore) => (await createEscalation({ departmentSlug: "paid_audit", workflowId: "wf_rr", taskId: "t1", reason: "dead_lettered" as const, severity: "high" as const, requiredDecision: "resume/reroute/terminate", handoffId: "h_old_1" }, deps(store))).escalation;

  it("creates a valid alternate handoff, cancels the old route, resolves action=reroute (lineage preserved)", async () => {
    const { store, rows } = makeStore();
    const esc = await rrEsc(store);
    let cancelledOld: string | null = null;
    let dispatched: { department?: string; authorizedMemoryScopes?: string[]; clientWorkspaceId?: string | null; previousAgentOutputs?: Record<string, unknown> } | null = null;
    const r = await rerouteEscalation(esc.id, "Moiz", { destinationDepartment: "delivery", reason: "specialist unavailable" }, rrDeps(store, {
      dispatchHandoff: async (env: { department?: string; authorizedMemoryScopes?: string[]; clientWorkspaceId?: string | null; previousAgentOutputs?: Record<string, unknown> }) => { dispatched = env; return { handoff: { id: "h_new_1" }, deduped: false }; },
      cancelHandoff: async (id: string) => { cancelledOld = id; return true; },
    }));
    expect(r.ok).toBe(true);
    expect(r.newHandoffId).toBe("h_new_1");
    expect(cancelledOld).toBe("h_old_1"); // old route superseded
    expect(dispatched!.department).toBe("delivery"); // addressed to the alternate
    expect(dispatched!.clientWorkspaceId).toBe("clientA"); // tenant preserved
    expect(dispatched!.previousAgentOutputs!.auditId).toBe("aud_1"); // completed work / evidence preserved
    expect(dispatched!.authorizedMemoryScopes).toEqual(["company", "offer", "research"]); // within dest grant, not widened
    expect(rows.get(esc.id)!.resolutionAction).toBe("reroute");
    expect(rows.get(esc.id)!.handoffId).toBe("h_new_1"); // new handoff linked to the escalation
  });

  it("REJECTS terminal work (completed/cancelled handoff cannot be rerouted)", async () => {
    const { store } = makeStore();
    const esc = await rrEsc(store);
    const r = await rerouteEscalation(esc.id, "Moiz", { destinationDepartment: "delivery", reason: "x" }, rrDeps(store, { getHandoff: async () => blockedHandoff("completed") }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/completed — cannot reroute terminal/);
  });

  it("REJECTS an inactive destination", async () => {
    const { store } = makeStore();
    const esc = await rrEsc(store);
    const r = await rerouteEscalation(esc.id, "Moiz", { destinationDepartment: "delivery", reason: "x" }, rrDeps(store, { loadDepartment: async () => dest({ status: "draft" }) }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not active/);
  });

  it("REJECTS a destination that does not accept the product schema", async () => {
    const { store } = makeStore();
    const esc = await rrEsc(store);
    const r = await rerouteEscalation(esc.id, "Moiz", { destinationDepartment: "delivery", reason: "x" }, rrDeps(store, { loadDepartment: async () => dest({ io: { acceptedHandoffSchemas: ["won_deal"], inboundCapabilities: [], outboundProducts: [], downstreamConsumers: [] } }) }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/schema 'business_audit' is not accepted/);
  });

  it("REJECTS a destination not permitted for the data classification", async () => {
    const { store } = makeStore();
    const esc = await rrEsc(store);
    const r = await rerouteEscalation(esc.id, "Moiz", { destinationDepartment: "delivery", reason: "x" }, rrDeps(store, { loadDepartment: async () => dest({ permissions: { authorizedMemoryScopes: ["company"], permittedDataClassifications: ["internal"], allowedTools: [], deniedTools: [] } }) }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/classification 'client_confidential' is not permitted/);
  });

  it("does NOT cancel the old route if the alternate dispatch fails (old work preserved)", async () => {
    const { store } = makeStore();
    const esc = await rrEsc(store);
    let cancelled = false;
    const r = await rerouteEscalation(esc.id, "Moiz", { destinationDepartment: "delivery", reason: "x" }, rrDeps(store, {
      dispatchHandoff: async () => { throw new Error("tenant mismatch"); },
      cancelHandoff: async () => { cancelled = true; return true; },
    }));
    expect(r.ok).toBe(false);
    expect(cancelled).toBe(false); // old route untouched
  });

  it("is idempotent: rerouting an already-rerouted escalation is a no-op success", async () => {
    const { store } = makeStore();
    const esc = await rrEsc(store);
    await rerouteEscalation(esc.id, "Moiz", { destinationDepartment: "delivery", reason: "x" }, rrDeps(store));
    const again = await rerouteEscalation(esc.id, "Moiz", { destinationDepartment: "delivery", reason: "x" }, rrDeps(store));
    expect(again.ok).toBe(true);
  });
});
