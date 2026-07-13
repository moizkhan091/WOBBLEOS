// Media Studio — pure domain (Phase 10, provider-independent core).
//
// Everything here is independent of any real media provider: the generation-request model, validation, the
// budget guard, and the job status lifecycle (queue → generating → succeeded/failed, with retries + cancel).
// The ACTUAL generation runs through a pluggable MediaProviderAdapter that is only "configured" when its
// credentials are present — when none is configured the request is truthfully BLOCKED (never a fake success).
// This is the shape the queue/worker/UI build against; the real provider (e.g. fal.ai) plugs in at the edge.

export const MEDIA_KINDS = ["image", "video", "audio", "model_3d"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_JOB_STATUSES = ["queued", "generating", "succeeded", "failed", "canceled", "blocked"] as const;
export type MediaJobStatus = (typeof MEDIA_JOB_STATUSES)[number];

export interface MediaGenerationRequest {
  id: string;
  kind: MediaKind;
  prompt: string;
  /** Provider slug, e.g. "fal" | "manual". */
  provider: string;
  params: Record<string, unknown>;
  estimatedCostCents: number;
  /** Hard cap — a request whose estimate exceeds this is rejected before any spend. */
  budgetCapCents: number;
  status: MediaJobStatus;
  attempts: number;
  maxAttempts: number;
  /** Signed URLs / secure storage refs of the produced media (empty until succeeded). */
  outputRefs: string[];
  error: string | null;
}

export interface MediaProviderAdapter {
  slug: string;
  /** True only when the provider's credentials are configured. */
  configured(): boolean;
}

export function validateMediaRequest(input: { kind: string; prompt: string; estimatedCostCents: number; budgetCapCents: number }): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!(MEDIA_KINDS as readonly string[]).includes(input.kind)) errors.push(`invalid media kind '${input.kind}'`);
  if (!input.prompt.trim()) errors.push("prompt is required");
  if (input.estimatedCostCents < 0) errors.push("estimatedCostCents must be ≥ 0");
  if (input.budgetCapCents < 0) errors.push("budgetCapCents must be ≥ 0");
  if (input.estimatedCostCents > input.budgetCapCents) errors.push(`estimated cost ${input.estimatedCostCents}¢ exceeds the budget cap ${input.budgetCapCents}¢`);
  return { ok: errors.length === 0, errors };
}

/** Resolve a provider from the registry; returns null when the requested provider is unknown OR unconfigured. */
export function resolveMediaProvider(slug: string, registry: Record<string, MediaProviderAdapter>): MediaProviderAdapter | null {
  const p = registry[slug];
  return p && p.configured() ? p : null;
}

const NEXT: Record<MediaJobStatus, MediaJobStatus[]> = {
  queued: ["generating", "canceled", "blocked"],
  generating: ["succeeded", "failed", "canceled"],
  failed: ["queued"], // retry (guarded by attempts)
  blocked: ["queued"], // once a provider is configured
  succeeded: [],
  canceled: [],
};

export function canTransitionMediaJob(from: MediaJobStatus, to: MediaJobStatus): boolean {
  return (NEXT[from] ?? []).includes(to);
}

export function canRetryMediaJob(job: Pick<MediaGenerationRequest, "status" | "attempts" | "maxAttempts">): boolean {
  return job.status === "failed" && job.attempts < job.maxAttempts;
}

/**
 * Decide the next status when dispatching a request: if no configured provider handles it, the job is BLOCKED
 * (truthful degraded state — the founder sees "provider not configured", never a fabricated success).
 */
export function dispatchDecision(
  request: Pick<MediaGenerationRequest, "provider">,
  registry: Record<string, MediaProviderAdapter>,
): { status: "generating" | "blocked"; reason: string } {
  const provider = resolveMediaProvider(request.provider, registry);
  if (!provider) return { status: "blocked", reason: `media provider '${request.provider}' is not configured — generation blocked (no credentials)` };
  return { status: "generating", reason: `dispatched to ${provider.slug}` };
}

/** fal.ai is configured when EITHER canonical env var is set (resolves the FAL_KEY vs FAL_API_KEY split). */
export function falConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean((env.FAL_KEY ?? env.FAL_API_KEY ?? "").trim());
}
