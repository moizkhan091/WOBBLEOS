#!/usr/bin/env node
// Image-content safety guard (WOB-AUD-002). Inspects a BUILT runner image's filesystem and FAILS if
// any machine-local / non-runtime path leaked in, or if a required runtime file is missing. Run in CI
// right after `docker build` so a forbidden path (storage media, .env secrets, docs/tests/e2e) can
// never reach a registry or a deploy. Uses `node` INSIDE the image (present in the runtime) to walk
// the FS — robust across the alpine BusyBox `find -printf` limitation the audit hit.
//
// Usage: node scripts/check-docker-image.mjs <image-tag>
import { execFileSync } from "node:child_process";

const image = process.argv[2];
if (!image) {
  console.error("usage: node scripts/check-docker-image.mjs <image-tag>");
  process.exit(2);
}

// FORBIDDEN: must NOT exist in the runtime image. (/app/storage is allowed ONLY as an EMPTY mount point
// for the durable volume — checked separately below: it must contain zero files.)
const FORBIDDEN = ["/app/.env", "/app/.env.production", "/app/docs", "/app/tests", "/app/e2e", "/app/README.md", "/app/AGENTS.md", "/app/CLAUDE.md"];
// REQUIRED: the standalone runtime + migrations the app needs.
const REQUIRED = ["/app/server.js", "/app/.next", "/app/public", "/app/src/db/migrations"];

// A tiny probe that runs inside the image and prints JSON of what exists. Also flags any *.zip / video
// leftovers anywhere under /app (defense in depth against future junk in the build context).
const probe = `
const fs = require('fs');
const path = require('path');
const forbidden = ${JSON.stringify(FORBIDDEN)};
const required = ${JSON.stringify(REQUIRED)};
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
function walkFind(root, exts, out, depth) {
  if (depth > 6) return;
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.next') continue;
    const full = path.join(root, e.name);
    if (e.isDirectory()) walkFind(full, exts, out, depth + 1);
    else if (exts.some((x) => e.name.toLowerCase().endsWith(x))) out.push(full);
  }
}
const stray = [];
walkFind('/app', ['.zip', '.mp4', '.mov', '.env'], stray, 0);
// /app/storage may exist ONLY as an empty mount point — count any files inside it.
const storageFiles = [];
if (exists('/app/storage')) walkFind('/app/storage', [''], storageFiles, 0);
console.log(JSON.stringify({
  forbiddenPresent: forbidden.filter(exists),
  requiredMissing: required.filter((p) => !exists(p)),
  stray,
  storageFiles,
}));
`;

let out;
try {
  out = execFileSync("docker", ["run", "--rm", "--entrypoint", "node", image, "-e", probe], { encoding: "utf8" });
} catch (err) {
  console.error("failed to inspect image:", err instanceof Error ? err.message : err);
  process.exit(2);
}

const report = JSON.parse(out.trim().split("\n").pop());
const problems = [];
if (report.forbiddenPresent.length) problems.push(`forbidden paths present: ${report.forbiddenPresent.join(", ")}`);
if (report.requiredMissing.length) problems.push(`required runtime paths MISSING: ${report.requiredMissing.join(", ")}`);
if (report.stray.length) problems.push(`stray media/secret files: ${report.stray.join(", ")}`);
if (report.storageFiles?.length) problems.push(`/app/storage must be EMPTY at build (runtime volume mount) but contains: ${report.storageFiles.slice(0, 10).join(", ")}`);

if (problems.length) {
  console.error(`❌ docker image content check FAILED for ${image}:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`✅ docker image content check passed for ${image} — no forbidden/stray paths; all required runtime paths present.`);
