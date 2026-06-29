import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const storageRoot = process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage");
const heartbeatPath = path.join(storageRoot, "temp", "video-worker-heartbeat.json");
let stopping = false;

async function writeHeartbeat(state: string) {
  await mkdir(path.dirname(heartbeatPath), { recursive: true });
  await writeFile(heartbeatPath, JSON.stringify({ state, at: new Date().toISOString() }, null, 2));
}

async function shutdown() {
  stopping = true;
  await writeHeartbeat("stopping");
  await writeHeartbeat("stopped");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main() {
  await writeHeartbeat("running");
  while (!stopping) {
    await new Promise((resolve) => setTimeout(resolve, 30_000));
    await writeHeartbeat("running");
  }
}

main().catch(async (error) => {
  await writeHeartbeat(`error:${error instanceof Error ? error.message : "unknown"}`);
  process.exit(1);
});
