import { test, expect } from "@playwright/test";
import { reseed } from "../fixtures/reseed";
import { handoffByWorkflow } from "../fixtures/api";
import { AGENTS, WF } from "../fixtures/constants";

/**
 * Inter-agent handoff operations from the Command Centre, asserted as REAL DB effects (read back through
 * the API) — not merely that a UI row changed. Each test re-seeds first so it starts from a known state.
 */
test.describe("Handoffs — retry & cancel (real effects)", () => {
  test.beforeEach(() => reseed());

  test("retry (redrive) a dead-lettered handoff → the DB row becomes delivered", async ({ page, request }) => {
    // Truthful precondition: the seeded handoff really is dead-lettered (poll: tolerate a post-reseed blip).
    await expect.poll(async () => (await handoffByWorkflow(request, WF.retry))?.deliveryState, { timeout: 15_000 }).toBe("dead_lettered");

    await page.goto("/departments");
    await page.locator("select").selectOption("dead_lettered"); // narrow the feed so our row is visible

    const row = page.locator("span").filter({ hasText: new RegExp(`${AGENTS.retrySrc}\\s*→\\s*${AGENTS.retryDst}`) }).locator("xpath=..");
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "retry", exact: true }).click();

    await expect(page.getByText("redrive ok")).toBeVisible({ timeout: 30_000 });

    // REAL EFFECT: the handoff is genuinely redriven back into delivery.
    await expect.poll(async () => (await handoffByWorkflow(request, WF.retry))?.deliveryState, { timeout: 30_000 }).toBe("delivered");
  });

  test("cancel a live handoff → the DB row becomes cancelled", async ({ page, request }) => {
    await expect.poll(async () => (await handoffByWorkflow(request, WF.cancel))?.deliveryState, { timeout: 15_000 }).toBe("delivered");

    // Cancelling a LIVE handoff now confirms first (it kills in-flight inter-agent work). Playwright
    // dismisses dialogs by default, which would turn the click into a silent no-op — accept it, since
    // this test is exercising the founder confirming.
    page.on("dialog", (dialog) => { void dialog.accept(); });
    await page.goto("/departments");
    await page.locator("select").selectOption("delivered");

    const row = page.locator("span").filter({ hasText: new RegExp(`${AGENTS.cancelSrc}\\s*→\\s*${AGENTS.cancelDst}`) }).locator("xpath=..");
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "cancel", exact: true }).click();

    await expect(page.getByText("cancel ok")).toBeVisible({ timeout: 30_000 });

    await expect.poll(async () => (await handoffByWorkflow(request, WF.cancel))?.deliveryState, { timeout: 30_000 }).toBe("cancelled");
  });
});
