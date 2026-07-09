import { describe, expect, it, vi } from "vitest";
import { ASK_TOOLS, runTool, toolSpecs, type ToolContext } from "@/lib/ask-tools";
import { DEFAULT_MODEL_CATALOG } from "@/lib/domain/model-registry";
import type { SystemMapDeps, AgentSummary } from "@/lib/system-map";
import type { ModelRegistryStore } from "@/lib/model-registry";
import type { ModelRoleMap } from "@/lib/domain/providers";
import type { ApprovalStore } from "@/lib/approvals";

const agents: AgentSummary[] = [
  { slug: "content_worker", name: "Content Worker", module: "content_command", team: "content", status: "active", purpose: "writes content" },
  { slug: "market_researcher", name: "Market Researcher", module: "research_radar", team: "intelligence", status: "active", purpose: "researches markets" },
];

const systemMapDeps: SystemMapDeps = {
  listAgents: async () => agents,
  countPendingApprovalsByType: async () => ({ content: 2, model_upgrade: 1 }),
  getModelRoleMap: async () => ({ content_strategy: { provider: "openrouter", model: "openai/gpt-4o-mini" } }),
  getModelCatalog: async () => DEFAULT_MODEL_CATALOG,
  modules: [{ id: "command", label: "Command Center", status: "wired" }],
};

function modelStore(map: ModelRoleMap = { content_strategy: { provider: "openrouter", model: "anthropic/claude-sonnet-4.5" } }): ModelRegistryStore {
  let current = { ...map };
  return {
    getModelCatalog: async () => DEFAULT_MODEL_CATALOG,
    getModelRoleMap: async () => current,
    setModelRoleMap: async (next) => {
      current = next;
    },
  };
}

function fakeApprovalStore(): ApprovalStore {
  return {
    insert: vi.fn(async () => {}),
    getById: vi.fn(async () => ({ status: "pending" as never, approvalType: "model_upgrade" })),
    update: vi.fn(async () => {}),
  };
}

const ctx = (): ToolContext => ({
  actor: "Moiz",
  systemMapDeps,
  modelRegistryDeps: { store: modelStore(), approvalStore: fakeApprovalStore(), recordAudit: async () => {} },
});

describe("tool registry", () => {
  it("exposes OpenAI-compatible specs for every tool", () => {
    const specs = toolSpecs();
    expect(specs).toHaveLength(ASK_TOOLS.length);
    for (const s of specs) {
      expect(s.type).toBe("function");
      expect(typeof s.function.name).toBe("string");
      expect(s.function.parameters).toHaveProperty("type", "object");
    }
  });
});

describe("read tools", () => {
  it("list_agents filters by team", async () => {
    const r = await runTool("list_agents", { team: "intelligence" }, ctx());
    expect(r.ok).toBe(true);
    expect((r.result as { total: number }).total).toBe(1);
  });

  it("list_pending_approvals returns the breakdown", async () => {
    const r = await runTool("list_pending_approvals", {}, ctx());
    expect(r.ok).toBe(true);
    expect(r.result).toMatchObject({ pending: 3, byType: { content: 2, model_upgrade: 1 } });
  });

  it("list_models filters by modality", async () => {
    const r = await runTool("list_models", { modality: "embedding" }, ctx());
    expect(r.ok).toBe(true);
    const models = (r.result as { models: Array<{ id: string }> }).models;
    expect(models.every((m) => m.id.includes("embedding"))).toBe(true);
  });
});

describe("dispatch safety", () => {
  it("rejects an unknown tool without throwing", async () => {
    const r = await runTool("delete_everything", {}, ctx());
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Unknown tool");
  });

  it("rejects invalid args without throwing", async () => {
    const r = await runTool("propose_model_swap", { role: "content_strategy" }, ctx()); // missing toModelId/rationale
    expect(r.ok).toBe(false);
  });

  it("returns a structured error (not a throw) when a handler fails", async () => {
    // embedding model on a text role -> validateModelSwap rejects inside the handler
    const r = await runTool(
      "propose_model_swap",
      { role: "content_strategy", toModelId: "openai/text-embedding-3-small", rationale: "x" },
      ctx(),
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain("text-capable");
  });
});

describe("action tools", () => {
  it("propose_model_swap creates a pending approval (not applied)", async () => {
    const r = await runTool(
      "propose_model_swap",
      { role: "content_strategy", toModelId: "openai/gpt-4o", rationale: "stronger reasoning", confidence: 0.7 },
      ctx(),
    );
    expect(r.ok).toBe(true);
    expect(r.mutated).toBe(true);
    expect(r.result).toMatchObject({ role: "content_strategy", toModelId: "openai/gpt-4o", status: "pending_approval" });
  });
});
