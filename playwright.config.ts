import { defineConfig, devices } from "@playwright/test";
import { loadDotEnv } from "./e2e/fixtures/load-env";
import { AUTH_STATE_PATH, BASE_URL, E2E_PORT, E2E_SESSION_SECRET } from "./e2e/fixtures/constants";

/**
 * WOBBLE OS — Phase 3 browser gate (Playwright E2E).
 *
 * Proves REAL effects, not just rendered rows: the founder logs in once (storageState), the department
 * grid / handoff feed / escalation queue are driven from the UI, and each mutating action is read back
 * through the API to assert the DB actually changed (handoff redriven→delivered, cancelled; escalation
 * resolved/resume, resolved/terminate, dismissed; budget + real provider usage).
 *
 * Auth is isolated to this server: a fixed SESSION_SECRET is injected into the web server's env, and the
 * founder ACCOUNTS (email + bcrypt password) are written into the E2E database by the global-setup seed
 * (`seedFounderAccounts`) — credentials live in Postgres, not in the environment. DATABASE_URL is passed
 * through (loaded from .env locally; exported by the job in CI) and points at the E2E database.
 */

loadDotEnv();

const isCI = !!process.env.CI;
const useExternalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1";

// Production build+start is the realistic gate in CI; `next dev` is the fast loop locally. Override with
// PLAYWRIGHT_WEB_COMMAND when needed (e.g. to reuse an already-built server).
const webCommand =
  process.env.PLAYWRIGHT_WEB_COMMAND ??
  (isCI ? `npm run build && npm run start -- --port ${E2E_PORT}` : `npm run dev -- --port ${E2E_PORT}`);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.artifacts/test-results",
  fullyParallel: false, // the DB-effect tests mutate specific seeded rows — run serially for determinism.
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  timeout: 90_000, // generous for a cold `next dev` (Turbopack) server; warm routes are fast.
  expect: { timeout: 20_000 },

  reporter: isCI
    ? [["list"], ["html", { outputFolder: "e2e/.artifacts/html-report", open: "never" }], ["github"]]
    : [["list"], ["html", { outputFolder: "e2e/.artifacts/html-report", open: "never" }]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  projects: [
    // 1) Log in once and save the founder session.
    { name: "setup", testMatch: /auth\.setup\.ts/ },

    // 2) Authenticated founder suite — everything under e2e/tests except the unauthenticated gate spec.
    {
      name: "chromium",
      testMatch: /tests\/.*\.spec\.ts$/,
      testIgnore: /\.unauth\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE_PATH },
    },

    // 3) Unauthenticated gate — a fresh context with NO session (must be redirected / 401'd).
    {
      name: "unauth",
      testMatch: /\.unauth\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], storageState: { cookies: [], origins: [] } },
    },
  ],

  webServer: useExternalServer ? undefined : {
    command: webCommand,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !isCI,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV ?? (isCI ? "production" : "development"),
      NEXT_TELEMETRY_DISABLED: "1",
      // Isolated E2E auth — a fixed signing secret for this server only. The founder accounts
      // themselves are seeded into the E2E database by global-setup.
      SESSION_SECRET: E2E_SESSION_SECRET,
      // The production build issues a `Secure` session cookie, which Playwright's APIRequestContext will
      // NOT replay over http://127.0.0.1 → authed API reads would 401. Issue a non-secure cookie for the
      // E2E server ONLY (test harness; never a real deploy) so both the browser and request context auth.
      SESSION_COOKIE_INSECURE: "1",
      // Real DB (loaded from .env locally; exported by the job in CI).
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      // CI-ONLY DETERMINISTIC JUDGMENT ADAPTER (non-production): the commercial-chain verticals' advisory LLM
      // steps return fixed benign results instead of calling OpenRouter, so the proposal-accept browser gate
      // drives the REAL production execution path (real runtime, consumer, deterministic CRM/Finance/Delivery
      // writes) without live paid LLM calls. NOT proof of the live provider path — that is the separate
      // real-OpenRouter smoke proof. Never set on a real deploy.
      WOBBLE_JUDGMENT_ADAPTER: "deterministic",
    },
  },
});
