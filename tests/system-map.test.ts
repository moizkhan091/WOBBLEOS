import { describe, expect, it } from "vitest";
import { formatSystemSnapshot, getSystemSnapshot, type AgentSummary, type SystemMapDeps } from "@/lib/system-map";
import { DEFAULT_MODEL_CATALOG } from "@/lib/domain/model-registry";
import { askWobble } from "@/lib/ask";

const agents: AgentSummary[] = [
  { slug: "ask_wobble", name: "Ask WOBBLE", module: "ask_wobble", team: "command", status: "active", purpose: "front door" },
  { slug: "content_worker", name: "Content Worker", module: "content_command", team: "content", status: "active", purpose: "writes content" },
  { slug: "model_scout", name: "Model Scout", module: "settings", team: "intelligence", status: "active", purpose: "proposes model upgrades" },
];

function deps(): SystemMapDeps {
  return {
    listAgents: async () => agents,
    countPendingApprovalsByType: async () => ({ content: 2, model_upgrade: 1 }),
    getModelRoleMap: async () => ({
      ask_wobble: { provider: "openrouter", model: "openai/gpt-4o-mini" },
      content_strategy: { provider: "openrouter", model: "openai/gpt-4o-mini" },
    }),
    getModelCatalog: async () => DEFAULT_MODEL_CATALOG,
    modules: [
      { id: "command", label: "Command Center", status: "wired" },
      { id: "radar", label: "Research Radar", status: "planned" },
      { id: "handoff", label: "n8n Handoff", status: "backend-ready" },
    ],
  };
}

describe("getSystemSnapshot", () => {
  it("aggregates agents, approvals, modules, and models", async () => {
    const snap = await getSystemSnapshot(deps());
    expect(snap.agents.total).toBe(3);
    expect(snap.agents.active).toBe(3);
    expect(snap.agents.byTeam.intelligence).toBe(1);
    expect(snap.approvals.pending).toBe(3);
    expect(snap.approvals.byType.content).toBe(2);
    expect(snap.modules.total).toBe(3);
    expect(snap.modules.wired).toBe(1);
    expect(snap.modules.backendReady).toBe(1);
    expect(snap.models.catalogCount).toBe(DEFAULT_MODEL_CATALOG.length);
    expect(snap.models.roles.ask_wobble.model).toBe("openai/gpt-4o-mini");
  });
});

describe("formatSystemSnapshot", () => {
  it("produces a compact, authoritative block listing agents + state", async () => {
    const text = formatSystemSnapshot(await getSystemSnapshot(deps()));
    expect(text).toContain("AGENTS: 3 total (3 active)");
    expect(text).toContain("model_scout");
    expect(text).toContain("APPROVALS PENDING: 3");
    expect(text).toContain("MODEL ROLES:");
  });
});

describe("Ask WOBBLE system awareness", () => {
  it("injects the live system snapshot into the model's system prompt", async () => {
    let capturedSystem = "";
    const result = await askWobble(
      { question: "how many ai agents are there and list them" },
      {
        classifyIntent: () => "question",
        retrieveBrain: async () => [],
        retrieveMemory: async () => [],
        retrieveSources: async () => [],
        retrieveSystemSnapshot: async () => "AGENTS: 3 total (3 active).\n  - model_scout (Model Scout) [module=settings]",
        runProvider: async ({ messages }) => {
          capturedSystem = messages.find((m) => m.role === "system")?.content ?? "";
          return { text: "There are 3 agents: ask_wobble, content_worker, model_scout.", run: { id: "run_1" } };
        },
        recordAudit: async () => {},
      },
    );
    expect(result.type).toBe("answer");
    expect(capturedSystem).toContain("Live OS system state");
    expect(capturedSystem).toContain("model_scout");
  });
});
