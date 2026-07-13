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

  test("Context OS intake + approval + health are gated at 401 (an unauthorized user cannot inject/trust/inspect context)", async ({ request }) => {
    expect((await request.post("/api/context/sources", { data: { kind: "manual", content: "x", scope: { type: "company", id: "e2e_ctx" } } })).status()).toBe(401);
    expect((await request.post("/api/context/assertions/anything/action", { data: { action: "approve" } })).status()).toBe(401);
    expect((await request.get("/api/context/health")).status()).toBe(401);
  });

  test("the self-optimizer is gated at 401 (an unauthorized user cannot trigger a cycle, inspect, or govern a proposal)", async ({ request }) => {
    // Running the optimizer + approving/activating/rolling back an improvement are founder-only — no anonymous
    // caller can trigger a cycle or change the governance state of a proposal.
    expect((await request.get("/api/optimizer")).status()).toBe(401);
    expect((await request.post("/api/optimizer", { data: {} })).status()).toBe(401);
    expect((await request.post("/api/optimizer/proposals/anything/action", { data: { action: "approve" } })).status()).toBe(401);
  });

  test("the communications outbox is gated at 401 (an unauthorized user cannot prepare, send, or inspect a comm)", async ({ request }) => {
    // Preparing/sending a notification or external comm is founder-only — an unauthorized caller can neither
    // stage nor dispatch a communication, nor read the outbox.
    expect((await request.get("/api/comms")).status()).toBe(401);
    expect((await request.post("/api/comms", { data: { channel: "internal_notification", kind: "alert", subject: "x", body: "y" } })).status()).toBe(401);
    expect((await request.post("/api/comms/anything/action", { data: { action: "send" } })).status()).toBe(401);
  });

  test("source deactivation/reactivation is gated at 401 (an unauthorized user cannot disable or restore a source)", async ({ request }) => {
    // Collection control is founder-only — an unauthorized caller can neither stop collection nor rollback.
    expect((await request.post("/api/sources/anything/action", { data: { action: "deactivate", reason: "unauthorized" } })).status()).toBe(401);
    expect((await request.post("/api/sources/anything/action", { data: { action: "reactivate" } })).status()).toBe(401);
  });

  test("Earned-autonomy grants are gated at 401 (an unauthorized user cannot grant or revoke autonomy)", async ({ request }) => {
    // Granting/revoking autonomy is the highest-trust founder control — it must never run for an unauthorized caller.
    expect((await request.get("/api/autonomy/policies")).status()).toBe(401);
    expect((await request.post("/api/autonomy/policies", { data: { category: "content.publish", grantedLevel: "autonomous" } })).status()).toBe(401);
    expect((await request.post("/api/autonomy/policies/anything/action", { data: { action: "revoke" } })).status()).toBe(401);
  });

  test("the QA gate surface is gated at 401 (an unauthorized user cannot inspect verdicts or run a review)", async ({ request }) => {
    // Independent QA verdicts + the on-demand review runner are founder-only — an unauthorized caller can
    // neither read other tenants' verdicts nor write a review row.
    expect((await request.get("/api/qa/reviews")).status()).toBe(401);
    expect((await request.post("/api/qa/reviews", { data: { boardSlug: "proposal_technical_review", artifact: {}, submission: { authorAgentSlug: "x", workflowId: "unauth_attempt" } } })).status()).toBe(401);
  });

  test("the selective-revision surface is gated at 401 (an unauthorized user cannot inspect or drive a revision)", async ({ request }) => {
    // Revision cycles (rerun/preserve plan + rollback) are founder-only — an unauthorized caller can neither
    // inspect them nor trigger a selective rerun / rollback.
    expect((await request.get("/api/revisions")).status()).toBe(401);
    expect((await request.post("/api/revisions/anything/action", { data: { action: "rollback" } })).status()).toBe(401);
  });
});
