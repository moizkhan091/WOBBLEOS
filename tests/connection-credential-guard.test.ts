import { describe, expect, it } from "vitest";
import { registerConnection, updateConnection, type ConnectionStore } from "@/lib/connections";
import { credentialEnvForSlug, type ConnectionRow } from "@/lib/domain/connections";

/**
 * WOB-AUD-010: a caller must not be able to point a KNOWN provider's credential at an unrelated env var
 * (e.g. register slug `openrouter` reading `SESSION_SECRET`), which the health probe could leak to a
 * third party. The credential env is server-authoritative for known slugs.
 */

function makeStore(seed: ConnectionRow[] = []): ConnectionStore {
  const rows = new Map(seed.map((r) => [r.id, r]));
  const bySlug = new Map(seed.map((r) => [r.slug, r]));
  return {
    async insertConnection(row) { rows.set(row.id, row); bySlug.set(row.slug, row); },
    async getConnectionById(id) { return rows.get(id) ?? null; },
    async getConnectionBySlug(slug) { return bySlug.get(slug) ?? null; },
    async listConnections() { return [...rows.values()]; },
    async updateConnection(id, fields) { const r = rows.get(id); if (r) Object.assign(r, fields); },
    async getCredential() { return null; },
  };
}

const base = {
  label: "OpenRouter",
  providerType: "llm",
  costCategory: "llm",
  enabled: false,
  allowedModules: [],
  metadata: {},
};

describe("connection credential env allowlist (WOB-AUD-010)", () => {
  it("rejects registering a known provider slug pointed at an unrelated secret", async () => {
    const store = makeStore();
    await expect(
      registerConnection({ ...base, slug: "openrouter", credentialKeyName: "SESSION_SECRET" }, { store, recordAudit: async () => {} }),
    ).rejects.toThrow(/fixed to env 'OPENROUTER_API_KEY'/);
  });

  it("allows registering a known provider slug with its pinned env var", async () => {
    const store = makeStore();
    const row = await registerConnection(
      { ...base, slug: "openrouter", credentialKeyName: "OPENROUTER_API_KEY" },
      { store, recordAudit: async () => {} },
    );
    expect(row.credentialKeyName).toBe("OPENROUTER_API_KEY");
  });

  it("rejects PATCHing a known provider's credential to another env var", async () => {
    const existing: ConnectionRow = {
      id: "conn_1", slug: "tavily", label: "Tavily", providerType: "search", credentialKeyName: "TAVILY_API_KEY",
      enabled: true, allowedModules: [], permissionMode: "read_write", costCategory: "search", healthStatus: "unknown",
      referenceDocPath: null, metadata: {}, createdAt: new Date(), updatedAt: new Date(),
    };
    const store = makeStore([existing]);
    await expect(
      updateConnection("conn_1", { credentialKeyName: "OPENROUTER_API_KEY" }, { store, recordAudit: async () => {} }),
    ).rejects.toThrow(/fixed to env 'TAVILY_API_KEY'/);
  });

  it("every slug with an outbound health probe is pinned", () => {
    // openrouter + tavily/search_api have live probes → must be pinned so their credential can't be swapped.
    expect(credentialEnvForSlug("openrouter")).toBe("OPENROUTER_API_KEY");
    expect(credentialEnvForSlug("tavily")).toBe("TAVILY_API_KEY");
    expect(credentialEnvForSlug("search_api")).toBe("SEARCH_API_KEY");
  });

  it("leaves unknown provider slugs to the schema-validated key (no false pinning)", async () => {
    const store = makeStore();
    const row = await registerConnection(
      { ...base, slug: "custom_thing", label: "Custom", credentialKeyName: "CUSTOM_THING_KEY" },
      { store, recordAudit: async () => {} },
    );
    expect(row.credentialKeyName).toBe("CUSTOM_THING_KEY");
  });
});
