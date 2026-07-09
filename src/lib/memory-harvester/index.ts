import { newId } from "@/lib/ids";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { runTextProvider } from "@/lib/providers";
import { approveMemoryUpdate, proposeMemoryUpdate, type MemoryDeps } from "@/lib/memory";
import {
  getConversation,
  getConversationMessages,
  listConversationsPendingHarvest,
  markConversationHarvested,
  markConversationSkipped,
  type ConversationDeps,
} from "@/lib/conversations";
import {
  buildHarvestPrompt,
  buildTranscript,
  classifyCandidateRouting,
  founderBankSlug,
  parseHarvestCandidates,
  type HarvestCandidate,
} from "@/lib/domain/conversations";

/**
 * Memory Harvester — the background agent (model_scout/system-style) that turns
 * chats into lasting, correctly-routed memory. For each conversation: extract
 * durable facts/preferences, then route by scope — a founder's personal preference
 * AUTO-SAVES to their own bank (embedding generated via the tested memory path),
 * while anything about WOBBLE brand/company/client is PROPOSED for founder approval.
 * Fully injectable (extractor / conversation store / memory deps / audit) so the
 * whole pipeline is testable without an LLM or a DB.
 */

const DEFAULT_MIN_CONFIDENCE = 0.55;

export interface HarvestResult {
  conversationId: string;
  candidates: number;
  saved: number;
  proposed: number;
  modelRunId?: string;
  skipped?: boolean;
}

export interface HarvestDeps {
  extract?: (input: { transcript: string; founderName?: string | null }) => Promise<{ candidates: HarvestCandidate[]; modelRunId?: string }>;
  conversationDeps?: ConversationDeps;
  memoryDeps?: MemoryDeps;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  minConfidence?: number;
  now?: Date;
}

async function defaultExtract(input: { transcript: string; founderName?: string | null }) {
  const { text, run } = await runTextProvider({
    role: "memory_router",
    module: "memory",
    messages: buildHarvestPrompt(input.transcript, input.founderName),
    maxTokens: 600,
  });
  return { candidates: parseHarvestCandidates(text), modelRunId: run.id };
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function memorySlug(area: string): string {
  const base = area.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "memory";
  return `${base}-${newId("h").split("_").pop()!.slice(0, 8)}`;
}

export async function harvestConversation(input: { conversationId: string }, deps: HarvestDeps = {}): Promise<HarvestResult> {
  const extract = deps.extract ?? defaultExtract;
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const minConfidence = deps.minConfidence ?? DEFAULT_MIN_CONFIDENCE;

  const conversation = await getConversation(input.conversationId, deps.conversationDeps);
  if (!conversation) throw new Error(`conversation '${input.conversationId}' not found`);

  const messages = await getConversationMessages(input.conversationId, deps.conversationDeps);
  const transcript = buildTranscript(messages);
  if (!transcript.trim()) {
    await markConversationSkipped(input.conversationId, deps.conversationDeps);
    return { conversationId: input.conversationId, candidates: 0, saved: 0, proposed: 0, skipped: true };
  }

  const { candidates, modelRunId } = await extract({ transcript, founderName: conversation.founderName });
  const bank = founderBankSlug(conversation.founderName ?? conversation.founderId);

  let saved = 0;
  let proposed = 0;

  for (const candidate of candidates) {
    if (candidate.confidence < minConfidence) continue;
    const routing = classifyCandidateRouting(candidate, { founderBankSlug: bank });

    const { proposal, approval } = await proposeMemoryUpdate(
      {
        proposedMemory: candidate.content,
        reason: `Learned from ${conversation.surface} conversation ${input.conversationId}`,
        affectedArea: candidate.area,
        suggestedBankSlugs: routing.bankSlugs,
        confidence: candidate.confidence,
        proposedBy: "memory_harvester",
      },
      deps.memoryDeps,
    );

    if (routing.action === "auto_save") {
      await approveMemoryUpdate(
        {
          proposalId: proposal.id,
          approvalId: approval.id,
          approvedBy: "memory_harvester",
          slug: memorySlug(candidate.area),
          title: truncate(candidate.content, 80),
          memoryTier: routing.memoryTier,
          trustLevel: routing.trustLevel,
          bankSlugs: routing.bankSlugs,
        },
        deps.memoryDeps,
      );
      saved += 1;
    } else {
      proposed += 1;
    }
  }

  await markConversationHarvested(input.conversationId, deps.conversationDeps);
  await recordAudit({
    eventType: "memory.harvested",
    module: "memory",
    entityType: "conversation",
    entityId: input.conversationId,
    actor: "memory_harvester",
    metadata: { candidates: candidates.length, saved, proposed, founder: conversation.founderName, bank },
  });

  return { conversationId: input.conversationId, candidates: candidates.length, saved, proposed, modelRunId };
}

/** Sweep idle, un-harvested conversations and harvest each. Safe to run on a schedule. */
export async function harvestPendingConversations(
  input: { idleMinutes?: number; limit?: number } = {},
  deps: HarvestDeps = {},
): Promise<HarvestResult[]> {
  const pending = await listConversationsPendingHarvest(
    { idleMinutes: input.idleMinutes, limit: input.limit },
    deps.conversationDeps,
  );
  const results: HarvestResult[] = [];
  for (const conversation of pending) {
    try {
      results.push(await harvestConversation({ conversationId: conversation.id }, deps));
    } catch (error) {
      console.error(`harvest failed for ${conversation.id}:`, error instanceof Error ? error.message : error);
    }
  }
  return results;
}
