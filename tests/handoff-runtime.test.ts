import { describe, expect, it } from "vitest";
import { buildHandoffEnvelope, type HandoffEnvelope } from "@/lib/domain/handoff";
import {
  buildHandoffRow,
  decideHandoffFailure,
  canTransitionHandoff,
  isLeaseExpired,
  type HandoffRow,
  type HandoffDeliveryState,
} from "@/lib/domain/handoff-delivery";
import {
  dispatchHandoff,
  claimNextHandoff,
  completeHandoff,
  failHandoff,
  reclaimExpiredHandoffLeases,
  redriveHandoff,
  cancelHandoff,
  purgeExpiredHandoffs,
  handoffStateCounts,
  listHandoffs,
  getHandoff,
  type HandoffStore,
} from "@/lib/handoff";

const now = new Date("2026-07-11T12:00:00Z");

function makeStore() {
  const rows = new Map<string, HandoffRow>();
  const key = (r: { workflowId: string; idempotencyKey: string }) => `${r.workflowId}::${r.idempotencyKey}`;
  const store: HandoffStore = {
    findByIdempotency: async (workflowId, idempotencyKey) => [...rows.values()].find((r) => r.workflowId === workflowId && r.idempotencyKey === idempotencyKey) ?? null,
    insert: async (row) => {
      if ([...rows.values()].some((r) => key(r) === key(row))) {
        throw new Error("duplicate key value violates unique constraint");
      }
      rows.set(row.id, row);
    },
    getById: async (id) => rows.get(id) ?? null,
    claimNext: async (destinationAgent, lease, at) => {
      const due = [...rows.values()]
        .filter((r) => r.destinationAgent === destinationAgent && r.deliveryState === "delivered" && (r.runAfter === null || r.runAfter.getTime() <= at.getTime()))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      if (!due) return null;
      const claimed = { ...due, deliveryState: "processing" as HandoffDeliveryState, leaseOwner: lease.owner, leaseExpiresAt: lease.expiresAt, updatedAt: at };
      rows.set(claimed.id, claimed);
      return claimed;
    },
    transition: async (id, from, fields) => {
      const r = rows.get(id);
      if (!r || r.deliveryState !== from) return false; // optimistic guard
      rows.set(id, { ...r, ...fields });
      return true;
    },
    reclaimExpiredLeases: async (at) => {
      let n = 0;
      for (const r of rows.values()) {
        if (r.deliveryState === "processing" && r.leaseExpiresAt && r.leaseExpiresAt.getTime() <= at.getTime()) {
          rows.set(r.id, { ...r, deliveryState: "delivered", leaseOwner: null, leaseExpiresAt: null, updatedAt: at });
          n += 1;
        }
      }
      return n;
    },
    list: async (q) => [...rows.values()].filter((r) => (!q.workflowId || r.workflowId === q.workflowId) && (!q.deliveryState || r.deliveryState === q.deliveryState) && (!q.clientWorkspaceId || r.clientWorkspaceId === q.clientWorkspaceId) && (!q.department || r.department === q.department) && (!q.sourceAgent || r.sourceAgent === q.sourceAgent) && (!q.destinationAgent || r.destinationAgent === q.destinationAgent)).slice(0, q.limit),
    countByState: async () => { const out: Record<string, number> = {}; for (const r of rows.values()) out[r.deliveryState] = (out[r.deliveryState] ?? 0) + 1; return out; },
    deleteExpired: async (before) => { let n = 0; for (const [k, r] of rows) if (["completed", "cancelled", "dead_lettered"].includes(r.deliveryState) && r.updatedAt.getTime() <= before.getTime()) { rows.delete(k); n += 1; } return n; },
  };
  return { store, rows };
}

function envelope(overrides: Partial<Parameters<typeof buildHandoffEnvelope>[0]> = {}): HandoffEnvelope {
  return buildHandoffEnvelope(
    { workflowId: "wf_1", department: "paid_audit", sourceAgent: "a", destinationAgent: "audit_opportunity_finder", objective: "o", requestedAction: "r", expectedOutputSchema: "opportunity_set", confidence: 0.8, clientWorkspaceId: "clientA", authorizedMemoryScopes: ["company"], ...overrides },
    { now, taskId: "task_1" },
  );
}

describe("handoff-delivery domain (state machine)", () => {
  it("allows only valid transitions", () => {
    expect(canTransitionHandoff("delivered", "processing")).toBe(true);
    expect(canTransitionHandoff("processing", "completed")).toBe(true);
    expect(canTransitionHandoff("processing", "delivered")).toBe(true); // lease reclaim
    expect(canTransitionHandoff("failed", "dead_lettered")).toBe(true);
    expect(canTransitionHandoff("dead_lettered", "delivered")).toBe(true); // redrive
    expect(canTransitionHandoff("completed", "delivered")).toBe(false);
    expect(canTransitionHandoff("cancelled", "processing")).toBe(false);
  });
  it("retries with backoff until out of attempts, then dead-letters", () => {
    expect(decideHandoffFailure({ retryCount: 0, maxRetries: 2 })).toMatchObject({ next: "delivered", backoffMs: 1000 });
    expect(decideHandoffFailure({ retryCount: 1, maxRetries: 2 })).toMatchObject({ next: "delivered", backoffMs: 2000 });
    expect(decideHandoffFailure({ retryCount: 2, maxRetries: 2 })).toMatchObject({ next: "dead_lettered" });
  });
  it("detects an expired lease", () => {
    expect(isLeaseExpired(new Date("2026-07-11T11:00:00Z"), now)).toBe(true);
    expect(isLeaseExpired(new Date("2026-07-11T13:00:00Z"), now)).toBe(false);
    expect(isLeaseExpired(null, now)).toBe(false);
  });
});

describe("handoff runtime (durable backbone)", () => {
  it("sender persists; destination consumes; correct agent receives", async () => {
    const { store } = makeStore();
    const { handoff, deduped } = await dispatchHandoff(envelope(), { clientWorkspaceId: "clientA", grantedMemoryScopes: ["company"] }, { store, recordAudit: async () => {}, now });
    expect(deduped).toBe(false);
    expect(handoff.deliveryState).toBe("delivered");

    const wrongAgent = await claimNextHandoff("some_other_agent", "worker_1", { store, recordAudit: async () => {}, now });
    expect(wrongAgent).toBeNull(); // only the addressed agent can claim
    const claimed = await claimNextHandoff("audit_opportunity_finder", "worker_1", { store, recordAudit: async () => {}, now });
    expect(claimed?.deliveryState).toBe("processing");
    expect(claimed?.leaseOwner).toBe("worker_1");
  });

  it("REJECTS a wrong-workspace delivery (tenant isolation) before persisting", async () => {
    const { store, rows } = makeStore();
    await expect(dispatchHandoff(envelope({ clientWorkspaceId: "clientA" }), { clientWorkspaceId: "clientB" }, { store, recordAudit: async () => {}, now })).rejects.toThrow(/client isolation/);
    expect(rows.size).toBe(0);
  });

  it("REJECTS an unauthorized memory scope before persisting", async () => {
    const { store, rows } = makeStore();
    await expect(dispatchHandoff(envelope({ authorizedMemoryScopes: ["company", "founder_moiz"] }), { grantedMemoryScopes: ["company"] }, { store, recordAudit: async () => {}, now })).rejects.toThrow(/unauthorized memory scopes/);
    expect(rows.size).toBe(0);
  });

  it("duplicate delivery executes ONCE (idempotent dispatch)", async () => {
    const { store, rows } = makeStore();
    const env = envelope();
    const first = await dispatchHandoff(env, { clientWorkspaceId: "clientA", grantedMemoryScopes: ["company"] }, { store, recordAudit: async () => {}, now });
    const second = await dispatchHandoff(env, { clientWorkspaceId: "clientA", grantedMemoryScopes: ["company"] }, { store, recordAudit: async () => {}, now });
    expect(second.deduped).toBe(true);
    expect(second.handoff.id).toBe(first.handoff.id);
    expect(rows.size).toBe(1); // stored once
  });

  it("a crashed consumer's expired lease is reclaimed → the handoff becomes deliverable again", async () => {
    const { store } = makeStore();
    await dispatchHandoff(envelope(), { clientWorkspaceId: "clientA", grantedMemoryScopes: ["company"] }, { store, recordAudit: async () => {}, now });
    const claimed = await claimNextHandoff("audit_opportunity_finder", "worker_1", { store, recordAudit: async () => {}, now });
    expect(claimed?.deliveryState).toBe("processing");
    // worker_1 crashes; time passes beyond the lease.
    const later = new Date(now.getTime() + 10 * 60_000);
    const reclaimed = await reclaimExpiredHandoffLeases({ store, recordAudit: async () => {}, now: later });
    expect(reclaimed).toBe(1);
    // a healthy worker can now re-claim it.
    const reclaim = await claimNextHandoff("audit_opportunity_finder", "worker_2", { store, recordAudit: async () => {}, now: later });
    expect(reclaim?.leaseOwner).toBe("worker_2");
  });

  it("failed handoffs retry then reach dead-letter; redrive resumes them", async () => {
    const { store } = makeStore();
    const { handoff } = await dispatchHandoff(envelope(), { clientWorkspaceId: "clientA", grantedMemoryScopes: ["company"] }, { store, recordAudit: async () => {}, now });
    // Exhaust retries (maxRetries default 5): fail repeatedly, re-delivering + re-claiming each time.
    for (let i = 0; i < 5; i += 1) {
      await claimNextHandoff("audit_opportunity_finder", "w", { store, recordAudit: async () => {}, now: new Date(now.getTime() + i * 120_000 + 60_000) });
      const r = await failHandoff(handoff.id, `attempt ${i}`, { store, recordAudit: async () => {}, now: new Date(now.getTime() + i * 120_000 + 61_000) });
      expect(r?.next).toBe("delivered");
    }
    // Claim + fail once more → out of attempts → dead-lettered.
    await claimNextHandoff("audit_opportunity_finder", "w", { store, recordAudit: async () => {}, now: new Date(now.getTime() + 999_000) });
    const dead = await failHandoff(handoff.id, "final", { store, recordAudit: async () => {}, now: new Date(now.getTime() + 999_500) });
    expect(dead?.next).toBe("dead_lettered");
    // Manual redrive puts it back into delivery with retries reset.
    expect(await redriveHandoff(handoff.id, "Moiz", { store, recordAudit: async () => {}, now })).toBe(true);
    const back = await store.getById(handoff.id);
    expect(back?.deliveryState).toBe("delivered");
    expect(back?.retryCount).toBe(0);
  });

  it("complete + cancel + retention purge + Founder-Command-Centre state counts", async () => {
    const { store } = makeStore();
    const a = await dispatchHandoff(envelope({ idempotencyKey: "k1", authorizedMemoryScopes: ["company"] }), { clientWorkspaceId: "clientA", grantedMemoryScopes: ["company"] }, { store, recordAudit: async () => {}, now });
    const b = await dispatchHandoff(envelope({ idempotencyKey: "k2", authorizedMemoryScopes: ["company"] }), { clientWorkspaceId: "clientA", grantedMemoryScopes: ["company"] }, { store, recordAudit: async () => {}, now });
    await claimNextHandoff("audit_opportunity_finder", "w", { store, recordAudit: async () => {}, now });
    expect(await completeHandoff(a.handoff.id, { costEstimate: 0.01, latencyMs: 120, qualityScore: 8 }, { store, recordAudit: async () => {}, now })).toBe(true);
    expect(await cancelHandoff(b.handoff.id, "Moiz", { store, recordAudit: async () => {}, now })).toBe(true);

    const counts = await handoffStateCounts({ store });
    expect(counts.completed).toBe(1);
    expect(counts.cancelled).toBe(1);

    // Retention reaps terminal states past the cutoff (live work is never purged).
    const later = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
    const purged = await purgeExpiredHandoffs(later, { store });
    expect(purged).toBe(2);
  });

  it("Command Centre: filters by workflow/client/department/source/dest/state + inspects one handoff", async () => {
    const { store } = makeStore();
    const auth = { clientWorkspaceId: null as string | null, grantedMemoryScopes: ["company"] };
    const deps = { store, recordAudit: async () => {}, now };
    // Two departments, distinct source/destination agents.
    await dispatchHandoff(envelope({ idempotencyKey: "k1", department: "paid_audit", sourceAgent: "orchestrator", destinationAgent: "audit_opportunity_finder", clientWorkspaceId: null, authorizedMemoryScopes: ["company"] }), auth, deps);
    await dispatchHandoff(envelope({ idempotencyKey: "k2", department: "content", sourceAgent: "content_strategist", destinationAgent: "content_researcher", clientWorkspaceId: null, authorizedMemoryScopes: ["company"] }), auth, deps);

    expect((await listHandoffs({ department: "paid_audit" }, { store })).map((h) => h.idempotencyKey)).toEqual(["k1"]);
    expect((await listHandoffs({ department: "content" }, { store })).map((h) => h.idempotencyKey)).toEqual(["k2"]);
    expect((await listHandoffs({ sourceAgent: "content_strategist" }, { store })).map((h) => h.idempotencyKey)).toEqual(["k2"]);
    expect((await listHandoffs({ destinationAgent: "audit_opportunity_finder" }, { store })).map((h) => h.idempotencyKey)).toEqual(["k1"]);
    expect(await listHandoffs({ deliveryState: "delivered" }, { store })).toHaveLength(2);
    expect(await listHandoffs({ deliveryState: "completed" }, { store })).toHaveLength(0);

    // Inspect: the full row (envelope + lineage + delivery state) is returned by id; unknown id → null.
    const one = (await listHandoffs({ department: "content" }, { store }))[0];
    const inspected = await getHandoff(one.id, { store });
    expect(inspected?.envelope.department).toBe("content");
    expect(inspected?.deliveryState).toBe("delivered");
    expect(await getHandoff("handoff_missing", { store })).toBeNull();
  });

  it("redrive/cancel are refused on terminal handoffs (a stale Command Centre click can't rewrite finished work)", async () => {
    const { store } = makeStore();
    const auth = { clientWorkspaceId: null as string | null, grantedMemoryScopes: ["company"] };
    const deps = { store, recordAudit: async () => {}, now };
    const d = await dispatchHandoff(envelope({ idempotencyKey: "term", clientWorkspaceId: null, authorizedMemoryScopes: ["company"] }), auth, deps);
    await claimNextHandoff("audit_opportunity_finder", "w", deps);
    await completeHandoff(d.handoff.id, {}, deps);

    expect(await cancelHandoff(d.handoff.id, "Moiz", deps)).toBe(false); // can't cancel a completed handoff
    expect(await redriveHandoff(d.handoff.id, "Moiz", deps)).toBe(false); // can't redrive a completed handoff
    expect((await getHandoff(d.handoff.id, { store }))!.deliveryState).toBe("completed"); // untouched
  });
});
