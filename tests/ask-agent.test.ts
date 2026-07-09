import { describe, expect, it, vi } from "vitest";
import { askWobbleAgent, type AskAgentDeps } from "@/lib/ask/agent";
import type { ProviderChatMessage, ProviderToolCall } from "@/lib/providers";
import { DEFAULT_MODEL_CATALOG } from "@/lib/domain/model-registry";
import type { SystemMapDeps, AgentSummary } from "@/lib/system-map";
import type { ModelRegistryStore } from "@/lib/model-registry";
import type { ModelRoleMap } from "@/lib/domain/providers";
import type { ApprovalStore } from "@/lib/approvals";

const agents: AgentSummary[] = [
  { slug: "content_worker", name: "Content Worker", module: "content_command", team: "content", status: "active", purpose: "writes content" },
  { slug: "market_researcher", name: "Market Researcher", module: "research_radar", team: "intelligence", status: "active", purpose: "market research" },
];

function toolCtx() {
  const systemMapDeps: SystemMapDeps = {
    listAgents: async () => agents,
    countPendingApprovalsByType: async () => ({ content: 2, model_upgrade: 1 }),
    getModelRoleMap: async () => ({ content_strategy: { provider: "openrouter", model: "openai/gpt-4o-mini" } }),
    getModelCatalog: async () => DEFAULT_MODEL_CATALOG,
    modules: [{ id: "command", label: "Command Center", status: "wired" }],
  };
  const map: ModelRoleMap = { ask_wobble: { provider: "openrouter", model: "openai/gpt-4o-mini" } };
  let current = { ...map };
  const modelStore: ModelRegistryStore = {
    getModelCatalog: async () => DEFAULT_MODEL_CATALOG,
    getModelRoleMap: async () => current,
    setModelRoleMap: async (next) => {
      current = next;
    },
  };
  const approvalStore: ApprovalStore = { insert: vi.fn(async () => {}), getById: vi.fn(async () => ({ status: "pending" as never, approvalType: "model_upgrade" })), update: vi.fn(async () => {}) };
  return { systemMapDeps, modelRegistryDeps: { store: modelStore, approvalStore, recordAudit: async () => {} }, current: () => current };
}

function scripted(responses: Array<{ text?: string; toolCalls?: ProviderToolCall[] }>) {
  let i = 0;
  const fn = async (_input: { messages: ProviderChatMessage[]; maxTokens?: number }) => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return { text: r.text ?? "", toolCalls: r.toolCalls, runId: `run_${i}` };
  };
  return fn;
}

function tc(name: string, args: unknown, id = "tc_1"): ProviderToolCall {
  return { id, name, arguments: args };
}

function baseDeps(runProvider: AskAgentDeps["runProvider"]): AskAgentDeps {
  const ctx = toolCtx();
  return {
    runProvider,
    getSystemSnapshotText: async () => "AGENTS: 2 total",
    toolContext: { actor: "Moiz", systemMapDeps: ctx.systemMapDeps, modelRegistryDeps: ctx.modelRegistryDeps },
    recordAudit: async () => {},
  };
}

describe("askWobbleAgent", () => {
  it("calls a read tool, then answers from the result", async () => {
    const deps = baseDeps(
      scripted([
        { toolCalls: [tc("list_pending_approvals", {})] },
        { text: "You have 3 items pending: 2 content, 1 model upgrade." },
      ]),
    );
    const res = await askWobbleAgent({ question: "what's pending approval?", founder: "Moiz" }, deps);
    expect(res.stoppedReason).toBe("final");
    expect(res.toolTrace).toHaveLength(1);
    expect(res.toolTrace[0]).toMatchObject({ tool: "list_pending_approvals", ok: true });
    expect(res.answer).toContain("pending");
  });

  it("HOLDS a destructive tool for confirmation (does not apply it)", async () => {
    const ctx = toolCtx();
    const deps: AskAgentDeps = {
      runProvider: scripted([{ toolCalls: [tc("apply_model_upgrade", { approvalId: "a1", role: "ask_wobble", toModelId: "openai/gpt-4o" })] }]),
      getSystemSnapshotText: async () => "state",
      toolContext: { actor: "Moiz", systemMapDeps: ctx.systemMapDeps, modelRegistryDeps: ctx.modelRegistryDeps },
      recordAudit: async () => {},
    };
    const res = await askWobbleAgent({ question: "switch ask_wobble to gpt-4o", founder: "Moiz", confirmActions: false }, deps);
    expect(res.stoppedReason).toBe("needs_confirmation");
    expect(res.pendingConfirmation?.tool).toBe("apply_model_upgrade");
    // the model role must be UNCHANGED — nothing was applied
    expect(ctx.current().ask_wobble.model).toBe("openai/gpt-4o-mini");
  });

  it("applies a destructive tool only when confirmActions is true", async () => {
    const ctx = toolCtx();
    const deps: AskAgentDeps = {
      runProvider: scripted([
        { toolCalls: [tc("apply_model_upgrade", { approvalId: "a1", role: "ask_wobble", toModelId: "openai/gpt-4o" })] },
        { text: "Done — ask_wobble now uses gpt-4o." },
      ]),
      getSystemSnapshotText: async () => "state",
      toolContext: { actor: "Moiz", systemMapDeps: ctx.systemMapDeps, modelRegistryDeps: ctx.modelRegistryDeps },
      recordAudit: async () => {},
    };
    const res = await askWobbleAgent({ question: "yes do it", founder: "Moiz", confirmActions: true }, deps);
    expect(res.stoppedReason).toBe("final");
    expect(ctx.current().ask_wobble.model).toBe("openai/gpt-4o");
  });

  it("recovers from an unknown tool (structured error, then answers)", async () => {
    const deps = baseDeps(
      scripted([
        { toolCalls: [tc("delete_the_database", {})] },
        { text: "I can't do that; here's what I can do instead." },
      ]),
    );
    const res = await askWobbleAgent({ question: "delete everything", founder: "Moiz" }, deps);
    expect(res.stoppedReason).toBe("final");
    expect(res.toolTrace[0]).toMatchObject({ ok: false });
    expect(res.answer).toContain("can't");
  });

  it("stops at the iteration cap instead of looping forever", async () => {
    // provider ALWAYS asks for a tool -> would loop forever without the cap
    const deps = baseDeps(scripted([{ toolCalls: [tc("list_agents", {})] }]));
    const res = await askWobbleAgent({ question: "loop", founder: "Moiz", maxIterations: 3 }, deps);
    expect(res.stoppedReason).toBe("max_iterations");
    expect(res.iterations).toBe(3);
  });
});
