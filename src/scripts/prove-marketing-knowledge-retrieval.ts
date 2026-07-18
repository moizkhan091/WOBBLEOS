/**
 * Prove the WOBBLE Marketing Knowledge is QUERYABLE via the hybrid knowledge retrieval (synthesized cited
 * notes + raw source chunks), over real OpenRouter query embeddings.
 *
 * Run:  DATABASE_URL=… OPENROUTER_API_KEY=… npx tsx src/scripts/prove-marketing-knowledge-retrieval.ts
 */
import { closeDb } from "@/db";
import { retrieveKnowledge } from "@/lib/knowledge";

const QUERIES = [
  "What hooks work for an AI receptionist that answers missed calls?",
  "How do we handle the objection that AI sounds robotic to customers?",
  "What is the six-ad angle matrix for a missed-lead recovery offer?",
];

async function main() {
  for (const q of QUERIES) {
    const r = await retrieveKnowledge({ query: q, limit: 3, chunkLimit: 2 });
    console.log(`\nQ: ${q}  (embedded=${r.embedded})`);
    for (const n of r.notes.slice(0, 3)) console.log(`   note> [${n.noteType ?? "?"}] ${(n.title ?? "").slice(0, 70)}`);
    for (const c of r.chunks.slice(0, 2)) console.log(`   raw>  ${c.content.slice(0, 80).replace(/\s+/g, " ")}…`);
    if (!r.notes.length && !r.chunks.length) console.log("   -> (nothing retrieved)");
  }
}

main().then(() => closeDb()).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
