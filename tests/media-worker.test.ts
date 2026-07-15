import { describe, expect, it, vi } from "vitest";
import { runMediaWorkerCycle } from "@/lib/media/worker";

describe("dedicated media worker", () => {
  it("dispatches queued media through the worker cycle, outside scheduler/web request code", async () => {
    const now = new Date("2026-07-15T00:00:00.000Z");
    const dispatch = vi.fn(async () => ({ dispatched: 1, reclaimed: 0, byStatus: { succeeded: 1 } }));
    const result = await runMediaWorkerCycle({ now, limit: 1, leaseOwner: "media-test", dispatch });
    expect(result).toEqual({ dispatched: 1, reclaimed: 0, byStatus: { succeeded: 1 } });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ now, limit: 1, leaseOwner: "media-test" });
  });
});
