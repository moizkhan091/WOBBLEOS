/**
 * WOBBLE OpenRouter image adapter (execution-order step 12) — prove the NEW adapter generates a real image
 * via OpenRouter and is wired into the media registry. We exercise the provider directly (createMediaJob →
 * dispatch can't be proven end-to-end against the shared UAT DB yet: the live media worker runs the OLD
 * build, which has neither this provider nor the OPENROUTER_API_KEY, so it races the queue and BLOCKS
 * openrouter jobs — that path lands once the worker image is rebuilt). The provider is the new code; the
 * queue/worker chain is pre-existing, already-proven infrastructure.
 *
 * Budget: ONE image (~$0.04). Set STORAGE_ROOT to a scratch dir so the binary is never committed.
 *
 * Run:  DATABASE_URL=… OPENROUTER_API_KEY=… STORAGE_ROOT=…/scratch npx tsx src/scripts/prove-openrouter-image.ts
 */
import { statSync } from "node:fs";
import path from "node:path";
import { closeDb } from "@/db";
import { defaultProviderRegistry } from "@/lib/media";
import { recordExternalSpend, getProviderSpend } from "@/lib/provider-budget";

const FOUNDER = "Moiz";
const PROMPT =
  "WOBBLE brand key visual: a single glowing electric-lime (#B8FF2C) orb/sphere with a soft motion trail on a near-black background, minimal, futuristic, high contrast. Small clean wordmark 'WOBBLE'. No other text.";

async function main() {
  const storageRoot = process.env.STORAGE_ROOT ?? process.cwd();

  // 1) The adapter is registered in the PRODUCTION media registry and reports configured (key present).
  const registry = defaultProviderRegistry();
  const provider = registry.openrouter;
  if (!provider) throw new Error("openrouter provider is NOT in defaultProviderRegistry()");
  console.log(`  registry has providers: ${Object.keys(registry).join(", ")}`);
  console.log(`  openrouter.configured() = ${provider.configured()} (fal.configured() = ${registry.fal.configured()})`);
  if (!provider.configured()) throw new Error("openrouter provider not configured (OPENROUTER_API_KEY missing)");

  // 2) Generate a real image through the adapter → OpenRouter → inline base64 → durable storage.
  const result = await provider.generate({ kind: "image", prompt: PROMPT, params: {} });
  console.log(`  generated outputs=${JSON.stringify(result.outputRefs)}, actualCostCents=${result.actualCostCents}`);
  if (result.outputRefs.length === 0) throw new Error("no image produced");

  for (const ref of result.outputRefs) {
    const size = statSync(path.join(storageRoot, ref)).size;
    console.log(`  artifact ${ref} = ${(size / 1024).toFixed(1)} KB on disk`);
    if (size < 1000) throw new Error(`artifact ${ref} suspiciously small (${size} bytes)`);
  }

  // 3) Truthfully block an unsupported kind (video stays with fal).
  let videoBlocked = false;
  try { await provider.generate({ kind: "video", prompt: "x", params: {} }); }
  catch (e) { videoBlocked = /does not support kind 'video'/.test(String(e)); }
  console.log(`  video correctly refused by openrouter adapter: ${videoBlocked}`);
  if (!videoBlocked) throw new Error("openrouter adapter should refuse video");

  // 4) Reflect the image spend in the unified OpenRouter budget ledger.
  const usd = (result.actualCostCents ?? 0) / 100;
  await recordExternalSpend({
    provider: "openrouter", item: "media:image", model: "google/gemini-2.5-flash-image",
    estimatedMaxCost: usd, actualCost: usd, unit: "usd", result: "succeeded", actor: FOUNDER,
    metadata: { outputs: result.outputRefs.length },
  });
  const spent = await getProviderSpend("openrouter");
  console.log(`  recorded image spend $${usd.toFixed(4)}; unified OpenRouter spend now $${spent.toFixed(4)} of $3.00`);
  console.log("  DONE: OpenRouter image adapter proven (registered + configured + real image + cost + truthful kind refusal).");
}

main().then(() => closeDb()).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
