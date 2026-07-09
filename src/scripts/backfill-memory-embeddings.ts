import { and, eq, isNull } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { memoryChunks } from "@/db/schema";
import { getDefaultEmbedder } from "@/lib/embeddings";

/**
 * Backfill embeddings for memory chunks that don't have one yet.
 *
 * Run: `npm run memory:backfill-embeddings`
 * Requires DATABASE_URL and an embeddings key (EMBEDDINGS_API_KEY or OPENROUTER_API_KEY).
 */

// Node >=20 can load .env directly; guarded so it is harmless if unavailable.
try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env");
} catch {
  // no .env file — rely on the ambient environment
}

const BATCH_SIZE = 32;

async function main(): Promise<void> {
  const embedder = getDefaultEmbedder();
  if (!embedder) {
    console.error("No embeddings key configured (set EMBEDDINGS_API_KEY or OPENROUTER_API_KEY).");
    process.exit(1);
    return;
  }

  const db = getDb();
  const pending = await db
    .select({ id: memoryChunks.id, content: memoryChunks.content })
    .from(memoryChunks)
    .where(and(eq(memoryChunks.status, "active"), isNull(memoryChunks.embedding)));

  console.log(`[backfill] model=${embedder.model} | chunks needing embeddings: ${pending.length}`);
  if (!pending.length) {
    await closeDb();
    console.log("[backfill] nothing to do.");
    return;
  }

  let done = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const vectors = await embedder.embed(batch.map((row) => row.content));
    for (let j = 0; j < batch.length; j++) {
      await db.update(memoryChunks).set({ embedding: vectors[j] }).where(eq(memoryChunks.id, batch[j].id));
    }
    done += batch.length;
    console.log(`[backfill] embedded ${done}/${pending.length}`);
  }

  await closeDb();
  console.log("[backfill] complete.");
}

main().catch(async (error) => {
  console.error("[backfill] failed:", error instanceof Error ? error.message : error);
  await closeDb().catch(() => {});
  process.exit(1);
});
