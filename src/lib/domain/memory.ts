import { z } from "zod";
import { newId } from "@/lib/ids";

export type MemoryTier = "core" | "working" | "episodic";
export type TrustLevel = "founder_core" | "approved_expert" | "monitored" | "experimental" | "blocked";
export type QueryMode = "current" | "historical" | "include_archived";

export const MEMORY_TIERS = ["core", "working", "episodic"] as const;
export const MEMORY_TRUST_LEVELS = ["founder_core", "approved_expert", "monitored", "experimental", "blocked"] as const;
export const MEMORY_PROPOSAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type MemoryProposalStatus = (typeof MEMORY_PROPOSAL_STATUSES)[number];

export interface MemoryChunkCandidate {
  id: string;
  similarity: number;
  tier: MemoryTier;
  trustLevel: TrustLevel;
  createdAt: string;
  archived: boolean;
}

export interface RankedMemoryChunk extends MemoryChunkCandidate {
  score: number;
}

export const memoryRecordInputSchema = z.object({
  slug: z.string().trim().min(1),
  title: z.string().trim().min(1),
  memoryTier: z.enum(MEMORY_TIERS),
  area: z.string().trim().min(1),
  content: z.string().trim().min(1),
  sourceId: z.string().trim().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  approvedBy: z.string().trim().min(1).optional(),
});

export type MemoryRecordInput = z.input<typeof memoryRecordInputSchema>;

export interface MemoryRecordRow {
  id: string;
  slug: string;
  title: string;
  memoryTier: MemoryTier;
  area: string;
  content: string;
  status: "active" | "archived";
  sourceId: string | null;
  confidence: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function buildMemoryRecordRow(
  input: MemoryRecordInput,
  opts: { id?: string; now?: Date } = {},
): MemoryRecordRow {
  const parsed = memoryRecordInputSchema.parse(input);
  const now = opts.now ?? new Date();

  return {
    id: opts.id ?? newId("memory"),
    slug: parsed.slug,
    title: parsed.title,
    memoryTier: parsed.memoryTier,
    area: parsed.area,
    content: parsed.content,
    status: "active",
    sourceId: parsed.sourceId ?? null,
    confidence: parsed.confidence !== undefined ? String(parsed.confidence) : null,
    approvedBy: parsed.approvedBy ?? null,
    approvedAt: parsed.approvedBy ? now : null,
    createdAt: now,
    updatedAt: now,
  };
}

export const memoryChunkInputSchema = z.object({
  memoryRecordId: z.string().trim().min(1).optional(),
  content: z.string().trim().min(1),
  memoryTier: z.enum(MEMORY_TIERS),
  trustLevel: z.enum(MEMORY_TRUST_LEVELS),
  sourceId: z.string().trim().min(1).optional(),
  parentEntityId: z.string().trim().min(1).optional(),
  entityType: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  sourceTimestamp: z.coerce.date().optional(),
});

export type MemoryChunkInput = z.input<typeof memoryChunkInputSchema>;

export interface MemoryChunkRow {
  id: string;
  memoryRecordId: string | null;
  content: string;
  embedding: number[] | null;
  memoryTier: MemoryTier;
  trustLevel: TrustLevel;
  sourceId: string | null;
  parentEntityId: string | null;
  entityType: string | null;
  status: "active" | "archived";
  archived: boolean;
  tags: string[];
  sourceTimestamp: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function buildMemoryChunkRows(
  input: MemoryChunkInput,
  opts: { ids?: string[]; now?: Date } = {},
): MemoryChunkRow[] {
  const parsed = memoryChunkInputSchema.parse(input);
  const now = opts.now ?? new Date();

  return [
    {
      id: opts.ids?.[0] ?? newId("memorychunk"),
      memoryRecordId: parsed.memoryRecordId ?? null,
      content: parsed.content,
      embedding: null,
      memoryTier: parsed.memoryTier,
      trustLevel: parsed.trustLevel,
      sourceId: parsed.sourceId ?? null,
      parentEntityId: parsed.parentEntityId ?? parsed.memoryRecordId ?? null,
      entityType: parsed.entityType ?? null,
      status: "active",
      archived: false,
      tags: parsed.tags,
      sourceTimestamp: parsed.sourceTimestamp ?? null,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export const memoryUpdateProposalInputSchema = z.object({
  proposedMemory: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  sourceId: z.string().trim().min(1).optional(),
  affectedArea: z.string().trim().min(1),
  confidence: z.number().min(0).max(1).optional(),
});

export type MemoryUpdateProposalInput = z.input<typeof memoryUpdateProposalInputSchema>;

export interface MemoryUpdateProposalRow {
  id: string;
  proposedMemory: string;
  reason: string;
  sourceId: string | null;
  affectedArea: string;
  confidence: string | null;
  approvalId: string | null;
  status: MemoryProposalStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectedBy: string | null;
  rejectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function buildMemoryUpdateProposalRow(
  input: MemoryUpdateProposalInput,
  opts: { id?: string; now?: Date } = {},
): MemoryUpdateProposalRow {
  const parsed = memoryUpdateProposalInputSchema.parse(input);
  const now = opts.now ?? new Date();

  return {
    id: opts.id ?? newId("memproposal"),
    proposedMemory: parsed.proposedMemory,
    reason: parsed.reason,
    sourceId: parsed.sourceId ?? null,
    affectedArea: parsed.affectedArea,
    confidence: parsed.confidence !== undefined ? String(parsed.confidence) : null,
    approvalId: null,
    status: "pending",
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface RetrievalMemoryChunk extends MemoryChunkCandidate {
  memoryRecordId: string | null;
  content: string;
  sourceId: string | null;
  parentEntityId: string | null;
  entityType: string | null;
  status: "active" | "archived";
  tags: string[];
}

export type RankedRetrievalMemoryChunk = RetrievalMemoryChunk & { score: number };

const tierBoost: Record<MemoryTier, number> = {
  core: 0.18,
  working: 0.1,
  episodic: 0,
};

const trustBoost: Record<TrustLevel, number> = {
  founder_core: 0.2,
  approved_expert: 0.12,
  monitored: 0.04,
  experimental: -0.06,
  blocked: -999,
};

function recencyScore(createdAt: string, now: Date, queryMode: QueryMode): number {
  if (queryMode === "historical" || queryMode === "include_archived") return 0;
  const ageMs = Math.max(0, now.getTime() - new Date(createdAt).getTime());
  const ageDays = ageMs / 86_400_000;
  return Math.max(-0.14, 0.12 - ageDays * 0.0002);
}

export function rankMemoryChunks<T extends MemoryChunkCandidate>(input: {
  chunks: T[];
  now: Date;
  queryMode: QueryMode;
}): Array<T & { score: number }> {
  return input.chunks
    .filter((chunk) => chunk.trustLevel !== "blocked")
    .filter((chunk) => input.queryMode === "include_archived" || !chunk.archived)
    .map((chunk) => ({
      ...chunk,
      score: chunk.similarity + tierBoost[chunk.tier] + trustBoost[chunk.trustLevel] + recencyScore(chunk.createdAt, input.now, input.queryMode),
    }))
    .sort((a, b) => b.score - a.score);
}
