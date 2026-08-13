import { describe, expect, it } from "vitest";
import { chatModelAllowed, chatModelOptions } from "@/lib/domain/chat-models";
import type { ModelCatalogEntry } from "@/lib/domain/model-registry";

const entry = (over: Partial<ModelCatalogEntry> & { id: string }): ModelCatalogEntry => ({
  label: over.id,
  provider: "openrouter",
  modalities: ["text"],
  costTier: "cheap",
  status: "active",
  goodFor: [],
  ...over,
});

const CATALOG: ModelCatalogEntry[] = [
  entry({ id: "openai/gpt-4o", label: "GPT-4o", modalities: ["text", "vision"], costTier: "premium", usdPerMillionOutput: 10 }),
  entry({ id: "google/gemini-2.5-flash-lite", label: "Gemini Flash Lite", usdPerMillionOutput: 0.4 }),
  entry({ id: "anthropic/claude-sonnet-4.5", label: "Sonnet 4.5", modalities: ["text", "vision"], costTier: "premium", usdPerMillionOutput: 15 }),
  entry({ id: "openai/text-embedding-3-small", label: "Embeddings", modalities: ["embedding"] }),
  entry({ id: "retired/thing", label: "Retired", status: "deprecated", usdPerMillionOutput: 1 }),
];

describe("the models the Ask box offers", () => {
  const options = chatModelOptions(CATALOG, "google/gemini-2.5-flash-lite");

  it("names what Model Control actually chose, rather than saying only Auto", () => {
    // The whole point: a founder can see what Auto costs before sending anything.
    expect(options[0].id).toBe("");
    expect(options[0].description).toContain("Gemini Flash Lite");
    expect(options[0].description).toContain("$0.4");
  });

  it("puts the cheapest model first, so the dear one is a deliberate reach", () => {
    expect(options[1].label).toBe("Gemini Flash Lite");
    expect(options[options.length - 1].label).toBe("Sonnet 4.5");
  });

  it("carries the price on every option", () => {
    expect(options.find((o) => o.label === "GPT-4o")?.description).toContain("$10 per million out");
  });

  it("leaves out models that cannot hold a conversation", () => {
    expect(options.map((o) => o.id)).not.toContain("openai/text-embedding-3-small");
  });

  it("leaves out anything not active", () => {
    expect(options.map((o) => o.id)).not.toContain("retired/thing");
  });

  it("says which options can read an attached image or PDF", () => {
    expect(options.find((o) => o.id === "openai/gpt-4o")?.vision).toBe(true);
    expect(options.find((o) => o.id === "google/gemini-2.5-flash-lite")?.vision).toBe(false);
  });

  it("still offers Auto when Model Control has chosen nothing", () => {
    const none = chatModelOptions(CATALOG, null);
    expect(none[0].id).toBe("");
    expect(none[0].description).toContain("Model Control");
  });

  it("names the role's model even when it is not in the catalog, rather than pretending it is unset", () => {
    const odd = chatModelOptions(CATALOG, "someone/experimental");
    expect(odd[0].description).toContain("someone/experimental");
  });

  it("returns only Auto when the catalog is empty, instead of throwing", () => {
    expect(chatModelOptions([], null)).toHaveLength(1);
  });
});

describe("which model ids the chat will actually run", () => {
  it("allows Auto", () => {
    expect(chatModelAllowed(CATALOG, undefined)).toBe(true);
    expect(chatModelAllowed(CATALOG, "")).toBe(true);
  });

  it("allows an active text model from the catalog", () => {
    expect(chatModelAllowed(CATALOG, "openai/gpt-4o")).toBe(true);
  });

  it("refuses a model nobody put in the catalog", () => {
    // Otherwise a session that can post JSON picks the dearest model on OpenRouter and bills the house.
    expect(chatModelAllowed(CATALOG, "openai/o1-pro")).toBe(false);
  });

  it("refuses a deprecated model even though it is listed", () => {
    expect(chatModelAllowed(CATALOG, "retired/thing")).toBe(false);
  });

  it("refuses an embedding model, which cannot answer a chat", () => {
    expect(chatModelAllowed(CATALOG, "openai/text-embedding-3-small")).toBe(false);
  });
});
