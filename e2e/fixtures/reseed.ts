import { execSync } from "node:child_process";

/**
 * Reset the E2E fixtures to their pristine state (delete-then-insert) by running the seed script. Called
 * from `beforeEach` in the MUTATING specs so every attempt — including a CI retry — starts from a clean,
 * known fixture (open escalations, a dead-lettered handoff, a live handoff). Read-only specs don't need it.
 */
export function reseed(): void {
  // E2E_FIXTURES_ONLY: skip the department re-seed (they already exist) — a fast, light per-test reset.
  execSync("npx tsx e2e/fixtures/seed.ts seed", { stdio: "inherit", env: { ...process.env, E2E_FIXTURES_ONLY: "1" } });
}
