import { test, expect, request as playwrightRequest, type APIRequestContext } from "@playwright/test";
import {
  BASE_URL,
  E2E_EMAIL,
  E2E_EMAIL_B,
  E2E_FOUNDER,
  E2E_FOUNDER_B,
  E2E_FOUNDER_B_ID,
  E2E_FOUNDER_ID,
  E2E_PASSWORD,
  E2E_PASSWORD_B,
} from "../fixtures/constants";

/**
 * Founder accounts — separate, individually-authenticated identities.
 *
 * This is the browser/API gate for the model that replaced the shared team password. It proves the
 * properties a shared login could never satisfy:
 *   - a founder's credentials only ever produce THEIR session (A cannot act as B)
 *   - no request field can change the authenticated actor
 *   - one founder's sessions can be revoked without touching another's
 *   - disabling one account leaves the others working, and kills that account's LIVE session
 *   - account administration is super-admin only
 *
 * Each founder gets their own APIRequestContext (its own cookie jar), so these are genuinely
 * simultaneous, independent sessions — not one session mutated in place.
 */

/**
 * A context with a GUARANTEED-empty cookie jar. `storageState` is passed explicitly because the authed
 * project sets a founder storageState in `use` — without this, a "logged out" context would silently
 * carry Moiz's session and the gate assertions below would pass for the wrong reason.
 */
async function freshContext(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
}

/** Log in and return the context holding that founder's session cookie. */
async function loginAs(email: string, password: string): Promise<APIRequestContext> {
  const ctx = await freshContext();
  const res = await ctx.post("/api/auth/login", { data: { email, password } });
  expect(res.status(), `login failed for ${email}: ${await res.text().catch(() => "")}`).toBe(200);
  return ctx;
}

async function whoAmI(ctx: APIRequestContext): Promise<{ authenticated: boolean; founder?: string; isSuperAdmin?: boolean }> {
  const res = await ctx.get("/api/auth/session");
  if (res.status() === 401) return { authenticated: false };
  return (await res.json()) as { authenticated: boolean; founder?: string; isSuperAdmin?: boolean };
}

test.describe("Founder accounts — separate identities", () => {
  test("each founder's credentials produce ONLY their own session", async () => {
    const moiz = await loginAs(E2E_EMAIL, E2E_PASSWORD);
    const ali = await loginAs(E2E_EMAIL_B, E2E_PASSWORD_B);

    expect(await whoAmI(moiz)).toMatchObject({ authenticated: true, founder: E2E_FOUNDER, isSuperAdmin: true });
    expect(await whoAmI(ali)).toMatchObject({ authenticated: true, founder: E2E_FOUNDER_B, isSuperAdmin: false });

    await moiz.dispose();
    await ali.dispose();
  });

  test("one founder's password cannot open another founder's account", async () => {
    const ctx = await freshContext();
    // Ali's email + Moiz's password must fail. Under the shared-password model this SUCCEEDED.
    const res = await ctx.post("/api/auth/login", { data: { email: E2E_EMAIL_B, password: E2E_PASSWORD } });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test("an unknown email fails exactly like a wrong password (no account enumeration)", async () => {
    const ctx = await freshContext();
    const unknown = await ctx.post("/api/auth/login", { data: { email: "ghost@wobble.local", password: "whatever-123" } });
    const wrongPw = await ctx.post("/api/auth/login", { data: { email: E2E_EMAIL, password: "definitely-wrong" } });
    expect(unknown.status()).toBe(401);
    expect(wrongPw.status()).toBe(401);
    // Identical bodies ⇒ the endpoint reveals nothing about which founder emails exist.
    expect(await unknown.json()).toEqual(await wrongPw.json());
    await ctx.dispose();
  });

  test("no request field can change who you are", async () => {
    const ctx = await freshContext();
    // Smuggle the fields the OLD model trusted. The acting founder must still be Ali.
    const res = await ctx.post("/api/auth/login", {
      data: { email: E2E_EMAIL_B, password: E2E_PASSWORD_B, founder: E2E_FOUNDER, actor: E2E_FOUNDER, fid: E2E_FOUNDER_ID, sa: true },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).founder).toBe(E2E_FOUNDER_B);
    expect(await whoAmI(ctx)).toMatchObject({ founder: E2E_FOUNDER_B, isSuperAdmin: false });
    await ctx.dispose();
  });

  test("the login page no longer offers a founder picker", async ({ page }) => {
    await page.goto("/login");
    // The old UI let you choose an identity from a dropdown; the new one demands your own email.
    await expect(page.locator("select")).toHaveCount(0);
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test("a founder can sign in through the real login form and is attributed to themselves", async ({ browser }) => {
    const ctx = await browser.newContext(); // no storageState — a genuinely fresh browser session
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(E2E_EMAIL_B);
    await page.locator('input[name="password"]').fill(E2E_PASSWORD_B);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/command/);
    // The shell's profile menu reads /api/auth/session — it must show Ali, not Moiz.
    await expect(page.getByText(E2E_FOUNDER_B, { exact: true }).first()).toBeVisible();
    await ctx.close();
  });

  test("a wrong password is rejected in the form without leaking which part was wrong", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(E2E_EMAIL);
    await page.locator('input[name="password"]').fill("definitely-not-the-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    // Target the error by test id, not by role: Next injects its own role="alert" route announcer.
    await expect(page.getByTestId("login-error")).toContainText(/wrong email or password/i);
    await expect(page).toHaveURL(/\/login/); // and we are NOT let in
    await ctx.close();
  });
});

test.describe("Founder accounts — per-founder session control", () => {
  test("revoking one founder's sessions leaves the other founder signed in", async () => {
    const moizAdmin = await loginAs(E2E_EMAIL, E2E_PASSWORD);

    // Clear any sessions Ali accumulated in earlier tests so the count below is deterministic —
    // disposing a request context drops its cookie jar but does NOT revoke the server-side session.
    await moizAdmin.post(`/api/auth/accounts/${E2E_FOUNDER_B_ID}/action`, { data: { action: "revoke_sessions" } });

    const ali1 = await loginAs(E2E_EMAIL_B, E2E_PASSWORD_B);
    const ali2 = await loginAs(E2E_EMAIL_B, E2E_PASSWORD_B); // Ali on a second device

    const res = await moizAdmin.post(`/api/auth/accounts/${E2E_FOUNDER_B_ID}/action`, { data: { action: "revoke_sessions" } });
    expect(res.status()).toBe(200);
    expect((await res.json()).sessionsRevoked).toBe(2); // exactly Ali's two, and nothing of Moiz's

    // BOTH of Ali's sessions are dead...
    expect((await whoAmI(ali1)).authenticated).toBe(false);
    expect((await whoAmI(ali2)).authenticated).toBe(false);
    // ...and the admin's own session is untouched.
    expect(await whoAmI(moizAdmin)).toMatchObject({ authenticated: true, founder: E2E_FOUNDER });

    // Ali can sign back in — revocation is not a lockout.
    const aliAgain = await loginAs(E2E_EMAIL_B, E2E_PASSWORD_B);
    expect(await whoAmI(aliAgain)).toMatchObject({ founder: E2E_FOUNDER_B });

    await Promise.all([moizAdmin.dispose(), ali1.dispose(), ali2.dispose(), aliAgain.dispose()]);
  });

  test("disabling one account kills its live session and blocks re-login, without affecting the other founder", async () => {
    const moizAdmin = await loginAs(E2E_EMAIL, E2E_PASSWORD);
    const ali = await loginAs(E2E_EMAIL_B, E2E_PASSWORD_B);
    expect((await whoAmI(ali)).authenticated).toBe(true); // live before

    try {
      expect((await moizAdmin.post(`/api/auth/accounts/${E2E_FOUNDER_B_ID}/action`, { data: { action: "disable" } })).status()).toBe(200);

      // The LIVE session dies immediately — not at token expiry. (The edge proxy is JWT-only, so this is
      // the DB-backed route gate doing its job.)
      expect((await whoAmI(ali)).authenticated).toBe(false);
      // A disabled founder cannot obtain a new session even with the correct password.
      const relogin = await (await freshContext()).post("/api/auth/login", { data: { email: E2E_EMAIL_B, password: E2E_PASSWORD_B } });
      expect(relogin.status()).toBe(403);
      // Moiz is entirely unaffected.
      expect(await whoAmI(moizAdmin)).toMatchObject({ authenticated: true, founder: E2E_FOUNDER });
    } finally {
      // Re-enable so the rest of the suite (and a re-run) sees a healthy Ali.
      await moizAdmin.post(`/api/auth/accounts/${E2E_FOUNDER_B_ID}/action`, { data: { action: "enable" } });
    }

    const aliAgain = await loginAs(E2E_EMAIL_B, E2E_PASSWORD_B);
    expect(await whoAmI(aliAgain)).toMatchObject({ founder: E2E_FOUNDER_B });
    await Promise.all([moizAdmin.dispose(), ali.dispose(), aliAgain.dispose()]);
  });

  test("simultaneous founder sessions stay independent", async () => {
    const moiz = await loginAs(E2E_EMAIL, E2E_PASSWORD);
    const ali = await loginAs(E2E_EMAIL_B, E2E_PASSWORD_B);

    // Interleave reads — each context must consistently report its own founder.
    for (let i = 0; i < 3; i++) {
      expect((await whoAmI(moiz)).founder).toBe(E2E_FOUNDER);
      expect((await whoAmI(ali)).founder).toBe(E2E_FOUNDER_B);
    }

    // Logging one out must not disturb the other.
    await moiz.post("/api/auth/logout");
    expect((await whoAmI(moiz)).authenticated).toBe(false);
    expect((await whoAmI(ali)).founder).toBe(E2E_FOUNDER_B);

    await Promise.all([moiz.dispose(), ali.dispose()]);
  });
});

test.describe("Founder accounts — administration is super-admin only", () => {
  test("an ordinary founder cannot administer another founder's account", async () => {
    const ali = await loginAs(E2E_EMAIL_B, E2E_PASSWORD_B);

    // Ali is a real, authenticated founder — but not an admin. 403, not 401.
    expect((await ali.get("/api/auth/accounts")).status()).toBe(403);
    expect((await ali.post(`/api/auth/accounts/${E2E_FOUNDER_ID}/action`, { data: { action: "disable" } })).status()).toBe(403);
    expect((await ali.post(`/api/auth/accounts/${E2E_FOUNDER_ID}/action`, { data: { action: "revoke_sessions" } })).status()).toBe(403);

    // And the attempt changed nothing: Moiz can still sign in.
    const moiz = await loginAs(E2E_EMAIL, E2E_PASSWORD);
    expect(await whoAmI(moiz)).toMatchObject({ authenticated: true, founder: E2E_FOUNDER });

    await Promise.all([ali.dispose(), moiz.dispose()]);
  });

  test("the roster is super-admin readable and never exposes password material", async () => {
    const moiz = await loginAs(E2E_EMAIL, E2E_PASSWORD);
    const res = await moiz.get("/api/auth/accounts");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.accounts)).toBe(true);
    // A password hash must never cross the wire, even to an admin.
    expect(JSON.stringify(body)).not.toMatch(/\$2[aby]\$/);
    expect(JSON.stringify(body)).not.toContain("passwordHash");

    const ali = body.accounts.find((a: { id: string }) => a.id === E2E_FOUNDER_B_ID);
    expect(ali).toMatchObject({ displayName: E2E_FOUNDER_B, email: E2E_EMAIL_B, passwordSet: true, isSuperAdmin: false });

    await moiz.dispose();
  });

  test("the super admin cannot disable their own account (no lock-out)", async () => {
    const moiz = await loginAs(E2E_EMAIL, E2E_PASSWORD);
    const res = await moiz.post(`/api/auth/accounts/${E2E_FOUNDER_ID}/action`, { data: { action: "disable" } });
    expect(res.status()).toBe(409);
    expect(await whoAmI(moiz)).toMatchObject({ authenticated: true, founder: E2E_FOUNDER });
    await moiz.dispose();
  });

  test("account actions are gated at 401 with no session at all", async () => {
    const anon = await freshContext();
    expect((await anon.get("/api/auth/accounts")).status()).toBe(401);
    expect((await anon.post(`/api/auth/accounts/${E2E_FOUNDER_B_ID}/action`, { data: { action: "disable" } })).status()).toBe(401);
    expect((await anon.post("/api/auth/password", { data: { currentPassword: "x", newPassword: "y" } })).status()).toBe(401);
    await anon.dispose();
  });
});

test.describe("Founder accounts — password change", () => {
  test("a founder can rotate their own password, and the old one stops working", async () => {
    const rotated = "rotated-e2e-password-987";
    const ali = await loginAs(E2E_EMAIL_B, E2E_PASSWORD_B);

    try {
      // Wrong current password is refused.
      expect((await ali.post("/api/auth/password", { data: { currentPassword: "wrong-one", newPassword: rotated } })).status()).toBe(401);
      // Too-short new password is refused.
      expect((await ali.post("/api/auth/password", { data: { currentPassword: E2E_PASSWORD_B, newPassword: "short" } })).status()).toBe(422);

      expect((await ali.post("/api/auth/password", { data: { currentPassword: E2E_PASSWORD_B, newPassword: rotated } })).status()).toBe(200);

      // The old credential is dead; the new one works.
      const old = await (await freshContext()).post("/api/auth/login", { data: { email: E2E_EMAIL_B, password: E2E_PASSWORD_B } });
      expect(old.status()).toBe(401);
      const fresh = await loginAs(E2E_EMAIL_B, rotated);
      expect(await whoAmI(fresh)).toMatchObject({ founder: E2E_FOUNDER_B });
      // The caller keeps their own session rather than being logged out mid-action.
      expect((await whoAmI(ali)).authenticated).toBe(true);
      await fresh.dispose();
    } finally {
      // Restore the seeded password so the suite is re-runnable without a reseed.
      await ali.post("/api/auth/password", { data: { currentPassword: rotated, newPassword: E2E_PASSWORD_B } }).catch(() => {});
    }
    await ali.dispose();
  });

  test("you cannot change anybody's password but your own", async () => {
    const ali = await loginAs(E2E_EMAIL_B, E2E_PASSWORD_B);
    // There is no founderId parameter to aim at someone else; smuggling one must be ignored, and the
    // call must fail on ALI's current password rather than touching Moiz.
    const res = await ali.post("/api/auth/password", {
      data: { founderId: E2E_FOUNDER_ID, currentPassword: E2E_PASSWORD, newPassword: "hijacked-password-123" },
    });
    expect(res.status()).toBe(401); // E2E_PASSWORD is not ALI's current password

    // Moiz's credential is untouched.
    const moiz = await loginAs(E2E_EMAIL, E2E_PASSWORD);
    expect(await whoAmI(moiz)).toMatchObject({ founder: E2E_FOUNDER });
    await Promise.all([ali.dispose(), moiz.dispose()]);
  });
});
