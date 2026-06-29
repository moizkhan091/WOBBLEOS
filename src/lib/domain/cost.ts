/**
 * Chunk 05: Cost estimation (pure, DB-free).
 *
 * Prices are DATA, not logic. `estimateCostUsd` takes a pricing table; the
 * exported DEFAULT_PRICING is a seed/config default that can later be moved
 * into Settings/DB and overridden per call. No price is hardcoded inside the
 * calculation itself, so updating prices never requires a code change to this
 * function.
 *
 * Pricing is expressed as USD per 1,000,000 tokens (the common provider unit).
 */

export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

/** Keyed by `${provider}:${model}`, plus a "default" fallback. */
export type PricingTable = Record<string, ModelPrice>;

export function priceKey(provider: string, model: string): string {
  return `${provider}:${model}`;
}

/**
 * Default pricing seed. These are placeholder rates and SHOULD be overridden
 * from Settings/DB once the Connections/Settings chunks store live prices.
 * Values are USD per 1,000,000 tokens.
 */
export const DEFAULT_PRICING: PricingTable = {
  "openrouter:anthropic/claude-3.5-sonnet": { inputPerMillion: 3, outputPerMillion: 15 },
  "openrouter:anthropic/claude-3.5-haiku": { inputPerMillion: 0.8, outputPerMillion: 4 },
  "openrouter:openai/gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
  "openrouter:openai/gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  // Fallback when a provider:model is not in the table.
  default: { inputPerMillion: 1, outputPerMillion: 3 },
};

export interface EstimateCostInput {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  pricing?: PricingTable;
}

/**
 * Estimate USD cost for a model call. Returns 0 when token counts are unknown.
 * Rounded to 6 decimal places to avoid floating-point noise in stored values.
 */
export function estimateCostUsd(input: EstimateCostInput): number {
  const pricing = input.pricing ?? DEFAULT_PRICING;
  const price = pricing[priceKey(input.provider, input.model)] ?? pricing.default ?? {
    inputPerMillion: 0,
    outputPerMillion: 0,
  };

  const inTokens = Math.max(0, input.inputTokens ?? 0);
  const outTokens = Math.max(0, input.outputTokens ?? 0);

  const cost = (inTokens / 1_000_000) * price.inputPerMillion + (outTokens / 1_000_000) * price.outputPerMillion;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
