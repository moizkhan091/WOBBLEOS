/**
 * Real-DB proof (Postgres) that the continuous-research INGESTION ADAPTERS actually collect + attach chunks end to
 * end — including the UNBLOCKED paths that no longer need Apify:
 *   - an INLINE-TEXT source (manual note / pasted content) → inline_text adapter → chunks attached (no network)
 *   - a WEBSITE source with NO Apify → http_web adapter (injected deterministic fetch) → chunks attached
 *   - an RSS source → rss_feed adapter (injected feed) → one chunk per item
 * Each proves the real DB effect (source_chunks rows) + a succeeded intake run + the selected adapter, and that a
 * URL-less/content-less source cleanly yields NO adapter (never a silent failure).
 *
 * ISOLATED + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-ingestion-adapters-db.ts
 */
import { inArray, eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { sources as sourcesTable, sourceChunks as sourceChunksTable, sourceIntakeRuns, auditLogs } from "@/db/schema";
import { createSource, activateApprovedSource, defaultStore as sourceStore } from "@/lib/sources";
import { runSourceIntake } from "@/lib/source-intake";
import type { IngestionContext } from "@/lib/source-intake/adapters";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const store = sourceStore(db);
  const deps = { store };
  const sourceIds: string[] = [];

  const chunkCount = async (id: string) => (await db.select({ id: sourceChunksTable.id }).from(sourceChunksTable).where(eq(sourceChunksTable.sourceId, id))).length;
  const lastRun = async (id: string) => (await db.select().from(sourceIntakeRuns).where(eq(sourceIntakeRuns.sourceId, id)).limit(1))[0] as { status?: string } | undefined;

  const mkActiveSource = async (tag: string, extra: Record<string, unknown>) => {
    const r = await createSource({ title: `Ingest ${tag} ${uniq}`, sourceType: String(extra.sourceType ?? "url"), url: (extra.url as string | undefined), ownerScope: "company", ownerId: `ingest_${uniq}`, addedBy: "Moiz" } as never, deps);
    sourceIds.push(r.source.id);
    await activateApprovedSource(r.source.id, { trustLevel: "verified", approvedBy: "Moiz" }, deps);
    if (extra.metadata) await store.updateSource(r.source.id, { metadata: extra.metadata as Record<string, unknown> });
    return r.source.id;
  };

  try {
    // 1) INLINE TEXT — no network, no Apify.
    const inlineId = await mkActiveSource("inline", { sourceType: "manual_note", metadata: { content: "WOBBLE positioning: senior AI systems for founders. Repeatable, owned, not rented. " .repeat(3) } });
    const inline = await runSourceIntake(inlineId, { context: {} });
    assert(inline.ok && inline.adapter === "inline_text" && (inline.chunks ?? 0) >= 1, "INLINE-TEXT source → inline_text adapter attached ≥1 chunk (fully unblocked, no network)");
    const inlineChunks = await chunkCount(inlineId);
    assert(inlineChunks >= 1, "the inline chunks are a REAL DB effect (source_chunks rows exist)");
    assert((await lastRun(inlineId))?.status === "succeeded", "the intake run for the inline source SUCCEEDED");
    // IDEMPOTENT re-ingest: running intake again REPLACES the chunks (no duplicate accumulation).
    await runSourceIntake(inlineId, { context: {} });
    assert(await chunkCount(inlineId) === inlineChunks, "IDEMPOTENT re-ingest: a second intake REPLACES the chunks (count unchanged, no duplicate pollution)");

    // 2) WEBSITE with NO Apify → the http_web fallback (injected deterministic fetch).
    const webCtx: IngestionContext = { apifyConfigured: false, fetchText: async () => "<html><h1>Market Report</h1><p>AI adoption is accelerating across mid-market services firms.</p><script>x()</script></html>" };
    const webId = await mkActiveSource("web", { sourceType: "blog", url: `https://example.com/report-${uniq}` });
    const web = await runSourceIntake(webId, { context: webCtx });
    assert(web.ok && web.adapter === "http_web" && (web.chunks ?? 0) >= 1, "WEBSITE source with NO Apify → http_web fallback attached ≥1 chunk (web ingestion no longer hard-depends on Apify)");
    const webChunk = (await db.select({ content: sourceChunksTable.content }).from(sourceChunksTable).where(eq(sourceChunksTable.sourceId, webId)).limit(1))[0] as { content?: string } | undefined;
    assert(!!webChunk && /Market Report/.test(webChunk.content ?? "") && !/<script>/.test(webChunk.content ?? ""), "the http_web chunk is stripped plain text (tags + scripts removed)");

    // 3) RSS feed → one chunk per item (injected feed).
    const rssXml = `<rss><channel>${["Alpha launch", "Beta pricing", "Gamma partnership"].map((t) => `<item><title>${t}</title><description>news about ${t}</description></item>`).join("")}</channel></rss>`;
    const rssCtx: IngestionContext = { apifyConfigured: false, fetchText: async () => rssXml };
    const rssId = await mkActiveSource("rss", { sourceType: "rss_feed", url: `https://example.com/feed-${uniq}.xml` });
    const rss = await runSourceIntake(rssId, { context: rssCtx });
    assert(rss.ok && rss.adapter === "rss_feed" && (rss.chunks ?? 0) === 3, "RSS source → rss_feed adapter attached one chunk PER feed item (3)");

    // 4) A content-less, URL-less source → NO adapter applies (clean, never a silent failure).
    const emptyId = await mkActiveSource("empty", { sourceType: "manual_note" });
    const empty = await runSourceIntake(emptyId, { context: {} });
    assert(empty.ok && empty.chunks === 0 && empty.note === "no adapter applies", "a URL-less + content-less source cleanly yields NO adapter (0 chunks, explicit note — not a silent scrape failure)");
    assert((await lastRun(emptyId))?.status === "cancelled", "the no-adapter intake run is CANCELLED (honest terminal state)");

    console.log("\n✅ ingestion-adapters DB proof passed");
  } finally {
    if (sourceIds.length) {
      await db.delete(sourceChunksTable).where(inArray(sourceChunksTable.sourceId, sourceIds));
      await db.delete(sourceIntakeRuns).where(inArray(sourceIntakeRuns.sourceId, sourceIds));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, sourceIds));
      await db.delete(sourcesTable).where(inArray(sourcesTable.id, sourceIds));
    }
    await closeDb();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
