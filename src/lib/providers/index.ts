import { eq } from "drizzle-orm";
import { providerConnections, settings } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { recordModelCall, type ModelCallResult, type ModelRunDeps, type ModelRunRow } from "@/lib/model-runs";
import {
  assertProviderAllowedForModule,
  modelRoleMapSchema,
  normalizeProviderError,
  resolveModelRole,
  type ModelRoleMap,
  type ProviderConnectionConfig,
} from "@/lib/domain/providers";

export interface ProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** OpenAI-compatible tool spec offered to the model. */
export interface ProviderToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** A tool call the model asked us to run (arguments already JSON-parsed). */
export interface ProviderToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

/** Multimodal content parts (OpenAI/OpenRouter compatible) — lets any call carry images/PDFs/text. */
export type ProviderContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

/** Rich chat message supporting tool-calling roundtrips (assistant tool_calls + tool results). */
export interface ProviderChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ProviderContentPart[] | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}

export interface TextProviderInput {
  model: string;
  messages: ProviderChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: ProviderToolSpec[];
  toolChoice?: "auto" | "none" | "required";
  /** OpenRouter plugins (e.g. file-parser for PDFs). Passed through verbatim. */
  plugins?: Array<Record<string, unknown>>;
}

export interface TextProviderOutput extends ModelCallResult {
  text: string;
  toolCalls?: ProviderToolCall[];
}

export interface TextProviderAdapter {
  slug: string;
  providerType: "text";
  generateText(input: TextProviderInput): Promise<TextProviderOutput>;
}

export interface SearchProviderAdapter {
  slug: string;
  providerType: "search";
  search(input: { query: string; maxResults?: number }): Promise<{ results: Array<Record<string, unknown>> }>;
}

export interface MediaProviderAdapter {
  slug: string;
  providerType: "media" | "video";
  createJob(input: Record<string, unknown>): Promise<{ providerRunId?: string; output?: Record<string, unknown> }>;
}

export type TextAdapterRegistry = Record<string, TextProviderAdapter>;

export interface ProviderRegistryStore {
  getModelRoleMap(): Promise<ModelRoleMap>;
  getProviderConnection(slug: string): Promise<ProviderConnectionConfig | null>;
  getCredential(credentialKeyName: string): Promise<string | null>;
  listProviderConnections(): Promise<ProviderConnectionConfig[]>;
}

export interface RunTextProviderInput {
  role: string;
  module: string;
  messages: ProviderChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: ProviderToolSpec[];
  toolChoice?: "auto" | "none" | "required";
  plugins?: Array<Record<string, unknown>>;
  /** Override the role's model for this one call (e.g. a chat model picker). Must use the role's provider. */
  model?: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
}

export interface RunTextProviderResult extends TextProviderOutput {
  run: ModelRunRow;
}

export interface ProviderDeps {
  store?: ProviderRegistryStore;
  adapters?: TextAdapterRegistry;
  modelRunDeps?: ModelRunDeps;
}

/** Parse model-supplied tool arguments defensively — never throw on malformed JSON. */
function safeJsonParse(value: string | undefined): unknown {
  if (!value || !value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return { __unparsed: value };
  }
}

export function createOpenRouterTextAdapter(input: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}): TextProviderAdapter {
  const fetchImpl = input.fetchImpl ?? fetch;
  const endpoint = input.baseUrl ?? "https://openrouter.ai/api/v1/chat/completions";

  return {
    slug: "openrouter",
    providerType: "text",
    async generateText(request) {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          ...(request.tools?.length ? { tools: request.tools, tool_choice: request.toolChoice ?? "auto" } : {}),
          ...(request.plugins?.length ? { plugins: request.plugins } : {}),
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const normalized = normalizeProviderError({
          provider: "openrouter",
          operation: "generate_text",
          error: { status: response.status, message: body || response.statusText },
        });
        const error = new Error(normalized.message);
        Object.assign(error, { status: normalized.statusCode, code: normalized.code });
        throw error;
      }

      const json = (await response.json()) as {
        id?: string;
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{ id: string; function?: { name?: string; arguments?: string } }>;
          };
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const message = json.choices?.[0]?.message;
      const text = message?.content ?? "";
      const toolCalls = (message?.tool_calls ?? [])
        .filter((tc) => tc.id && tc.function?.name)
        .map((tc) => ({ id: tc.id, name: tc.function!.name!, arguments: safeJsonParse(tc.function?.arguments) }));

      if (!text && toolCalls.length === 0) {
        throw new Error("OpenRouter response did not include text content or tool calls");
      }

      return {
        text,
        toolCalls: toolCalls.length ? toolCalls : undefined,
        inputTokens: json.usage?.prompt_tokens,
        outputTokens: json.usage?.completion_tokens,
        providerRunId: json.id,
      };
    },
  };
}

export async function runTextProvider(
  input: RunTextProviderInput,
  deps: ProviderDeps = {},
): Promise<RunTextProviderResult> {
  const store = deps.store ?? defaultStore();
  const roleMap = await store.getModelRoleMap();
  const roleConfig = resolveModelRole(input.role, roleMap);
  // A caller may override just the model (same provider) — e.g. the chat model picker.
  const model = input.model?.trim() || roleConfig.model;

  const connection = await store.getProviderConnection(roleConfig.provider);
  if (!connection) {
    throw new Error(`provider '${roleConfig.provider}' is not configured`);
  }
  assertProviderAllowedForModule(connection, input.module);

  const credential = await store.getCredential(connection.credentialKeyName);
  if (!credential) {
    throw new Error(`credential '${connection.credentialKeyName}' is not configured`);
  }

  const adapter = deps.adapters?.[connection.slug] ?? defaultTextAdapter(connection, credential);
  if (!adapter) {
    throw new Error(`no text adapter registered for provider '${connection.slug}'`);
  }

  const { result, run } = await recordModelCall(
    {
      provider: connection.slug,
      model,
      role: input.role,
      module: input.module,
      linkedEntityType: input.linkedEntityType,
      linkedEntityId: input.linkedEntityId,
    },
    () =>
      adapter.generateText({
        model,
        messages: input.messages,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        tools: input.tools,
        toolChoice: input.toolChoice,
        plugins: input.plugins,
      }),
    deps.modelRunDeps,
  );

  return { ...result, run };
}

function defaultTextAdapter(connection: ProviderConnectionConfig, credential: string): TextProviderAdapter | null {
  if (connection.slug === "openrouter") {
    return createOpenRouterTextAdapter({ apiKey: credential });
  }
  return null;
}

function mapConnection(row: typeof providerConnections.$inferSelect): ProviderConnectionConfig {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    providerType: row.providerType,
    credentialKeyName: row.credentialKeyName,
    enabled: row.enabled,
    allowedModules: row.allowedModules,
    permissionMode: row.permissionMode,
    costCategory: row.costCategory,
    healthStatus: row.healthStatus,
    referenceDocPath: row.referenceDocPath,
    metadata: row.metadata,
  };
}

export function defaultStore(db: Db = getDb()): ProviderRegistryStore {
  return {
    async getModelRoleMap() {
      const rows = await db
        .select({ value: settings.value })
        .from(settings)
        .where(eq(settings.key, "model_roles"))
        .limit(1);
      return modelRoleMapSchema.parse(rows[0]?.value ?? {});
    },
    async getProviderConnection(slug) {
      const rows = await db.select().from(providerConnections).where(eq(providerConnections.slug, slug)).limit(1);
      return rows[0] ? mapConnection(rows[0]) : null;
    },
    async getCredential(credentialKeyName) {
      return process.env[credentialKeyName] ?? null;
    },
    async listProviderConnections() {
      const rows = await db.select().from(providerConnections);
      return rows.map(mapConnection);
    },
  };
}

export async function listProviderConnections(deps: { store?: ProviderRegistryStore } = {}) {
  const store = deps.store ?? defaultStore();
  return store.listProviderConnections();
}
