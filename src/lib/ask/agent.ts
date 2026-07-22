import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { runTextProvider, type ProviderChatMessage, type ProviderToolCall } from "@/lib/providers";
import { formatSystemSnapshot, getSystemSnapshot } from "@/lib/system-map";
import { ASK_TOOLS_BY_NAME, runTool, toolSpecs, type ToolContext } from "@/lib/ask-tools";
import { appendMessage, startConversation } from "@/lib/conversations";

/**
 * Ask WOBBLE Orchestrator (tool-calling loop) — the "it does stuff" brain.
 *
 * Offers the toolbox to the model, executes the tools it chooses (through the safe
 * dispatcher), feeds results back, and loops until the model gives a final answer.
 * Hardened by design:
 *  - a hard iteration cap (no runaway loops / cost),
 *  - destructive tools (requiresConfirmation) are NEVER executed without an explicit
 *    founder `confirmActions` — instead the loop stops and asks,
 *  - bad/invalid tool calls return a structured error the model can recover from,
 *  - every mutating action is audited.
 * Fully injectable (provider / snapshot / tool context / audit) so it is testable
 * without an LLM or a DB.
 */

export const askAgentSchema = z.object({
  question: z.string().trim().min(1, "question is required"),
  founder: z.string().trim().min(1).optional(),
  confirmActions: z.boolean().optional(),
  maxIterations: z.number().int().min(1).max(10).optional(),
  maxTokens: z.number().int().min(100).max(1200).optional(),
});

export type AskAgentInput = z.infer<typeof askAgentSchema> & { conversationId?: string };

export interface AskAgentToolTrace {
  tool: string;
  args: unknown;
  ok: boolean;
  mutated: boolean;
  result?: unknown;
  error?: string;
}

export interface AskAgentResult {
  answer: string;
  toolTrace: AskAgentToolTrace[];
  /** The FIRST item awaiting approval — kept for existing callers/UI. */
  pendingConfirmation?: { tool: string; args: unknown; message: string };
  /** EVERY item awaiting approval this turn. A chain can reach several; the founder approves once. */
  pendingConfirmations?: Array<{ tool: string; args: unknown; message: string }>;
  modelRunIds: string[];
  iterations: number;
  stoppedReason: "final" | "needs_confirmation" | "max_iterations";
  conversationId?: string;
}

export interface AskAgentDeps {
  runProvider?: (input: { messages: ProviderChatMessage[]; maxTokens?: number }) => Promise<{ text: string; toolCalls?: ProviderToolCall[]; runId: string }>;
  getSystemSnapshotText?: () => Promise<string | undefined>;
  toolContext?: ToolContext;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
}

/**
 * Step budget for the tool loop.
 *
 * 6/10 was sized for single questions ("how many agents do we have?"). Real founder requests chain:
 * "show closed deals and unsent proposals, generate the missing proposals, invoice two of them, then
 * schedule a post" is easily 8-12 tool calls. At the old ceiling that ran out mid-chain and left a
 * half-finished state with no clear account of what had happened. Raised to give chains room while
 * still bounding a runaway loop — and when the ceiling IS hit we now report exactly what was done.
 */
const DEFAULT_MAX_ITERATIONS = 12;
const HARD_MAX_ITERATIONS = 24;

function buildSystemPrompt(snapshot: string | undefined, confirmActions: boolean): string {
  return [
    "You are WOBBLE OS's command surface for the founders. You can inspect and operate the OS using the provided tools.",
    "Use read tools to answer operational questions and to gather facts BEFORE proposing any change. Never invent counts, names, models, or statuses — get them from a tool.",
    "OS tools: list_agents, list_pending_approvals, get_model_config, list_models.",
    // The agent used to have OS tools only, so business questions got "check with your sales team" —
    // telling the founder to ask the humans this OS replaces. Point it at the business tools explicitly.
    "BUSINESS READ tools: get_business_overview (start here for any 'how are we doing' / 'what should I focus on'), list_deals (pipeline, closest to closing, forecast, deal values), list_leads (follow-ups, best leads), get_finance_summary (overdue, outstanding, cash), list_proposals (what's out with clients), list_sources (what accounts/sources we track, what's pending), get_website_stats.",
    "ACTION tools (these CREATE things): create_lead, run_free_audit, build_proposal_from_audit, create_invoice_draft, generate_content, propose_source, create_task. Every one produces a DRAFT or a PENDING record inside the OS's existing approval + audit guardrails — none of them sends, publishes, or deletes anything. So you may run them when the founder asks, then tell them plainly what was created and where to review it.",
    "You have DIRECT access to the company's live data and to these actions. NEVER tell the founder to contact a sales team, check the CRM, open another tool, or ask a colleague for something you can do or look up yourself — call the tool. If a tool genuinely returns nothing, say the record set is empty rather than deferring to a human.",
    "Chain tools when a request needs it (e.g. 'audit Acme and build a proposal' = run_free_audit then build_proposal_from_audit). Prefer one broad read (get_business_overview) over several narrow ones.",
    // House answer format — the raw model markdown was rendering as literal ** characters in the chat UI.
    "FORMAT your answer for a busy founder: lead with the direct answer in one or two sentences, then at most 5 short bullets starting with '- ', then a single 'Next:' line if action is needed. Use plain sentences. Do NOT use markdown headings (#), tables, bold (**), or italics — the chat renders limited formatting. Never show raw ids unless asked; use names.",
    "To change a model, use propose_model_swap: it creates an APPROVAL for the founder and does not apply anything. Present compatible options and cost before proposing. If the founder's request is ambiguous (which role? which model?), ASK a short clarifying question instead of guessing.",
    "Only use apply_model_upgrade when the founder has explicitly confirmed. Never claim you applied or changed something unless a tool result confirms it.",
    confirmActions
      ? "The founder has authorised applying confirmed actions this turn."
      : "The founder has NOT authorised applying actions this turn; do not attempt irreversible changes — propose them instead.",
    snapshot ? `Current live OS state:\n${snapshot}` : "",
    "When you have enough information, give a concise, direct answer for the founder. Flag anything that needs their decision.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

async function defaultRunProvider(input: { messages: ProviderChatMessage[]; maxTokens?: number }) {
  const result = await runTextProvider({
    role: "ask_wobble",
    module: "ask_wobble",
    messages: input.messages,
    maxTokens: input.maxTokens,
    tools: toolSpecs(),
    toolChoice: "auto",
  });
  return { text: result.text, toolCalls: result.toolCalls, runId: result.run.id };
}

async function defaultSnapshot(): Promise<string | undefined> {
  try {
    return formatSystemSnapshot(await getSystemSnapshot());
  } catch (error) {
    console.error("agent snapshot failed:", error instanceof Error ? error.message : error);
    return undefined;
  }
}

// Conversation logging is best-effort: it must never break an answer (and no-ops
// cleanly in unit tests where there is no DB).
async function ensureConversation(input: AskAgentInput): Promise<string | undefined> {
  if (input.conversationId) return input.conversationId;
  try {
    const conversation = await startConversation({ founderName: input.founder, surface: "ask_wobble", scope: "founder" });
    return conversation.id;
  } catch {
    return undefined;
  }
}

async function logMessage(conversationId: string | undefined, role: "user" | "assistant", content: string): Promise<void> {
  if (!conversationId || !content) return;
  try {
    await appendMessage({ conversationId, role, content });
  } catch {
    /* logging is best-effort */
  }
}

export async function askWobbleAgent(input: AskAgentInput, deps: AskAgentDeps = {}): Promise<AskAgentResult> {
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const runProvider = deps.runProvider ?? defaultRunProvider;
  const getSnapshot = deps.getSystemSnapshotText ?? defaultSnapshot;
  const toolCtx: ToolContext = { actor: input.founder ?? "founder", ...deps.toolContext };
  const maxIterations = Math.min(Math.max(input.maxIterations ?? DEFAULT_MAX_ITERATIONS, 1), HARD_MAX_ITERATIONS);

  const snapshot = await getSnapshot();
  const messages: ProviderChatMessage[] = [
    { role: "system", content: buildSystemPrompt(snapshot, input.confirmActions ?? false) },
    { role: "user", content: input.question },
  ];

  const toolTrace: AskAgentToolTrace[] = [];
  // Every confirm-gated call the model reached this turn, collected rather than aborting on the first.
  const pendingConfirmations: Array<{ tool: string; args: unknown; message: string }> = [];
  const modelRunIds: string[] = [];
  const conversationId = await ensureConversation(input);
  await logMessage(conversationId, "user", input.question);

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const { text, toolCalls, runId } = await runProvider({ messages, maxTokens: input.maxTokens ?? 500 });
    modelRunIds.push(runId);

    if (!toolCalls || toolCalls.length === 0) {
      await recordAudit({
        eventType: "ask.agent.answered",
        module: "ask_wobble",
        entityType: "model_run",
        entityId: runId,
        modelRunId: runId,
        actor: input.founder,
        metadata: { iterations: iteration, toolsUsed: toolTrace.map((t) => t.tool) },
      });
      await logMessage(conversationId, "assistant", text);
      return {
        answer: text,
        toolTrace,
        modelRunIds,
        iterations: iteration,
        // Anything the model wanted to do that needs a human yes is surfaced WITH the finished answer,
        // so the founder sees "here is what I did, and here is the one thing awaiting you" in one place.
        ...(pendingConfirmations.length
          ? { pendingConfirmation: pendingConfirmations[0], pendingConfirmations }
          : {}),
        stoppedReason: pendingConfirmations.length ? "needs_confirmation" : "final",
        conversationId,
      };
    }

    // Assistant turn that issued the tool calls must be recorded before the tool results.
    messages.push({
      role: "assistant",
      content: text || null,
      tool_calls: toolCalls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) } })),
    });

    // Did anything actually RUN this iteration? If a turn produces only blocked calls there is no new
    // information for the model to work with, and letting it loop just burns the step budget
    // re-requesting the same forbidden action — so we stop and hand the founder the approval list.
    let executedThisIteration = 0;

    for (const call of toolCalls) {
      const tool = ASK_TOOLS_BY_NAME[call.name];

      // Confirmation gate: never apply a destructive tool without explicit founder authorisation.
      //
      // It used to RETURN on the first such tool, which broke multi-step work: "draft these three
      // proposals then schedule the post" abandoned the drafts the moment it reached the post. Now the
      // risky call is recorded and SKIPPED while the loop carries on, so every safe step still lands and
      // the founder gets ONE consolidated list of what needs their go-ahead instead of a popup per item.
      if (tool?.requiresConfirmation && !input.confirmActions) {
        const message = `Needs your go-ahead: ${call.name}(${JSON.stringify(call.arguments)}) — NOT applied.`;
        pendingConfirmations.push({ tool: call.name, args: call.arguments, message });
        toolTrace.push({ tool: call.name, args: call.arguments, ok: false, mutated: false, error: "awaiting_founder_confirmation" });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ ok: false, blocked: true, reason: "awaiting_founder_confirmation", note: "Do NOT retry this call. Continue with the remaining work and summarise this as pending the founder's approval." }),
        });
        await recordAudit({
          eventType: "ask.agent.confirmation_required",
          module: "ask_wobble",
          entityType: "tool",
          actor: input.founder,
          metadata: { tool: call.name, args: call.arguments },
        });
        continue;
      }

      const res = await runTool(call.name, call.arguments, toolCtx);
      executedThisIteration += 1;
      toolTrace.push({ tool: call.name, args: call.arguments, ok: res.ok, mutated: res.mutated, result: res.result, error: res.error });

      if (res.mutated && res.ok) {
        await recordAudit({
          eventType: "ask.agent.tool_action",
          module: "ask_wobble",
          entityType: "tool",
          actor: input.founder,
          metadata: { tool: call.name, args: call.arguments },
        });
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(res.ok ? { ok: true, result: res.result } : { ok: false, error: res.error }),
      });
    }

    // Nothing ran and something is waiting on the founder → the turn cannot progress. Return now with
    // everything that WAS applied plus the consolidated approval list, instead of spinning to the cap.
    if (executedThisIteration === 0 && pendingConfirmations.length > 0) {
      const applied = toolTrace.filter((t) => t.mutated && t.ok).map((t) => t.tool);
      const answer = text
        || `${applied.length ? `Done: ${applied.join(", ")}. ` : ""}Waiting on your go-ahead for: ${pendingConfirmations.map((p) => p.tool).join(", ")}.`;
      await logMessage(conversationId, "assistant", answer);
      return {
        answer,
        toolTrace,
        pendingConfirmation: pendingConfirmations[0],
        pendingConfirmations,
        modelRunIds,
        iterations: iteration,
        stoppedReason: "needs_confirmation",
        conversationId,
      };
    }
  }

  await recordAudit({ eventType: "ask.agent.max_iterations", module: "ask_wobble", actor: input.founder, metadata: { iterations: maxIterations } });
  // Running out of steps mid-chain used to say only "ask me to continue", leaving the founder unsure
  // what had actually been created. Account for it explicitly — a half-applied chain must be legible.
  const applied = toolTrace.filter((t) => t.mutated && t.ok).map((t) => t.tool);
  const appliedLine = applied.length
    ? `Already done (these are real and saved): ${applied.join(", ")}.`
    : "Nothing was created or changed.";
  const pendingLine = pendingConfirmations.length
    ? ` Still waiting on your go-ahead: ${pendingConfirmations.map((p) => p.tool).join(", ")}.`
    : "";
  return {
    answer: `I hit the ${maxIterations}-step limit before finishing. ${appliedLine}${pendingLine} Tell me to continue and I'll pick up from here.`,
    toolTrace,
    modelRunIds,
    iterations: maxIterations,
    ...(pendingConfirmations.length ? { pendingConfirmation: pendingConfirmations[0], pendingConfirmations } : {}),
    stoppedReason: "max_iterations",
    conversationId,
  };
}
