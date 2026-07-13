import { describe, expect, it } from "vitest";
import {
  createMediaJob,
  dispatchOneMediaJob,
  cancelMediaJob,
  retryMediaJob,
  deterministicMediaProvider,
  type MediaStore,
  type MediaJobRow,
  type MediaProvider,
} from "@/lib/media";

const noAudit = async () => {};

function makeStore(seed: MediaJobRow[] = []) {
  const rows = new Map<string, MediaJobRow>(seed.map((r) => [r.id, r]));
  const store: MediaStore = {
    insert: async (r) => { if (r.dedupeKey && [...rows.values()].some((x) => x.dedupeKey === r.dedupeKey)) return false; rows.set(r.id, r); return true; },
    getById: async (id) => rows.get(id) ?? null,
    getByDedupeKey: async (k) => [...rows.values()].find((x) => x.dedupeKey === k) ?? null,
    list: async (q) => [...rows.values()].filter((x) => (q.status ? x.status === q.status : true)).slice(0, q.limit),
    update: async (id, f) => { const c = rows.get(id); if (c) rows.set(id, { ...c, ...f } as MediaJobRow); },
    updateOwned: async (id, owner, f) => { const c = rows.get(id); if (!c || c.leaseOwner !== owner) return false; rows.set(id, { ...c, ...f } as MediaJobRow); return true; },
    claim: async (owner, exp, now) => {
      const j = [...rows.values()].filter((x) => x.status === "queued" || (x.status === "generating" && x.leaseExpiresAt !== null && x.leaseExpiresAt < now)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      if (!j) return null;
      const claimed = { ...j, status: "generating" as const, leaseOwner: owner, leaseExpiresAt: exp, startedAt: j.startedAt ?? now };
      rows.set(j.id, claimed);
      return claimed;
    },
    reclaimStale: async (now) => {
      let n = 0;
      for (const [id, x] of rows) if (x.status === "generating" && (!x.leaseExpiresAt || x.leaseExpiresAt < now)) { rows.set(id, { ...x, status: "queued", leaseOwner: null, leaseExpiresAt: null }); n++; }
      return n;
    },
  };
  return { store, rows };
}

const boom: MediaProvider = { slug: "boom", configured: () => true, generate: async () => { throw new Error("kaboom"); } };

describe("media service — worker lifecycle (no IO)", () => {
  it("creates a queued job (validated) and is idempotent by dedupeKey; rejects over-budget", async () => {
    const { store, rows } = makeStore();
    const a = await createMediaJob({ kind: "image", prompt: "hero", provider: "deterministic", estimatedCostCents: 0, budgetCapCents: 100, requestedBy: "Moiz", dedupeKey: "k" }, { store, recordAudit: noAudit });
    expect(a.job?.status).toBe("queued");
    const b = await createMediaJob({ kind: "image", prompt: "hero", provider: "deterministic", estimatedCostCents: 0, budgetCapCents: 100, requestedBy: "Moiz", dedupeKey: "k" }, { store, recordAudit: noAudit });
    expect(b.deduped).toBe(true);
    expect(rows.size).toBe(1);
    expect((await createMediaJob({ kind: "image", prompt: "x", estimatedCostCents: 999, budgetCapCents: 10, requestedBy: "Moiz" }, { store, recordAudit: noAudit })).ok).toBe(false);
  });

  it("runs a job to succeeded with a configured provider (real outputs)", async () => {
    const { store } = makeStore();
    const c = await createMediaJob({ kind: "image", prompt: "p", provider: "deterministic", estimatedCostCents: 0, budgetCapCents: 100, requestedBy: "Moiz" }, { store, recordAudit: noAudit });
    const r = await dispatchOneMediaJob({ store, recordAudit: noAudit, providers: { deterministic: deterministicMediaProvider } });
    expect(r.status).toBe("succeeded");
    expect((await store.getById(c.job!.id))!.outputRefs.length).toBeGreaterThanOrEqual(1);
  });

  it("blocks a job when the provider is not configured (never faked)", async () => {
    const { store } = makeStore();
    const c = await createMediaJob({ kind: "video", prompt: "p", provider: "fal", estimatedCostCents: 0, budgetCapCents: 100, requestedBy: "Moiz" }, { store, recordAudit: noAudit });
    const r = await dispatchOneMediaJob({ store, recordAudit: noAudit, providers: { fal: { slug: "fal", configured: () => false, generate: async () => ({ outputRefs: [] }) } } });
    expect(r.status).toBe("blocked");
    expect((await store.getById(c.job!.id))!.outputRefs.length).toBe(0);
  });

  it("retries a failing provider then dead-letters at the attempt cap", async () => {
    const { store } = makeStore();
    const c = await createMediaJob({ kind: "image", prompt: "p", provider: "boom", estimatedCostCents: 0, budgetCapCents: 100, requestedBy: "Moiz", maxAttempts: 2 }, { store, recordAudit: noAudit });
    expect((await dispatchOneMediaJob({ store, recordAudit: noAudit, providers: { boom } })).status).toBe("queued");
    expect((await dispatchOneMediaJob({ store, recordAudit: noAudit, providers: { boom } })).status).toBe("failed");
    expect((await store.getById(c.job!.id))!.attempts).toBe(2);
  });

  it("reclaims an expired-lease generating job (crash recovery)", async () => {
    const { store } = makeStore();
    const c = await createMediaJob({ kind: "image", prompt: "p", provider: "deterministic", estimatedCostCents: 0, budgetCapCents: 100, requestedBy: "Moiz" }, { store, recordAudit: noAudit });
    await store.update(c.job!.id, { status: "generating", leaseOwner: "dead", leaseExpiresAt: new Date(Date.now() - 1000) });
    expect(await store.reclaimStale(new Date())).toBeGreaterThanOrEqual(1);
    expect((await store.getById(c.job!.id))!.status).toBe("queued");
  });

  it("cancels a queued job; refuses to cancel a terminal one; retry only from failed/blocked", async () => {
    const { store } = makeStore();
    const c = await createMediaJob({ kind: "image", prompt: "p", provider: "deterministic", estimatedCostCents: 0, budgetCapCents: 100, requestedBy: "Moiz" }, { store, recordAudit: noAudit });
    expect((await cancelMediaJob(c.job!.id, { canceledBy: "Moiz" }, { store, recordAudit: noAudit })).ok).toBe(true);
    expect((await cancelMediaJob(c.job!.id, { canceledBy: "Moiz" }, { store, recordAudit: noAudit })).ok).toBe(false);
    expect((await retryMediaJob(c.job!.id, { retriedBy: "Moiz" }, { store, recordAudit: noAudit })).ok).toBe(false);
  });
});
