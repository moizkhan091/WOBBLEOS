import { z } from "zod";
import { recordIntelligenceItem, type IntelligenceDeps } from "@/lib/intelligence";
import { INTELLIGENCE_ITEM_TYPES, type IntelligenceItemInput } from "@/lib/domain/intelligence";

/**
 * Ingestion normalizer — the ONE place external competitor/social/market data (from Apify,
 * n8n, or manual paste) becomes an `intelligence_item` (pending approval). Both the signed
 * webhook and the Apify scout converge here so there's a single, testable mapping.
 *
 * The "reel problem": AI can't watch video, so we ingest text proxies — caption + transcript
 * + engagement + extracted {hook, format, cta, offerAngle}. All land pending founder approval.
 */

export const ingestRecordSchema = z.object({
  itemType: z.enum(INTELLIGENCE_ITEM_TYPES).default("competitor_post"),
  scope: z.enum(["wobble", "client", "global"]).default("wobble"),
  clientId: z.string().trim().min(1).optional(),
  targetId: z.string().trim().min(1).optional(),
  platform: z.string().trim().min(1).optional(),
  account: z.string().trim().min(1).optional(),      // -> actorName
  url: z.string().trim().min(1).optional(),           // -> sourceUrl
  title: z.string().trim().min(1).optional(),
  caption: z.string().trim().optional(),              // -> summary (fallback)
  summary: z.string().trim().optional(),
  transcript: z.string().trim().optional(),           // -> rawText
  hook: z.string().trim().optional(),
  format: z.string().trim().optional(),
  cta: z.string().trim().optional(),
  offerAngle: z.string().trim().optional(),
  category: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  metrics: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  postedAt: z.string().trim().optional(),             // -> observedAt
  confidence: z.coerce.number().min(0).max(1).optional(),
  createdByAgent: z.string().trim().min(1).optional(),
});
export type IngestRecord = z.input<typeof ingestRecordSchema>;

export const ingestPayloadSchema = z.union([
  // batch shape first — otherwise the all-optional single-record schema swallows { records }
  z.object({ records: z.array(ingestRecordSchema).min(1).max(200) }),
  ingestRecordSchema,
]);

/** Pure: normalize one ingest record into the intelligence-item input shape. */
export function mapIngestRecordToItemInput(raw: IngestRecord): IntelligenceItemInput {
  const r = ingestRecordSchema.parse(raw);
  const extracted: Record<string, unknown> = {};
  if (r.hook) extracted.hook = r.hook;
  if (r.format) extracted.format = r.format;
  if (r.cta) extracted.cta = r.cta;
  if (r.offerAngle) extracted.offerAngle = r.offerAngle;
  if (r.category) extracted.category = r.category;
  if (r.notes) extracted.notes = r.notes;

  const title = r.title ?? `${r.account ?? "competitor"} on ${r.platform ?? "social"}`.slice(0, 180);
  const summary = r.summary ?? r.caption ?? r.transcript?.slice(0, 400) ?? title;

  return {
    itemType: r.itemType,
    scope: r.scope,
    clientId: r.clientId,
    targetId: r.targetId,
    platform: r.platform,
    actorName: r.account,
    sourceUrl: r.url,
    title,
    summary,
    rawText: r.transcript,
    approvalStatus: "pending",
    confidence: r.confidence ?? 0.6,
    observedAt: r.postedAt,
    tags: r.tags ?? [],
    metrics: r.metrics ?? {},
    extracted,
    createdByAgent: r.createdByAgent ?? "ingest",
  };
}

export interface IngestResult { created: string[]; count: number }

/** Ingest one or many records → intelligence_items (pending). Best-effort per record. */
export async function ingestIntelligencePayload(payload: unknown, deps: IntelligenceDeps = {}): Promise<IngestResult> {
  const parsed = ingestPayloadSchema.parse(payload);
  const records: IngestRecord[] = "records" in parsed ? parsed.records : [parsed];
  const created: string[] = [];
  for (const rec of records) {
    const { item } = await recordIntelligenceItem(mapIngestRecordToItemInput(rec), deps);
    created.push(item.id);
  }
  return { created, count: created.length };
}
