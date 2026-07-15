import { test, expect } from "@playwright/test";
import { runMediaWorkerCycle } from "@/lib/media/worker";

/**
 * Media Studio — founder-facing durable pipeline with a bounded dedicated-worker cycle. The live
 * fal.ai call remains externally blocked; this test uses no provider credential or paid call.
 */
test.describe("Media Studio — submit → dedicated worker → honest blocked (real effects)", () => {
  test("a durable job is consumed by the media worker and blocked honestly without a provider", async ({ request }) => {
    const stamp = Date.now();
    const status = await request.get("/api/media?limit=50");
    expect(status.ok()).toBe(true);
    const s = (await status.json()) as { pipelineBuilt: boolean; providerConfigured: boolean };
    expect(s.pipelineBuilt).toBe(true);
    expect(s.providerConfigured).toBe(false);

    const create = await request.post("/api/media", {
      data: { kind: "image", prompt: `hero shot ${stamp}`, estimatedCostCents: 0, budgetCapCents: 500 },
    });
    expect(create.status()).toBe(201);
    const id = ((await create.json()) as { job: { id: string; status: string } }).job.id;

    // This is exactly one production media-worker cycle; the general scheduler is not involved.
    const cycle = await runMediaWorkerCycle({ limit: 1, leaseOwner: `e2e-media-${stamp}` });
    expect(cycle.dispatched).toBe(1);
    expect(cycle.byStatus.blocked).toBe(1);

    const afterRes = await request.get("/api/media?limit=50");
    const after = ((await afterRes.json()) as {
      jobs: Array<{ id: string; status: string; outputRefs: string[]; error: string | null }>;
    }).jobs.find((job) => job.id === id)!;
    expect(after.status).toBe("blocked");
    expect(after.outputRefs).toHaveLength(0);
    expect(after.error).toContain("not configured");

    const retry = await request.post(`/api/media/${id}/action`, { data: { action: "retry" } });
    expect(retry.ok()).toBe(true);
    const cancel = await request.post(`/api/media/${id}/action`, { data: { action: "cancel" } });
    expect(cancel.ok()).toBe(true);
    const finalRes = await request.get("/api/media?limit=50");
    const final = ((await finalRes.json()) as { jobs: Array<{ id: string; status: string }> }).jobs.find((job) => job.id === id)!;
    expect(final.status).toBe("canceled");
  });
});
