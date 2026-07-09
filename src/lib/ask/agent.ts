import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { runTextProvider, type ProviderChatMessage, type ProviderToolCall } from "@/lib/providers";
import { formatSystemSnapshot, getSystemSnapshot } from "@/lib/system-map";
import { ASK_TOOLS_BY_NAME, runTool, toolSpecs, type ToolContext } from "@/lib/ask-tools";

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

export type AskAgentInput = z.infer<typeof askAgentSchema>;

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
  pendingConfirmation?: { tool: string; args: unknown; message: string };
  modelRunIds: string[];
  iterations: number;
  stoppedReason: "final" | "needs_confirmation" | "max_iterations";
}

export interface AskAgentDeps {
  runProvider?: (input: { messages: ProviderChatMessage[]; maxTokens?: number }) => Promise<{ text: string; toolCalls?: ProviderToolCall[]; runId: string }>;
  getSystemSnapshotText?: () => Promise<string | undefined>;
  toolContext?: ToolContext;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
}

const DEFAULT_MAX_ITERATIONS = 6;
const HARD_MAX_ITERATIONS = 10;

function buildSystemPrompt(snapshot: string | undefined, confirmActions: boolean): string {
  return [
    "You are WOBBLE OS's command surface for the founders. You can inspect and operate the OS using the provided tools.",
    "Use read tools (list_agents, list_pending_approvals, get_model_config, list_models) to answer operational questions and to gather facts BEFORE proposing any change. Never invent counts, names, models, or statuses — get them from a tool.",
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
  const modelRunIds: string[] = [];

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
      return { answer: text, toolTrace, modelRunIds, iterations: iteration, stoppedReason: "final" };
    }

    // Assistant turn that issued the tool calls must be recorded before the tool results.
    messages.push({
      role: "assistant",
      content: text || null,
      tool_calls: toolCalls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) } })),
    });

    for (const call of toolCalls) {
      const tool = ASK_TOOLS_BY_NAME[call.name];

      // Confirmation gate: never apply a destructive tool without explicit founder authorisation.
      if (tool?.requiresConfirmation && !input.confirmActions) {
        const message = `Confirm to proceed: ${call.name}(${JSON.stringify(call.arguments)}). I have NOT applied it. Reply to confirm and I'll run it.`;
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: false, blocked: true, reason: "awaiting_founder_confirmation" }) });
        await recordAudit({
          eventType: "ask.agent.confirmation_required",
          module: "ask_wobble",
          entityType: "tool",
          actor: input.founder,
          metadata: { tool: call.name, args: call.arguments },
        });
        return {
          answer: text || message,
          toolTrace,
          pendingConfirmation: { tool: call.name, args: call.arguments, message },
          modelRunIds,
          iterations: iteration,
          stoppedReason: "needs_confirmation",
        };
      }

      const res = await runTool(call.name, call.arguments, toolCtx);
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
  }

  await recordAudit({ eventType: "ask.agent.max_iterations", module: "ask_wobble", actor: input.founder, metadata: { iterations: maxIterations } });
  return {
    answer: "I gathered information but reached the tool-step limit before finishing. Ask me to continue and I'll pick up where I left off.",
    toolTrace,
    modelRunIds,
    iterations: maxIterations,
    stoppedReason: "max_iterations",
  };
}
