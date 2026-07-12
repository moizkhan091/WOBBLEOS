import { test, expect } from "@playwright/test";

/**
 * Runs in the `unauth` project (fresh context, NO session). Proves the proxy auth gate: app pages
 * redirect to /login, and the API returns 401 — the Command Centre is genuinely gated, not just hidden.
 */
test.describe("Auth gate — unauthenticated", () => {
  test("a page visit without a session is redirected to /login", async ({ page }) => {
    await page.goto("/departments");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    // The gated UI must NOT render.
    await expect(page.getByText("Departments — truthful health")).toHaveCount(0);
  });

  test("the departments API returns 401 without a session", async ({ request }) => {
    const res = await request.get("/api/departments");
    expect(res.status()).toBe(401);
    const json = (await res.json()) as { ok?: boolean };
    expect(json.ok).toBe(false);
  });

  test("an escalation ACTION without a session is gated at 401 (the mutation never runs)", async ({ request }) => {
    // A valid body so the request reaches the auth check (not a 422). The founder gate must block it before
    // any state change — an unauthorized user can never resolve/dismiss a founder escalation.
    const res = await request.post("/api/escalations/escalation_e2e_dismiss/action", { data: { action: "dismiss", reason: "unauthorized attempt" } });
    expect(res.status()).toBe(401);
    expect(((await res.json()) as { ok?: boolean }).ok).toBe(false);
  });

  test("the publishing surfaces (Library + scheduled posts) are gated at 401 without a session", async ({ request }) => {
    // An unauthorized user can neither inspect nor promote content — the Library + scheduled-posts queue are
    // founder-gated at the proxy, not merely hidden in the UI.
    expect((await request.get("/api/library/assets")).status()).toBe(401);
    expect((await request.get("/api/library/scheduled")).status()).toBe(401);
    expect((await request.post("/api/library/assets", { data: { title: "unauthorized asset", kind: "image" } })).status()).toBe(401);
  });

  test("proposal ACCEPTANCE and the consumer tick are gated at 401 (an unauthorized user cannot accept a deal or drive the chain)", async ({ request }) => {
    // A valid body so the request reaches the auth check. The atomic accept + outbox emit must never run for
    // an unauthorized caller — no deal is won, no invoice/project is created.
    expect((await request.post("/api/proposals/proposal_e2e_sent/action", { data: { action: "accept" } })).status()).toBe(401);
    expect((await request.post("/api/scheduler/tick?consumers=true", { data: {} })).status()).toBe(401);
  });
});
