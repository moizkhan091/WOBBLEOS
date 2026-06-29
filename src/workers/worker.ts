import { PgBoss } from "pg-boss";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const storageRoot = process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage");
const heartbeatPath = path.join(storageRoot, "temp", "worker-heartbeat.json");
const connectionString = process.env.DATABASE_URL;

async function writeHeartbeat(state: string) {
  await mkdir(path.dirname(heartbeatPath), { recursive: true });
  await writeFile(heartbeatPath, JSON.stringify({ state, at: new Date().toISOString() }, null, 2));
}

async function main() {
  await writeHeartbeat("booting");

  if (!connectionString) {
    await writeHeartbeat("missing_database_url");
    return;
  }

  const boss = new PgBoss(connectionString);

  const shutdown = async () => {
    await writeHeartbeat("stopping");
    await boss.stop();
    await writeHeartbeat("stopped");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await boss.start();
  await writeHeartbeat("running");
}

main().catch(async (error) => {
  await writeHeartbeat(`error:${error instanceof Error ? error.message : "unknown"}`);
  process.exit(1);
});

