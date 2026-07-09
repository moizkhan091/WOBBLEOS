import { describe, expect, it, vi } from "vitest";
import {
  assertProviderAllowedForModule,
  normalizeProviderError,
  resolveModelRole,
  type ModelRoleMap,
  type ProviderConnectionConfig,
} from "@/lib/domain/providers";
import {
  createOpenRouterTextAdapter,
  runTextProvider,
  type ProviderRegistryStore,
  type TextProviderAdapter,
} from "@/lib/providers";
import type { ModelRunRow, ModelRunWriter } from "@/lib/model-runs";

const roleMap: ModelRoleMap = {
  ask_wobble: { provider: "openrouter", model: "openai/gpt-4o-mini" },
  content_writer: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
};

const openRouterConnection: ProviderConnectionConfig = {
  id: "provider_openrouter",
  slug: "openrouter",
  label: "OpenRouter",
  providerType: "llm_gateway",
  credentialKeyName: "OPENROUTER_API_KEY",
  enabled: true,
  allowedModules: ["ask_wobble", "content"],
  permissionMode: "read_write",
  costCategory: "openrouter",
  healthStatus: "healthy",
  referenceDocPath: "docs/provider-references/openrouter.md",
  metadata: {},
};

describe("provider domain", () => {
  it("resolves model roles from settings data", () => {
    expect(resolveModelRole("ask_wobble", roleMap)).toEqual({
      provider: "openrouter",
      model: "openai/gpt-4o-mini",
    });
    expect(() => resolveModelRole("missing_role", roleMap)).toThrowError(/model role/);
  });

  it("falls back to the 'default' role for an unmapped role, but still throws with no default", () => {
    const withDefault = { ...roleMap, default: { provider: "openrouter", model: "openai/gpt-4o-mini" } };
    expect(resolveModelRole("some_new_agent_role", withDefault)).toEqual({ provider: "openrouter", model: "openai/gpt-4o-mini" });
    expect(() => resolveModelRole("some_new_agent_role", roleMap)).toThrowError(/model role/);
  });

  it("blocks disabled providers or modules outside provider permissions", () => {
    expect(() => assertProviderAllowedForModule(openRouterConnection, "ask_wobble")).not.toThrow();
    expect(() => assertProviderAllowedForModule({ ...openRouterConnection, enabled: false }, "ask_wobble")).toThrowError(/disabled/);
    expect(() => assertProviderAllowedForModule(openRouterConnection, "media_studio")).toThrowError(/not allowed/);
  });

  it("normalizes provider errors without leaking secrets", () => {
    const normalized = normalizeProviderError({
      provider: "openrouter",
      operation: "generate_text",
      error: { status: 429, message: "Rate limit for key sk-hidden-secret" },
    });

    expect(normalized).toMatchObject({
      provider: "openrouter",
      operation: "generate_text",
      statusCode: 429,
      retryable: true,
    });
    expect(normalized.message).not.toContain("sk-hidden-secret");
  });
});

describe("OpenRouter text adapter", () => {
  it("returns normalized text output from a mocked OpenRouter response", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "run_123",
          choices: [{ message: { content: "Hello from WOBBLE." } }],
          usage: { prompt_tokens: 12, completion_tokens: 8 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const adapter = createOpenRouterTextAdapter({ apiKey: "test-key", fetchImpl });

    const result = await adapter.generateText({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "Say hi" }],
    });

    expect(result).toMatchObject({
      text: "Hello from WOBBLE.",
      inputTokens: 12,
      outputTokens: 8,
      providerRunId: "run_123",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      }),
    );
  });
});

function fakeWriter() {
  const rows: ModelRunRow[] = [];
  const writer: ModelRunWriter = {
    insertModelRun: async (row) => {
      rows.push(row);
    },
  };
  return { rows, writer };
}

function fakeStore(connection: ProviderConnectionConfig = openRouterConnection): ProviderRegistryStore {
  return {
    getModelRoleMap: async () => roleMap,
    getProviderConnection: async (slug) => (slug === connection.slug ? connection : null),
    getCredential: async () => "test-key",
    listProviderConnections: async () => [connection],
  };
}

describe("provider registry service", () => {
  it("runs a text provider through configured role routing and logs model_run success", async () => {
    const { rows, writer } = fakeWriter();
    const adapter: TextProviderAdapter = {
      slug: "openrouter",
      providerType: "text",
      generateText: async () => ({ text: "Strategy answer", inputTokens: 10, outputTokens: 20, providerRunId: "p1" }),
    };

    const result = await runTextProvider(
      {
        role: "ask_wobble",
        module: "ask_wobble",
        messages: [{ role: "user", content: "What should we do?" }],
        linkedEntityType: "ask_session",
        linkedEntityId: "ask_1",
      },
      {
        store: fakeStore(),
        adapters: { openrouter: adapter },
        modelRunDeps: { writer, recordAudit: async () => {}, clock: (() => {
          let t = 100;
          return () => {
            const value = t;
            t += 25;
            return value;
          };
        })() },
      },
    );

    expect(result.text).toBe("Strategy answer");
    expect(rows[0]).toMatchObject({
      provider: "openrouter",
      model: "openai/gpt-4o-mini",
      role: "ask_wobble",
      module: "ask_wobble",
      status: "succeeded",
      inputTokens: 10,
      outputTokens: 20,
      latencyMs: 25,
    });
  });

  it("records model_run error when a provider adapter fails", async () => {
    const { rows, writer } = fakeWriter();
    const adapter: TextProviderAdapter = {
      slug: "openrouter",
      providerType: "text",
      generateText: async () => {
        throw new Error("provider unavailable");
      },
    };

    await expect(
      runTextProvider(
        {
          role: "ask_wobble",
          module: "ask_wobble",
          messages: [{ role: "user", content: "Help" }],
        },
        {
          store: fakeStore(),
          adapters: { openrouter: adapter },
          modelRunDeps: { writer, recordAudit: async () => {}, clock: () => 100 },
        },
      ),
    ).rejects.toThrowError(/provider unavailable/);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: "openrouter",
      model: "openai/gpt-4o-mini",
      status: "error",
      error: "provider unavailable",
    });
  });
});
