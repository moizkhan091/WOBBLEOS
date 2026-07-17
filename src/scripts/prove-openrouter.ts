/**
 * LIVE PROOF (campaign step 4): one MINIMAL OpenRouter text auth + JSON-schema test through the FULL
 * governed path (budget → kill switch → adapter → model_run → external spend ledger). Cheap model
 * (openai/gpt-4o-mini), tiny prompt. Key from env (never printed). Worst-case << the $2.70 stop.
 *
 * Run:  OPENROUTER_API_KEY=… DATABASE_URL=…@127.0.0.1:15432/wobble_os npx tsx src/scripts/prove-openrouter.ts
 */
import { closeDb } from "@/db";
import { runTextProvider } from "@/lib/providers";
import { getProviderSpend } from "@/lib/provider-budget";

async function main() {
  const before = await getProviderSpend("openrouter");
  console.log(`  [openrouter] item=step4-auth-schema model=openai/gpt-4o-mini spent=$${before} stop=$2.70 max-charge≈$0.04`);
  try {
    const res = await runTextProvider(
      {
        role: "ask_wobble",
        module: "ask_wobble",
        messages: [{ role: "user", content: 'Reply with ONLY compact JSON, no prose: {"ok":true,"provider":"openrouter"}' }],
        maxTokens: 60,
        temperature: 0,
        usageContext: { departmentSlug: "ask", agentSlug: "ask_wobble" },
      },
      {},
    );
    let parsed: unknown = null;
    try { parsed = JSON.parse(res.text.trim().replace(/^```json\s*|\s*```$/g, "")); } catch { /* leave null */ }
    console.log(`  [openrouter] OK text=${JSON.stringify(res.text).slice(0, 80)} parsedJSON=${parsed ? "yes" : "no"} status=${res.run.status} tokensIn=${res.run.inputTokens} tokensOut=${res.run.outputTokens} costUsd=${res.run.estimatedCost ?? "n/a"}`);
  } catch (e) {
    console.log(`  [openrouter] FAILED: ${e instanceof Error ? e.message : e}`);
  }
  console.log(`  [openrouter] spend after: $${await getProviderSpend("openrouter")}`);
}

main().then(() => closeDb()).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
