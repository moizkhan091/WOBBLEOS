import { test, expect } from "@playwright/test";

/**
 * The founder-facing publishing surfaces. Content promoted through QA + approval lands in the Library and,
 * once scheduled, in the scheduled-posts queue — both inspectable by the founder (status, evidence, provider,
 * failures). This asserts the surfaces are reachable + authorized for the founder; the full promotion →
 * schedule → publish path (with every guard) is proven on Postgres by verify-content-publishing-db.
 */
test.describe("Publishing — founder can inspect the Library + scheduled posts", () => {
  test("the Library asset feed is readable by the founder", async ({ request }) => {
    const res = await request.get("/api/library/assets?limit=50");
    expect(res.ok()).toBe(true);
    const json = (await res.json()) as { ok?: boolean; assets?: unknown[] };
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.assets)).toBe(true);
  });

  test("the scheduled-posts queue is readable by the founder", async ({ request }) => {
    const res = await request.get("/api/library/scheduled?limit=50");
    expect(res.ok()).toBe(true);
    const json = (await res.json()) as { ok?: boolean };
    expect(json.ok).toBe(true);
  });
});
