import { z } from "zod";
import { newId } from "@/lib/ids";
import { getSystemSnapshot, type SystemMapDeps } from "@/lib/system-map";
import { getModelCatalog, proposeModelSwap, applyModelSwapApproval, type ModelRegistryDeps } from "@/lib/model-registry";
import { MODEL_MODALITIES } from "@/lib/domain/model-registry";
import { approveMemoryUpdate, archiveMemoryRecord, pinMemory, proposeMemoryUpdate, retrieveMemoryContext, type MemoryDeps } from "@/lib/memory";
import { classifyCandidateRouting, founderBankSlug } from "@/lib/domain/conversations";
import { personalBankOwner } from "@/lib/domain/memory";

/**
 * Ask WOBBLE Tool Registry — the safe "toolbox" the orchestrator is allowed to use.
 *
 * This is how Ask WOBBLE gets power WITHOUT ever seeing raw code: each tool is a
 * named, described, schema-validated capability. Read tools expose live system state;
 * action tools change things but ONLY through existing guardrails (validation +
 * approvals + audit). Every tool carries an OpenAI-compatible jsonSchema so the LLM
 * tool-calling loop (next step) can offer them to the model. Tools are dispatched
 * through runTool() which validates args before the handler ever runs.
 */

export interface ToolContext {
  actor?: string;
  systemMapDeps?: SystemMapDeps;
  modelRegistryDeps?: ModelRegistryDeps;
  memoryDeps?: MemoryDeps;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** OpenAI function-calling `parameters` schema — used when we offer tools to the model. */
  jsonSchema: Record<string, unknown>;
  /** Runtime validation of the model-supplied args. */
  argsSchema: z.ZodType<unknown>;
  /** True if the tool changes state at all (proposals count — they queue an approval). */
  mutates: boolean;
  /** True if the tool applies an irreversible/production change and needs explicit founder confirmation. */
  requiresConfirmation: boolean;
  handler: (args: unknown, ctx: ToolContext) => Promise<unknown>;
}

/** Define a tool with full type-safety on its args, erased to the uniform ToolDefinition. */
function defineTool<A>(spec: {
  name: string;
  description: string;
  jsonSchema: Record<string, unknown>;
  argsSchema: z.ZodType<A>;
  mutates: boolean;
  requiresConfirmation?: boolean;
  handler: (args: A, ctx: ToolContext) => Promise<unknown>;
}): ToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    jsonSchema: spec.jsonSchema,
    argsSchema: spec.argsSchema as z.ZodType<unknown>,
    mutates: spec.mutates,
    requiresConfirmation: spec.requiresConfirmation ?? false,
    handler: (args, ctx) => spec.handler(args as A, ctx),
  };
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}

// ---------------------------------------------------------------- read tools

const listAgentsTool = defineTool<{ team?: string; module?: string }>({
  name: "list_agents",
  description: "List the AI agents in the system (optionally filtered by team or module), with what each one does.",
  jsonSchema: objectSchema({
    team: { type: "string", description: "Optional team filter, e.g. 'content', 'intelligence'." },
    module: { type: "string", description: "Optional module filter, e.g. 'content_command'." },
  }),
  argsSchema: z.object({ team: z.string().trim().optional(), module: z.string().trim().optional() }),
  mutates: false,
  handler: async (args, ctx) => {
    const snap = await getSystemSnapshot(ctx.systemMapDeps);
    let list = snap.agents.list;
    if (args.team) list = list.filter((a) => a.team === args.team);
    if (args.module) list = list.filter((a) => a.module === args.module);
    return { total: list.length, agents: list };
  },
});

const listPendingApprovalsTool = defineTool<Record<string, never>>({
  name: "list_pending_approvals",
  description: "Show how many items are waiting on founder approval, broken down by type (content, memory_update, model_upgrade, source, etc).",
  jsonSchema: objectSchema({}),
  argsSchema: z.object({}),
  mutates: false,
  handler: async (_args, ctx) => {
    const snap = await getSystemSnapshot(ctx.systemMapDeps);
    return { pending: snap.approvals.pending, byType: snap.approvals.byType };
  },
});

const getModelConfigTool = defineTool<Record<string, never>>({
  name: "get_model_config",
  description: "Show which model each agent role currently uses.",
  jsonSchema: objectSchema({}),
  argsSchema: z.object({}),
  mutates: false,
  handler: async (_args, ctx) => {
    const snap = await getSystemSnapshot(ctx.systemMapDeps);
    return { roles: snap.models.roles };
  },
});

const listModelsTool = defineTool<{ modality?: (typeof MODEL_MODALITIES)[number] }>({
  name: "list_models",
  description: "List the models in the catalog (optionally filtered by modality) with cost tier, status, and what they're good for.",
  jsonSchema: objectSchema({
    modality: { type: "string", enum: [...MODEL_MODALITIES], description: "Optional: text | vision | image | video | embedding." },
  }),
  argsSchema: z.object({ modality: z.enum(MODEL_MODALITIES).optional() }),
  mutates: false,
  handler: async (args, ctx) => {
    const catalog = await getModelCatalog(ctx.modelRegistryDeps);
    const models = args.modality ? catalog.filter((m) => m.modalities.includes(args.modality!)) : catalog;
    return { total: models.length, models };
  },
});

// -------------------------------------------------------------- action tools

const proposeModelSwapTool = defineTool<{ role: string; toModelId: string; rationale: string; confidence?: number }>({
  name: "propose_model_swap",
  description: "Propose changing the model for an agent role. Creates an APPROVAL for the founder to accept or reject — it is never applied automatically. Validated against the catalog (blocks incompatible models).",
  jsonSchema: objectSchema(
    {
      role: { type: "string", description: "The agent role to change, e.g. 'content_strategy', 'ask_wobble'." },
      toModelId: { type: "string", description: "The catalog model id to switch to, e.g. 'openai/gpt-4o'." },
      rationale: { type: "string", description: "Why this model is a genuine upgrade for this role." },
      confidence: { type: "number", description: "0..1 confidence that this is a real upgrade." },
    },
    ["role", "toModelId", "rationale"],
  ),
  argsSchema: z.object({
    role: z.string().trim().min(1),
    toModelId: z.string().trim().min(1),
    rationale: z.string().trim().min(1),
    confidence: z.number().min(0).max(1).optional(),
  }),
  mutates: true,
  handler: async (args, ctx) => {
    const result = await proposeModelSwap(
      { role: args.role, toModelId: args.toModelId, rationale: args.rationale, confidence: args.confidence ?? 0.6, proposedBy: ctx.actor ?? "ask_wobble" },
      ctx.modelRegistryDeps,
    );
    return { approvalId: result.approval.id, role: result.role, fromModelId: result.fromModelId, toModelId: result.toModelId, status: "pending_approval" };
  },
});

const applyModelUpgradeTool = defineTool<{ approvalId: string; role: string; toModelId: string }>({
  name: "apply_model_upgrade",
  description: "Approve and APPLY a previously proposed model upgrade. Use only when the founder has explicitly confirmed. Validated + audited.",
  jsonSchema: objectSchema(
    {
      approvalId: { type: "string", description: "The approval id of the proposed upgrade." },
      role: { type: "string", description: "The agent role being changed." },
      toModelId: { type: "string", description: "The model id to switch to." },
    },
    ["approvalId", "role", "toModelId"],
  ),
  argsSchema: z.object({ approvalId: z.string().trim().min(1), role: z.string().trim().min(1), toModelId: z.string().trim().min(1) }),
  mutates: true,
  requiresConfirmation: true,
  handler: async (args, ctx) => {
    const result = await applyModelSwapApproval(
      { approvalId: args.approvalId, role: args.role, toModelId: args.toModelId, approvedBy: ctx.actor ?? "founder" },
      ctx.modelRegistryDeps,
    );
    return { role: result.role, previousModelId: result.previousModelId, appliedModelId: result.config.model, status: "applied" };
  },
});

const rememberTool = defineTool<{ fact: string; scope?: "founder" | "company" | "brand" | "client" | "project"; area?: string }>({
  name: "remember",
  description: "Save a durable fact or preference to memory. Personal preferences (scope 'founder') save to THIS founder's own memory bank automatically; anything about WOBBLE brand/company/client is proposed for founder approval. Use for stable facts, not one-off tasks.",
  jsonSchema: objectSchema(
    {
      fact: { type: "string", description: "The durable fact or preference to remember." },
      scope: { type: "string", enum: ["founder", "company", "brand", "client", "project"], description: "'founder' = this person's personal preference (default); 'brand'/'company' = WOBBLE truth (approval-gated)." },
      area: { type: "string", description: "Topic area, e.g. 'content', 'brand', 'strategy'." },
    },
    ["fact"],
  ),
  argsSchema: z.object({
    fact: z.string().trim().min(3),
    scope: z.enum(["founder", "company", "brand", "client", "project"]).optional(),
    area: z.string().trim().min(1).optional(),
  }),
  mutates: true,
  handler: async (args, ctx) => {
    const scope = args.scope ?? "founder";
    const area = args.area ?? "general";
    const routing = classifyCandidateRouting({ content: args.fact, scope, area, confidence: 0.9 }, { founderBankSlug: founderBankSlug(ctx.actor) });
    const { proposal, approval } = await proposeMemoryUpdate(
      {
        proposedMemory: args.fact,
        reason: `Remembered via Ask WOBBLE by ${ctx.actor ?? "founder"}`,
        affectedArea: area,
        suggestedBankSlugs: routing.bankSlugs,
        confidence: 0.9,
        proposedBy: ctx.actor ?? "ask_wobble",
      },
      ctx.memoryDeps,
    );
    if (routing.action === "auto_save") {
      const cleaned = args.fact.replace(/\s+/g, " ").trim();
      await approveMemoryUpdate(
        {
          proposalId: proposal.id,
          approvalId: approval.id,
          approvedBy: ctx.actor ?? "founder",
          slug: `${area.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${newId("h").split("_").pop()!.slice(0, 8)}`,
          title: cleaned.length > 80 ? `${cleaned.slice(0, 79)}…` : cleaned,
          memoryTier: routing.memoryTier,
          trustLevel: routing.trustLevel,
          bankSlugs: routing.bankSlugs,
        },
        ctx.memoryDeps,
      );
      return { status: "saved", bank: routing.bankSlugs[0], scope };
    }
    return { status: "pending_approval", bank: routing.bankSlugs[0], scope, approvalId: approval.id };
  },
});

const searchMemoryTool = defineTool<{ query: string; bank?: string; limit?: number }>({
  name: "search_memory",
  description: "Search WOBBLE's memory semantically to recall facts, preferences, brand rules, decisions. Optionally scope to a bank (e.g. 'founder_moiz', 'brand', 'company').",
  jsonSchema: objectSchema(
    { query: { type: "string" }, bank: { type: "string", description: "Optional bank slug to scope the search." }, limit: { type: "number" } },
    ["query"],
  ),
  argsSchema: z.object({ query: z.string().trim().min(1), bank: z.string().trim().min(1).optional(), limit: z.number().int().min(1).max(10).optional() }),
  mutates: false,
  handler: async (args, ctx) => {
    // Guard: never let a founder read another founder's PERSONAL bank via search.
    if (args.bank) {
      const bankOwner = personalBankOwner(args.bank);
      const actorOwner = personalBankOwner(founderBankSlug(ctx.actor));
      if (bankOwner && bankOwner !== actorOwner) {
        throw new Error(`'${args.bank}' is another founder's personal memory bank and cannot be searched.`);
      }
    }
    const hits = await retrieveMemoryContext(
      { query: args.query, bankSlugs: args.bank ? [args.bank] : undefined, limit: args.limit ?? 5 },
      ctx.memoryDeps,
    );
    return { results: hits.map((h) => ({ recordId: h.memoryRecordId, content: h.content, similarity: Number(h.similarity.toFixed(3)), trust: h.trustLevel })) };
  },
});

const forgetMemoryTool = defineTool<{ recordId: string; reason?: string }>({
  name: "forget_memory",
  description: "Archive (soft-delete) a memory by its record id when the founder asks to forget/remove it. Reversible for 48h.",
  jsonSchema: objectSchema({ recordId: { type: "string" }, reason: { type: "string" } }, ["recordId"]),
  argsSchema: z.object({ recordId: z.string().trim().min(1), reason: z.string().trim().min(1).optional() }),
  mutates: true,
  requiresConfirmation: true,
  handler: async (args, ctx) => {
    await archiveMemoryRecord({ id: args.recordId, archivedBy: ctx.actor ?? "founder", reason: args.reason }, ctx.memoryDeps);
    return { status: "archived", restorableFor: "48h" };
  },
});

const pinMemoryTool = defineTool<{ recordId: string; pinned?: boolean; importance?: number }>({
  name: "pin_memory",
  description: "Pin (or unpin) a memory so it weighs more in recall. pinned defaults to true.",
  jsonSchema: objectSchema({ recordId: { type: "string" }, pinned: { type: "boolean" }, importance: { type: "number" } }, ["recordId"]),
  argsSchema: z.object({ recordId: z.string().trim().min(1), pinned: z.boolean().optional(), importance: z.number().int().min(0).max(10).optional() }),
  mutates: true,
  handler: async (args, ctx) => {
    const pinned = args.pinned ?? true;
    await pinMemory({ id: args.recordId, pinned, importance: args.importance, actor: ctx.actor ?? "founder" }, ctx.memoryDeps);
    return { status: pinned ? "pinned" : "unpinned" };
  },
});

export const ASK_TOOLS: ToolDefinition[] = [
  listAgentsTool,
  listPendingApprovalsTool,
  getModelConfigTool,
  listModelsTool,
  proposeModelSwapTool,
  applyModelUpgradeTool,
  rememberTool,
  searchMemoryTool,
  forgetMemoryTool,
  pinMemoryTool,
];

export const ASK_TOOLS_BY_NAME: Record<string, ToolDefinition> = Object.fromEntries(ASK_TOOLS.map((t) => [t.name, t]));

/** OpenAI-compatible tool specs to offer the model during tool-calling. */
export function toolSpecs(): Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
  return ASK_TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.jsonSchema } }));
}

export interface RunToolResult {
  ok: boolean;
  tool: string;
  mutated: boolean;
  result?: unknown;
  error?: string;
}

/** Validate args and dispatch a tool. Never throws — returns a structured result the loop can feed back to the model. */
export async function runTool(name: string, rawArgs: unknown, ctx: ToolContext = {}): Promise<RunToolResult> {
  const tool = ASK_TOOLS_BY_NAME[name];
  if (!tool) return { ok: false, tool: name, mutated: false, error: `Unknown tool '${name}'.` };
  const parsed = tool.argsSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return { ok: false, tool: name, mutated: false, error: `Invalid arguments for '${name}': ${parsed.error.issues.map((i) => i.message).join("; ")}` };
  }
  try {
    const result = await tool.handler(parsed.data, ctx);
    return { ok: true, tool: name, mutated: tool.mutates, result };
  } catch (error) {
    return { ok: false, tool: name, mutated: tool.mutates, error: error instanceof Error ? error.message : String(error) };
  }
}
