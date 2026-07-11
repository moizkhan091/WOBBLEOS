import { eq } from "drizzle-orm";
import { sources } from "@/db/schema";
import { getDb } from "@/db";
import { createSourceIntakeRun, markSourceIntakeRunComplete, attachSourceChunks } from "@/lib/sources";
import { apifyConfigured, scrapeWebsite, scrapeInstagram } from "@/lib/scraper/apify";
import { recordAgentRun } from "@/lib/agents";
import type { JobRow } from "@/lib/domain/jobs";

/**
 * Source intake worker — makes approving a source ACTUALLY do something. Previously an intake run
 * was recorded but nothing executed it, so approving a source produced no scrape/chunks and the
 * knowledge compiler found nothing. This dispatches by type: websites/blogs → Apify web scrape,
 * social handles → Apify instagram scrape → chunk → attach (embedded) → complete the run. Wires up
 * the source_intake_orchestrator agent (its runs now log). Gated: inert without APIFY_API_KEY.
 */

function chunkText(text: string, size = 1200): string[] {
  const clean = (text ?? "").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  for (let i = 0; i < clean.length && chunks.length < 40; i += size) chunks.push(clean.slice(i, i + size));
  return chunks;
}

export interface SourceIntakeResult { ok: boolean; chunks?: number; note?: string; error?: string }

export async function runSourceIntake(sourceId: string): Promise<SourceIntakeResult> {
  const db = getDb();
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);
  if (!source) return { ok: false, error: "source not found" };

  const { run } = await createSourceIntakeRun({ sourceId, trigger: "agent", tool: "apify" });
  const url = source.url;

  if (!url) {
    await markSourceIntakeRunComplete({ intakeRunId: run.id, status: "cancelled", logs: [{ note: "no URL — attach chunks via the API / n8n" }] }).catch(() => {});
    return { ok: true, chunks: 0, note: "no url to scrape" };
  }
  if (!apifyConfigured()) {
    await markSourceIntakeRunComplete({ intakeRunId: run.id, status: "cancelled", logs: [{ note: "APIFY_API_KEY not set — scraping disabled" }] }).catch(() => {});
    return { ok: true, chunks: 0, note: "apify not configured" };
  }

  try {
    let chunks: string[] = [];
    if (/instagram\.com/i.test(url) || (source.sourceType ?? "").includes("social") || (source.sourceType ?? "").includes("instagram")) {
      const ig = await scrapeInstagram(url, 12);
      chunks = ig.posts.map((p) => p.caption).filter((c): c is string => Boolean(c && c.trim())).slice(0, 40);
    } else {
      const web = await scrapeWebsite(url);
      chunks = chunkText(web.text);
    }
    if (chunks.length) await attachSourceChunks({ sourceId, chunks });
    await markSourceIntakeRunComplete({ intakeRunId: run.id, status: "succeeded", logs: [{ chunks: chunks.length, url }] }).catch(() => {});
    await recordAgentRun({ agentSlug: "source_intake_orchestrator", status: "succeeded", inputSummary: url.slice(0, 200), outputSummary: `${chunks.length} chunks from ${source.sourceType}` }).catch(() => {});
    // Chain: now that chunks exist, compile them into the knowledge base.
    if (chunks.length) {
      try { const { enqueueKnowledgeCompileJob } = await import("@/lib/knowledge"); await enqueueKnowledgeCompileJob({ sourceId }); } catch { /* best-effort */ }
    }
    return { ok: true, chunks: chunks.length };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown error";
    await markSourceIntakeRunComplete({ intakeRunId: run.id, status: "failed", error: msg }).catch(() => {});
    await recordAgentRun({ agentSlug: "source_intake_orchestrator", status: "failed", error: msg }).catch(() => {});
    return { ok: false, error: msg };
  }
}

/** Job handler: `source.intake` — enqueued when a source is approved. */
export async function runSourceIntakeJobHandler(job: JobRow): Promise<Record<string, unknown>> {
  const sourceId = typeof job.payload?.sourceId === "string" ? job.payload.sourceId : undefined;
  if (!sourceId) return { skipped: "no sourceId in payload" };
  return { ...(await runSourceIntake(sourceId)) };
}
