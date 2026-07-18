/**
 * Ingest the WOBBLE service catalogue (34 offer sheets → offers module). Idempotent by name. This seeds the
 * Company Twin's service_catalogue with real WOBBLE offers. Deterministic — no provider. createdBy=Moiz.
 *
 * Run:  DATABASE_URL=…@127.0.0.1:15432/wobble_os npx tsx src/scripts/prove-offer-catalogue.ts
 */
import { readFileSync } from "node:fs";
import { closeDb } from "@/db";
import { addOffer, listOffers } from "@/lib/offers";

async function main() {
  const catalogue: Array<{ name: string; promise: string; hypothesis: string }> = JSON.parse(
    readFileSync("C:/Temp/wobble-local-uat/ingestion/wobble-offer-catalogue.json", "utf8"),
  );
  const existing = new Set((await listOffers({ limit: 1000 })).map((o) => o.name));
  let created = 0;
  for (const o of catalogue) {
    if (existing.has(o.name)) continue;
    await addOffer(
      {
        name: o.name,
        promise: o.promise,
        hypothesis: o.hypothesis || undefined,
        audience: "WOBBLE ICP — local SMBs, home services, dental/med spa, agencies",
        priceModel: "monthly retainer",
        createdBy: "Moiz",
      },
      {},
    );
    created += 1;
  }
  const total = (await listOffers({ limit: 1000 })).length;
  console.log(`  offer catalogue: ${created} created this run, ${total} total offers now in the module`);
}

main().then(() => closeDb()).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
