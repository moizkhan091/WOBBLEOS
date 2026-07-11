/**
 * Controlled REAL-provider smoke test (Phase 6 of the release gate). Makes ONE tiny live LLM call
 * through the actual runTextProvider path (role map -> connection -> credential -> OpenRouter adapter
 * -> model_runs logging) to prove auth, structured output, and token/cost accounting with real creds.
 * Minimal budget (maxTokens 30, gpt-4o-mini). Never prints secrets.
 *
 * Run:  DATABASE_URL=... OPENROUTER_API_KEY=... npx tsx src/scripts/smoke-provider.ts
 */
import { runTextProvider } from "@/lib/providers";
import { closeDb } from "@/db";

async function main() {
  const started = Date.now();
  const res = await runTextProvider({
    role: "ask_wobble",
    module: "ask_wobble",
    messages: [{ role: "user", content: 'Reply with EXACTLY this JSON and nothing else: {"ok":true,"n":7}' }],
    maxTokens: 30,
    temperature: 0,
  });
  const ms = Date.now() - started;

  const run = res.run as unknown as Record<string, unknown>;
  console.log("text:", JSON.stringify(res.text).slice(0, 160));
  console.log("model_run:", JSON.stringify({
    id: run.id, model: run.model, provider: run.provider, status: run.status,
    inputTokens: run.inputTokens, outputTokens: run.outputTokens, estimatedCost: run.estimatedCost, latencyMs: ms,
  }));

  let parsedOk = false;
  try { const j = JSON.parse(res.text.replace(/```json|```/g, "").trim()); parsedOk = j.ok === true && j.n === 7; } catch { /* parse failure => not ok */ }

  const authOk = Boolean(res.text) && Boolean(run.id);
  const tokensOk = Number(run.inputTokens) > 0 && Number(run.outputTokens) > 0;
  console.log("checks:", JSON.stringify({ authOk, structuredParseOk: parsedOk, tokenAccountingOk: tokensOk }));
  console.log(authOk && tokensOk ? "SMOKE PASS ✅ (real OpenRouter call succeeded, tokens+cost recorded)" : "SMOKE FAIL");
  if (!(authOk && tokensOk)) process.exitCode = 1;
}

main()
  .then(closeDb)
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(async (e) => {
    console.error("SMOKE ERROR:", e instanceof Error ? e.message : e);
    await closeDb();
    process.exit(1);
  });
