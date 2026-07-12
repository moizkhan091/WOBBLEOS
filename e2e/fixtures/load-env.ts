import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Minimal `.env` loader (mirrors `src/db/seed-runner.ts`) so `npx playwright test` and the seed script
 * pick up `DATABASE_URL` (and friends) when run locally. In CI those values are exported by the job and
 * no `.env` exists, so this is a no-op there. Never overrides an already-set variable.
 */
export function loadDotEnv(path = resolve(process.cwd(), ".env")): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    if (process.env[key] === undefined) process.env[key] = m[2];
  }
}
