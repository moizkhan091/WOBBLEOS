#!/usr/bin/env node
// Filesystem-driven DB-proof runner (WOB-AUD-015). DISCOVERS every `src/scripts/verify-*-db.ts` proof
// and runs it, so a NEW proof file is automatically part of the release gate — nothing can be silently
// omitted the way 24 proofs were before. A proof may be excluded ONLY by listing it in
// `scripts/db-proof-manifest.json` with an explicit reason (e.g. requires an external provider credential
// not present in CI). Requires DATABASE_URL. Runs sequentially; reports every failure; exits non-zero if
// any required proof fails.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

if (!process.env.DATABASE_URL) {
  console.error("❌ run-all-db-proofs: DATABASE_URL is required (point it at a fresh migrated + seeded DB).");
  process.exit(1);
}

const manifestPath = join(root, "scripts", "db-proof-manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { skip: {} };
const skip = manifest.skip ?? {};

const scriptsDir = join(root, "src", "scripts");
const all = readdirSync(scriptsDir).filter((f) => /^verify-.*-db\.ts$/.test(f)).sort();

// Guard: a skip entry that names a proof which no longer exists is a stale manifest → fail loudly.
const stale = Object.keys(skip).filter((k) => !all.includes(k));
if (stale.length) {
  console.error(`❌ db-proof-manifest has stale skip entries (files gone): ${stale.join(", ")}`);
  process.exit(1);
}

const toRun = all.filter((f) => !(f in skip));
const skipped = all.filter((f) => f in skip);
const timeoutMs = Number(process.env.DB_PROOF_TIMEOUT_MS ?? 180_000);

console.log(`▶ running ${toRun.length} DB proofs (${skipped.length} skipped by manifest, ${all.length} total)`);
for (const s of skipped) console.log(`  ⤷ skip ${s} — ${skip[s]}`);

const failures = [];
const started = process.hrtime.bigint();
for (const file of toRun) {
  const label = file.replace(/\.ts$/, "");
  process.stdout.write(`  • ${label} ... `);
  const res = spawnSync("npx", ["tsx", join("src", "scripts", file)], {
    cwd: root, encoding: "utf8", timeout: timeoutMs, shell: process.platform === "win32",
    env: process.env,
  });
  if (res.status === 0) {
    console.log("PASS");
  } else {
    console.log(`FAIL (exit ${res.status ?? "timeout"})`);
    const tail = (res.stdout || "") + (res.stderr || "");
    failures.push({ file, reason: tail.trim().split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 300) });
  }
}
const secs = Number((process.hrtime.bigint() - started) / 1_000_000n) / 1000;

if (failures.length) {
  console.error(`\n❌ ${failures.length}/${toRun.length} DB proofs FAILED (${secs.toFixed(0)}s):`);
  for (const f of failures) console.error(`  - ${f.file}: ${f.reason}`);
  process.exit(1);
}
console.log(`\n✅ all ${toRun.length} DB proofs passed in ${secs.toFixed(0)}s (${skipped.length} manifest-skipped).`);
