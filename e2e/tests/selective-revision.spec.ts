import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Selective Revision founder surface (real DB effects). A revision cycle is seeded exactly as the production
 * `revise` trigger opens it: content-graph nodes with `draft` failed → the plan reruns draft + its downstream
 * (revise, scoring) and PRESERVES strategy + research. The founder inspects the plan, drives a SELECTIVE rerun
 * (only the reran nodes' checkpoints are cleared), then ROLLS the cycle back.
 */
const RUN = "e2e_rev_run";
async function cycle(request: APIRequestContext): Promise<{ id: string; status: string; plan: { rerun: string[]; preserved: string[] }; components: Array<{ key: string; status: string; version: number }> } | null> {
  const res = await request.get("/api/revisions?artifactKind=content_graph");
  const json = (await res.json()) as { cycles?: Array<{ id: string; status: string; graphRunId: string; plan: { rerun: string[]; preserved: string[] }; components: Array<{ key: string; status: string; version: number }> }> };
  return (json.cycles ?? []).find((c) => c.graphRunId === RUN) ?? null;
}

test.describe("Selective Revision — inspect → selective rerun → rollback (real effects)", () => {
  test("plan preserves approved upstream nodes; founder drives a selective rerun then rolls back", async ({ request }) => {
    const c = await cycle(request);
    expect(c).not.toBeNull();

    // draft failed → rerun draft, revise, scoring; preserve strategy, research.
    expect(c!.plan.rerun.slice().sort()).toEqual(["draft", "revise", "scoring"]);
    expect(c!.plan.preserved.slice().sort()).toEqual(["research", "strategy"]);
    // the preserved nodes stay approved at v1; the reran nodes are bumped to v2.
    const strategy = c!.components.find((x) => x.key === "strategy")!;
    expect(strategy.status).toBe("approved");
    expect(strategy.version).toBe(1);
    expect(c!.components.find((x) => x.key === "draft")!.version).toBe(2);

    // Selective rerun: exactly the 3 reran nodes' checkpoints are cleared (strategy + research preserved), AND
    // the producer is RE-ENQUEUED bound to the preserved graphRunId (so the re-run reuses the preserved nodes).
    const rerun = await request.post(`/api/revisions/${c!.id}/action`, { data: { action: "rerun" } });
    expect(rerun.status()).toBe(200);
    const rr = (await rerun.json()) as { cleared: number; rerun: string[]; preserved: string[]; reenqueued: boolean };
    expect(rr.cleared).toBe(3);
    expect(rr.preserved.slice().sort()).toEqual(["research", "strategy"]);
    expect(rr.reenqueued).toBe(true); // the content.graph re-run was enqueued under the preserved graphRunId
    // the cycle transitions planned → reran (so a subsequent revise opens a fresh cycle, not the stale plan)
    expect((await cycle(request))!.status).toBe("reran");

    // Rollback restores every component to its PRE-REVISION snapshot: all back to version 1, the preserved
    // nodes still approved, and the originally-failed `draft` faithfully restored to `failed` (not fabricated
    // as approved — rollback undoes the revision, it does not launder a failure).
    const rollback = await request.post(`/api/revisions/${c!.id}/action`, { data: { action: "rollback" } });
    expect(rollback.ok()).toBe(true);
    const after = await cycle(request);
    expect(after!.status).toBe("rolled_back");
    expect(after!.components.every((x) => x.version === 1)).toBe(true);
    expect(after!.components.find((x) => x.key === "strategy")!.status).toBe("approved");
    expect(after!.components.find((x) => x.key === "research")!.status).toBe("approved");
    expect(after!.components.find((x) => x.key === "draft")!.status).toBe("failed");
  });
});
