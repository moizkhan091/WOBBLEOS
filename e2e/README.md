# WOBBLE OS — Phase 3 browser gate (Playwright E2E)

End-to-end proof that the **Departments & Handoffs Command Centre** (`/departments`) drives **real effects**,
not just rendered rows. Every mutating action flows UI → API → **DB**, and each test reads the state back
through the API to assert the row actually changed.

## What it proves

| Spec | Asserts (real effect) |
|------|-----------------------|
| `auth.setup.ts` | Logs in once via `/api/auth/login`, saves the founder session as storageState, and warms the on-demand-compiled routes. |
| `tests/auth-gate.unauth.spec.ts` | No session → `/departments` redirects to `/login`; `/api/departments` returns **401**. |
| `tests/departments-grid.spec.ts` | Department grid renders with **truthful health**; the UI and `/api/departments` agree (paid_audit `active`, real health status). |
| `tests/handoffs.spec.ts` | **retry** a dead-lettered handoff → DB row becomes `delivered`; **cancel** a live handoff → DB row becomes `cancelled`. |
| `tests/escalations.spec.ts` | **resume** → escalation `resolved`/`resume` **and** the linked handoff redriven to `delivered`; **terminate** → `resolved`/`terminate` **and** the linked handoff `cancelled`; **dismiss** → `dismissed`. |
| `tests/budget-kpi.spec.ts` | Per-department budget strip shows **real** daily spend + a **verified provider-usage** row (`actualCostCents > 0`, `unverifiedRows == 0`). |

## Layout

```
playwright.config.ts        # projects, webServer, isolated E2E auth env, global setup/teardown
e2e/
  auth.setup.ts             # setup project: API login → storageState + route warmup
  global-setup.ts           # seeds deterministic E2E fixtures (tsx child process)
  global-teardown.ts        # removes E2E fixtures
  tests/*.spec.ts           # authed suite (chromium project) + *.unauth.spec.ts (unauth project)
  fixtures/
    constants.ts            # pure TS: auth, department, fixed ids, greppable labels (imported by tests AND seed)
    seed.ts                 # tsx-run: builds fixtures via the REAL domain builders/stores; seed|cleanup
    reseed.ts               # per-test reset (used by mutating specs' beforeEach)
    api.ts                  # resilient authed API readers for DB-effect readback
    load-env.ts             # minimal .env loader (local); no-op in CI
  tsconfig.json             # typecheck scope for e2e/** + playwright.config.ts
```

## Projects

- **setup** → logs in once, writes `e2e/.auth/founder.json`.
- **chromium** → the authenticated suite (depends on `setup`, uses the saved storageState).
- **unauth** → a fresh context with no session (the gate test).

## Determinism

- The seed writes fixtures with **fixed ids** and **E2E-prefixed workflow ids** through the app's real
  builders/stores (`buildHandoffEnvelope`→`buildHandoffRow`, `buildEscalationRow`, `reserveBudget`,
  `recordProviderUsage`). It **deletes-then-inserts**, so it is idempotent and repeatable.
- Mutating specs call `reseed()` in `beforeEach`, so every attempt (incl. CI retries) starts clean.
- `globalTeardown` removes all E2E rows.

## Isolated auth

The config injects a bcrypt hash of a **test-only** password (`E2E_PASSWORD`) + a fixed `SESSION_SECRET`
into the web server's env — so the shared-login password is known only to this suite. `DATABASE_URL` is
passed through (loaded from `.env` locally, exported by the job in CI) and points at the E2E database.

## Run it

```bash
# one-time: install the browser
npx playwright install --with-deps chromium

# run the whole gate (starts the web server itself; seeds + cleans up automatically)
npx playwright test

# useful variants
npx playwright test --list                 # discovery only
npx playwright test tests/handoffs.spec.ts  # one spec
npx playwright test --ui                    # interactive
npx tsx e2e/fixtures/seed.ts seed           # seed fixtures manually
npx tsx e2e/fixtures/seed.ts cleanup        # remove fixtures manually
```

Prereqs: a migrated + seeded Postgres reachable via `DATABASE_URL`. Locally the config runs `next dev` on
port 3100; in CI it runs `next build && next start` (set `CI=1`). Override the server with
`PLAYWRIGHT_WEB_COMMAND`, the port with `PLAYWRIGHT_PORT`, or point at an already-running server with
`PLAYWRIGHT_BASE_URL`.
