import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MODEL_CATALOG,
  validateModelSwap,
  type ModelCatalog,
} from "@/lib/domain/model-registry";
import {
  applyModelSwapApproval,
  proposeModelSwap,
  setModelForRole,
  type ModelRegistryStore,
} from "@/lib/model-registry";
import type { ModelRoleMap } from "@/lib/domain/providers";
import type { ApprovalStore } from "@/lib/approvals";
import type { AuditEventInput } from "@/lib/domain/audit";

const now = new Date("2026-07-09T12:00:00.000Z");

function makeStore(roleMap: ModelRoleMap = {}, catalog: ModelCatalog = DEFAULT_MODEL_CATALOG) {
  let map: ModelRoleMap = { ...roleMap };
  const store: ModelRegistryStore = {
    getModelCatalog: async () => catalog,
    getModelRoleMap: async () => map,
    setModelRoleMap: async (next) => {
      map = next;
    },
  };
  return { store, current: () => map };
}

function fakeApprovalStore() {
  const inserted: unknown[] = [];
  const store: ApprovalStore = {
    insert: vi.fn(async (row) => {
      inserted.push(row);
    }),
    getById: vi.fn(async () => ({ status: "pending" as never, approvalType: "model_upgrade" })),
    update: vi.fn(async () => {}),
  };
  return { store, inserted };
}

describe("validateModelSwap", () => {
  it("accepts a compatible text model for a text role", () => {
    const v = validateModelSwap({ role: "content_strategy", modelId: "openai/gpt-4o-mini", catalog: DEFAULT_MODEL_CATALOG });
    expect(v.ok).toBe(true);
  });

  it("rejects an unknown model", () => {
    const v = validateModelSwap({ role: "content_strategy", modelId: "made-up/model", catalog: DEFAULT_MODEL_CATALOG });
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("not in the catalog");
  });

  it("rejects a modality mismatch (embedding model on a text role)", () => {
    const v = validateModelSwap({ role: "content_strategy", modelId: "openai/text-embedding-3-small", catalog: DEFAULT_MODEL_CATALOG });
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("text-capable");
  });

  it("requires an embedding model for the embeddings role", () => {
    const bad = validateModelSwap({ role: "embeddings", modelId: "openai/gpt-4o-mini", catalog: DEFAULT_MODEL_CATALOG });
    expect(bad.ok).toBe(false);
    const good = validateModelSwap({ role: "embeddings", modelId: "openai/text-embedding-3-small", catalog: DEFAULT_MODEL_CATALOG });
    expect(good.ok).toBe(true);
  });

  it("rejects a deprecated model", () => {
    const catalog: ModelCatalog = [
      { id: "old/model", label: "Old", provider: "openrouter", modalities: ["text"], costTier: "mid", status: "deprecated", goodFor: [] },
    ];
    const v = validateModelSwap({ role: "ask_wobble", modelId: "old/model", catalog });
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("deprecated");
  });
});

describe("model registry service", () => {
  it("swaps a role's model and writes an audit event", async () => {
    const { store, current } = makeStore({ content_strategy: { provider: "openrouter", model: "anthropic/claude-sonnet-4.5" } });
    const audit: AuditEventInput[] = [];

    const result = await setModelForRole(
      { role: "content_strategy", modelId: "openai/gpt-4o-mini", changedBy: "Moiz", reason: "budget mode" },
      { store, recordAudit: async (e) => void audit.push(e), now },
    );

    expect(result.previousModelId).toBe("anthropic/claude-sonnet-4.5");
    expect(current().content_strategy.model).toBe("openai/gpt-4o-mini");
    expect(audit.some((e) => e.eventType === "model_role.changed" && (e.metadata as Record<string, unknown>).toModel === "openai/gpt-4o-mini")).toBe(true);
  });

  it("refuses an incompatible swap instead of silently breaking the role", async () => {
    const { store, current } = makeStore({ content_strategy: { provider: "openrouter", model: "openai/gpt-4o-mini" } });
    await expect(
      setModelForRole({ role: "content_strategy", modelId: "openai/text-embedding-3-small", changedBy: "Moiz" }, { store, recordAudit: async () => {}, now }),
    ).rejects.toThrow(/text-capable/);
    // unchanged
    expect(current().content_strategy.model).toBe("openai/gpt-4o-mini");
  });

  it("proposes an upgrade through approval (offered, not force-fed)", async () => {
    const { store, current } = makeStore({ ask_wobble: { provider: "openrouter", model: "openai/gpt-4o-mini" } });
    const approval = fakeApprovalStore();

    const result = await proposeModelSwap(
      { role: "ask_wobble", toModelId: "openai/gpt-4o", rationale: "Stronger reasoning at acceptable cost", proposedBy: "model_scout", confidence: 0.7 },
      { store, approvalStore: approval.store, recordAudit: async () => {}, now },
    );

    expect(result.fromModelId).toBe("openai/gpt-4o-mini");
    expect(result.toModelId).toBe("openai/gpt-4o");
    expect(approval.inserted).toHaveLength(1);
    // proposal alone must NOT change the live role — approval is required
    expect(current().ask_wobble.model).toBe("openai/gpt-4o-mini");
  });

  it("applies the model swap only after approval", async () => {
    const { store, current } = makeStore({ ask_wobble: { provider: "openrouter", model: "openai/gpt-4o-mini" } });
    await applyModelSwapApproval(
      { approvalId: "approval_1", role: "ask_wobble", toModelId: "openai/gpt-4o", approvedBy: "Moiz" },
      { store, approvalStore: fakeApprovalStore().store, recordAudit: async () => {}, now },
    );
    expect(current().ask_wobble.model).toBe("openai/gpt-4o");
  });
});
