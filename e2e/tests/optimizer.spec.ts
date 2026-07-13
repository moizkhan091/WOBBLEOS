import { test, expect } from "@playwright/test";

/**
 * Controlled Dream / Optimizer — the founder-facing operational path (real DB effects):
 *   a founder TRIGGERS a cycle (observe real signals + propose) → inspects cycles/proposals → drives the governed
 *   lifecycle (approve → activate → monitor → rollback). The action route governs illegal transitions with a 409.
 */
test.describe("Self-Optimizer — cycle + governed lifecycle (real effects)", () => {
  test("a founder triggers a cycle, inspects it, and the action route governs proposals", async ({ request }) => {
    // TRIGGER a real cycle — observes real signals, proposes evidence-backed opportunities, changes nothing.
    const run = await request.post("/api/optimizer", { data: {} });
    expect(run.status()).toBe(201);
    const runBody = (await run.json()) as { ok: boolean; observations: number; opportunities: number; proposalIds: string[] };
    expect(runBody.ok).toBe(true);
    expect(typeof runBody.observations).toBe("number");
    expect(typeof runBody.opportunities).toBe("number");

    // INSPECT — the cycle is durably listed for the founder.
    const view = await request.get("/api/optimizer?limit=10");
    expect(view.ok()).toBe(true);
    const viewBody = (await view.json()) as { cycles: Array<{ id: string; status: string }>; proposals: Array<{ id: string; status: string; metadata: { evaluation?: { passed?: boolean } } }> };
    expect(viewBody.cycles.length).toBeGreaterThanOrEqual(1);

    // GOVERNANCE guard: the action route refuses an unknown proposal (409) — proving it is wired + governed.
    const bogus = await request.post("/api/optimizer/proposals/does_not_exist/action", { data: { action: "approve" } });
    expect(bogus.status()).toBe(409);

    // Drive the FULL governed chain on a proposal whose EVIDENCE evaluation passes (a strong-evidence opportunity).
    // The evidence gate is REAL, so only an approvable proposal can proceed — approve → activate → monitor → rollback.
    const approvable = viewBody.proposals.find((p) => p.status === "proposed" && p.metadata?.evaluation?.passed === true);
    if (approvable) {
      const id = approvable.id;
      const approve = await request.post(`/api/optimizer/proposals/${id}/action`, { data: { action: "approve" } });
      expect(approve.ok()).toBe(true);
      const activate = await request.post(`/api/optimizer/proposals/${id}/action`, { data: { action: "activate" } });
      expect(activate.ok()).toBe(true);
      // Monitor with a metric BELOW baseline + autoRollback → the improvement is rolled back (no degrading change persists).
      const monitor = await request.post(`/api/optimizer/proposals/${id}/action`, { data: { action: "monitor", measuredMetric: 0, autoRollback: true } });
      expect(monitor.ok()).toBe(true);
      const monBody = (await monitor.json()) as { degraded: boolean; rolledBack: boolean };
      expect(monBody.degraded).toBe(true);
      expect(monBody.rolledBack).toBe(true);
    }
  });
});
