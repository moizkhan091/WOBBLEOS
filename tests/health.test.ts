import { describe, expect, it } from "vitest";
import { getHealthStatus } from "@/lib/health";

describe("health/readiness", () => {
  it("reports healthy + db up when the ping succeeds, with a latency", async () => {
    const h = await getHealthStatus({ pingDb: async () => {}, now: () => new Date("2026-07-14T00:00:00Z") });
    expect(h.ok).toBe(true);
    expect(h.status).toBe("healthy");
    expect(h.db).toBe("up");
    expect(h.dbLatencyMs).not.toBeNull();
  });

  it("reports degraded + db down (never fakes healthy) when the ping throws", async () => {
    const h = await getHealthStatus({ pingDb: async () => { throw new Error("down"); } });
    expect(h.ok).toBe(false);
    expect(h.status).toBe("degraded");
    expect(h.db).toBe("down");
    expect(h.dbLatencyMs).toBeNull();
  });
});
