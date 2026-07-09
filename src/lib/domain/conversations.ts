import { z } from "zod";
import { newId } from "@/lib/ids";
import type { MemoryTier, TrustLevel } from "@/lib/domain/memory";
import type { ProviderMessage } from "@/lib/providers";

/**
 * Conversational-memory domain (pure, DB-free).
 *
 * Owns: conversation/message row builders, the founder→memory-bank mapping (so a
 * chat's learnings land in the RIGHT person's taste bank vs shared WOBBLE brain),
 * the harvest-candidate schema + safe parsing of the extractor's output, and the
 * routing rule that decides whether a learned fact auto-saves (personal) or must go
 * to founder approval (brand/company/client). Kept pure so all of it is unit-testable.
 */

export const KNOWN_FOUNDERS = ["moiz", "ali", "ibrahim", "haad"] as const;

/** Map a founder name/id ("Moiz", "founder_moiz") to their personal memory bank slug. */
export function founderBankSlug(founder?: string | null): string {
  if (!founder) return "founder_taste";
  const key = founder.trim().toLowerCase().replace(/^founder[_-]?/, "");
  return (KNOWN_FOUNDERS as readonly string[]).includes(key) ? `founder_${key}` : "founder_taste";
}

// ---------------------------------------------------------------- row builders

export interface ConversationRow {
  id: string;
  founderId: string | null;
  founderName: string | null;
  surface: string;
  scope: string;
  clientId: string | null;
  projectId: string | null;
  title: string | null;
  status: string;
  messageCount: number;
  lastMessageAt: Date | null;
  harvestStatus: string;
  harvestedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export const startConversationSchema = z.object({
  founderId: z.string().trim().min(1).optional(),
  founderName: z.string().trim().min(1).optional(),
  surface: z.string().trim().min(1).default("ask_wobble"),
  scope: z.enum(["founder", "company", "client", "project"]).default("founder"),
  clientId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
});
export type StartConversationInput = z.input<typeof startConversationSchema>;

export function buildConversationRow(input: StartConversationInput, opts: { id?: string; now?: Date } = {}): ConversationRow {
  const parsed = startConversationSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("conv"),
    founderId: parsed.founderId ?? null,
    founderName: parsed.founderName ?? null,
    surface: parsed.surface,
    scope: parsed.scope,
    clientId: parsed.clientId ?? null,
    projectId: parsed.projectId ?? null,
    title: parsed.title ?? null,
    status: "active",
    messageCount: 0,
    lastMessageAt: null,
    harvestStatus: "pending",
    harvestedAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

export interface ConversationMessageRow {
  id: string;
  conversationId: string;
  role: string;
  content: string | null;
  toolName: string | null;
  modelRunId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export const appendMessageSchema = z.object({
  conversationId: z.string().trim().min(1),
  role: z.enum(["user", "assistant", "tool", "system"]),
  content: z.string().nullable().optional(),
  toolName: z.string().trim().min(1).optional(),
  modelRunId: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type AppendMessageInput = z.input<typeof appendMessageSchema>;

export function buildConversationMessageRow(input: AppendMessageInput, opts: { id?: string; now?: Date } = {}): ConversationMessageRow {
  const parsed = appendMessageSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("cmsg"),
    conversationId: parsed.conversationId,
    role: parsed.role,
    content: parsed.content ?? null,
    toolName: parsed.toolName ?? null,
    modelRunId: parsed.modelRunId ?? null,
    metadata: parsed.metadata,
    createdAt: now,
  };
}

// ---------------------------------------------------------------- harvesting

export function buildTranscript(messages: Array<{ role: string; content: string | null }>): string {
  return messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content && m.content.trim())
    .map((m) => `${m.role === "user" ? "Founder" : "WOBBLE"}: ${m.content!.trim()}`)
    .join("\n");
}

export const harvestCandidateSchema = z.object({
  content: z.string().trim().min(3),
  scope: z.enum(["founder", "company", "brand", "client", "project"]).default("company"),
  area: z.string().trim().min(1).default("general"),
  confidence: z.number().min(0).max(1).default(0.6),
});
export type HarvestCandidate = z.infer<typeof harvestCandidateSchema>;
export const harvestCandidatesSchema = z.array(harvestCandidateSchema);

/** Safely pull a JSON array of candidates out of the model's reply (tolerates prose / code fences). */
export function parseHarvestCandidates(text: string): HarvestCandidate[] {
  if (!text) return [];
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const parsed = harvestCandidatesSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export interface CandidateRouting {
  action: "auto_save" | "propose";
  bankSlugs: string[];
  memoryTier: MemoryTier;
  trustLevel: TrustLevel;
}

/**
 * Routing rule (the core safety of conversational memory):
 *  - personal ("founder") preferences AUTO-SAVE to that founder's own bank,
 *  - anything shared (company/brand/client/project) is PROPOSED for founder approval,
 *    and brand truth is treated as core tier — a casual chat can never silently
 *    overwrite WOBBLE's protected brand.
 */
export function classifyCandidateRouting(candidate: HarvestCandidate, opts: { founderBankSlug: string }): CandidateRouting {
  if (candidate.scope === "founder") {
    return { action: "auto_save", bankSlugs: [opts.founderBankSlug], memoryTier: "working", trustLevel: "approved_expert" };
  }
  const bankByScope: Record<string, string> = { company: "company", brand: "brand", client: "client", project: "project" };
  const bank = bankByScope[candidate.scope] ?? "company";
  return {
    action: "propose",
    bankSlugs: [bank],
    memoryTier: candidate.scope === "brand" ? "core" : "working",
    trustLevel: "monitored",
  };
}

/** Prompt for the extractor model — pull durable, reusable facts/preferences only. */
export function buildHarvestPrompt(transcript: string, founderName?: string | null): ProviderMessage[] {
  const system = [
    "You extract DURABLE, reusable memory from a founder's conversation with WOBBLE OS. Return ONLY a JSON array.",
    "Each item: { \"content\": string, \"scope\": \"founder\"|\"company\"|\"brand\"|\"client\"|\"project\", \"area\": string, \"confidence\": 0..1 }.",
    "Rules: capture stable facts, preferences, decisions, and constraints — NOT small talk, one-off task requests, or transient chatter.",
    `Scope: use "founder" for THIS person's personal preferences/working style${founderName ? ` (${founderName})` : ""}; "brand" for WOBBLE voice/positioning/do-not-say; "company" for WOBBLE facts/strategy/offers; "client"/"project" for client-specific facts.`,
    "If nothing is worth remembering, return []. Be conservative — quality over quantity.",
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: `Conversation:\n${transcript}\n\nReturn the JSON array of durable memories.` },
  ];
}
