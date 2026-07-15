import { describe, expect, it } from "vitest";
import { getReadiness } from "@/lib/health";

const NOW = new Date("2026-07-14T12:00:00.000Z");
const fresh = { state: "online", at: new Date(NOW.getTime() - 5_000).toISOString() };
const stale = { state: "online", at: new Date(NOW.getTime() - 10 * 60_000).toISOString() };

function deps(over: Partial<Parameters<typeof getReadiness>[0]> = {}) {
  return {
    now: () => NOW,
    pingDb: async () => {},
    probeStorage: async () => true,
    readHeartbeat: async (name: string) => (name.includes("video") ? fresh : fresh),
    ...over,
  };
}

/**
 * WOB-UAT-026 — readiness must refuse a split-brain stack.
 *
 * Regression gate for a defect that happened live: `docker compose up -d --build app` rebuilt only the
 * app, leaving the workers on the previous image against an already-migrated schema. Silent and
 * misleading — a seed run by the stale worker "succeeded" while writing nothing.
 */
describe("getReadiness — service version parity (WOB-UAT-026)", () => {
  const stamped = (buildId: string, at = new Date(NOW.getTime() - 5_000).toISOString()) => ({ state: "online", at, buildId });

  it("is READY in production when every service reports the same build id", async () => {
    // The app's own id comes from its image env; align it with the workers' so this asserts genuine
    // parity rather than the unstamped-app path covered below.
    process.env.WOBBLE_BUILD_ID = "sha-aaa";
    try {
      const r = await getReadiness(deps({ production: true, readHeartbeat: async () => stamped("sha-aaa") }));
      const parity = r.checks.find((c) => c.name === "version-parity");
      expect(parity?.ok).toBe(true);
      expect(parity?.critical).toBe(true); // it IS a blocking gate in production
      expect(parity?.detail).toContain("all services on");
      expect(r.ok).toBe(true);
    } finally {
      delete process.env.WOBBLE_BUILD_ID;
    }
  });

  it("is NOT READY in production when a worker runs a DIFFERENT build (the real defect)", async () => {
    process.env.WOBBLE_BUILD_ID = "sha-new";
    try {
      const r = await getReadiness(
        deps({ production: true, readHeartbeat: async (n) => (n.includes("video") ? stamped("sha-OLD") : stamped("sha-new")) }),
      );
      expect(r.ok).toBe(false);
      expect(r.status).toBe("not_ready");
      const parity = r.checks.find((c) => c.name === "version-parity");
      expect(parity?.ok).toBe(false);
      expect(parity?.critical).toBe(true);
      // Names the exact stale service and the remedy — an operator must not have to guess.
      expect(parity?.detail).toContain("worker-video");
      expect(parity?.detail).toContain("docker compose up -d --build");
    } finally {
      delete process.env.WOBBLE_BUILD_ID;
    }
  });

  it("does NOT fire outside production, where nothing is stamped (no false alarm in dev)", async () => {
    const r = await getReadiness(deps({ production: false }));
    const parity = r.checks.find((c) => c.name === "version-parity");
    expect(parity?.critical).toBe(false); // reported, but never blocks local dev
    expect(parity?.detail).toContain("not enforced outside production");
    expect(r.ok).toBe(true); // the rest of the stack is healthy, so dev stays usable
  });

  it("in production an UNSTAMPED app fails — unverifiable is not the same as fine", async () => {
    const r = await getReadiness(deps({ production: true, readHeartbeat: async () => stamped("sha-aaa") }));
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.name === "version-parity")?.detail).toContain("no WOBBLE_BUILD_ID");
  });
});

describe("getReadiness (WOB-AUD-013)", () => {
  it("is READY when db + storage + worker are healthy", async () => {
    const r = await getReadiness(deps());
    expect(r.ok).toBe(true);
    expect(r.status).toBe("ready");
    expect(r.checks.find((c) => c.name === "database")?.ok).toBe(true);
    expect(r.checks.find((c) => c.name === "worker")?.ok).toBe(true);
  });

  it("is NOT READY when the general worker heartbeat is stale (the 'green but inert' gap)", async () => {
    const r = await getReadiness(deps({ readHeartbeat: async (n) => (n.includes("video") ? fresh : stale) }));
    expect(r.ok).toBe(false);
    expect(r.status).toBe("not_ready");
    expect(r.checks.find((c) => c.name === "worker")?.ok).toBe(false);
  });

  it("is NOT READY when the DB is down even if the web layer is serving", async () => {
    const r = await getReadiness(deps({ pingDb: async () => { throw new Error("connection refused"); } }));
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.name === "database")?.ok).toBe(false);
  });

  it("is NOT READY when the required media worker is down", async () => {
    const r = await getReadiness(deps({ readHeartbeat: async (n) => (n.includes("video") ? null : fresh) }));
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.name === "video-worker")?.ok).toBe(false);
  });

  it("is NOT READY when storage is unwritable", async () => {
    const r = await getReadiness(deps({ probeStorage: async () => false }));
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.name === "storage")?.ok).toBe(false);
  });
});
