import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Context OS founder-facing flow (real DB effects): raw intake → extracted assertion is NOT trusted →
 * founder approval → the assertion becomes trusted + retrievable. Raw is never auto-trusted.
 */
const SCOPE = "scope=company&id=e2e_ctx";
async function trustedIds(request: APIRequestContext): Promise<string[]> {
  const res = await request.get(`/api/context?${SCOPE}&task=ask`);
  const json = (await res.json()) as { assertions?: Array<{ id: string }> };
  return (json.assertions ?? []).map((a) => a.id);
}

test.describe("Context OS — intake → approval → trusted retrieval (real effects)", () => {
  test("an extracted assertion is NOT trusted until the founder approves it", async ({ request }) => {
    const stamp = Date.now();
    const create = await request.post("/api/context/sources", {
      data: { kind: "questionnaire", content: `Our launch date is Q${stamp}.`, scope: { type: "company", id: "e2e_ctx" }, assertions: [{ statement: `Launch is Q${stamp}`, entities: [`launch_${stamp}`] }] },
    });
    expect(create.ok()).toBe(true);
    const body = (await create.json()) as { assertions: Array<{ id: string; status: string }> };
    const id = body.assertions[0].id;
    expect(body.assertions[0].status).toBe("extracted"); // pending, not trusted

    // BEFORE approval: not in the trusted retrieval (raw/extracted never auto-trusted).
    expect(await trustedIds(request)).not.toContain(id);

    // Founder approves → it becomes trusted + retrievable.
    const approve = await request.post(`/api/context/assertions/${id}/action`, { data: { action: "approve" } });
    expect(approve.ok()).toBe(true);
    await expect.poll(() => trustedIds(request), { timeout: 15_000 }).toContain(id);
  });
});
