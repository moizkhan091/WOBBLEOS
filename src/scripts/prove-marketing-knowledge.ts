/**
 * WOBBLE Marketing Knowledge System (execution-order step 20) — ingest the 34 Phase-4 offer sheets through
 * the REAL knowledge engine: immutable raw (source + section chunks) + compiled, CITED notes.
 *
 * Per sheet: createSource(internal_company_document) -> approveSource -> attachSourceChunks (one chunk per
 * `##` section, so Hook Bank / Copy Bank / Ad Angles / Psychology stay individually retrievable) ->
 * compileSource (gpt-4o-mini, budget-guarded) which synthesises cited knowledge_notes with provenance back
 * to the raw chunks. Idempotent: a sheet whose source title already exists is skipped.
 *
 * Run:  DATABASE_URL=… OPENROUTER_API_KEY=… npx tsx src/scripts/prove-marketing-knowledge.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { closeDb } from "@/db";
import { createSource, approveSource, attachSourceChunks, listSources } from "@/lib/sources";
import { compileSource } from "@/lib/knowledge";

const FOUNDER = "Moiz";
const SHEETS_DIR = "C:/Users/moizk/OneDrive/Documents/Claude/Projects/Marketing campaign/Phase-4-Offer-Sheets";

/** Split an offer sheet into one chunk per `## ` section (preamble kept as chunk 0). */
function sectionChunks(md: string): string[] {
  const parts = md.split(/\n(?=## )/g).map((s) => s.trim()).filter((s) => s.length > 0);
  // Cap each chunk to keep embeddings sane; sheets are small so this is rarely hit.
  return parts.map((p) => p.slice(0, 6000));
}

function titleFor(file: string, md: string): string {
  const h1 = md.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return `WOBBLE Offer Sheet — ${h1 ?? file.replace(/\.md$/, "")}`;
}

async function main() {
  const files = readdirSync(SHEETS_DIR).filter((f) => f.endsWith(".md")).sort();
  const existingTitles = new Set((await listSources({ limit: 500 })).map((s) => s.title));

  let ingested = 0, skipped = 0, totalChunks = 0, totalNotes = 0, totalReinforced = 0;
  for (const file of files) {
    const md = readFileSync(`${SHEETS_DIR}/${file}`, "utf8");
    const title = titleFor(file, md);
    if (existingTitles.has(title)) { skipped += 1; continue; }

    const chunks = sectionChunks(md);
    const created = await createSource({
      title,
      sourceType: "internal_company_document",
      ownerScope: "company",
      intendedUse: ["marketing_knowledge", "offer_intelligence"],
      trustLevel: "tier_2_approved_expert",
      addedBy: FOUNDER,
      metadata: { phase: "phase-4-offer-sheets", file, sections: chunks.length },
    });
    if (!created.autoActivated) {
      await approveSource({ sourceId: created.source.id, approvalId: created.approval.id, approvedBy: FOUNDER, trustLevel: "tier_2_approved_expert" });
    }
    await attachSourceChunks({ sourceId: created.source.id, chunks });
    totalChunks += chunks.length;

    const compiled = await compileSource({ sourceId: created.source.id, triggeredBy: FOUNDER });
    totalNotes += compiled.notesCreated;
    totalReinforced += compiled.notesReinforced;
    ingested += 1;
    console.log(`  [${ingested}] ${title} — ${chunks.length} raw chunks, ${compiled.notesCreated} notes (+${compiled.notesReinforced} reinforced)`);
  }

  console.log(`\n  DONE: ${ingested} sheets ingested (${skipped} already present), ${totalChunks} raw chunks, ${totalNotes} compiled notes (+${totalReinforced} reinforced).`);
}

main().then(() => closeDb()).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
