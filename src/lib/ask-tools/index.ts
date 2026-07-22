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

// ---------------------------------------------------------------- business read tools
//
// Every tool above inspects the OS ITSELF (agents, models, memory, approvals). None could look at the
// company. So asked "which deals are closest to closing?" the agent had nothing to call and fell back to
// "check with your sales team" — advising the founder to ask the humans it is supposed to replace.
// These read-only tools give it the commercial picture.

const listDealsTool = defineTool<{ stage?: string; status?: string; limit?: number }>({
  name: "list_deals",
  description: "List CRM deals/opportunities with their pipeline stage, value and company — use this for ANY question about the pipeline, what is closest to closing, deal values, forecast, or what to chase today. Never tell the founder to ask a sales team; call this instead.",
  jsonSchema: objectSchema({
    stage: { type: "string", description: "Optional pipeline stage filter, e.g. 'negotiation', 'proposal_sent', 'qualified'." },
    status: { type: "string", description: "Optional status filter: open | won | lost | archived. Defaults to all." },
    limit: { type: "number", description: "Max deals to return (default 100)." },
  }),
  argsSchema: z.object({ stage: z.string().trim().optional(), status: z.string().trim().optional(), limit: z.number().int().min(1).max(500).optional() }),
  mutates: false,
  handler: async (args) => {
    const { listOpportunities, listCompanies } = await import("@/lib/crm");
    const [opps, companies] = await Promise.all([listOpportunities({ limit: args.limit ?? 100 }), listCompanies({ limit: 300 })]);
    const nameOf = new Map(companies.map((c) => [c.id, c.name]));
    let list = opps;
    if (args.stage) list = list.filter((o) => o.stage === args.stage);
    if (args.status) list = list.filter((o) => o.status === args.status);
    const sorted = [...list].sort((a, b) => b.valueCents - a.valueCents);
    return {
      total: sorted.length,
      totalValueUsd: sorted.reduce((s, o) => s + o.valueCents, 0) / 100,
      deals: sorted.map((o) => ({ name: o.name, company: nameOf.get(o.companyId) ?? null, stage: o.stage, status: o.status, valueUsd: o.valueCents / 100, expectedCloseAt: o.expectedCloseAt, nextAction: o.nextAction ?? null })),
    };
  },
});

const listLeadsTool = defineTool<{ limit?: number }>({
  name: "list_leads",
  description: "List CRM leads awaiting qualification/conversion, with their score and source. Use for 'who should I follow up with', 'best leads', or lead-volume questions.",
  jsonSchema: objectSchema({ limit: { type: "number", description: "Max leads (default 100)." } }),
  argsSchema: z.object({ limit: z.number().int().min(1).max(300).optional() }),
  mutates: false,
  handler: async (args) => {
    const { listLeads } = await import("@/lib/crm");
    const leads = await listLeads({ limit: args.limit ?? 100 });
    const open = leads.filter((l) => l.status !== "converted");
    return {
      total: leads.length,
      open: open.length,
      leads: [...open].sort((a, b) => b.score - a.score).map((l) => ({ name: l.name, score: l.score, status: l.status, source: l.source ?? null })),
    };
  },
});

const financeSummaryTool = defineTool<Record<string, never>>({
  name: "get_finance_summary",
  description: "Invoices and cash position: overdue count/amount, total outstanding, and paid totals. Use for 'who owes us', 'what's overdue', revenue or cash questions.",
  jsonSchema: objectSchema({}),
  argsSchema: z.object({}),
  mutates: false,
  handler: async () => {
    const { listInvoices } = await import("@/lib/finance");
    const invoices = await listInvoices({ limit: 500 });
    const now = Date.now();
    const openish = invoices.filter((i) => !["paid", "cancelled", "draft"].includes(i.status));
    const overdue = openish.filter((i) => i.dueDate != null && i.dueDate.getTime() < now && i.totalCents - i.amountPaidCents > 0);
    return {
      totalInvoices: invoices.length,
      overdueCount: overdue.length,
      overdueUsd: overdue.reduce((s, i) => s + (i.totalCents - i.amountPaidCents), 0) / 100,
      outstandingUsd: openish.reduce((s, i) => s + (i.totalCents - i.amountPaidCents), 0) / 100,
      paidUsd: invoices.reduce((s, i) => s + i.amountPaidCents, 0) / 100,
      overdue: overdue.map((i) => ({ number: i.invoiceNumber, dueDate: i.dueDate, openUsd: (i.totalCents - i.amountPaidCents) / 100 })),
    };
  },
});

const listProposalsTool = defineTool<{ status?: string }>({
  name: "list_proposals",
  description: "List proposals with status (draft/sent/viewed/approved/accepted/expired). Use for 'what proposals are out', 'what's awaiting client response'.",
  jsonSchema: objectSchema({ status: { type: "string", description: "Optional status filter." } }),
  argsSchema: z.object({ status: z.string().trim().optional() }),
  mutates: false,
  handler: async (args) => {
    const { listProposals } = await import("@/lib/proposals");
    const rows = await listProposals({ status: args.status, limit: 200 });
    return { total: rows.length, proposals: rows.map((p) => ({ title: p.title, status: p.status, valueUsd: p.pricingCents / 100, sentAt: p.sentAt })) };
  },
});

const businessOverviewTool = defineTool<Record<string, never>>({
  name: "get_business_overview",
  description: "One-call snapshot of the whole commercial position: open/won deals with values by stage, top leads, invoice/cash position and open proposals. Call this FIRST for any broad 'how are we doing', 'what should I focus on today', or status question.",
  jsonSchema: objectSchema({}),
  argsSchema: z.object({}),
  mutates: false,
  handler: async (_args, ctx) => {
    const snap = await getSystemSnapshot(ctx.systemMapDeps);
    return snap.business ?? { note: "no database configured — business state unavailable" };
  },
});

// ------------------------------------------------------- intelligence / source reads

const listSourcesTool = defineTool<{ status?: string; targetType?: string }>({
  name: "list_sources",
  description: "List the research sources / tracked accounts the OS monitors (competitor accounts, creator accounts, sites, queries) with approval status, cadence and when each was last checked. Use for 'what are we tracking', 'how many sources', 'is anything new', 'are we still watching X'.",
  jsonSchema: objectSchema({
    status: { type: "string", description: "Optional approval filter: pending | approved | rejected." },
    targetType: { type: "string", description: "Optional type filter, e.g. 'competitor_account', 'creator_account'." },
  }),
  argsSchema: z.object({ status: z.string().trim().optional(), targetType: z.string().trim().optional() }),
  mutates: false,
  handler: async (args) => {
    const { listResearchTargets } = await import("@/lib/intelligence");
    const rows = await listResearchTargets({ limit: 300 });
    let list = rows;
    if (args.status) list = list.filter((r) => r.approvalStatus === args.status);
    if (args.targetType) list = list.filter((r) => r.targetType === args.targetType);
    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.approvalStatus] = (byStatus[r.approvalStatus] ?? 0) + 1;
    return {
      total: rows.length,
      byApprovalStatus: byStatus,
      sources: list.map((r) => ({ id: r.id, name: r.name, type: r.targetType, platform: r.platform, handleOrUrl: r.handleOrUrl, approvalStatus: r.approvalStatus, cadence: r.cadence, lastCheckedAt: r.lastCheckedAt, trustLevel: r.trustLevel })),
    };
  },
});

const proposeSourceTool = defineTool<{ name: string; targetType: string; handleOrUrl?: string; platform?: string; reason: string; evidence: string[]; expectedValue: string; collectionMethod?: string }>({
  name: "propose_source",
  description: "Propose a NEW research source / account to track. Creates it PENDING the founder's approval — never active immediately. Use when asked to 'track', 'add', 'start watching' an account, competitor or site.",
  jsonSchema: objectSchema(
    {
      name: { type: "string", description: "Human name of the source, e.g. 'Jao Roberts'." },
      targetType: { type: "string", description: "competitor_account | creator_account | website | search_query | publication (see the OS's research target types)." },
      handleOrUrl: { type: "string", description: "The @handle or URL to monitor." },
      platform: { type: "string", description: "instagram | linkedin | youtube | web …" },
      reason: { type: "string", description: "Why this source is worth tracking." },
      evidence: { type: "array", items: { type: "string" }, description: "At least one concrete piece of evidence justifying it." },
      expectedValue: { type: "string", description: "What the OS expects to learn from it." },
      collectionMethod: { type: "string", description: "How it would be collected, e.g. 'apify instagram scraper'." },
    },
    ["name", "targetType", "reason", "evidence", "expectedValue"],
  ),
  argsSchema: z.object({
    name: z.string().trim().min(1),
    targetType: z.string().trim().min(1),
    handleOrUrl: z.string().trim().optional(),
    platform: z.string().trim().optional(),
    reason: z.string().trim().min(1),
    evidence: z.array(z.string().trim().min(1)).min(1),
    expectedValue: z.string().trim().min(1),
    collectionMethod: z.string().trim().optional(),
  }),
  mutates: true,
  handler: async (args, ctx) => {
    const { proposeResearchSource } = await import("@/lib/intelligence");
    const row = await proposeResearchSource({
      targetType: args.targetType as never,
      name: args.name,
      platform: args.platform,
      handleOrUrl: args.handleOrUrl,
      addedBy: ctx.actor ?? "ask_wobble",
      proposal: {
        reason: args.reason,
        evidence: args.evidence,
        expectedValue: args.expectedValue,
        collectionMethod: args.collectionMethod ?? "manual",
      },
    });
    return { sourceId: row.id, name: row.name, approvalStatus: row.approvalStatus, note: "created PENDING your approval — it is not being collected yet" };
  },
});

// ------------------------------------------------------- business ACTION tools
//
// Everything here creates a DRAFT or a PENDING record inside the existing guardrails (validation +
// approval + audit). Nothing here sends, publishes, or deletes — those stay confirm-gated surfaces in
// their own modules, so the agent can never quietly ship something to a client.

const createLeadTool = defineTool<{ name: string; contactName?: string; email?: string; phone?: string; companyName?: string; industry?: string; source?: string; problemStated?: string }>({
  name: "create_lead",
  description: "Capture a NEW lead in the CRM. It is scored automatically and lands in the New Lead stage for qualification. Use when the founder says 'add a lead', 'log this prospect', 'someone reached out'.",
  jsonSchema: objectSchema(
    {
      name: { type: "string", description: "Lead label — usually the company name." },
      contactName: { type: "string" }, email: { type: "string" }, phone: { type: "string" },
      companyName: { type: "string" }, industry: { type: "string" },
      source: { type: "string", description: "manual | referral | inbound | cold_email | instagram | linkedin | website_form | whatsapp" },
      problemStated: { type: "string", description: "The problem the prospect described, in their words." },
    },
    ["name"],
  ),
  argsSchema: z.object({
    name: z.string().trim().min(1), contactName: z.string().trim().optional(), email: z.string().trim().optional(),
    phone: z.string().trim().optional(), companyName: z.string().trim().optional(), industry: z.string().trim().optional(),
    source: z.string().trim().optional(), problemStated: z.string().trim().optional(),
  }),
  mutates: true,
  handler: async (args, ctx) => {
    const { addLead } = await import("@/lib/crm");
    // The model usually supplies only `name` ("a lead for Skyline Interiors"), which left companyName
    // blank on the row and starved the scorer. Default the company from the label so the CRM record is
    // complete and scoreable rather than a bare string.
    const lead = await addLead({
      ...args,
      companyName: args.companyName ?? args.name,
      source: args.source ?? "manual",
      createdBy: ctx.actor ?? "ask_wobble",
    } as never);
    return { leadId: lead.id, name: lead.name, company: lead.companyName ?? args.name, score: lead.score, status: lead.status, note: "captured in the CRM — it appears in the New Lead column of the pipeline" };
  },
});

const runFreeAuditTool = defineTool<{ businessName: string; industry?: string; problems?: string[] }>({
  name: "run_free_audit",
  description: "Run the free/quick AI-readiness audit for a business and persist the report. Returns the audit id, its opportunities and estimated upside. Use for 'audit X', 'quick diagnosis for X'.",
  jsonSchema: objectSchema(
    { businessName: { type: "string" }, industry: { type: "string" }, problems: { type: "array", items: { type: "string" }, description: "Known pain points, if the founder stated any." } },
    ["businessName"],
  ),
  argsSchema: z.object({ businessName: z.string().trim().min(1), industry: z.string().trim().optional(), problems: z.array(z.string().trim().min(1)).optional() }),
  mutates: true,
  handler: async (args) => {
    const { runFreeAudit } = await import("@/lib/free-audit");
    const audit = await runFreeAudit({ businessName: args.businessName, industry: args.industry, problems: args.problems ?? [] } as never);
    return { auditId: audit.id, businessName: audit.businessName, kind: audit.kind, note: "audit stored — you can build a proposal from it with build_proposal_from_audit" };
  },
});

const buildProposalFromAuditTool = defineTool<{ auditId: string }>({
  name: "build_proposal_from_audit",
  description: "Turn an existing audit into a DRAFT proposal (scope + pricing derived from the audit's findings). The proposal is created as a draft for founder review — it is NOT sent. Use for 'build a proposal from that audit'.",
  jsonSchema: objectSchema({ auditId: { type: "string", description: "The audit id to build from." } }, ["auditId"]),
  argsSchema: z.object({ auditId: z.string().trim().min(1) }),
  mutates: true,
  handler: async (args, ctx) => {
    const { createProposalFromAudit } = await import("@/lib/proposals");
    const proposal = await createProposalFromAudit(args.auditId, { createdBy: ctx.actor ?? "ask_wobble" });
    if (!proposal) return { created: false, note: "no audit found with that id" };
    return { created: true, proposalId: proposal.id, title: proposal.title, status: proposal.status, valueUsd: proposal.pricingCents / 100, note: "DRAFT created — review and send it from the Proposals module" };
  },
});

const createInvoiceDraftTool = defineTool<{ description: string; amountUsd: number; companyId?: string; dueInDays?: number }>({
  name: "create_invoice_draft",
  description: "Create a DRAFT invoice. Drafts are never sent — the founder approves and sends from the Invoices module. Use for 'invoice X for Y'.",
  jsonSchema: objectSchema(
    { description: { type: "string" }, amountUsd: { type: "number" }, companyId: { type: "string" }, dueInDays: { type: "number", description: "Payment terms in days (default 14)." } },
    ["description", "amountUsd"],
  ),
  argsSchema: z.object({ description: z.string().trim().min(1), amountUsd: z.number().min(0), companyId: z.string().trim().optional(), dueInDays: z.number().int().min(0).max(365).optional() }),
  mutates: true,
  handler: async (args, ctx) => {
    const { createInvoice } = await import("@/lib/finance");
    const inv = await createInvoice({
      companyId: args.companyId,
      lineItems: [{ description: args.description, quantity: 1, unitPriceCents: Math.round(args.amountUsd * 100) }],
      dueDate: new Date(Date.now() + (args.dueInDays ?? 14) * 86_400_000),
      createdBy: ctx.actor ?? "ask_wobble",
    } as never);
    return { invoiceId: inv.id, number: inv.invoiceNumber, status: inv.status, totalUsd: inv.totalCents / 100, note: "DRAFT — approve and send it from the Invoices module" };
  },
});

const generateContentTool = defineTool<{ objective: string; contentTrackId?: string; platforms?: string[] }>({
  name: "generate_content",
  description: "Kick off the content team to produce content packets for an objective. Runs as a background job and lands in Content Command for approval — it does NOT publish. Use for 'write posts about X', 'make content for Y'.",
  jsonSchema: objectSchema(
    { objective: { type: "string", description: "What the content should achieve." }, contentTrackId: { type: "string", description: "Which content track/brand. Defaults to the WOBBLE company track." }, platforms: { type: "array", items: { type: "string" } } },
    ["objective"],
  ),
  argsSchema: z.object({ objective: z.string().trim().min(1), contentTrackId: z.string().trim().optional(), platforms: z.array(z.string().trim()).optional() }),
  mutates: true,
  handler: async (args, ctx) => {
    const { enqueueContentGenerationJob } = await import("@/lib/content-worker");
    const res = await enqueueContentGenerationJob({
      contentTrackId: args.contentTrackId ?? "track_wobble_company",
      objective: args.objective,
      platformFocus: (args.platforms ?? []) as never,
      requestedBy: ctx.actor ?? "ask_wobble",
    } as never);
    return { queued: true, job: res, note: "content team started — drafts will appear in Content Command for your approval" };
  },
});

const websiteStatsTool = defineTool<{ period?: string }>({
  name: "get_website_stats",
  description: "Live website analytics (visitors, pageviews, sources) for a period. Reports honestly if analytics is not configured rather than inventing numbers.",
  jsonSchema: objectSchema({ period: { type: "string", description: "e.g. '7d', '30d' (default 30d)." } }),
  argsSchema: z.object({ period: z.string().trim().optional() }),
  mutates: false,
  handler: async (args) => {
    const { getWebstats } = await import("@/lib/analytics/plausible");
    return getWebstats(args.period ?? "30d");
  },
});

const createTaskTool = defineTool<{ title: string; details?: string; dueInDays?: number; owner?: string }>({
  name: "create_task",
  description: "Create a task in Delivery & Ops so a commitment is not lost. Use for 'remind me to…', 'add a task…', or to capture a follow-up you just agreed.",
  jsonSchema: objectSchema({ title: { type: "string" }, details: { type: "string" }, dueInDays: { type: "number" }, owner: { type: "string" } }, ["title"]),
  argsSchema: z.object({ title: z.string().trim().min(1), details: z.string().trim().optional(), dueInDays: z.number().int().min(0).max(365).optional(), owner: z.string().trim().optional() }),
  mutates: true,
  handler: async (args, ctx) => {
    const { addTask } = await import("@/lib/tasks");
    const task = await addTask({
      title: args.title, details: args.details,
      dueAt: args.dueInDays != null ? new Date(Date.now() + args.dueInDays * 86_400_000) : undefined,
      owner: args.owner ?? ctx.actor, createdBy: ctx.actor ?? "ask_wobble",
    } as never);
    return { taskId: (task as { id: string }).id, title: args.title };
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
  // business reads — so the agent can answer about the COMPANY, not just about itself
  businessOverviewTool,
  listDealsTool,
  listLeadsTool,
  financeSummaryTool,
  listProposalsTool,
  listSourcesTool,
  websiteStatsTool,
  // actions — all create DRAFTS or PENDING records inside existing guardrails; none send or publish
  createLeadTool,
  runFreeAuditTool,
  buildProposalFromAuditTool,
  createInvoiceDraftTool,
  generateContentTool,
  proposeSourceTool,
  createTaskTool,
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
