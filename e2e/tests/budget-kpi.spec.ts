import { test, expect } from "@playwright/test";
import { budgetState } from "../fixtures/api";
import { E2E_DEPARTMENT } from "../fixtures/constants";

/**
 * The per-department budget + KPI strip must render REAL values — a real budget reservation contributes
 * to daily spend and a real, provider-reported (verified) usage row makes the estimated-vs-actual tag
 * truthful. Asserted both via the API and in the rendered strip.
 */
test.describe("Budget + KPI strip — real values", () => {
  test("selecting a department reveals its real budget usage + verified provider usage", async ({ page, request }) => {
    // Ground truth from the API: real, non-zero, verified provider usage exists for the department.
    const bud = await budgetState(request, E2E_DEPARTMENT);
    expect(bud, "budget state is available").toBeTruthy();
    expect(bud!.usage.dailyCents).toBeGreaterThan(0); // seeded reservation
    expect(bud!.providerUsage.actualRows).toBeGreaterThan(0); // seeded provider usage
    expect(bud!.providerUsage.actualCostCents).toBeGreaterThan(0);
    expect(bud!.providerUsage.unverifiedRows).toBe(0); // the seeded row is provider-reported ⇒ verified

    await page.goto("/departments");
    // Click the department card (in <main>, not the sidebar nav link) → the budget & KPI strip renders.
    await page.getByRole("main").getByText("Paid Audit", { exact: true }).click();

    await expect(page.getByText(`${E2E_DEPARTMENT} — budget & KPIs`)).toBeVisible();
    await expect(page.getByText(/daily \$/)).toBeVisible(); // real daily spend tag
    await expect(page.getByText(/actual \$/)).toBeVisible(); // estimated-vs-actual provider usage tag
    await expect(page.getByText(/verified/)).toBeVisible();
  });
});
