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
});
