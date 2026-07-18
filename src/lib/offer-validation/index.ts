import { and, desc, eq } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { offers as offersTable, offerValidationRuns, offerValidationDimensions } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import type { OfferRow } from "@/lib/domain/offer";
import { runTextProvider, type ProviderChatMessage } from "@/lib/providers";
import { tavilySearch, type TavilySearchOutput } from "@/lib/tavily";
import {
  OFFER_VALIDATION_DIMENSIONS,
  computeOverallScore,
  decideVerdict,
  parseDimensionResult,
  buildValidationRunRow,
  buildValidationDimensionRow,
  type DimensionScore,
  type OfferValidationRunRow,
  type OfferValidationDimensionRow,
} from "@/lib/domain/offer-validation";

/**
 * Offer Validation Lab service — validates an offer across the 11 dimension agents, each grounded in the
 * offer + (optionally) real web evidence, then rolls the scores up into a go/pivot/kill verdict and persists
 * a versioned run. Provider + evidence + store + clock are injectable so the whole orchestration is
 * unit-tested WITHOUT a live paid call; the real Tavily/LLM calls fire only in production/proof.
 */

export const OFFER_VALIDATION_MODULE = "offer_validation";

export interface OfferValidationStore {
  getOffer(id: string): Promise<OfferRow | null>;
  countRuns(offerId: string): Promise<number>;
  insertRun(row: OfferValidationRunRow): Promise<void>;
  insertDimensions(rows: OfferValidationDimensionRow[]): Promise<void>;
  listRuns(offerId: string, limit: number): Promise<OfferValidationRunRow[]>;
  getDimensions(runId: string): Promise<OfferValidationDimensionRow[]>;
}

export type DimensionProvider = (input: { role: string; module: string; model?: string; messages: ProviderChatMessage[]; maxTokens?: number; temperature?: number }) => Promise<{ text: string }>;
export type EvidenceSearch = (input: { query: string; item: string; actor?: string }) => Promise<TavilySearchOutput>;

export interface OfferValidationDeps {
  store?: OfferValidationStore;
  runProvider?: DimensionProvider;
  searchEvidence?: EvidenceSearch | null; // null => skip evidence gathering
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
  actor?: string;
  model?: string;
}

export interface OfferValidationResult {
  run: OfferValidationRunRow;
  dimensions: OfferValidationDimensionRow[];
}

async function audit(deps: OfferValidationDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

function offerContext(offer: OfferRow): string {
  return [
    `Offer: ${offer.name}`,
    offer.promise ? `Promise: ${offer.promise}` : null,
    offer.hypothesis ? `Hypothesis: ${offer.hypothesis}` : null,
    offer.audience ? `Audience: ${offer.audience}` : null,
    offer.priceModel ? `Price model: ${offer.priceModel}` : null,
    offer.deliverables.length ? `Deliverables: ${offer.deliverables.join("; ")}` : null,
  ].filter(Boolean).join("\n");
}

async function scoreDimension(
  offer: OfferRow,
  evidenceBlock: string,
  dim: (typeof OFFER_VALIDATION_DIMENSIONS)[number],
  deps: OfferValidationDeps,
): Promise<DimensionScore> {
  const runProvider = deps.runProvider ?? (async (i) => runTextProvider({ ...i, usageContext: { agentSlug: dim.agentSlug, module: OFFER_VALIDATION_MODULE } }));
  const messages: ProviderChatMessage[] = [
    { role: "system", content: "You are a rigorous WOBBLE offer-validation analyst. Score ONE dimension of an offer 0-100 (100 = excellent) and justify it in 1-2 sentences grounded in the offer and any evidence. Be skeptical; do not inflate. Respond with STRICT JSON only: {\"score\": <0-100>, \"rationale\": \"...\", \"evidenceRefs\": [\"url-or-note\"]}." },
    { role: "user", content: `${offerContext(offer)}\n\n${evidenceBlock}\n\nDimension: ${dim.name}\nQuestion: ${dim.question}\n\nReturn STRICT JSON only.` },
  ];
  const r = await runProvider({ role: "default", module: OFFER_VALIDATION_MODULE, model: deps.model ?? "openai/gpt-4o-mini", messages, maxTokens: 220, temperature: 0.2 });
  return parseDimensionResult(dim.slug, r.text);
}

export async function runOfferValidation(offerId: string, deps: OfferValidationDeps = {}): Promise<OfferValidationResult> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const actor = deps.actor ?? "offer_validation_lab";

  const offer = await store.getOffer(offerId);
  if (!offer) throw new Error(`offer '${offerId}' not found`);

  // 1) Optional real web evidence (ONE governed search, shared by all dimensions). Graceful: on failure or
  //    no adapter, validation still runs on the offer text alone (evidenceCount 0).
  let evidenceBlock = "Evidence: (none gathered)";
  let evidenceCount = 0;
  const searchEvidence = deps.searchEvidence === undefined
    ? (async (i: { query: string; item: string; actor?: string }) => tavilySearch({ query: i.query, item: i.item, actor: i.actor, searchDepth: "basic", maxResults: 5 }))
    : deps.searchEvidence;
  if (searchEvidence) {
    try {
      const q = `${offer.promise ?? offer.name} — demand, competitors, and objections for ${offer.audience ?? "small businesses"}`;
      const ev = await searchEvidence({ query: q, item: "offer-validation", actor });
      evidenceCount = ev.results.length;
      if (evidenceCount > 0) {
        evidenceBlock = "Evidence (web):\n" + ev.results.slice(0, 5).map((r, i) => `[${i + 1}] ${r.title} — ${r.url}\n${r.content.slice(0, 300)}`).join("\n");
      }
    } catch (e) {
      evidenceBlock = `Evidence: (gathering failed: ${e instanceof Error ? e.message : String(e)})`;
    }
  }

  // 2) Score all 11 dimensions (sequential — respects the max-1 external concurrency posture).
  const scores: DimensionScore[] = [];
  for (const dim of OFFER_VALIDATION_DIMENSIONS) {
    scores.push(await scoreDimension(offer, evidenceBlock, dim, deps));
  }

  // 3) Roll up → verdict, versioned per offer.
  const overallScore = computeOverallScore(scores);
  const verdict = decideVerdict(overallScore);
  const version = (await store.countRuns(offerId)) + 1;
  const weakest = [...scores].sort((a, b) => a.score - b.score)[0];
  const strongest = [...scores].sort((a, b) => b.score - a.score)[0];
  const summary = `Verdict ${verdict.toUpperCase()} at ${overallScore}/100. Strongest: ${strongest?.slug} (${strongest?.score}). Weakest: ${weakest?.slug} (${weakest?.score}).`;

  const run = buildValidationRunRow({ offerId, version, verdict, overallScore, summary, evidenceCount, model: deps.model ?? "openai/gpt-4o-mini", createdBy: actor }, { now });
  const weightBySlug = OFFER_VALIDATION_DIMENSIONS.reduce<Record<string, number>>((acc, d) => ((acc[d.slug] = d.weight), acc), {});
  const agentBySlug = OFFER_VALIDATION_DIMENSIONS.reduce<Record<string, string>>((acc, d) => ((acc[d.slug] = d.agentSlug), acc), {});
  const dimensionRows = scores.map((s) => buildValidationDimensionRow({ runId: run.id, dimension: s.slug, agentSlug: agentBySlug[s.slug], score: s.score, weight: weightBySlug[s.slug], rationale: s.rationale, evidenceRefs: s.evidenceRefs }, { now }));

  await store.insertRun(run);
  await store.insertDimensions(dimensionRows);
  await audit(deps, { eventType: "offer_validation.completed", module: OFFER_VALIDATION_MODULE, entityType: "offer", entityId: offerId, actor, metadata: { runId: run.id, version, verdict, overallScore, evidenceCount } });

  return { run, dimensions: dimensionRows };
}

export async function listOfferValidations(offerId: string, limit = 20, deps: OfferValidationDeps = {}): Promise<OfferValidationRunRow[]> {
  return (deps.store ?? defaultStore()).listRuns(offerId, Math.min(Math.max(limit, 1), 100));
}

export async function getOfferValidationDetail(runId: string, deps: OfferValidationDeps = {}): Promise<OfferValidationDimensionRow[]> {
  return (deps.store ?? defaultStore()).getDimensions(runId);
}

export function defaultStore(db: Db = getDb()): OfferValidationStore {
  return {
    async getOffer(id) { const r = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1); return (r[0] as OfferRow) ?? null; },
    async countRuns(offerId) { const r = await db.select().from(offerValidationRuns).where(eq(offerValidationRuns.offerId, offerId)); return r.length; },
    async insertRun(row) { await db.insert(offerValidationRuns).values(row as unknown as typeof offerValidationRuns.$inferInsert); },
    async insertDimensions(rows) {
      if (!rows.length) return;
      await db.insert(offerValidationDimensions).values(rows.map((r) => ({ ...r, weight: String(r.weight) })) as unknown as (typeof offerValidationDimensions.$inferInsert)[]);
    },
    async listRuns(offerId, limit) { const r = await db.select().from(offerValidationRuns).where(eq(offerValidationRuns.offerId, offerId)).orderBy(desc(offerValidationRuns.version)).limit(limit); return r as unknown as OfferValidationRunRow[]; },
    async getDimensions(runId) { const r = await db.select().from(offerValidationDimensions).where(eq(offerValidationDimensions.runId, runId)); return r.map((d) => ({ ...d, weight: Number(d.weight) })) as unknown as OfferValidationDimensionRow[]; },
  };
}
