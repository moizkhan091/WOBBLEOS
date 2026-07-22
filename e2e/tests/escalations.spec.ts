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
    // TERMINATE now asks for confirmation before killing blocked work (it is destructive and was firing
    // on a single click). Playwright DISMISSES dialogs by default, which silently turned the click into a
    // no-op and made this spec fail on a timeout rather than an assertion. Accept it: the test is
    // exercising the founder saying "yes", and the dialog itself is the behaviour we want to keep.
    page.on("dialog", (dialog) => { void dialog.accept(); });
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

/**
 * Edge cases on the SAME real action API the founder buttons drive — proving the guards, not just the happy
 * path: a duplicate action is a no-op (not a double-effect), an invalid transition is refused, and a ghost id
 * 404s. All assert the settled state back through the API. (Unauthorized access is proven in the unauth
 * project's auth-gate spec — the same POST returns 401 before the handler runs.)
 */
test.describe("Escalations — edge cases (idempotency / invalid transitions)", () => {
  test.beforeEach(() => reseed());

  test("a DUPLICATE dismiss is a 409 no-op (the second click cannot re-resolve or double-act)", async ({ request }) => {
    const first = await request.post(`/api/escalations/${IDS.escDismiss}/action`, { data: { action: "dismiss", reason: "first dismiss" } });
    expect(first.ok()).toBe(true);
    await expect.poll(async () => (await escalationById(request, IDS.escDismiss))?.status, { timeout: 15_000 }).toBe("dismissed");

    const second = await request.post(`/api/escalations/${IDS.escDismiss}/action`, { data: { action: "dismiss", reason: "duplicate dismiss" } });
    expect(second.status()).toBe(409); // already resolved — the transition guard refuses it
    expect((await escalationById(request, IDS.escDismiss))?.status).toBe("dismissed"); // unchanged
  });

  test("an INVALID transition (resume an escalation with no redrivable handoff) is refused (409), state unchanged", async ({ request }) => {
    // escDismiss carries no linked handoff, so there is nothing to redrive — resume must not fake a success.
    const res = await request.post(`/api/escalations/${IDS.escDismiss}/action`, { data: { action: "resolve", resolutionAction: "resume", resolution: "try to resume non-actionable noise" } });
    expect(res.status()).toBe(409);
    expect((await escalationById(request, IDS.escDismiss))?.status).toBe("open"); // still open — nothing happened
  });

  test("acting on a NON-EXISTENT escalation returns 404 (no silent success)", async ({ request }) => {
    const res = await request.post(`/api/escalations/escalation_does_not_exist/action`, { data: { action: "dismiss", reason: "ghost" } });
    expect(res.status()).toBe(404);
  });

  test("REROUTE with no live handoff to re-route is refused (409), state unchanged", async ({ request }) => {
    // escDismiss carries no linked handoff — there is no in-flight work to send to an alternate department.
    const res = await request.post(`/api/escalations/${IDS.escDismiss}/action`, { data: { action: "reroute", destinationDepartment: "proposal", reason: "attempt reroute of non-actionable noise" } });
    expect(res.status()).toBe(409);
    expect((await escalationById(request, IDS.escDismiss))?.status).toBe("open");
  });

  test("REROUTE to a NON-EXISTENT / unauthorized destination department is refused (409), handoff untouched", async ({ request }) => {
    // escResume has a real (dead-lettered) handoff, but no such department exists to legitimately accept it —
    // reroute must not fabricate an unauthorized route.
    await expect.poll(async () => (await handoffByWorkflow(request, WF.resume))?.deliveryState, { timeout: 15_000 }).toBe("dead_lettered");
    const res = await request.post(`/api/escalations/${IDS.escResume}/action`, { data: { action: "reroute", destinationDepartment: "does_not_exist_dept", reason: "invalid target" } });
    expect(res.status()).toBe(409);
    expect((await escalationById(request, IDS.escResume))?.status).toBe("open"); // unchanged
    expect((await handoffByWorkflow(request, WF.resume))?.deliveryState).toBe("dead_lettered"); // the old route is untouched
  });
});
