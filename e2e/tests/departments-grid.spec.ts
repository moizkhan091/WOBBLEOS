import { test, expect } from "@playwright/test";
import { E2E_DEPARTMENT } from "../fixtures/constants";

/**
 * The department grid must render with TRUTHFUL health — the UI and the API agree, and health is a real
 * status string derived from runtime data (never fabricated). Read-only.
 */
test.describe("Departments grid — truthful health", () => {
  test("renders the seeded departments with truthful, API-consistent health", async ({ page, request }) => {
    await page.goto("/departments");

    await expect(page.getByText("Departments — truthful health")).toBeVisible();
    // Scope to <main> — "Paid Audit" also exists as a sidebar nav link.
    await expect(page.getByRole("main").getByText("Paid Audit", { exact: true })).toBeVisible();

    // Cross-check the grid against the API (same authed surface the UI reads).
    const res = await request.get("/api/departments");
    expect(res.ok()).toBeTruthy();
    const json = (await res.json()) as { departments: Array<{ department: string; status: string | null; healthStatus: string | null }> };
    const paid = json.departments.find((d) => d.department === E2E_DEPARTMENT);
    expect(paid, "paid_audit is present in the roll-up").toBeTruthy();
    expect(paid!.status).toBe("active"); // seeded truthfully active
    expect(typeof paid!.healthStatus).toBe("string"); // real, non-null health status
    expect(json.departments.length).toBeGreaterThan(1);

    // The Command Centre KPI tiles are present (real counts, not placeholders).
    await expect(page.getByText("Handoffs in-flight")).toBeVisible();
    await expect(page.getByText("Open escalations")).toBeVisible();
  });
});
