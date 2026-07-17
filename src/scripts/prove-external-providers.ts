/**
 * LIVE PROOF (campaign steps 5–6): one governed Tavily basic search + one ≤5-item Apify run, against real
 * UAT Postgres, under the external-provider budget controls. Keys are read from the environment (loaded by
 * the runner from the secrets file) and NEVER printed. Each call records real spend to external_provider_spend.
 *
 * Run with keys + UAT DB in env (the runner sets them from provider-secrets.env; values never echoed):
 *   TAVILY_API_KEY=… APIFY_API_TOKEN=… DATABASE_URL=…@127.0.0.1:15432/wobble_os npx tsx src/scripts/prove-external-providers.ts
 */
import { closeDb } from "@/db";
import { tavilySearch } from "@/lib/tavily";
import { apifyRunActor } from "@/lib/apify";
import { getProviderSpend, PROVIDER_BUDGETS } from "@/lib/provider-budget";

async function main() {
  const redactedKeyStatus = (v?: string) => (v && v.length > 8 ? `present(${v.length} chars)` : "MISSING");
  console.log(`  keys: tavily=${redactedKeyStatus(process.env.TAVILY_API_KEY)} apify=${redactedKeyStatus(process.env.APIFY_API_TOKEN)}`);

  // --- Tavily (step 5): pre-call checklist ---
  const tavilyBudget = PROVIDER_BUDGETS.tavily;
  const tavilySpentBefore = await getProviderSpend("tavily");
  console.log(`  [tavily] item=step5-tavily-basic-search provider=tavily endpoint=/search depth=basic max-charge=1cr spent=${tavilySpentBefore}cr stop=${tavilyBudget.stop}cr`);
  try {
    const t = await tavilySearch(
      { query: "AI operating system for marketing agencies 2026 demand", item: "step5-tavily-basic-search", maxResults: 3, searchDepth: "basic", actor: "Moiz" },
      {},
    );
    console.log(`  [tavily] OK results=${t.results.length} answer=${t.answer ? "yes" : "no"} topTitle="${(t.results[0]?.title ?? "").slice(0, 50)}" creditsUsed=${t.creditsUsed}`);
  } catch (e) {
    console.log(`  [tavily] FAILED: ${e instanceof Error ? e.message : e}`);
  }

  // --- Apify (step 6): pre-call checklist ---
  const apifyBudget = PROVIDER_BUDGETS.apify;
  const apifySpentBefore = await getProviderSpend("apify");
  console.log(`  [apify] item=step6-apify-5item provider=apify actor=apify/rag-web-browser maxItems=3 max-charge=$0.10 spent=$${apifySpentBefore} stop=$${apifyBudget.stop}`);
  if (apifySpentBefore > 0) {
    console.log(`  [apify] SKIP — already proven ($${apifySpentBefore} recorded); not re-spending (founder cap: one test)`);
  } else try {
    const a = await apifyRunActor(
      { actorId: "apify/rag-web-browser", input: { query: "AI receptionist for dental clinics", maxResults: 3 }, maxItems: 3, item: "step6-apify-5item", worstCaseUsd: 0.1, actor: "Moiz" },
      {},
    );
    console.log(`  [apify] OK itemCount=${a.itemCount} estCostUsd=${a.estimatedCostUsd}`);
  } catch (e) {
    console.log(`  [apify] FAILED: ${e instanceof Error ? e.message : e}`);
  }

  console.log(`  spend after: tavily=${await getProviderSpend("tavily")}cr apify=$${await getProviderSpend("apify")}`);
}

main().then(() => closeDb()).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
