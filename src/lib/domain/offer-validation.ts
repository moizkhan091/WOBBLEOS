import { z } from "zod";
import { newId } from "@/lib/ids";

/**
 * Offer Validation Lab — the pure, deterministic core. Eleven dimension "agents" each score an offer 0–100
 * on one axis with a rationale grounded in evidence; a weighted roll-up decides a go / pivot / kill verdict.
 * All scoring + verdict logic here is provider-free and unit-tested; the LLM only fills in per-dimension
 * scores + rationales, which this module validates and aggregates.
 */

export type OfferValidationVerdict = "go" | "pivot" | "kill";

export interface OfferValidationDimensionDef {
  slug: string;
  name: string;
  /** The agent (registered in the CANONICAL agents registry) that owns this dimension. */
  agentSlug: string;
  /** Relative weight in the overall roll-up (need not sum to 1 — normalized at aggregation). */
  weight: number;
  /** The question the dimension agent answers about the offer. */
  question: string;
}

/** The 11 dimension agents of the Offer Validation Lab. */
export const OFFER_VALIDATION_DIMENSIONS: OfferValidationDimensionDef[] = [
  { slug: "market_demand", name: "Market Demand", agentSlug: "offer_market_demand_agent", weight: 1.3, question: "Is there real, current demand for this outcome among the target buyers? Cite demand signals." },
  { slug: "pain_acuity", name: "Pain Acuity", agentSlug: "offer_pain_acuity_agent", weight: 1.2, question: "How acute and expensive is the pain this offer removes? Is it a bleeding-neck problem or a nice-to-have?" },
  { slug: "icp_fit", name: "ICP Fit", agentSlug: "offer_icp_fit_agent", weight: 1.2, question: "How well does this offer fit WOBBLE's ICP (Pakistan-first owner-led SMBs with budget and operational pain)?" },
  { slug: "differentiation", name: "Differentiation", agentSlug: "offer_differentiation_agent", weight: 1.1, question: "How differentiated is this vs agencies and generic automation? Is the 'capability inside the business' angle clear?" },
  { slug: "pricing_viability", name: "Pricing Viability", agentSlug: "offer_pricing_agent", weight: 1.0, question: "Is the price model viable — enough value to justify it, and affordable for the ICP?" },
  { slug: "proof_strength", name: "Proof Strength", agentSlug: "offer_proof_agent", weight: 1.0, question: "How strong is the available proof (mechanism credibility, demos, before/after) for the promise?" },
  { slug: "urgency", name: "Urgency", agentSlug: "offer_urgency_agent", weight: 0.9, question: "Why now? Is there a compelling reason the buyer must act soon rather than later?" },
  { slug: "competition", name: "Competitive Pressure", agentSlug: "offer_competition_agent", weight: 0.9, question: "How crowded is the competitive landscape and can WOBBLE win against it?" },
  { slug: "delivery_feasibility", name: "Delivery Feasibility", agentSlug: "offer_delivery_agent", weight: 1.1, question: "Can WOBBLE actually deliver this reliably with AI employees + automations, within its safety boundaries?" },
  { slug: "message_clarity", name: "Message Clarity", agentSlug: "offer_message_agent", weight: 0.8, question: "Is the promise clear, specific, and believable in one line — or vague/overpromised?" },
  { slug: "risk_objections", name: "Risk & Objections", agentSlug: "offer_risk_agent", weight: 1.0, question: "What are the biggest objections/risks (incl. the payment/AI-safety boundary) and how answerable are they? (higher score = lower risk)" },
];

export const OFFER_VALIDATION_DIMENSION_SLUGS = OFFER_VALIDATION_DIMENSIONS.map((d) => d.slug);

export const GO_THRESHOLD = 70;
export const PIVOT_THRESHOLD = 45;

export interface DimensionScore {
  slug: string;
  score: number; // 0..100
  rationale: string;
  evidenceRefs?: string[];
}

/** Weighted average of dimension scores (0..100), normalized by the weights of the dimensions actually scored. */
export function computeOverallScore(scores: DimensionScore[]): number {
  const byWeight = OFFER_VALIDATION_DIMENSIONS.reduce<Record<string, number>>((acc, d) => ((acc[d.slug] = d.weight), acc), {});
  let weightedSum = 0;
  let weightTotal = 0;
  for (const s of scores) {
    const w = byWeight[s.slug];
    if (w === undefined) continue; // ignore unknown dimensions
    const clamped = Math.max(0, Math.min(100, s.score));
    weightedSum += clamped * w;
    weightTotal += w;
  }
  if (weightTotal === 0) return 0;
  return Math.round(weightedSum / weightTotal);
}

export function decideVerdict(overallScore: number): OfferValidationVerdict {
  if (overallScore >= GO_THRESHOLD) return "go";
  if (overallScore >= PIVOT_THRESHOLD) return "pivot";
  return "kill";
}

/** Parse and validate a single dimension agent's JSON output ({score, rationale, evidenceRefs?}). */
const dimensionResultSchema = z.object({
  score: z.coerce.number().min(0).max(100),
  rationale: z.string().trim().min(1),
  evidenceRefs: z.array(z.string().trim().min(1)).optional(),
});
export function parseDimensionResult(slug: string, raw: string): DimensionScore {
  let json: unknown;
  try {
    // tolerate models that wrap JSON in prose/fences
    const match = raw.match(/\{[\s\S]*\}/);
    json = JSON.parse(match ? match[0] : raw);
  } catch {
    throw new Error(`dimension '${slug}' returned unparseable output`);
  }
  const parsed = dimensionResultSchema.parse(json);
  return { slug, score: Math.round(parsed.score), rationale: parsed.rationale, evidenceRefs: parsed.evidenceRefs ?? [] };
}

// ---------------------------------------------------------------- row builders

export interface OfferValidationRunRow {
  id: string;
  offerId: string;
  version: number;
  verdict: OfferValidationVerdict;
  overallScore: number;
  summary: string | null;
  evidenceCount: number;
  model: string | null;
  createdBy: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface OfferValidationDimensionRow {
  id: string;
  runId: string;
  dimension: string;
  agentSlug: string;
  score: number;
  weight: number;
  rationale: string;
  evidenceRefs: string[];
  createdAt: Date;
}

export function buildValidationRunRow(
  input: { offerId: string; version: number; verdict: OfferValidationVerdict; overallScore: number; summary?: string; evidenceCount: number; model?: string; createdBy?: string; metadata?: Record<string, unknown> },
  opts: { id?: string; now?: Date } = {},
): OfferValidationRunRow {
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("offerval"),
    offerId: input.offerId,
    version: input.version,
    verdict: input.verdict,
    overallScore: input.overallScore,
    summary: input.summary ?? null,
    evidenceCount: input.evidenceCount,
    model: input.model ?? null,
    createdBy: input.createdBy ?? null,
    metadata: input.metadata ?? {},
    createdAt: now,
  };
}

export function buildValidationDimensionRow(
  input: { runId: string; dimension: string; agentSlug: string; score: number; weight: number; rationale: string; evidenceRefs?: string[] },
  opts: { id?: string; now?: Date } = {},
): OfferValidationDimensionRow {
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("offervaldim"),
    runId: input.runId,
    dimension: input.dimension,
    agentSlug: input.agentSlug,
    score: input.score,
    weight: input.weight,
    rationale: input.rationale,
    evidenceRefs: input.evidenceRefs ?? [],
    createdAt: now,
  };
}
