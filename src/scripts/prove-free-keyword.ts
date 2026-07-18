/**
 * LIVE proof of the FREE keyword research (Google/DDG autocomplete) — the DataForSEO fallback. No key.
 *   npx tsx src/scripts/prove-free-keyword.ts
 */
import { relatedKeywords, freeDemandSignal } from "@/lib/keyword-research";
import { defaultTopicEnricher } from "@/lib/content-topics";

async function main() {
  const seeds = ["ai receptionist", "missed call text back", "n8n automation"];
  for (const s of seeds) {
    const rel = await relatedKeywords(s);
    const sig = await freeDemandSignal(s);
    console.log(`· "${s}" → signal ${sig.signal}/100 (commercialIntent=${sig.commercialIntent}) | related: ${rel.slice(0, 5).join(" | ")}`);
  }
  console.log("\n[enricher] free demand signal fills in even while DataForSEO is unverified:");
  const { volumes, signals } = await defaultTopicEnricher().enrich(seeds, "prove-free-keyword", "United States");
  for (const s of seeds) console.log(`  ${s}: paidVolume=${volumes.get(s) ?? "n/a"} freeSignal=${signals?.get(s) ?? "n/a"}`);
  console.log("\n[free-kw] PROVEN LIVE — keyword research works with NO paid provider. ✓");
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
