import { describe, expect, it } from "vitest";
import { estimateCostUsd, priceKey, DEFAULT_PRICING } from "@/lib/domain/cost";

describe("estimateCostUsd", () => {
  it("uses the matching provider:model price", () => {
    // gpt-4o-mini: 0.15 in / 0.6 out per 1M tokens
    const cost = estimateCostUsd({ provider: "openrouter", model: "openai/gpt-4o-mini", inputTokens: 1000, outputTokens: 1000 });
    expect(cost).toBeCloseTo(0.00075, 8);
  });

  it("falls back to the default price for unknown models", () => {
    const cost = estimateCostUsd({ provider: "x", model: "y", inputTokens: 1_000_000, outputTokens: 0 });
    expect(cost).toBe(DEFAULT_PRICING.default.inputPerMillion);
  });

  it("returns 0 when token counts are unknown", () => {
    expect(estimateCostUsd({ provider: "openrouter", model: "openai/gpt-4o" })).toBe(0);
  });

  it("accepts a custom pricing table (prices are config, not hardcoded)", () => {
    const pricing = { default: { inputPerMillion: 10, outputPerMillion: 20 } };
    const cost = estimateCostUsd({ provider: "p", model: "m", inputTokens: 1_000_000, outputTokens: 1_000_000, pricing });
    expect(cost).toBe(30);
  });

  it("builds price keys as provider:model", () => {
    expect(priceKey("openrouter", "openai/gpt-4o")).toBe("openrouter:openai/gpt-4o");
  });
});
