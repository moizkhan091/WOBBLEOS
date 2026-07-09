import { z } from "zod";

/**
 * Model Registry — the swappable "model brain" for every agent in WOBBLE OS.
 *
 * Agents never hardcode a model. They reference a ROLE (e.g. "content_strategy"),
 * and the role points at a model id in a central catalog. Swapping a model = change
 * one role mapping. This module holds the pure, testable rules that make swaps SAFE:
 * a catalog of known models with capabilities, and validation so a role can never be
 * pointed at a model that cannot do its job (e.g. a text-only model on an image role).
 */

export const MODEL_MODALITIES = ["text", "vision", "image", "video", "embedding"] as const;
export type ModelModality = (typeof MODEL_MODALITIES)[number];

export const MODEL_COST_TIERS = ["cheap", "mid", "strong", "premium"] as const;
export type ModelCostTier = (typeof MODEL_COST_TIERS)[number];

export const MODEL_STATUSES = ["active", "experimental", "deprecated"] as const;
export type ModelStatus = (typeof MODEL_STATUSES)[number];

export const modelCatalogEntrySchema = z.object({
  id: z.string().trim().min(1), // provider model id, e.g. "openai/gpt-4o-mini"
  label: z.string().trim().min(1),
  provider: z.string().trim().min(1), // provider connection slug, e.g. "openrouter"
  modalities: z.array(z.enum(MODEL_MODALITIES)).min(1),
  costTier: z.enum(MODEL_COST_TIERS),
  status: z.enum(MODEL_STATUSES).default("active"),
  contextWindow: z.number().int().positive().optional(),
  goodFor: z.array(z.string().trim().min(1)).default([]),
  notes: z.string().trim().optional(),
});
export type ModelCatalogEntry = z.infer<typeof modelCatalogEntrySchema>;

export const modelCatalogSchema = z.array(modelCatalogEntrySchema);
export type ModelCatalog = z.infer<typeof modelCatalogSchema>;

/**
 * Required modality per known role. A role listed here can ONLY be pointed at a model
 * whose modalities include the requirement. Roles not listed accept any active model
 * (with a soft note), so new roles are never blocked — just unguarded until added here.
 */
export const ROLE_MODALITY: Record<string, ModelModality> = {
  ask_wobble: "text",
  content_strategy: "text",
  memory_router: "text",
  knowledge_compiler: "text",
  system_auditor: "text",
  model_scout: "text",
  embeddings: "embedding",
  vision_analysis: "vision",
  image_generation: "image",
  video_generation: "video",
};

/** Starter catalog — accurate, modest, and fully editable at runtime via Settings. */
export const DEFAULT_MODEL_CATALOG: ModelCatalog = [
  {
    id: "openai/gpt-4o-mini",
    label: "GPT-4o mini",
    provider: "openrouter",
    modalities: ["text", "vision"],
    costTier: "cheap",
    status: "active",
    contextWindow: 128000,
    goodFor: ["classification", "routing", "extraction", "cheap-drafts", "testing"],
    notes: "Cheap, fast, multimodal. Great default for plumbing and high-volume tasks.",
  },
  {
    id: "openai/gpt-4o",
    label: "GPT-4o",
    provider: "openrouter",
    modalities: ["text", "vision"],
    costTier: "strong",
    status: "active",
    contextWindow: 128000,
    goodFor: ["reasoning", "vision-analysis", "strategy"],
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    label: "Claude Sonnet 4.5",
    provider: "openrouter",
    modalities: ["text", "vision"],
    costTier: "strong",
    status: "active",
    contextWindow: 200000,
    goodFor: ["copywriting", "creative", "strategy", "long-context", "prompt-engineering"],
    notes: "Premium writing quality. Preferred for founder-facing content in production.",
  },
  {
    id: "openai/text-embedding-3-small",
    label: "Text Embedding 3 Small",
    provider: "openrouter",
    modalities: ["embedding"],
    costTier: "cheap",
    status: "active",
    goodFor: ["semantic-memory", "retrieval"],
    notes: "1536 dims — matches the memory_chunks / intelligence embedding columns.",
  },
  {
    id: "openai/text-embedding-3-large",
    label: "Text Embedding 3 Large",
    provider: "openrouter",
    modalities: ["embedding"],
    costTier: "mid",
    status: "experimental",
    goodFor: ["semantic-memory", "retrieval"],
    notes: "3072 dims — higher recall but would require a schema/dimension change before use.",
  },
  {
    id: "fal-ai/seedance",
    label: "Seedance (video)",
    provider: "fal_seedance",
    modalities: ["video"],
    costTier: "premium",
    status: "experimental",
    goodFor: ["short-form-video", "reels"],
  },
];

export interface ModelSwapValidation {
  ok: boolean;
  reason: string;
  entry?: ModelCatalogEntry;
  requiredModality?: ModelModality;
}

/**
 * Validate that a role may be pointed at a model. Guards against the silent breakage
 * of putting an incompatible or deprecated model on a role.
 */
export function validateModelSwap(input: {
  role: string;
  modelId: string;
  catalog: ModelCatalog;
  roleModality?: Record<string, ModelModality>;
}): ModelSwapValidation {
  const catalog = modelCatalogSchema.parse(input.catalog);
  const entry = catalog.find((item) => item.id === input.modelId);
  if (!entry) {
    return { ok: false, reason: `Model '${input.modelId}' is not in the catalog. Add it to the catalog before assigning it.` };
  }
  if (entry.status === "deprecated") {
    return { ok: false, reason: `Model '${input.modelId}' is deprecated and cannot be assigned.`, entry };
  }
  const required = (input.roleModality ?? ROLE_MODALITY)[input.role];
  if (required && !entry.modalities.includes(required)) {
    return {
      ok: false,
      reason: `Role '${input.role}' needs a ${required}-capable model, but '${input.modelId}' only supports ${entry.modalities.join(", ")}.`,
      entry,
      requiredModality: required,
    };
  }
  return {
    ok: true,
    reason: `'${input.modelId}' is compatible with role '${input.role}'.`,
    entry,
    requiredModality: required,
  };
}

export const modelUpgradeProposalSchema = z.object({
  role: z.string().trim().min(1),
  fromModelId: z.string().trim().min(1).nullable().optional(),
  toModelId: z.string().trim().min(1),
  rationale: z.string().trim().min(1),
  confidence: z.number().min(0).max(1).default(0.6),
  proposedBy: z.string().trim().min(1),
  evidence: z.array(z.string().trim().min(1)).default([]),
});
export type ModelUpgradeProposalInput = z.input<typeof modelUpgradeProposalSchema>;
export type ModelUpgradeProposal = z.infer<typeof modelUpgradeProposalSchema>;
