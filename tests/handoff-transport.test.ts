import { describe, expect, it } from "vitest";
import { buildHandoffEnvelope, type HandoffEnvelope } from "@/lib/domain/handoff";
import { buildHandoffRow, type HandoffDeliveryState, type HandoffRow } from "@/lib/domain/handoff-delivery";
import { claimHandoffById, reclaimExpiredHandoffLeases, redriveHandoff, type HandoffStore } from "@/lib/handoff";
import { runHandoffHop, HandoffAlreadyProcessedError } from "@/lib/handoff-transport";

const now = new Date("2026-07-12T12:00:00.000Z");

// Faithful in-memory HandoffStore (mirrors the DB store's optimistic guards + unique idempotency index).
function makeStore() {
  const rows = new Map<string, HandoffRow>();
  const key = (r: { workflowId: string; idempotencyKey: string }) => `${r.workflowId}::${r.idempotencyKey}`;
  const store: HandoffStore = {
    findByIdempotency: async (workflowId, idempotencyKey) => [...rows.values()].find((r) => r.workflowId === workflowId && r.idempotencyKey === idempotencyKey) ?? null,
    insert: async (row) => {
      if ([...rows.values()].some((r) => key(r) === key(row))) throw new Error("duplicate key value violates unique constraint");
      rows.set(row.id, row);
    },
    getById: async (id) => rows.get(id) ?? null,
    claimNext: async (destinationAgent, lease, at) => {
      const due = [...rows.values()].filter((r) => r.destinationAgent === destinationAgent && r.deliveryState === "delivered" && (r.runAfter === null || r.runAfter.getTime() <= at.getTime())).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      if (!due) return null;
      const claimed = { ...due, deliveryState: "processing" as HandoffDeliveryState, leaseOwner: lease.owner, leaseExpiresAt: lease.expiresAt, updatedAt: at };
      rows.set(claimed.id, claimed);
      return claimed;
    },
    claimNextForDepartment: async () => null,
    transition: async (id, from, fields) => {
      const r = rows.get(id);
      if (!r || r.deliveryState !== from) return false;
      rows.set(id, { ...r, ...fields });
      return true;
    },
    reclaimExpiredLeases: async (at) => {
      let n = 0;
      for (const r of rows.values()) if (r.deliveryState === "processing" && r.leaseExpiresAt && r.leaseExpiresAt.getTime() <= at.getTime()) { rows.set(r.id, { ...r, deliveryState: "delivered", leaseOwner: null, leaseExpiresAt: null, updatedAt: at }); n += 1; }
      return n;
    },
    list: async (q) => [...rows.values()].filter((r) => (!q.workflowId || r.workflowId === q.workflowId) && (!q.deliveryState || r.deliveryState === q.deliveryState) && (!q.clientWorkspaceId || r.clientWorkspaceId === q.clientWorkspaceId)).slice(0, q.limit),
    countByState: async () => { const out: Record<string, number> = {}; for (const r of rows.values()) out[r.deliveryState] = (out[r.deliveryState] ?? 0) + 1; return out; },
    deleteExpired: async () => 0,
  };
  return { store, rows };
}

function envelope(overrides: Partial<Parameters<typeof buildHandoffEnvelope>[0]> = {}, taskId = "task_1"): HandoffEnvelope {
  return buildHandoffEnvelope(
    { workflowId: "wf_1", department: "paid_audit", sourceAgent: "orchestrator", destinationAgent: "audit_opportunity_finder", objective: "o", requestedAction: "r", expectedOutputSchema: "opportunity_set", confidence: 0.8, clientWorkspaceId: "clientA", authorizedMemoryScopes: ["company"], ...overrides },
    { now, taskId },
  );
}

const ctx = (store: HandoffStore) => ({ store, clientWorkspaceId: "clientA", grantedMemoryScopes: ["company", "research"], recordAudit: async () => {}, now });

describe("handoff transport — runtime-driven consumption", () => {
  it("executes the node ONLY through the full lifecycle and lands the handoff completed", async () => {
    const { store, rows } = makeStore();
    const order: string[] = [];
    const res = await runHandoffHop(
      envelope(),
      async (claimed) => {
        // At execution time the handoff must already be claimed (processing), never `delivered`.
        expect(claimed.deliveryState).toBe("processing");
        expect(rows.get(claimed.id)!.deliveryState).toBe("processing");
        order.push("execute");
        return { value: { ok: 42 }, telemetry: { costEstimate: 0.01, latencyMs: 120 } };
      },
      ctx(store),
    );
    expect(res.result).toEqual({ ok: 42 });
    const row = rows.get(res.handoffId)!;
    expect(row.deliveryState).toBe("completed");
    expect(row.acknowledgedAt).not.toBeNull(); // durable ack happened
    expect(row.completedAt).not.toBeNull();
    expect(row.costEstimate).toBe("0.01");
    expect(order).toEqual(["execute"]);
  });

  it("NEVER executes the node when the envelope is rejected (wrong workspace)", async () => {
    const { store } = makeStore();
    let executed = false;
    await expect(
      runHandoffHop(envelope({ clientWorkspaceId: "clientB" }), async () => { executed = true; return { value: 1 }; }, ctx(store)),
    ).rejects.toThrow(/handoff rejected|workspace/i);
    expect(executed).toBe(false); // dispatch validation blocked it before any claim/execute
  });

  it("NEVER executes the node when the envelope over-reaches memory scope", async () => {
    const { store } = makeStore();
    let executed = false;
    await expect(
      runHandoffHop(envelope({ authorizedMemoryScopes: ["company", "secret_scope_not_granted"] }), async () => { executed = true; return { value: 1 }; }, ctx(store)),
    ).rejects.toThrow(/handoff rejected|scope/i);
    expect(executed).toBe(false);
  });

  it("executes EXACTLY once under duplicate delivery (same envelope dispatched twice)", async () => {
    const { store } = makeStore();
    let runs = 0;
    const env = envelope();
    await runHandoffHop(env, async () => { runs += 1; return { value: "first" }; }, ctx(store));
    // Re-dispatching the SAME envelope (identical idempotencyKey) must not re-run the node.
    await expect(
      runHandoffHop(env, async () => { runs += 1; return { value: "second" }; }, ctx(store)),
    ).rejects.toBeInstanceOf(HandoffAlreadyProcessedError);
    expect(runs).toBe(1);
  });

  it("on executor failure FAILS the handoff (retry/backoff) and re-throws so the caller can roll back", async () => {
    const { store, rows } = makeStore();
    let handoffId = "";
    await expect(
      runHandoffHop(envelope(), async (claimed) => { handoffId = claimed.id; throw new Error("node blew up"); }, ctx(store)),
    ).rejects.toThrow("node blew up");
    const row = rows.get(handoffId)!;
    expect(row.deliveryState).toBe("delivered"); // back to delivered for retry
    expect(row.retryCount).toBe(1);
    expect(row.failureReason).toMatch(/node blew up/);
    expect(row.runAfter).not.toBeNull(); // backoff scheduled
  });

  it("crash-after-claim is recovered by lease expiry, then re-run lands completed (no duplicate row)", async () => {
    const { store, rows } = makeStore();
    // Simulate a crash: dispatch + claim, then the worker dies mid-execute (row stuck `processing`).
    const env = envelope();
    const dispatched = buildHandoffRow(env, { now });
    await store.insert(dispatched);
    await claimHandoffById(dispatched.id, "dead_worker", { store, recordAudit: async () => {}, now });
    expect(rows.get(dispatched.id)!.deliveryState).toBe("processing");

    // Lease expires; the scheduler reclaims it back to `delivered`.
    const later = new Date(now.getTime() + 10 * 60_000);
    const reclaimed = await reclaimExpiredHandoffLeases({ store, recordAudit: async () => {}, now: later });
    expect(reclaimed).toBe(1);
    expect(rows.get(dispatched.id)!.deliveryState).toBe("delivered");

    // A fresh hop for the SAME envelope now dedups to the reclaimed row, re-claims it, and completes it.
    const res = await runHandoffHop(env, async () => ({ value: "recovered" }), { store, clientWorkspaceId: "clientA", grantedMemoryScopes: ["company"], recordAudit: async () => {}, now: later });
    expect(res.result).toBe("recovered");
    expect(res.handoffId).toBe(dispatched.id); // same row — no duplicate
    expect(rows.get(dispatched.id)!.deliveryState).toBe("completed");
    expect([...rows.values()].filter((r) => r.idempotencyKey === env.idempotencyKey)).toHaveLength(1);
  });

  it("a dead-lettered handoff can be redriven and then completes on the next hop (resumes the stage)", async () => {
    const { store, rows } = makeStore();
    const env = envelope();
    const row = buildHandoffRow(env, { now, maxRetries: 0 });
    await store.insert({ ...row, deliveryState: "dead_lettered", deadLetteredAt: now });
    // Founder redrive → delivered again.
    expect(await redriveHandoff(row.id, "Moiz", { store, recordAudit: async () => {}, now })).toBe(true);
    expect(rows.get(row.id)!.deliveryState).toBe("delivered");
    // The same hop now claims + completes it (resumes the exact stage).
    const res = await runHandoffHop(env, async () => ({ value: "redriven" }), ctx(store));
    expect(res.result).toBe("redriven");
    expect(rows.get(row.id)!.deliveryState).toBe("completed");
  });
});
