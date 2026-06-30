/**
 * Creative Reference Selection engine (pure, DB-free).
 *
 * Founder rule, enforced here: NEVER blend many design references into one ugly
 * hybrid. For EACH visual asset we pick exactly ONE reference.
 *  - Static image  -> exactly one approved `static` reference, chosen per asset
 *    (static #1 might pick ref 4, static #2 ref 2 - independent, diversified).
 *  - Carousel      -> exactly one approved `carousel_set` reference (a multi-slide
 *    set), matched to the needed slide count. Never a mix of carousel refs.
 *  - Video         -> exactly one approved `video` reference.
 *
 * Selection is by fit score (style-tag overlap + use-case + brand fit + platform
 * match + founder pin), deterministic (stable tie-break), with BATCH DIVERSITY so
 * a batch of statics spreads across different references instead of repeating.
 * `negative` references are never selected; their style tags become "avoid"
 * guidance for the image prompt. Built for Chunk 21 (library) + Chunk 22
 * (reference-conditioned generation) to consume; the chosen reference + rationale
 * are stored on the asset for the learning loop.
 */

export type ReferenceKind = "static" | "carousel_set" | "video";
export type AssetType = "static" | "carousel" | "video";

export interface CreativeReference {
  id: string;
  kind: ReferenceKind;
  approvalStatus: "approved" | "pending" | "rejected";
  styleTags: string[];
  useCases?: string[];
  platform?: string;
  brandFit?: number; // 0-10
  slideCount?: number; // for carousel_set
  pinned?: boolean; // founder-pinned: force selection when eligible
  negative?: boolean; // a style to AVOID, never to copy
  source?: string;
}

export interface AssetRequest {
  assetType: AssetType;
  index: number; // position in the batch (e.g. static #1, #2)
  platform?: string;
  objective?: string;
  desiredStyleTags?: string[];
  slideCount?: number; // for carousel
  pinnedReferenceId?: string; // founder pin for THIS asset
}

export interface ReferenceSelection {
  assetIndex: number;
  assetType: AssetType;
  reference: CreativeReference | null; // exactly one, or null if none eligible
  score: number;
  rationale: string;
  candidatesConsidered: number;
  avoidStyleTags: string[]; // from negative references
}

const KIND_FOR_ASSET: Record<AssetType, ReferenceKind> = {
  static: "static",
  carousel: "carousel_set",
  video: "video",
};

function overlapCount(a: string[] = [], b: string[] = []): number {
  const set = new Set(a.map((s) => s.toLowerCase()));
  return b.reduce((n, t) => (set.has(t.toLowerCase()) ? n + 1 : n), 0);
}

/** Collect style tags from negative references that match the asset, to AVOID. */
export function collectAvoidTags(references: CreativeReference[]): string[] {
  const tags = new Set<string>();
  for (const ref of references) {
    if (ref.negative) ref.styleTags.forEach((t) => tags.add(t));
  }
  return [...tags];
}

/** Score a single eligible reference against an asset request (higher = better fit). */
export function scoreReference(ref: CreativeReference, request: AssetRequest): number {
  if (ref.pinned || request.pinnedReferenceId === ref.id) return 1000; // founder pin wins
  let score = 0;
  score += overlapCount(ref.styleTags, request.desiredStyleTags) * 5;
  if (request.objective && ref.useCases?.some((u) => request.objective!.toLowerCase().includes(u.toLowerCase()))) score += 4;
  if (request.platform && ref.platform && ref.platform === request.platform) score += 3;
  score += (ref.brandFit ?? 5) / 2; // up to +5
  // carousel slide-count fit: prefer the smallest set that still covers the need
  if (request.assetType === "carousel" && request.slideCount && ref.slideCount) {
    if (ref.slideCount >= request.slideCount) score += 3 - Math.min(3, ref.slideCount - request.slideCount) * 0.5;
    else score -= 2; // too few slides
  }
  return Math.round(score * 100) / 100;
}

function eligibleFor(request: AssetRequest, references: CreativeReference[]): CreativeReference[] {
  const wantKind = KIND_FOR_ASSET[request.assetType];
  return references.filter(
    (r) =>
      r.approvalStatus === "approved" &&
      !r.negative &&
      r.kind === wantKind &&
      (!request.platform || !r.platform || r.platform === request.platform) &&
      // carousel must physically cover the slide count if both are known
      !(request.assetType === "carousel" && request.slideCount && r.slideCount !== undefined && r.slideCount < request.slideCount),
  );
}

/**
 * Select exactly ONE reference for a single asset. Pure; returns null if nothing
 * eligible (caller falls back to brand-kit-only generation).
 */
export function selectReferenceForAsset(
  request: AssetRequest,
  references: CreativeReference[],
  opts: { excludeIds?: Set<string> } = {},
): ReferenceSelection {
  const avoidStyleTags = collectAvoidTags(references);
  const candidates = eligibleFor(request, references);

  const ranked = candidates
    .map((ref) => ({ ref, score: scoreReference(ref, request) }))
    .sort((a, b) => b.score - a.score || a.ref.id.localeCompare(b.ref.id)); // stable tie-break

  // Batch diversity: skip references already used in this batch unless it's the
  // only/pinned option, so a batch of statics spreads across different refs.
  const exclude = opts.excludeIds ?? new Set<string>();
  const preferred =
    ranked.find((c) => c.ref.pinned || request.pinnedReferenceId === c.ref.id) ??
    ranked.find((c) => !exclude.has(c.ref.id)) ??
    ranked[0];

  if (!preferred) {
    return {
      assetIndex: request.index,
      assetType: request.assetType,
      reference: null,
      score: 0,
      rationale: `No approved ${KIND_FOR_ASSET[request.assetType]} reference matched; generate from brand kit only.`,
      candidatesConsidered: 0,
      avoidStyleTags,
    };
  }

  const pinned = preferred.ref.pinned || request.pinnedReferenceId === preferred.ref.id;
  return {
    assetIndex: request.index,
    assetType: request.assetType,
    reference: preferred.ref,
    score: preferred.score,
    rationale: pinned
      ? `Founder-pinned reference ${preferred.ref.id}.`
      : `Chose ${preferred.ref.id} (score ${preferred.score}) for ${request.assetType} #${request.index} on style/use-case/brand fit; one reference only, never blended.`,
    candidatesConsidered: candidates.length,
    avoidStyleTags,
  };
}

/**
 * Select one reference PER asset for a whole batch, diversifying across the
 * batch so different statics get different references where sensible. Guarantees
 * each asset gets exactly one reference (or null) - never a hybrid of many.
 */
export function selectReferencesForBatch(
  requests: AssetRequest[],
  references: CreativeReference[],
): ReferenceSelection[] {
  const used = new Set<string>();
  const results: ReferenceSelection[] = [];
  for (const request of requests) {
    const selection = selectReferenceForAsset(request, references, { excludeIds: used });
    if (selection.reference) used.add(selection.reference.id);
    results.push(selection);
  }
  return results;
}
