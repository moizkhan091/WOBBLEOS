#!/usr/bin/env node
// Container healthcheck for a worker (WOB-AUD-003/013). Reads the worker's heartbeat file from the
// shared storage volume and exits 0 only if it exists AND is FRESH (written within the freshness
// window). A crashed/hung worker stops updating the file → this exits non-zero → Docker marks the
// service unhealthy and restarts it.
//
// Usage: node scripts/worker-heartbeat-healthcheck.mjs <heartbeat-filename> [maxAgeSeconds]
import { readFileSync } from "node:fs";
import path from "node:path";

const file = process.argv[2] ?? "worker-heartbeat.json";
const maxAgeSeconds = Number(process.argv[3] ?? 120);
const storageRoot = process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage");
const heartbeatPath = path.join(storageRoot, "temp", file);

try {
  const raw = readFileSync(heartbeatPath, "utf8");
  const beat = JSON.parse(raw);
  const at = beat && typeof beat.at === "string" ? Date.parse(beat.at) : NaN;
  if (!Number.isFinite(at)) {
    console.error(`heartbeat ${file}: no valid 'at' timestamp`);
    process.exit(1);
  }
  const ageSeconds = (Date.now() - at) / 1000;
  const state = String(beat.state ?? "");
  if (state.startsWith("error") || state === "stopped" || state === "missing_database_url") {
    console.error(`heartbeat ${file}: unhealthy state '${state}'`);
    process.exit(1);
  }
  if (ageSeconds > maxAgeSeconds) {
    console.error(`heartbeat ${file}: stale (${Math.round(ageSeconds)}s > ${maxAgeSeconds}s)`);
    process.exit(1);
  }
  console.log(`heartbeat ${file}: healthy (state='${state}', age=${Math.round(ageSeconds)}s)`);
  process.exit(0);
} catch (err) {
  console.error(`heartbeat ${file}: unreadable (${err instanceof Error ? err.message : err})`);
  process.exit(1);
}
