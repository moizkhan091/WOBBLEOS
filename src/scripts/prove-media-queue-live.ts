/**
 * Prove the FULL media queue chain live: createMediaJob(provider="openrouter") from the host → the LIVE
 * worker-video (now on HEAD, with the provider registered + OPENROUTER_API_KEY wired) claims the lease,
 * generates the image, writes it to the shared storage volume → job SUCCEEDED with outputRefs + metered
 * cost. We do NOT dispatch here — the running worker does, which is the whole point.
 *
 * Run:  DATABASE_URL=…@127.0.0.1:15432/wobble_os npx tsx src/scripts/prove-media-queue-live.ts
 */
import { closeDb } from "@/db";
import { createMediaJob, defaultStore } from "@/lib/media";

const PROMPT =
  "WOBBLE launch card: electric-lime (#B8FF2C) orb with a motion trail on near-black, small 'WOBBLE' wordmark, minimal futuristic. No other text.";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const dedupeKey = `wobble-queue-live-${Date.now()}`;
  const created = await createMediaJob({
    kind: "image", prompt: PROMPT, provider: "openrouter",
    estimatedCostCents: 10, budgetCapCents: 20, requestedBy: "Moiz", scopeType: "company", dedupeKey,
  });
  if (!created.ok || !created.job) throw new Error(`createMediaJob failed: ${created.error} ${JSON.stringify(created.errors)}`);
  const id = created.job.id;
  console.log(`  queued media job ${id} (provider=openrouter) — waiting for the LIVE worker to process it…`);

  const store = defaultStore();
  let job = created.job;
  for (let i = 0; i < 40; i++) { // up to ~120s
    await sleep(3000);
    const fresh = await store.getById(id);
    if (!fresh) continue;
    job = fresh;
    if (job.status !== "queued" && job.status !== "generating") break;
    if (i % 3 === 0) console.log(`    …status=${job.status} (t+${(i + 1) * 3}s)`);
  }

  console.log(`  FINAL: status=${job.status}, outputs=${JSON.stringify(job.outputRefs)}, actualCostCents=${job.actualCostCents}, error=${job.error ?? "none"}`);
  if (job.status !== "succeeded") throw new Error(`queue chain did not succeed (status=${job.status})`);
  if (job.outputRefs.length === 0) throw new Error("succeeded but no outputRefs");
  console.log("  DONE: full media queue chain proven LIVE (host createMediaJob → live worker → provider → artifact → cost).");
  console.log(`  artifact ref (in the wobble_storage volume): ${job.outputRefs[0]}`);
}

main().then(() => closeDb()).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
