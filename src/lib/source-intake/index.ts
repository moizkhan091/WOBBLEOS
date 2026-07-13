import { eq } from "drizzle-orm";
import { sources, sourceChunks } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { createSourceIntakeRun, markSourceIntakeRunComplete, attachSourceChunks } from "@/lib/sources";
import { apifyConfigured, scrapeWebsite, scrapeInstagram } from "@/lib/scraper/apify";
import { recordAgentRun } from "@/lib/agents";
import type { JobRow } from "@/lib/domain/jobs";
import { selectIngestionAdapter, type IngestionContext, type SourceLike } from "@/lib/source-intake/adapters";

/**
 * Source intake worker — makes approving a source ACTUALLY do something. An intake run is dispatched to the FIRST
 * applicable INGESTION ADAPTER (`adapters.ts`): inline text (unblocked) → RSS feed (unblocked) → Apify social/web
 * (when a key is configured) → plain HTTP web fetch (unblocked fallback) → chunk → attach (embedded) → complete the
 * run → chain the knowledge compile. Web + inline ingestion no longer HARD-depend on Apify; only rich social scrape
 * does. Wires up the source_intake_orchestrator agent (its runs log). Deps are injectable for deterministic proofs.
 */

export interface SourceIntakeResult { ok: boolean; chunks?: number; note?: string; adapter?: string; error?: string }

export interface SourceIntakeDeps {
  db?: Db;
  /** Override the ingestion context (inject a deterministic fetchText / apify stubs in proofs). */
  context?: IngestionContext;
}

export async function runSourceIntake(sourceId: string, deps: SourceIntakeDeps = {}): Promise<SourceIntakeResult> {
  const db = deps.db ?? getDb();
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);
  if (!source) return { ok: false, error: "source not found" };

  // Only an ACTIVE, APPROVED source may be collected — this gates the server-side fetch too (a non-active source
  // can never trigger an outbound ingestion request, even via a direct reingest API call).
  if (source.status !== "active" || source.approvalStatus !== "approved") {
    const { run } = await createSourceIntakeRun({ sourceId, trigger: "agent", tool: "ingestion" });
    await markSourceIntakeRunComplete({ intakeRunId: run.id, status: "cancelled", logs: [{ note: `source is not active+approved (status: ${source.status}, approval: ${source.approvalStatus}) — no collection` }] }).catch(() => {});
    return { ok: true, chunks: 0, note: "source not active" };
  }

  const { run } = await createSourceIntakeRun({ sourceId, trigger: "agent", tool: "ingestion" });

  const ctx: IngestionContext = deps.context ?? {
    apifyConfigured: apifyConfigured(),
    scrapeWebsite: async (u) => ({ text: (await scrapeWebsite(u)).text ?? "" }),
    scrapeInstagram: async (u, n) => ({ posts: (await scrapeInstagram(u, n)).posts }),
  };

  const adapter = selectIngestionAdapter(source as SourceLike, ctx);
  if (!adapter) {
    await markSourceIntakeRunComplete({ intakeRunId: run.id, status: "cancelled", logs: [{ note: "no ingestion adapter applies (no URL and no inline content) — attach chunks via the API / n8n" }] }).catch(() => {});
    return { ok: true, chunks: 0, note: "no adapter applies" };
  }

  try {
    const { chunks, note } = await adapter.collect(source as SourceLike, ctx);
    // Idempotent re-ingest: REPLACE the source's chunks (delete the prior set before attaching) so a re-ingest or a
    // periodic re-collection never accumulates duplicate chunks that would pollute retrieval.
    if (chunks.length) {
      await db.delete(sourceChunks).where(eq(sourceChunks.sourceId, sourceId));
      await attachSourceChunks({ sourceId, chunks });
    }
    await markSourceIntakeRunComplete({ intakeRunId: run.id, status: "succeeded", logs: [{ adapter: adapter.slug, chunks: chunks.length, note }] }).catch(() => {});
    await recordAgentRun({ agentSlug: "source_intake_orchestrator", status: "succeeded", inputSummary: `${adapter.slug}:${(source.url ?? "inline").slice(0, 180)}`, outputSummary: `${chunks.length} chunks via ${adapter.slug}` }).catch(() => {});
    // Chain: now that chunks exist, compile them into the knowledge base.
    if (chunks.length) {
      try { const { enqueueKnowledgeCompileJob } = await import("@/lib/knowledge"); await enqueueKnowledgeCompileJob({ sourceId }); } catch { /* best-effort */ }
    }
    return { ok: true, chunks: chunks.length, adapter: adapter.slug, note };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown error";
    await markSourceIntakeRunComplete({ intakeRunId: run.id, status: "failed", error: msg }).catch(() => {});
    await recordAgentRun({ agentSlug: "source_intake_orchestrator", status: "failed", error: msg }).catch(() => {});
    return { ok: false, error: msg, adapter: adapter.slug };
  }
}

/** Job handler: `source.intake` — enqueued when a source is approved. */
export async function runSourceIntakeJobHandler(job: JobRow): Promise<Record<string, unknown>> {
  const sourceId = typeof job.payload?.sourceId === "string" ? job.payload.sourceId : undefined;
  if (!sourceId) return { skipped: "no sourceId in payload" };
  return { ...(await runSourceIntake(sourceId)) };
}
