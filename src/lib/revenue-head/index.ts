import { z } from "zod";
import { askWobbleAgent, type AskAgentResult } from "@/lib/ask/agent";
import { ASK_TOOLS, ASK_TOOLS_BY_NAME, toolSpecs, type ToolContext, type ToolDefinition } from "@/lib/ask-tools";
import { runTextProvider } from "@/lib/providers";
import { HOUSE_STYLE_PROMPT } from "@/lib/domain/house-style";
import { getClientIntakeContext } from "@/lib/intake/context";
import { getCommercialJourney } from "@/lib/commercial-journey";
import { getStoredQuestionSet } from "@/lib/call-questions";
import { revisionRequestSchema } from "@/lib/domain/founder-revision";
import { reviseProposalFromInstruction } from "@/lib/proposals/founder-revision";
import { runQualification } from "@/lib/qualification";
import { generateCallQuestions } from "@/lib/call-questions";
import { moveOpportunityStage, updateOpportunity, listOpportunities, addContact } from "@/lib/crm";
import { PIPELINE_STAGES } from "@/lib/domain/crm";

/**
 * Head of Revenue and CRM.
 *
 * Not a second Ask WOBBLE. Ask WOBBLE is a generalist across 45 modules; a head carries ONE
 * department's judgment, its service menu, its escalation rules and a narrow tool set. That narrowness
 * is deliberate and load-bearing: tool-selection accuracy degrades as the count grows, and every tool
 * offered is re-billed on every call, so a head with the right dozen tools outperforms a generalist
 * with forty.
 *
 * It runs on the SAME agent loop as Ask WOBBLE (tool calling, confirmation gating, audit trail). Only
 * the persona and the tool set differ.
 *
 * Hard boundaries, matching the department's declared governance: it prepares, the founder releases. It
 * never sends a message, never moves money, and never replaces a live artifact without the founder
 * seeing the diff.
 */

export const REVENUE_HEAD_MODULE = "revenue_head";
export const REVENUE_HEAD_AGENT = "revenue_head";

/** Tools the head inherits from the shared registry: everything commercial, nothing else. */
const INHERITED_TOOL_NAMES = [
  "list_deals",
  "list_leads",
  "list_proposals",
  "get_finance_summary",
  "get_business_overview",
  "create_lead",
  "run_free_audit",
  "build_proposal_from_audit",
  "create_invoice_draft",
  "create_task",
  "search_memory",
  "remember",
];

// ---------------------------------------------------------------- head-only tools

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}

function tool<A>(spec: {
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

/** Everything the OS knows about one client, in the shape the head reasons over. */
async function readClient(companyId: string) {
  const [journey, intake, questions] = await Promise.all([
    getCommercialJourney(companyId).catch(() => null),
    getClientIntakeContext(companyId).catch(() => ({ snapshots: [] })),
    getStoredQuestionSet(companyId).catch(() => null),
  ]);
  const snap = intake.snapshots[0];
  return {
    company: journey?.company ?? null,
    stage: journey?.stage ?? null,
    qualification: journey?.qualification ?? null,
    openDeals: journey?.opportunities ?? [],
    audits: journey?.paidTransformationAudits ?? [],
    proposals: journey?.proposals ?? [],
    meetings: journey?.meetings?.length ?? 0,
    approvedFindings: journey?.discoveryFactCount ?? 0,
    whatTheyToldUs: snap
      ? {
          painPoints: snap.painPoints,
          focusAreas: snap.focusAreas,
          currentTools: snap.currentTools,
          urgency: snap.urgency,
          openToPaidAudit: snap.openToPaidAudit,
          teamSize: snap.teamSize,
          market: snap.cityMarket,
          wantsFromCall: snap.whatMakesCallUseful,
        }
      : null,
    hasQuestionSet: Boolean(questions),
  };
}

const HEAD_TOOLS: ToolDefinition[] = [
  tool({
    name: "read_client",
    description: "Read EVERYTHING the OS holds on one client: their form answers in their own words, qualification grade, deals, audits, proposals, approved call findings. Use this before answering anything about a specific client.",
    jsonSchema: objectSchema({ companyId: { type: "string", description: "The client's company id" } }, ["companyId"]),
    argsSchema: z.object({ companyId: z.string().trim().min(1) }),
    mutates: false,
    handler: async ({ companyId }) => readClient(companyId),
  }),
  tool({
    name: "revise_proposal",
    description: "Change a proposal by describing the change in plain words (for example: drop the reporting module, move the retainer to monthly, make the ROI conservative). Produces a NEW version; the previous one is kept and nothing is sent.",
    jsonSchema: objectSchema(
      { proposalId: { type: "string" }, instruction: { type: "string", description: "What to change, in the founder's words" } },
      ["proposalId", "instruction"],
    ),
    argsSchema: z.object({ proposalId: z.string().trim().min(1), instruction: z.string().trim().min(8) }),
    mutates: true,
    // A revision costs a model call and creates a client-facing artifact, so the founder authorises it.
    requiresConfirmation: true,
    handler: async ({ proposalId, instruction }, ctx) => {
      const parsed = revisionRequestSchema.parse({ instruction });
      const r = await reviseProposalFromInstruction(proposalId, parsed, ctx.actor ?? "revenue_head");
      return { newProposalId: r.newProposalId, scope: r.scope, reusedSynthesis: r.reusedSynthesis, summary: r.summary };
    },
  }),
  tool({
    name: "qualify_client",
    description: "Run the 8-agent qualification council on a client and return the grade, the weakest filter and each agent's reasoning.",
    jsonSchema: objectSchema({ companyId: { type: "string" } }, ["companyId"]),
    argsSchema: z.object({ companyId: z.string().trim().min(1) }),
    mutates: true,
    handler: async ({ companyId }, ctx) => {
      const { assessment, roles } = await runQualification(companyId, { actor: ctx.actor ?? "revenue_head" });
      return { grade: assessment.grade, score: assessment.overallScore, recommendation: assessment.recommendation, roles: roles.map((r) => ({ role: r.role, score: r.score, rationale: r.rationale })) };
    },
  }),
  tool({
    name: "generate_call_questions",
    description: "Write the questions for this client's next call, from their form answers and approved findings. Returns the opening line and the question set.",
    jsonSchema: objectSchema({ companyId: { type: "string" } }, ["companyId"]),
    argsSchema: z.object({ companyId: z.string().trim().min(1) }),
    mutates: true,
    handler: async ({ companyId }, ctx) => {
      const set = await generateCallQuestions(companyId, { actor: ctx.actor ?? "revenue_head" });
      return { opening: set.opening, questions: set.questions.map((q) => q.question), gaps: set.gaps };
    },
  }),
  tool({
    name: "move_deal_stage",
    description: `Move a deal to a different pipeline stage. Valid stages: ${PIPELINE_STAGES.join(", ")}.`,
    jsonSchema: objectSchema({ opportunityId: { type: "string" }, stage: { type: "string" }, reason: { type: "string" } }, ["opportunityId", "stage"]),
    argsSchema: z.object({ opportunityId: z.string().trim().min(1), stage: z.enum(PIPELINE_STAGES), reason: z.string().trim().optional() }),
    mutates: true,
    // Moving a deal to won fires invoicing and delivery, so every stage move is authorised.
    requiresConfirmation: true,
    handler: async ({ opportunityId, stage, reason }, ctx) => {
      const moved = await moveOpportunityStage(opportunityId, stage, { actor: ctx.actor ?? "revenue_head", reason });
      return moved ? { id: moved.id, stage: moved.stage, status: moved.status } : { error: "deal not found" };
    },
  }),
  tool({
    name: "set_deal_value",
    description: "Set what a deal is worth, in whole currency units (not cents). Use when a price is agreed or revised.",
    jsonSchema: objectSchema({ opportunityId: { type: "string" }, amount: { type: "number" }, currency: { type: "string" } }, ["opportunityId", "amount"]),
    argsSchema: z.object({ opportunityId: z.string().trim().min(1), amount: z.number().min(0), currency: z.string().trim().default("USD") }),
    mutates: true,
    // Money. The head proposes a number, the founder sets it.
    requiresConfirmation: true,
    handler: async ({ opportunityId, amount, currency }) => {
      const ok = await updateOpportunity(opportunityId, { valueCents: Math.round(amount * 100), currency });
      return ok ? { opportunityId, valueCents: Math.round(amount * 100), currency } : { error: "deal not found" };
    },
  }),
  tool({
    name: "add_contact",
    description: "Add a person to a client, for example the second decision maker met on a call.",
    jsonSchema: objectSchema(
      { companyId: { type: "string" }, fullName: { type: "string" }, role: { type: "string" }, email: { type: "string" }, phone: { type: "string" } },
      ["companyId", "fullName"],
    ),
    argsSchema: z.object({ companyId: z.string().trim().min(1), fullName: z.string().trim().min(1), role: z.string().trim().optional(), email: z.string().trim().optional(), phone: z.string().trim().optional() }),
    mutates: true,
    handler: async ({ companyId, fullName, role, email, phone }) => {
      const c = await addContact({ companyId, fullName, role, email, phone, leadSource: "revenue_head" });
      return { id: c.id, fullName: c.fullName };
    },
  }),
  tool({
    name: "list_stalled_deals",
    description: "Find open deals that have not moved recently, so the head can say which clients need attention today.",
    jsonSchema: objectSchema({ daysStalled: { type: "number", description: "How many days without a stage move counts as stalled (default 7)" } }),
    argsSchema: z.object({ daysStalled: z.number().int().min(1).max(120).default(7) }),
    mutates: false,
    handler: async ({ daysStalled }) => {
      const deals = await listOpportunities({ status: "open", limit: 500 });
      const cutoff = Date.now() - daysStalled * 86_400_000;
      return deals
        .filter((d) => new Date(d.updatedAt).getTime() < cutoff)
        .map((d) => ({ id: d.id, name: d.name, stage: d.stage, companyId: d.companyId, daysSinceMove: Math.floor((Date.now() - new Date(d.updatedAt).getTime()) / 86_400_000), valueCents: d.valueCents }))
        .sort((a, b) => b.daysSinceMove - a.daysSinceMove)
        .slice(0, 25);
    },
  }),
];

export const REVENUE_HEAD_TOOLS: ToolDefinition[] = [
  ...INHERITED_TOOL_NAMES.map((n) => ASK_TOOLS_BY_NAME[n]).filter(Boolean),
  ...HEAD_TOOLS,
];

// ---------------------------------------------------------------- persona

function revenueHeadPrompt(snapshot: string | undefined, confirmActions: boolean): string {
  return [
    "You are the HEAD OF REVENUE AND CRM at WOBBLE, an AI-OS consultancy. You run this department for the founders.",
    "",
    "You are not a search box. You hold an opinion and you say it, in one or two lines, before or after you act.",
    "If a founder asks for something you think loses the deal, do it and say why you would not have.",
    "",
    "How you work:",
    "- ALWAYS read the client before talking about them. Never guess a name, number, stage or price.",
    "- Their own words from the readiness form are your strongest evidence. Quote them back.",
    "- Chase countable reality. 'They are keen' is worthless; 'open to a paid audit, wants it before Ramadan, ten weeks' is not.",
    "- When a client objected to something, the answer must address that objection, not talk around it.",
    "",
    "Answering rules, these are not style preferences:",
    "- QUOTE them. If you know what the client wrote or said, put it in quotation marks in your answer.",
    "- Name the SPECIFIC risk, never the category. \"They may not see the value\" is useless. \"They bought a",
    "  PKR 400k system last year that nobody used because it did not touch WhatsApp, so anything that",
    "  looks like another dashboard dies\" is the answer.",
    "- Cite the state you actually read: the stage, the grade, the weakest qualification filter, how many",
    "  findings are approved, whether a proposal exists. If you did not read it, do not claim it.",
    "- Lead with the single next action, then the reasoning. Never open with a summary of what you did.",
    "",
    "Hard boundaries you never cross, whatever you are asked:",
    "- You PREPARE, the founder RELEASES. You never send an email, message or proposal to a client.",
    "- You never move money. You may draft an invoice; a human issues it.",
    "- You never replace a live artifact silently. A revision creates a NEW version and the founder sees what changed.",
    "- You propose prices, you do not set them. Say the number and your reasoning, then let the founder decide.",
    "- Act on the client in front of you. Before doing anything across MANY clients at once, say what you intend and ask first.",
    "",
    confirmActions
      ? "Confirmation is ON: a gated action is proposed for approval instead of executed. Say plainly what you would do and why."
      : "Gated actions still require founder authorisation; everything else you may just do.",
    "",
    HOUSE_STYLE_PROMPT,
    snapshot ? `\nCurrent OS state:\n${snapshot}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface RevenueHeadInput {
  question: string;
  founder?: string;
  /** The client the founder currently has open, so "this client" resolves without an id. */
  companyId?: string | null;
  conversationId?: string;
  confirmActions?: boolean;
}

/** Ask the head. Same loop, same audit trail, same confirmation gating as Ask WOBBLE. */
export async function askRevenueHead(input: RevenueHeadInput): Promise<AskAgentResult> {
  // Bind the open client into the question so "this client" and "their proposal" resolve without the
  // founder pasting ids around.
  const scoped = input.companyId
    ? `${input.question}\n\n[The founder currently has client ${input.companyId} open. "this client", "them" and "their" refer to it.]`
    : input.question;

  return askWobbleAgent(
    { question: scoped, founder: input.founder, conversationId: input.conversationId, confirmActions: input.confirmActions, maxTokens: 900 },
    {
      tools: REVENUE_HEAD_TOOLS,
      systemPrompt: revenueHeadPrompt,
      auditModule: REVENUE_HEAD_MODULE,
      toolContext: { actor: input.founder ?? "founder" },
      // Offer only this department's tools to the model, so the narrow set is real and not cosmetic.
      runProvider: async ({ messages, maxTokens }) => {
        const r = await runTextProvider({
          role: "revenue_head",
          module: REVENUE_HEAD_MODULE,
          messages,
          maxTokens,
          tools: toolSpecs(REVENUE_HEAD_TOOLS),
          toolChoice: "auto",
          usageContext: { agentSlug: REVENUE_HEAD_AGENT, module: REVENUE_HEAD_MODULE },
        });
        return { text: r.text, toolCalls: r.toolCalls, runId: r.run.id };
      },
    },
  );
}

/** Exported for the registry-integrity guard and for tests. */
export const REVENUE_HEAD_TOOL_NAMES = REVENUE_HEAD_TOOLS.map((t) => t.name);
export { ASK_TOOLS };
