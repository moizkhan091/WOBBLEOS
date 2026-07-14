#!/usr/bin/env node
// Release-gate coverage guard (WOB-AUD-015) — STATIC (no DB), runs in `release:check`.
//
// Old failure mode: DB proofs existed as files but were never wired into the gate, so "all DB proofs
// run" was false (34 of 58 ran). The gate is now the FILESYSTEM-DRIVEN runner
// (scripts/run-all-db-proofs.mjs), which discovers EVERY `src/scripts/verify-*-db.ts` and runs it unless
// it is explicitly excluded in scripts/db-proof-manifest.json with a reason. This guard proves the
// bookkeeping is honest so nothing can be silently omitted:
//   1. `verify:all-db` actually invokes the discovery runner.
//   2. Every manifest `skip` entry names a real file (no stale entries) and carries a non-empty reason.
//   3. Reports how many proofs run in the gate vs. are deferred (with their reasons).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const allDb = pkg.scripts?.["verify:all-db"] ?? "";

const errors = [];

// 1. The gate must be the discovery runner (not a hand-curated chain that can silently drop proofs).
if (!/run-all-db-proofs\.mjs/.test(allDb)) {
  errors.push("`verify:all-db` must invoke scripts/run-all-db-proofs.mjs (the filesystem-driven runner), so every proof is discovered automatically.");
}

// 2. Enumerate proof files + validate the manifest.
const scriptsDir = join(root, "src", "scripts");
const proofFiles = readdirSync(scriptsDir).filter((f) => /^verify-.*-db\.ts$/.test(f)).sort();

const manifestPath = join(root, "scripts", "db-proof-manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { skip: {} };
const skip = manifest.skip ?? {};

for (const [key, reason] of Object.entries(skip)) {
  if (!proofFiles.includes(key)) errors.push(`db-proof-manifest skip entry '${key}' has no matching file (stale — remove it).`);
  if (typeof reason !== "string" || reason.trim().length < 10) errors.push(`db-proof-manifest skip entry '${key}' must carry a real reason.`);
}

if (errors.length) {
  console.error("❌ verify-coverage FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

const inGate = proofFiles.filter((f) => !(f in skip));
console.log(`✅ verify-coverage: ${proofFiles.length} DB proofs discovered — ${inGate.length} run in the gate (verify:all-db), ${Object.keys(skip).length} explicitly deferred:`);
for (const [k, r] of Object.entries(skip)) console.log(`   ⤷ ${k} — ${r}`);
