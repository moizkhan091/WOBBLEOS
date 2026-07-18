/**
 * Offer Validation Lab (execution-order step 7) — validate ONE real WOBBLE offer end-to-end: gather ONE
 * governed Tavily evidence search, score all 11 dimension agents (gpt-4o-mini, budget-guarded), roll up to a
 * go/pivot/kill verdict, and persist a versioned run + its 11 dimension rows. Re-running produces v2 (kept,
 * not overwritten).
 *
 * Run:  DATABASE_URL=… OPENROUTER_API_KEY=… TAVILY_API_KEY=… npx tsx src/scripts/prove-offer-validation.ts
 */
import { closeDb } from "@/db";
import { listOffers } from "@/lib/offers";
import { runOfferValidation, getOfferValidationDetail, listOfferValidations } from "@/lib/offer-validation";

async function main() {
  const offers = await listOffers({ limit: 500 });
  const offer = offers.find((o) => /receptionist/i.test(o.name)) ?? offers[0];
  if (!offer) throw new Error("no offers in the module to validate — run prove-offer-catalogue first");
  console.log(`  validating offer: ${offer.name} (${offer.id})`);

  const { run, dimensions } = await runOfferValidation(offer.id, { actor: "Moiz" });
  console.log(`  VERDICT: ${run.verdict.toUpperCase()} @ ${run.overallScore}/100  (version ${run.version}, evidence ${run.evidenceCount})`);
  console.log(`  ${run.summary}`);
  console.log("  dimensions:");
  for (const d of dimensions.sort((a, b) => b.score - a.score)) {
    console.log(`    ${String(d.score).padStart(3)}  ${d.dimension.padEnd(22)} — ${d.rationale.slice(0, 80)}`);
  }

  // Prove persistence: reload the run list + the stored dimensions for this run.
  const runs = await listOfferValidations(offer.id, 10);
  const storedDims = await getOfferValidationDetail(run.id);
  console.log(`  persisted: ${runs.length} run(s) for this offer, latest verdict=${runs[0]?.verdict}, ${storedDims.length} dimension rows for run ${run.id}`);
  if (storedDims.length !== 11) throw new Error(`expected 11 stored dimensions, got ${storedDims.length}`);
  console.log("  DONE: Offer Validation Lab proven live (evidence → 11 dimension agents → verdict → versioned persistence).");
}

main().then(() => closeDb()).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
