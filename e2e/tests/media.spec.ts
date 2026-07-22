import { test, expect } from "@playwright/test";
import { runMediaWorkerCycle } from "@/lib/media/worker";

/**
 * Media Studio — founder-facing durable pipeline with a bounded dedicated-worker cycle.
 *
 * Exercises the honest-blocked path through a VIDEO job. Images deliberately are NOT used here: they
 * route to OpenRouter on the OS's existing key, so an image job would really generate (and really
 * charge) on any machine where that key is set. Video/audio/3d go to fal, which is unconfigured in CI
 * and on developer machines alike — so this test stays deterministic and costs nothing, anywhere.
 */
test.describe("Media Studio — submit → dedicated worker → honest blocked (real effects)", () => {
  test("a durable job is consumed by the media worker and blocked honestly without a provider", async ({ request }) => {
    const stamp = Date.now();
    const status = await request.get("/api/media?limit=50");
    expect(status.ok()).toBe(true);
    const s = (await status.json()) as { pipelineBuilt: boolean; videoAudio3dEnabled: boolean };
    expect(s.pipelineBuilt).toBe(true);
    // Assert the VIDEO capability specifically, not the aggregate `providerConfigured`.
    // WHY: images now run on OpenRouter (the key the OS already uses), so the aggregate flag is true on
    // any machine with OPENROUTER_API_KEY set — and this test then submitted a real IMAGE job and made a
    // genuine PAID call, contradicting the "no provider credential or paid call" promise in the header.
    // fal (video/audio/3d) is the capability that is honestly unconfigured everywhere, so exercising the
    // blocked path through a VIDEO job is deterministic in CI and on a developer machine alike, and free.
    expect(s.videoAudio3dEnabled).toBe(false);

    const create = await request.post("/api/media", {
      data: { kind: "video", prompt: `hero shot ${stamp}`, estimatedCostCents: 0, budgetCapCents: 500 },
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
