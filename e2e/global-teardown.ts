import { execSync } from "node:child_process";
import type { FullConfig } from "@playwright/test";
import { loadDotEnv } from "./fixtures/load-env";

/**
 * Remove the E2E fixtures after the suite so the workspace is left clean and the next run is repeatable.
 * Best-effort: a teardown failure must not mask a real test failure.
 */
export default async function globalTeardown(_config: FullConfig): Promise<void> {
  loadDotEnv();
  try {
    execSync("npx tsx e2e/fixtures/seed.ts cleanup", { stdio: "inherit", env: process.env });
  } catch (err) {
    console.warn("e2e global-teardown cleanup failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}
