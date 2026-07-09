/**
 * Embeddings adapter for WOBBLE OS semantic memory.
 *
 * Turns text into 1536-dim vectors so memory_chunks / intelligence items can be
 * retrieved by MEANING (pgvector cosine search), not just recency. Pluggable and
 * OpenAI-compatible: defaults to OpenRouter using the existing OPENROUTER_API_KEY
 * (model `openai/text-embedding-3-small`, 1536 dims — matches the DB schema).
 *
 * Degrades gracefully: if no key/adapter is configured, embed* returns null and
 * callers fall back to non-semantic behaviour instead of crashing. This keeps the
 * OS safe to run before embeddings are configured.
 */

export const EMBEDDING_DIMENSIONS = 1536;
export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const DEFAULT_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";

export interface Embedder {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

type EnvMap = Record<string, string | undefined>;

export interface EmbedderDeps {
  embedder?: Embedder | null;
  env?: EnvMap;
}

export function createOpenRouterEmbedder(opts: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): Embedder {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const model = opts.model ?? DEFAULT_EMBEDDING_MODEL;
  const url = opts.baseUrl ?? DEFAULT_EMBEDDINGS_URL;

  return {
    model,
    async embed(texts) {
      if (!texts.length) return [];
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, input: texts }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`embeddings request failed: HTTP ${response.status} ${body.slice(0, 200)}`);
      }

      const json = (await response.json()) as {
        data?: Array<{ embedding: number[]; index?: number }>;
      };
      const data = json.data ?? [];
      if (data.length !== texts.length) {
        throw new Error(`embeddings count mismatch: expected ${texts.length}, received ${data.length}`);
      }
      // Preserve request order (OpenAI-compatible responses include `index`).
      return [...data]
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .map((item) => item.embedding);
    },
  };
}

/** True when an embeddings credential is available in the environment. */
export function isEmbeddingsConfigured(env: EnvMap = process.env): boolean {
  return Boolean(env.EMBEDDINGS_API_KEY || env.OPENROUTER_API_KEY);
}

/**
 * Build the default embedder from environment, or null when no key is set.
 * Configurable via EMBEDDINGS_API_KEY / EMBEDDINGS_MODEL / EMBEDDINGS_BASE_URL,
 * falling back to OPENROUTER_API_KEY.
 */
export function getDefaultEmbedder(env: EnvMap = process.env): Embedder | null {
  const apiKey = env.EMBEDDINGS_API_KEY || env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  return createOpenRouterEmbedder({
    apiKey,
    model: env.EMBEDDINGS_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL,
    baseUrl: env.EMBEDDINGS_BASE_URL?.trim() || DEFAULT_EMBEDDINGS_URL,
  });
}

function resolveEmbedder(deps: EmbedderDeps): Embedder | null {
  if (deps.embedder !== undefined) return deps.embedder;
  return getDefaultEmbedder(deps.env);
}

/** Embed many texts. Returns null (no-op) when no embedder is configured. */
export async function embedTexts(texts: string[], deps: EmbedderDeps = {}): Promise<number[][] | null> {
  const embedder = resolveEmbedder(deps);
  if (!embedder) return null;
  if (!texts.length) return [];
  return embedder.embed(texts);
}

/** Embed a single text. Returns null when no embedder is configured. */
export async function embedText(text: string, deps: EmbedderDeps = {}): Promise<number[] | null> {
  const result = await embedTexts([text], deps);
  return result ? result[0] ?? null : null;
}
