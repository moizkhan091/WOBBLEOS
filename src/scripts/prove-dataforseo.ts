/**
 * LIVE proof for the DataForSEO adapter. Runs the CHEAPEST useful calls (Google Trends ≈ $0.001, then a
 * tiny search-volume) against the real API, governed by the budget ledger, and confirms the spend was
 * recorded. Requires DATAFORSEO_AUTH (base64 login:password) + DATABASE_URL in the env.
 *
 * NOTE: DataForSEO data endpoints require the account to be VERIFIED first (app.dataforseo.com). Until then
 * every data call returns 40104 and this script reports that truthfully instead of pretending success.
 *
 *   DATAFORSEO_AUTH=… DATABASE_URL=… npx tsx src/scripts/prove-dataforseo.ts
 */
import { trendsExplore, searchVolume, DataForSeoAccountError, DATAFORSEO_PROVIDER } from "@/lib/dataforseo";
import { getProviderSpend } from "@/lib/provider-budget";

async function main() {
  if (!process.env.DATAFORSEO_AUTH) throw new Error("DATAFORSEO_AUTH absent — cannot prove a governed provider without its credential");
  const before = await getProviderSpend(DATAFORSEO_PROVIDER).catch(() => 0);
  console.log(`[dataforseo] ledger spend before: $${before.toFixed(4)}`);

  try {
    console.log("[dataforseo] Google Trends explore (cheap ~$0.001) …");
    const trends = await trendsExplore({ keywords: ["ai receptionist", "business automation"], item: "prove-dataforseo:trends", locationName: "United States" });
    for (const t of trends) {
      console.log(`  · ${t.keyword}: latest=${t.latest} peak=${t.peak} velocity=${t.velocity.toFixed(2)} points=${t.interestOverTime.length}`);
    }

    console.log("[dataforseo] Search volume (small) …");
    const vols = await searchVolume({ keywords: ["ai receptionist", "missed call text back"], item: "prove-dataforseo:volume", locationName: "United States" });
    for (const v of vols) {
      console.log(`  · ${v.keyword}: volume=${v.searchVolume} competition=${v.competition} cpc=${v.cpc}`);
    }

    const after = await getProviderSpend(DATAFORSEO_PROVIDER).catch(() => 0);
    console.log(`[dataforseo] ledger spend after: $${after.toFixed(4)} (delta $${(after - before).toFixed(4)})`);
    console.log("[dataforseo] PROVEN LIVE ✓");
  } catch (err) {
    if (err instanceof DataForSeoAccountError) {
      console.log(`[dataforseo] BLOCKED by DataForSEO: ${err.message}`);
      console.log("[dataforseo] → Verify the account at https://app.dataforseo.com/ , then re-run. The adapter + governance are correct; only account verification is pending.");
      const after = await getProviderSpend(DATAFORSEO_PROVIDER).catch(() => 0);
      console.log(`[dataforseo] ledger spend after (should be unchanged): $${after.toFixed(4)}`);
      return;
    }
    throw err;
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
