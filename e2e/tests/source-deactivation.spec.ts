import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Source deactivation — the founder-controlled reversible path (real DB effects):
 *   create → approve (active) → DEACTIVATE (collection stops, evidence preserved, reversible) → REACTIVATE.
 * Deactivation drops the source from the active feed but keeps the record + approval; reactivation restores it.
 */
async function listIds(request: APIRequestContext, status: "active" | "archived"): Promise<string[]> {
  const res = await request.get(`/api/sources?status=${status}&limit=300`);
  const json = (await res.json()) as { sources?: Array<{ id: string }> };
  return (json.sources ?? []).map((s) => s.id);
}

test.describe("Source deactivation — reversible founder collection control (real effects)", () => {
  test("an active source can be deactivated (collection stops, evidence preserved) and reactivated", async ({ request }) => {
    const stamp = Date.now();
    // Create → pending.
    const create = await request.post("/api/sources", {
      data: { title: `E2E deact ${stamp}`, sourceType: "url", url: `https://example.com/e2e-deact-${stamp}`, ownerScope: "company", ownerId: `e2e_srcdeact_${stamp}`, addedBy: "Moiz" },
    });
    expect(create.ok()).toBe(true);
    const created = (await create.json()) as { source: { id: string }; approval: { id: string } };
    const id = created.source.id;

    // Founder approves → active.
    const approve = await request.post(`/api/sources/${id}/approval`, {
      data: { action: "approve", approvalId: created.approval.id, approvedBy: "Moiz", trustLevel: "tier_3_monitored" },
    });
    expect(approve.ok()).toBe(true);
    expect(await listIds(request, "active")).toContain(id);

    // DEACTIVATE → ok + impact; drops out of the active feed; still present as archived + approval preserved.
    const deact = await request.post(`/api/sources/${id}/action`, { data: { action: "deactivate", reason: "e2e no longer authoritative" } });
    expect(deact.ok()).toBe(true);
    const deactBody = (await deact.json()) as { ok: boolean; impact?: { chunksPreserved: number }; source?: { status: string } };
    expect(deactBody.ok).toBe(true);
    expect(deactBody.impact?.chunksPreserved).toBeGreaterThanOrEqual(0);
    expect(await listIds(request, "active")).not.toContain(id); // COLLECTION STOPS
    const archivedRes = await request.get(`/api/sources?status=archived&limit=300`);
    const archived = ((await archivedRes.json()) as { sources: Array<{ id: string; approvalStatus: string; processingStatus: string }> }).sources.find((s) => s.id === id)!;
    expect(archived.approvalStatus).toBe("approved"); // approval PRESERVED (not a rejection)
    expect(archived.processingStatus).toBe("archived");

    // REACTIVATE (rollback) → back in the active feed.
    const react = await request.post(`/api/sources/${id}/action`, { data: { action: "reactivate" } });
    expect(react.ok()).toBe(true);
    expect(((await react.json()) as { ok: boolean }).ok).toBe(true);
    expect(await listIds(request, "active")).toContain(id);
  });
});
