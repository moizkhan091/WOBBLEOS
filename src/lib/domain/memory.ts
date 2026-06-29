export type MemoryTier = "core" | "working" | "episodic";
export type TrustLevel = "founder_core" | "approved_expert" | "monitored" | "experimental" | "blocked";
export type QueryMode = "current" | "historical" | "include_archived";

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

export function rankMemoryChunks(input: { chunks: MemoryChunkCandidate[]; now: Date; queryMode: QueryMode }): RankedMemoryChunk[] {
  return input.chunks
    .filter((chunk) => chunk.trustLevel !== "blocked")
    .filter((chunk) => input.queryMode === "include_archived" || !chunk.archived)
    .map((chunk) => ({
      ...chunk,
      score: chunk.similarity + tierBoost[chunk.tier] + trustBoost[chunk.trustLevel] + recencyScore(chunk.createdAt, input.now, input.queryMode),
    }))
    .sort((a, b) => b.score - a.score);
}
