import { execSync } from "node:child_process";
import type { FullConfig } from "@playwright/test";
import { loadDotEnv } from "./fixtures/load-env";

/**
 * Seed the deterministic E2E fixtures before the suite. Runs the seed as a child `tsx` process so it uses
 * the app's own runtime + tsconfig path resolution (exactly like `npm run db:seed`) rather than requiring
 * Playwright to resolve `@/…` aliases. Assumes the DB is already migrated (locally: the running app's DB;
 * in CI: the `db:migrate` + `db:seed` steps run before Playwright).
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  loadDotEnv();
  execSync("npx tsx e2e/fixtures/seed.ts seed", { stdio: "inherit", env: process.env });
}
