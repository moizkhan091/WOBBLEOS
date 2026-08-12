import { eq } from "drizzle-orm";
import { providerConnections, settings } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { recordModelCall, type ModelCallResult, type ModelRunDeps, type ModelRunRow } from "@/lib/model-runs";
import { loadEngagedSwitches, assertNotKilled } from "@/lib/security-governance/enforcement";
import { PROVIDER_BUDGETS, assertProviderAllowance, recordExternalSpend, ProviderBudgetExceededError, type ProviderBudgetDeps } from "@/lib/provider-budget";
import type { KillSwitchRow } from "@/lib/domain/security-governance";
import {
  assertProviderAllowedForModule,
  modelRoleMapSchema,
  normalizeProviderError,
  resolveModelRole,
  type ModelRoleMap,
  type ProviderConnectionConfig,
} from "@/lib/domain/providers";

/** Conservative WORST-CASE USD for a text call — deliberately pessimistic so the budget stop is never
 *  crossed by an in-flight call. Real cost is a fraction of this; it only gates cumulative spend. */
/**
 * What this call could cost, at worst, before it is allowed to run.
 *
 * The old estimate charged maxTokens in BOTH directions at a flat $0.10 per 1k. Against Sonnet 4.5's
 * real prices ($3/M in, $15/M out) that is about 33 times too pessimistic on input and 7 times on
 * output, and it charged the output ceiling for a prompt whose size is known exactly. Under a $2 daily
 * cap it started REFUSING legitimate work: a 6,000-token proposal review was priced at $1.20 and
 * blocked, so a founder's guard against overspending became a guard against working at all.
 *
 * Now it prices the prompt it actually has against the model's real listed rates, and only the output
 * is a ceiling. Still an over-estimate (the model rarely writes to the ceiling), which is the correct
 * direction for a guard: an in-flight call must never be able to cross the stop threshold.
 */
export function estimateTextWorstCaseUsd(
  maxTokens: number,
  opts: { promptChars?: number; usdPerMillionInput?: number; usdPerMillionOutput?: number } = {},
): number {
  // Roughly four characters per token across English and the mixed English/Urdu these prompts carry.
  const promptTokens = Math.ceil((opts.promptChars ?? 0) / 4);
  // The fallback rates are the most expensive model in the catalog, so an unknown model is still
  // bounded generously rather than optimistically.
  const inRate = (opts.usdPerMillionInput ?? 3) / 1_000_000;
  const outRate = (opts.usdPerMillionOutput ?? 15) / 1_000_000;
  return Math.max(0.005, promptTokens * inRate + maxTokens * outRate);
}

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
  /** Real listed rates for a model, so the budget guard prices what it is about to buy. Optional: an
   *  injected test store need not implement it, and a missing price falls back to the dearest model. */
  getModelPricing?(modelId: string): Promise<{ usdPerMillionInput?: number; usdPerMillionOutput?: number } | null>;
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
  /** Department/workflow/tenant context so this call's usage is attributed + settled against a budget. */
  usageContext?: import("@/lib/domain/provider-usage").ProviderUsageContext & { attempt?: number };
}

export interface RunTextProviderResult extends TextProviderOutput {
  run: ModelRunRow;
}

export interface ProviderDeps {
  store?: ProviderRegistryStore;
  adapters?: TextAdapterRegistry;
  modelRunDeps?: ModelRunDeps;
  /** Record normalized provider usage (injectable; env-gated default records to the DB). */
  recordUsage?: (input: import("@/lib/domain/provider-usage").BuildProviderUsageInput) => Promise<void>;
  /** Injectable engaged-kill-switch loader (defaults to the security-governance loader). */
  loadKillSwitches?: () => Promise<KillSwitchRow[]>;
  /** Injectable budget deps (db/now/getSpent) for the external-provider budget gate. */
  budgetDeps?: ProviderBudgetDeps;
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
          // Ask OpenRouter to return the ACTUAL billed cost + detailed token usage (cached / reasoning).
          usage: { include: true },
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
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          cost?: number; // OpenRouter-reported billed cost in USD (usage.include=true)
          prompt_tokens_details?: { cached_tokens?: number };
          completion_tokens_details?: { reasoning_tokens?: number };
        };
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
        cachedInputTokens: json.usage?.prompt_tokens_details?.cached_tokens,
        reasoningTokens: json.usage?.completion_tokens_details?.reasoning_tokens,
        providerReportedCostUsd: typeof json.usage?.cost === "number" ? json.usage.cost : undefined,
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

  // EXTERNAL PROVIDER GOVERNANCE: a budget-tracked provider (openrouter/…) must clear the KILL SWITCH and
  // the BUDGET before any paid call, and its actual cost is recorded to the durable ledger after. Internal/
  // untracked providers skip this. The worst-case estimate is pessimistic so an in-flight call can never
  // cross the stop threshold; a rejected call is still ledgered so the block is auditable.
  const budget = PROVIDER_BUDGETS[connection.slug];
  const budgetItem = input.usageContext?.departmentSlug ? `${input.usageContext.departmentSlug}:${input.role}` : `${input.module}:${input.role}`;
  // Active only in a REAL spend context: a persistent DB (production/UAT) or explicitly injected deps.
  // A pure no-DB unit test has no external spend to govern, so the guard stays out of its way.
  const budgetActive = Boolean(budget) && Boolean(process.env.DATABASE_URL || deps.budgetDeps || deps.loadKillSwitches);
  let worstCaseCost = 0;
  if (budget && budgetActive) {
    const switches: KillSwitchRow[] = deps.loadKillSwitches ? await deps.loadKillSwitches() : await loadEngagedSwitches();
    assertNotKilled(switches, "provider", connection.slug); // throws KillSwitchEngagedError → 409 upstream
    const promptChars = input.messages.reduce((n, m) => n + (m.content?.length ?? 0), 0);
    const priced = await store.getModelPricing?.(model).catch(() => null);
    worstCaseCost = budget.unit === "usd"
      ? estimateTextWorstCaseUsd(input.maxTokens ?? 1600, { promptChars, usdPerMillionInput: priced?.usdPerMillionInput, usdPerMillionOutput: priced?.usdPerMillionOutput })
      : (input.maxTokens ?? 1600);
    try {
      await assertProviderAllowance(connection.slug, worstCaseCost, deps.budgetDeps);
    } catch (e) {
      if (e instanceof ProviderBudgetExceededError) {
        await recordExternalSpend({ provider: connection.slug, item: budgetItem, model, estimatedMaxCost: worstCaseCost, actualCost: 0, unit: budget.unit, result: "rejected_budget", actor: input.usageContext?.agentSlug ?? undefined }, deps.budgetDeps).catch(() => {});
      }
      throw e;
    }
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

  // Record the normalized ACTUAL provider usage (idempotent by providerRequestId) so budgets settle
  // against real tokens/cost, not the estimate. Env-gated default; never fails the provider call.
  const r = result as { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; reasoningTokens?: number; providerReportedCostUsd?: number; providerRunId?: string; toolCalls?: unknown[] };

  // Ledger the ACTUAL external spend for a budget-tracked provider — this is what the next call's allowance
  // check reads. USD providers record the provider-reported cost (fallback to the run's calculated cost);
  // character/credit providers record token throughput. Never fails the call.
  if (budget && budgetActive) {
    const actual = budget.unit === "usd" ? (r.providerReportedCostUsd ?? (run.estimatedCost ? Number(run.estimatedCost) : 0)) : ((r.inputTokens ?? 0) + (r.outputTokens ?? 0));
    await recordExternalSpend({ provider: connection.slug, item: budgetItem, model, estimatedMaxCost: worstCaseCost, actualCost: actual, unit: budget.unit, tokens: (r.inputTokens ?? 0) + (r.outputTokens ?? 0), latencyMs: run.latencyMs ?? undefined, result: "succeeded", actor: input.usageContext?.agentSlug ?? undefined }, deps.budgetDeps).catch((e) => console.error("external spend record failed (non-fatal):", e instanceof Error ? e.message : e));
  }
  const recordUsage = deps.recordUsage ?? (process.env.DATABASE_URL ? async (u: import("@/lib/domain/provider-usage").BuildProviderUsageInput) => { const { recordProviderUsage } = await import("@/lib/provider-usage"); await recordProviderUsage(u); } : undefined);
  if (recordUsage) {
    try {
      await recordUsage({
        providerRequestId: r.providerRunId,
        provider: connection.slug,
        model,
        attempt: input.usageContext?.attempt ?? 1,
        inputTokens: r.inputTokens ?? null,
        outputTokens: r.outputTokens ?? null,
        cachedInputTokens: r.cachedInputTokens ?? null,
        reasoningTokens: r.reasoningTokens ?? null,
        toolCalls: Array.isArray(r.toolCalls) ? r.toolCalls.length : 0,
        providerReportedCostUsd: r.providerReportedCostUsd ?? null,
        calculatedCostUsd: run.estimatedCost ? Number(run.estimatedCost) : undefined,
        latencyMs: run.latencyMs ?? null,
        status: "succeeded",
        modelRunId: run.id,
        context: { ...input.usageContext, role: input.role, module: input.module },
      });
    } catch (err) {
      console.error("provider usage record failed (non-fatal):", err instanceof Error ? err.message : err);
    }
  }

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
    async getModelPricing(modelId) {
      // The catalog is the same settings row Model Control edits, so a price a founder can see on that
      // page is the price the budget guard uses. No separate source to drift.
      const rows = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "model_catalog")).limit(1);
      const models = ((rows[0]?.value ?? {}) as { models?: Array<{ id?: string; usdPerMillionInput?: number; usdPerMillionOutput?: number }> }).models ?? [];
      const found = models.find((m) => m.id === modelId);
      return found ? { usdPerMillionInput: found.usdPerMillionInput, usdPerMillionOutput: found.usdPerMillionOutput } : null;
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
