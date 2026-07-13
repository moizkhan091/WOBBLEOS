import { test, expect } from "@playwright/test";

/**
 * Continuous-research ingestion — the founder-facing re-ingest control (real DB effects). An INLINE-TEXT source
 * (manual note / pasted content) is collected by the unblocked `inline_text` adapter with NO external key: the
 * founder triggers re-ingest and real source_chunks appear, viewable through the chunks API.
 */
test.describe("Ingestion — founder re-ingest of an inline source (real effects)", () => {
  test("an approved inline-text source re-ingests into real chunks via the inline_text adapter", async ({ request }) => {
    const stamp = Date.now();
    const create = await request.post("/api/sources", {
      data: { title: `E2E ingest ${stamp}`, sourceType: "manual_note", ownerScope: "company", ownerId: `e2e_ingest_${stamp}`, addedBy: "Moiz", metadata: { content: `WOBBLE builds senior AI systems that founders own, not rent. Focus ${stamp}. ` .repeat(4) } },
    });
    expect(create.ok()).toBe(true);
    const created = (await create.json()) as { source: { id: string }; approval: { id: string } };
    const id = created.source.id;

    // Approve → active (so intake can attach chunks).
    const approve = await request.post(`/api/sources/${id}/approval`, { data: { action: "approve", approvalId: created.approval.id, approvedBy: "Moiz", trustLevel: "tier_3_monitored" } });
    expect(approve.ok()).toBe(true);

    // Founder triggers re-ingest → the inline_text adapter runs with no external key.
    const reingest = await request.post(`/api/sources/${id}/action`, { data: { action: "reingest" } });
    expect(reingest.ok()).toBe(true);
    const body = (await reingest.json()) as { ok: boolean; adapter: string; chunks: number };
    expect(body.ok).toBe(true);
    expect(body.adapter).toBe("inline_text");
    expect(body.chunks).toBeGreaterThanOrEqual(1);

    // The chunks are a real DB effect, visible through the chunks API.
    const chunksRes = await request.get(`/api/sources/${id}/chunks?limit=20`);
    expect(chunksRes.ok()).toBe(true);
    const chunks = ((await chunksRes.json()) as { chunks: Array<{ content: string }> }).chunks;
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].content).toContain("WOBBLE");
  });
});
