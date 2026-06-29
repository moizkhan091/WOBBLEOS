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

export interface TextProviderInput {
  model: string;
  messages: ProviderMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface TextProviderOutput extends ModelCallResult {
  text: string;
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
  messages: ProviderMessage[];
  temperature?: number;
  maxTokens?: number;
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
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const text = json.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error("OpenRouter response did not include text content");
      }

      return {
        text,
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
      model: roleConfig.model,
      role: input.role,
      module: input.module,
      linkedEntityType: input.linkedEntityType,
      linkedEntityId: input.linkedEntityId,
    },
    () =>
      adapter.generateText({
        model: roleConfig.model,
        messages: input.messages,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
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
