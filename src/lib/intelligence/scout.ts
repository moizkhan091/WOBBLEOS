import { apifyConfigured, scrapeInstagram } from "@/lib/scraper/apify";
import { ingestIntelligencePayload, type IngestRecord } from "@/lib/intelligence/ingest";
import type { IntelligenceDeps } from "@/lib/intelligence";

/**
 * Competitor Scout — the built-in agent that pulls a competitor's recent posts (via Apify)
 * and lands them as pending `intelligence_items`. Runs on the VPS, no n8n required. Gated:
 * inert (configured:false) without APIFY_API_TOKEN so it never fabricates data.
 *
 * Captions + engagement + post date are captured now; transcripts/frame-summaries for reels
 * arrive later via the transcript actor or the n8n webhook (same ingest pipe).
 */

export interface ScoutInput {
  handleOrUrl: string;
  platform?: string;        // default instagram
  limit?: number;           // posts to pull
  targetId?: string;        // link back to the research_target
  scope?: "wobble" | "client" | "global";
  clientId?: string;
}

export interface ScoutResult {
  configured: boolean;
  handle?: string;
  found?: number;
  created?: string[];
  note?: string;
}

export async function runCompetitorScout(input: ScoutInput, deps: IntelligenceDeps = {}): Promise<ScoutResult> {
  const platform = (input.platform ?? "instagram").toLowerCase();
  if (!apifyConfigured()) {
    return { configured: false, note: "Set APIFY_API_TOKEN to let the Competitor Scout pull posts." };
  }
  if (platform !== "instagram") {
    // Only the Instagram actor is wired today; other platforms use the /api/webhooks/intelligence pipe.
    return { configured: true, found: 0, created: [], note: `No scraper wired for ${platform} yet — push via /api/webhooks/intelligence.` };
  }

  const signals = await scrapeInstagram(input.handleOrUrl, input.limit ?? 12);
  const records: IngestRecord[] = signals.posts.map((p) => ({
    itemType: "competitor_post" as const,
    scope: input.scope ?? "wobble",
    clientId: input.clientId,
    targetId: input.targetId,
    platform: "instagram",
    account: signals.handle,
    url: p.url,
    caption: p.caption,
    summary: p.caption ? p.caption.slice(0, 400) : `Post by @${signals.handle}`,
    metrics: { likes: p.likes, comments: p.comments, followers: signals.followers },
    postedAt: p.timestamp,
    createdByAgent: "competitor_scout",
  }));

  if (!records.length) return { configured: true, handle: signals.handle, found: 0, created: [], note: "No posts returned for this account." };

  const result = await ingestIntelligencePayload({ records }, deps);
  return { configured: true, handle: signals.handle, found: records.length, created: result.created, note: "Ingested as pending — review in the Intelligence Inbox." };
}
