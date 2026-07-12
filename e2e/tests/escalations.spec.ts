import { test, expect } from "@playwright/test";
import { reseed } from "../fixtures/reseed";
import { escalationById, handoffByWorkflow } from "../fixtures/api";
import { DECISIONS, IDS, WF } from "../fixtures/constants";

/**
 * The escalation queue is where a founder decision controls the REAL workflow. Each action is asserted as
 * an actual state change read back through the API — and, for resume/terminate, the LINKED handoff really
 * moving too (resume redrives the dead-lettered handoff; terminate cancels the live one).
 */
test.describe("Escalations — resume / terminate / dismiss (real effects)", () => {
  test.beforeEach(() => reseed());

  async function openEscalationRow(page: import("@playwright/test").Page, decision: string) {
    await page.goto("/departments");
    await expect(page.getByText("Escalations — blocked work needs a decision")).toBeVisible();
    return page.locator("span").filter({ hasText: decision }).locator("xpath=..");
  }

  test("resume → escalation resolved(resume) AND the linked dead-lettered handoff is redriven", async ({ page, request }) => {
    await expect.poll(async () => (await escalationById(request, IDS.escResume))?.status, { timeout: 15_000 }).toBe("open");
    await expect.poll(async () => (await handoffByWorkflow(request, WF.resume))?.deliveryState, { timeout: 15_000 }).toBe("dead_lettered");

    const row = await openEscalationRow(page, DECISIONS.resume);
    await row.getByRole("button", { name: "resume", exact: true }).click();
    await expect(page.getByText("escalation resolve ok")).toBeVisible({ timeout: 30_000 });

    // REAL EFFECT #1: the escalation is resolved with the truthful resume action.
    await expect.poll(async () => (await escalationById(request, IDS.escResume))?.status, { timeout: 30_000 }).toBe("resolved");
    expect((await escalationById(request, IDS.escResume))?.resolutionAction).toBe("resume");
    // REAL EFFECT #2: the linked handoff was actually put back in flight.
    await expect.poll(async () => (await handoffByWorkflow(request, WF.resume))?.deliveryState, { timeout: 30_000 }).toBe("delivered");
  });

  test("terminate → escalation resolved(terminate) AND the linked live handoff is cancelled", async ({ page, request }) => {
    await expect.poll(async () => (await escalationById(request, IDS.escTerminate))?.status, { timeout: 15_000 }).toBe("open");
    await expect.poll(async () => (await handoffByWorkflow(request, WF.terminate))?.deliveryState, { timeout: 15_000 }).toBe("delivered");

    const row = await openEscalationRow(page, DECISIONS.terminate);
    await row.getByRole("button", { name: "terminate", exact: true }).click();
    await expect(page.getByText("escalation resolve ok")).toBeVisible({ timeout: 30_000 });

    await expect.poll(async () => (await escalationById(request, IDS.escTerminate))?.status, { timeout: 30_000 }).toBe("resolved");
    expect((await escalationById(request, IDS.escTerminate))?.resolutionAction).toBe("terminate");
    // REAL EFFECT: terminate cancelled the real workflow's handoff.
    await expect.poll(async () => (await handoffByWorkflow(request, WF.terminate))?.deliveryState, { timeout: 30_000 }).toBe("cancelled");
  });

  test("dismiss → escalation status becomes dismissed in the DB", async ({ page, request }) => {
    await expect.poll(async () => (await escalationById(request, IDS.escDismiss))?.status, { timeout: 15_000 }).toBe("open");

    const row = await openEscalationRow(page, DECISIONS.dismiss);
    await row.getByRole("button", { name: "dismiss", exact: true }).click();
    await expect(page.getByText("escalation dismiss ok")).toBeVisible({ timeout: 30_000 });

    await expect.poll(async () => (await escalationById(request, IDS.escDismiss))?.status, { timeout: 30_000 }).toBe("dismissed");
  });
});
