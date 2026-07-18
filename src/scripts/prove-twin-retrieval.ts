/**
 * Prove the WOBBLE Company Twin is QUERYABLE: three natural-language questions run through the real
 * semantic retrieval path (query -> OpenRouter embedding -> pgvector search -> ranked twin facts).
 *
 * Run:  DATABASE_URL=… OPENROUTER_API_KEY=… npx tsx src/scripts/prove-twin-retrieval.ts
 */
import { closeDb } from "@/db";
import { retrieveMemoryContext } from "@/lib/memory";

const QUERIES = [
  "What does WOBBLE sell and how is it priced?",
  "What is WOBBLE's brand voice and what must we never say?",
  "What is WOBBLE's primary brand colour and visual design?",
  "Who is WOBBLE's ideal customer?",
];

async function main() {
  for (const q of QUERIES) {
    const chunks = await retrieveMemoryContext({ query: q, limit: 3 });
    const top = chunks.slice(0, 3).map((c) => `[${c.bankSlugs.join(",")}] ${c.content.slice(0, 70)}…`);
    console.log(`\nQ: ${q}`);
    for (const t of top) console.log(`   -> ${t}`);
    if (!chunks.length) console.log("   -> (no chunks retrieved)");
  }
}

main().then(() => closeDb()).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
