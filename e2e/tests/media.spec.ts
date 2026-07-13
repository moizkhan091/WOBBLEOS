import { test, expect } from "@playwright/test";

/**
 * Media Studio — the founder-facing durable pipeline (real DB effects). The provider-independent pipeline is built;
 * the live fal.ai call is the only blocked piece. A founder submits a job → the worker (scheduler tick) runs it →
 * with NO provider key the job is truthfully BLOCKED (never a fabricated success) → the founder can retry/cancel.
 */
test.describe("Media Studio — submit → worker → honest blocked (real effects)", () => {
  test("a submitted media job is durable, the worker runs it, and it is BLOCKED honestly with no provider", async ({ request }) => {
    const stamp = Date.now();
    // Pipeline status is honest: built, provider not configured (no FAL_KEY in CI).
    const status = await request.get("/api/media?limit=50");
    expect(status.ok()).toBe(true);
    const s = (await status.json()) as { pipelineBuilt: boolean; providerConfigured: boolean };
    expect(s.pipelineBuilt).toBe(true);
    expect(s.providerConfigured).toBe(false);

    // Submit a job → queued.
    const create = await request.post("/api/media", { data: { kind: "image", prompt: `hero shot ${stamp}`, estimatedCostCents: 0, budgetCapCents: 500 } });
    expect(create.status()).toBe(201);
    const id = ((await create.json()) as { job: { id: string; status: string } }).job.id;

    // The scheduler tick is the real media worker trigger — it claims + runs the job. With no provider → blocked.
    const tick = await request.post("/api/scheduler/tick", { data: {} });
    expect(tick.ok()).toBe(true);
    expect((await tick.json()) as { mediaJobsDispatched?: number }).toHaveProperty("mediaJobsDispatched");

    // The job is now BLOCKED (honest degraded state, no outputs) — never a fabricated success.
    const afterRes = await request.get("/api/media?limit=50");
    const after = ((await afterRes.json()) as { jobs: Array<{ id: string; status: string; outputRefs: string[]; error: string | null }> }).jobs.find((j) => j.id === id)!;
    expect(after.status).toBe("blocked");
    expect(after.outputRefs.length).toBe(0);
    expect(after.error).toContain("not configured");

    // Founder can requeue a blocked job (e.g. after configuring a provider) and cancel it.
    const retry = await request.post(`/api/media/${id}/action`, { data: { action: "retry" } });
    expect(retry.ok()).toBe(true);
    const cancel = await request.post(`/api/media/${id}/action`, { data: { action: "cancel" } });
    expect(cancel.ok()).toBe(true);
    const finalRes = await request.get("/api/media?limit=50");
    const final = ((await finalRes.json()) as { jobs: Array<{ id: string; status: string }> }).jobs.find((j) => j.id === id)!;
    expect(final.status).toBe("canceled");
  });
});
