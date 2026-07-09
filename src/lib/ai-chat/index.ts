import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { runTextProvider, type ProviderChatMessage } from "@/lib/providers";
import { retrieveMemoryContext } from "@/lib/memory";
import { buildUserContent, type AttachmentInput } from "@/lib/domain/attachments";

/**
 * WOBBLE AI Chat — the universal "talk to the OS" surface. Any module that wants
 * a proper chat box calls this. Supports file attachments (images -> vision,
 * PDFs -> OpenRouter file-parser, text -> inline). Grounded with light memory
 * retrieval. Provider/retrieval/audit are injectable so it's testable without IO.
 */

export const CHAT_MODULE = "ask_wobble"; // reuse the allowed module (provider allowlist)
export const CHAT_ROLE = "ask_wobble";

const attachmentSchema = z.object({
  filename: z.string().trim().min(1),
  mimeType: z.string().trim().optional(),
  dataBase64: z.string().min(1),
  text: z.string().optional(),
});

const turnSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.string() });

export const chatSchema = z.object({
  message: z.string().trim().default(""),
  attachments: z.array(attachmentSchema).max(10).optional(),
  history: z.array(turnSchema).max(30).optional(),
  founder: z.string().trim().min(1).optional(),
  useMemory: z.boolean().optional(),
  maxTokens: z.number().int().min(100).max(4000).optional(),
});
export type ChatInput = z.input<typeof chatSchema>;

const SYSTEM_PROMPT = `You are WOBBLE — the AI brain of WOBBLE's internal operating system. WOBBLE is an AI automation studio that helps businesses find and ship AI opportunities (audits, chatbots, content, automations, delivery).

Voice: sharp, warm, founder-to-founder. Concise by default, deep when asked. No corporate filler. You are talking to a WOBBLE founder (Moiz, Ali, Ibrahim, or Haad), so be direct and useful.

You can reason over attached files: images (you see them), PDFs and documents (parsed for you), and pasted text/code. When a file is attached, analyze it and pull out what matters for the founder's goal. If you're missing context, ask one crisp question rather than guessing.`;

export interface ChatDeps {
  runProvider?: (input: { role: string; module: string; messages: ProviderChatMessage[]; maxTokens?: number; plugins?: Array<Record<string, unknown>> }) => Promise<{ text: string; run: { id: string } }>;
  retrieveMemory?: (query: string) => Promise<string[]>;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
}

export interface ChatResult {
  text: string;
  runId: string;
  attachments: string[]; // human notes about what was attached
}

export async function chatWithWobble(input: ChatInput, deps: ChatDeps = {}): Promise<ChatResult> {
  const parsed = chatSchema.parse(input);
  const attachments = (parsed.attachments ?? []) as AttachmentInput[];
  if (!parsed.message.trim() && attachments.length === 0) {
    throw new Error("message or attachment is required");
  }

  const runProvider = deps.runProvider ?? defaultRunProvider;
  const recordAudit = deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i));

  const messages: ProviderChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  // Optional grounding: pull a little relevant memory (best-effort, non-fatal).
  if (parsed.useMemory && parsed.message.trim()) {
    const retrieveMemory = deps.retrieveMemory ?? defaultRetrieveMemory;
    try {
      const chunks = await retrieveMemory(parsed.message);
      if (chunks.length) messages.push({ role: "system", content: `Relevant context from WOBBLE memory:\n${chunks.map((c, i) => `[${i + 1}] ${c}`).join("\n")}` });
    } catch (error) {
      console.error("chat memory retrieval failed:", error instanceof Error ? error.message : error);
    }
  }

  // Prior turns (text only).
  for (const turn of parsed.history ?? []) messages.push({ role: turn.role, content: turn.content });

  // Current user turn with attachments folded in.
  const { content, notes, hasBinary } = buildUserContent(parsed.message, attachments);
  const hasPdf = attachments.some((a) => (a.mimeType ?? "").includes("pdf") || /\.pdf$/i.test(a.filename));
  messages.push({ role: "user", content });

  const { text, run } = await runProvider({
    role: CHAT_ROLE,
    module: CHAT_MODULE,
    messages,
    maxTokens: parsed.maxTokens ?? 1500,
    // OpenRouter file-parser makes PDFs readable by any model.
    plugins: hasPdf ? [{ id: "file-parser", pdf: { engine: "pdf-text" } }] : undefined,
  });

  await recordAudit({
    eventType: "chat.message",
    module: CHAT_MODULE,
    entityType: "model_run",
    entityId: run.id,
    modelRunId: run.id,
    actor: parsed.founder,
    metadata: { attachments: notes.length, hasBinary, hasPdf, chars: parsed.message.length },
  });

  return { text, runId: run.id, attachments: notes };
}

async function defaultRunProvider(input: { role: string; module: string; messages: ProviderChatMessage[]; maxTokens?: number; plugins?: Array<Record<string, unknown>> }) {
  const result = await runTextProvider(input);
  return { text: result.text, run: { id: result.run.id } };
}

async function defaultRetrieveMemory(query: string): Promise<string[]> {
  const chunks = await retrieveMemoryContext({ query, queryMode: "current", limit: 6 });
  return chunks.map((c) => c.content);
}
