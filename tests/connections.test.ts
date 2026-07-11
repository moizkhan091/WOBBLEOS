import { describe, expect, it } from "vitest";
import {
  buildConnectionRow,
  evaluateConnectionGuard,
  sanitizeConnection,
  type ConnectionRow,
  type RegisterConnectionInput,
} from "@/lib/domain/connections";
import {
  assertJobConnectionsAllowed,
  checkConnectionHealth,
  guardConnection,
  listConnections,
  registerConnection,
  updateConnection,
  type ConnectionStore,
} from "@/lib/connections";
import type { AuditEventInput } from "@/lib/domain/audit";

const now = new Date("2026-07-04T09:00:00.000Z");

const base: RegisterConnectionInput = {
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
  metadata: { docsChecked: true },
};

function makeStore(seed: ConnectionRow[] = [], credentials: Record<string, string | null> = {}) {
  const rows = new Map(seed.map((row) => [row.id, row]));
  const bySlug = () => new Map([...rows.values()].map((row) => [row.slug, row]));

  const store: ConnectionStore = {
    insertConnection: async (row) => void rows.set(row.id, row),
    getConnectionById: async (id) => rows.get(id) ?? null,
    getConnectionBySlug: async (slug) => bySlug().get(slug) ?? null,
    listConnections: async (query) =>
      [...rows.values()]
        .filter((row) => (query.providerType ? row.providerType === query.providerType : true))
        .filter((row) => (query.enabled === undefined ? true : row.enabled === query.enabled))
        .slice(0, query.limit),
    updateConnection: async (id, fields) => {
      const current = rows.get(id);
      if (current) rows.set(id, { ...current, ...fields } as ConnectionRow);
    },
    getCredential: async (key) => credentials[key] ?? null,
  };

  return { store, rows };
}

function audit() {
  const events: AuditEventInput[] = [];
  return { events, recordAudit: async (event: AuditEventInput) => void events.push(event) };
}

describe("connections domain", () => {
  it("sanitizes connection rows without exposing secret values", () => {
    const row = buildConnectionRow(base, { id: "conn_openrouter", now });
    const view = sanitizeConnection(row, { credentialConfigured: true });

    expect(view).toMatchObject({
      slug: "openrouter",
      credentialKeyName: "OPENROUTER_API_KEY",
      credentialConfigured: true,
      enabled: true,
      allowedModules: ["ask_wobble", "content"],
    });
    expect(JSON.stringify(view)).not.toContain("test-secret");
  });

  it("evaluates disabled, module-blocked, missing-credential, and allowed guards", () => {
    const row = buildConnectionRow(base, { id: "conn_openrouter", now });
    expect(evaluateConnectionGuard({ connection: { ...row, enabled: false }, module: "ask_wobble", credentialConfigured: true })).toMatchObject({ allowed: false, code: "connection_disabled" });
    expect(evaluateConnectionGuard({ connection: row, module: "media", credentialConfigured: true })).toMatchObject({ allowed: false, code: "module_not_allowed" });
    expect(evaluateConnectionGuard({ connection: row, module: "ask_wobble", credentialConfigured: false })).toMatchObject({ allowed: false, code: "missing_credential" });
    expect(evaluateConnectionGuard({ connection: row, module: "ask_wobble", credentialConfigured: true })).toMatchObject({ allowed: true, code: "allowed" });
  });
});

describe("connections service", () => {
  it("registers and lists sanitized connections", async () => {
    const { store } = makeStore([], { OPENROUTER_API_KEY: "test-secret" });
    const { events, recordAudit } = audit();

    const row = await registerConnection(base, { store, recordAudit, now });
    const rows = await listConnections({}, { store });

    expect(row.slug).toBe("openrouter");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ slug: "openrouter", credentialConfigured: true });
    expect(JSON.stringify(rows[0])).not.toContain("test-secret");
    expect(events.map((event) => event.eventType)).toContain("connection.registered");
  });

  it("updates enabled state and audits the action", async () => {
    const seed = buildConnectionRow(base, { id: "conn_openrouter", now });
    const { store } = makeStore([seed]);
    const { events, recordAudit } = audit();

    const updated = await updateConnection("openrouter", { enabled: false }, { store, recordAudit, now });

    expect(updated.enabled).toBe(false);
    expect(events.map((event) => event.eventType)).toContain("connection.disabled");
  });

  it("health check reports 'blocked' for missing credentials without calling external APIs", async () => {
    const seed = buildConnectionRow(base, { id: "conn_openrouter", now });
    const { store } = makeStore([seed], { OPENROUTER_API_KEY: null });
    const { events, recordAudit } = audit();

    const result = await checkConnectionHealth("openrouter", { store, recordAudit, now });

    expect(result.connection.healthStatus).toBe("blocked");
    expect(result.credentialConfigured).toBe(false);
    expect(events.map((event) => event.eventType)).toContain("connection.health_checked");
  });

  it("a present credential is VERIFIED by a real probe — not assumed healthy from env-var presence", async () => {
    const seed = buildConnectionRow(base, { id: "conn_openrouter", now });
    const { store } = makeStore([seed], { OPENROUTER_API_KEY: "sk-test" });
    const { recordAudit } = audit();

    // Probe says the key is live -> healthy.
    const ok = await checkConnectionHealth("openrouter", { store, recordAudit, now, probe: async () => ({ status: "healthy" }) });
    expect(ok.connection.healthStatus).toBe("healthy");

    // Probe rejects the key (revoked/rotated) -> failed, NOT healthy (the false-confidence bug).
    const bad = await checkConnectionHealth("openrouter", { store, recordAudit, now, probe: async () => ({ status: "failed", detail: "auth rejected" }) });
    expect(bad.connection.healthStatus).toBe("failed");

    // No probe wired for a provider -> unverified (credential present but unconfirmed), never healthy.
    const unknown = await checkConnectionHealth("openrouter", { store, recordAudit, now, probe: async () => undefined });
    expect(unknown.connection.healthStatus).toBe("unverified");
  });

  it("guard blocks disabled connections with an audit event", async () => {
    const seed = buildConnectionRow({ ...base, enabled: false }, { id: "conn_openrouter", now });
    const { store } = makeStore([seed], { OPENROUTER_API_KEY: "test-secret" });
    const { events, recordAudit } = audit();

    const decision = await guardConnection({ slug: "openrouter", module: "ask_wobble" }, { store, recordAudit, now });

    expect(decision).toMatchObject({ allowed: false, code: "connection_disabled" });
    expect(events.map((event) => event.eventType)).toContain("connection.guard_blocked");
  });

  it("job guard rejects required disabled connections before enqueue", async () => {
    const seed = buildConnectionRow({ ...base, enabled: false }, { id: "conn_openrouter", now });
    const { store } = makeStore([seed], { OPENROUTER_API_KEY: "test-secret" });
    const { events, recordAudit } = audit();

    await expect(
      assertJobConnectionsAllowed(
        {
          type: "content.generate",
          linkedModule: "content",
          payload: { requiredConnectionSlug: "openrouter" },
        },
        { store, recordAudit, now },
      ),
    ).rejects.toThrow(/disabled/);
    expect(events.map((event) => event.eventType)).toContain("connection.guard_blocked");
  });
});
