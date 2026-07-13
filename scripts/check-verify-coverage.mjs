#!/usr/bin/env node
// Release-gate guard (encodes a real lesson: a proof wired to its own `verify:*` script but forgotten from the
// aggregate `verify:all-db` chain silently stops running in the release gate). Asserts that EVERY `verify:*`
// package.json script that runs a real `src/scripts/verify-*-db.ts` proof is referenced (`npm run <name>`) in
// `verify:all-db`. Exits non-zero on any gap. (It does NOT require a 1:1 file↔script mapping — several proofs are
// intentionally driven by other aggregate scripts or run ad hoc; this guards only the named `verify:*` DB proofs.)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts ?? {};
const allDb = scripts["verify:all-db"] ?? "";

const missing = Object.entries(scripts)
  .filter(([name, cmd]) => name.startsWith("verify:") && name !== "verify:all-db" && name !== "verify:coverage" && /src\/scripts\/verify-.*-db\.ts/.test(cmd))
  .map(([name]) => name)
  .filter((name) => !allDb.includes(`npm run ${name}`));

if (missing.length) {
  console.error("❌ verify-coverage FAILED — these DB-proof scripts are NOT in verify:all-db (they would silently stop running in the release gate):");
  for (const name of missing) console.error("  - " + name);
  process.exit(1);
}
const count = Object.keys(scripts).filter((n) => n.startsWith("verify:") && n !== "verify:all-db" && n !== "verify:coverage" && /src\/scripts\/verify-.*-db\.ts/.test(scripts[n])).length;
console.log(`✅ verify-coverage: all ${count} named DB-proof scripts are wired into verify:all-db.`);
