import { desc, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { modelRuns } from "@/db/schema";
import { applyModelChange } from "@/lib/model-control";
import { getModelRoleMap } from "@/lib/model-registry";
import { runTextProvider } from "@/lib/providers";

/**
 * Proof that switching a model in Model Control actually changes what OpenRouter is asked for.
 *
 * The founder's requirement was blunt: switch a model and have it take effect, without coming back to
 * ask whether it silently failed. This proves the whole chain against the real database and the real
 * provider, in the same process the app uses:
 *
 *   1. read what the role runs now
 *   2. switch it through applyModelChange (the exact function the API route calls)
 *   3. make a REAL provider call and read back the model recorded in model_runs
 *   4. switch it back and prove the next call moved with it
 *
 * If step 3 or 5 shows the old model, the switch did not take effect and this exits non-zero.
 *
 * Cost: two ~10-token completions on whatever the role is set to. Run it with the role left on cheap
 * models (the default below) and it costs a fraction of a cent.
 *
 * Usage (inside the worker container, which has src + node_modules):
 *   docker exec wobbleos-worker-1 npx tsx src/scripts/prove-model-control.ts
 */

const ROLE = process.env.PROVE_ROLE ?? "content_scoring";
const SWITCH_TO = process.env.PROVE_MODEL ?? "openai/gpt-4o-mini";
const FALLBACK_SWITCH_TO = "openai/gpt-4o";

async function currentModelFor(role: string): Promise<string | null> {
  return (await getModelRoleMap())[role]?.model ?? null;
}

/** The model recorded against the most recent run of this role, which is what was actually requested. */
async function lastRunModel(role: string): Promise<{ model: string; at: Date } | null> {
  const rows = await getDb().select({ model: modelRuns.model, at: modelRuns.createdAt }).from(modelRuns).where(eq(modelRuns.role, role)).orderBy(desc(modelRuns.createdAt)).limit(1);
  const row = rows[0];
  return row ? { model: row.model, at: new Date(row.at) } : null;
}

async function callOnce(role: string): Promise<void> {
  await runTextProvider({
    role,
    module: "model_control_proof",
    messages: [{ role: "user", content: "Reply with the single word: ok" }],
    maxTokens: 8,
    temperature: 0,
    usageContext: { agentSlug: "model_control_proof", module: "model_control_proof" },
  });
}

async function main() {
  const failures: string[] = [];
  const original = await currentModelFor(ROLE);
  if (!original) throw new Error(`role '${ROLE}' is not in the map, so there is nothing to switch`);
  console.log(`role '${ROLE}' currently runs ${original}`);

  // Switch to something DIFFERENT from what it runs now, otherwise the proof proves nothing.
  const target = original === SWITCH_TO ? FALLBACK_SWITCH_TO : SWITCH_TO;

  const applied = await applyModelChange({ role: ROLE, model: target }, "model_control_proof");
  if (applied.failed.length) throw new Error(`switch rejected: ${applied.failed.map((f) => `${f.role}: ${f.error}`).join(", ")}`);
  const afterSwitch = await currentModelFor(ROLE);
  console.log(`switched to ${target}; map now says ${afterSwitch}`);
  if (afterSwitch !== target) failures.push(`the map still says ${afterSwitch} after switching to ${target}`);

  await callOnce(ROLE);
  const run1 = await lastRunModel(ROLE);
  console.log(`next provider call was recorded as ${run1?.model}`);
  if (run1?.model !== target) failures.push(`the call after the switch ran ${run1?.model}, not ${target}`);

  // And back, so this proof leaves the map exactly as it found it.
  const restored = await applyModelChange({ role: ROLE, model: original }, "model_control_proof");
  if (restored.failed.length) throw new Error(`restore rejected: ${restored.failed.map((f) => `${f.role}: ${f.error}`).join(", ")}`);
  await callOnce(ROLE);
  const run2 = await lastRunModel(ROLE);
  console.log(`restored to ${original}; the call after that ran ${run2?.model}`);
  if (run2?.model !== original) failures.push(`the call after restoring ran ${run2?.model}, not ${original}`);

  const finalModel = await currentModelFor(ROLE);
  if (finalModel !== original) failures.push(`left the map on ${finalModel} instead of the original ${original}`);

  if (failures.length) {
    console.error("\nXX  model control did NOT take effect:");
    for (const f of failures) console.error(`    - ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log("\nOK  a model switch takes effect on the very next provider call, with no restart.");
}

main()
  .catch((error) => {
    console.error("XX  proof failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
