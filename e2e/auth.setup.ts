import { test as setup, expect } from "@playwright/test";
import { AUTH_STATE_PATH, E2E_DEPARTMENT, E2E_EMAIL, E2E_FOUNDER, E2E_PASSWORD } from "./fixtures/constants";

/**
 * Log in ONCE as the founder and persist the session (`wobble_session` cookie) as storageState for every
 * authed test. We log in through the real /api/auth/login endpoint with the founder's OWN email +
 * password (the accounts are seeded into the E2E database by global-setup) and capture its Set-Cookie via
 * the request context's jar — robust against dev-server client-redirect timing (the login PAGE itself is
 * separately smoke-tested by the unauthenticated gate spec).
 *
 * We also WARM the on-demand-compiled routes here (Next dev / Turbopack compiles each route on first hit),
 * so the browser tests that follow hit already-compiled pages + APIs and stay fast and deterministic.
 */
setup("authenticate founder + warm routes", async ({ request }) => {
  setup.setTimeout(180_000); // absorb first-hit route compilation on a cold dev server

  const res = await request.post("/api/auth/login", { data: { email: E2E_EMAIL, password: E2E_PASSWORD } });
  expect(res.ok(), `login failed: ${res.status()} ${await res.text().catch(() => "")}`).toBeTruthy();
  const body = (await res.json()) as { ok?: boolean; founder?: string };
  expect(body.ok).toBe(true);
  // The acting founder is derived from the ACCOUNT, never from the request — proving it here means every
  // downstream authed test is attributed to a real, individually-authenticated founder.
  expect(body.founder).toBe(E2E_FOUNDER);

  // Persist the authenticated cookie jar as storageState.
  await request.storageState({ path: AUTH_STATE_PATH });

  // Pre-compile the GET routes the suite drives (best-effort; failures here are not fatal to setup).
  const warm = [
    "/command",
    "/departments",
    "/api/auth/session",
    "/api/departments",
    "/api/handoffs?limit=1",
    "/api/escalations?status=open&limit=1",
    `/api/departments/${E2E_DEPARTMENT}/budget`,
    `/api/departments/${E2E_DEPARTMENT}/kpis`,
  ];
  for (const path of warm) await request.get(path).catch(() => undefined);

  // Pre-compile the mutating ACTION routes too, with a non-existent id so nothing is actually mutated
  // (getHandoff/getEscalation return null ⇒ 404). Avoids a ~17s cold compile on the first real click.
  await request.post("/api/handoffs/__warm__/action", { data: { action: "cancel" } }).catch(() => undefined);
  await request.post("/api/escalations/__warm__/action", { data: { action: "dismiss", reason: "warm" } }).catch(() => undefined);
});
