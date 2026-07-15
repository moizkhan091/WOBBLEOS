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
