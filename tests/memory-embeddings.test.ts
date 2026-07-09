import { describe, expect, it } from "vitest";
import {
  createOpenRouterEmbedder,
  embedText,
  getDefaultEmbedder,
  isEmbeddingsConfigured,
  type Embedder,
} from "@/lib/embeddings";
import {
  buildMemoryBankRow,
  buildMemoryUpdateProposalRow,
  DEFAULT_MEMORY_BANKS,
  rankMemoryChunks,
  type MemoryBankRow,
  type MemoryChunkRow,
  type MemoryRecordRow,
  type MemoryUpdateProposalRow,
  type RetrievalMemoryChunk,
} from "@/lib/domain/memory";
import { approveMemoryUpdate, retrieveMemoryContext, type MemoryStore } from "@/lib/memory";
import type { ApprovalStore } from "@/lib/approvals";

const now = new Date("2026-07-09T12:00:00.000Z");

// Deterministic offline embedder: maps text to a small vector by topic keywords.
// Real embeddings are 1536-dim; dimensionality is irrelevant for cosine unit tests.
function keywordEmbedder(): Embedder {
  const axes = ["brand", "seo", "content"];
  return {
    model: "fake-keyword-embedder",
    async embed(texts) {
      return texts.map((text) => {
        const lower = text.toLowerCase();
        const v = axes.map((axis) => (lower.includes(axis) ? 1 : 0));
        // avoid an all-zero vector (undefined cosine) by adding a tiny constant axis
        return [...v, 0.01];
      });
    },
  };
}

function fakeApprovalStore() {
  const store: ApprovalStore = {
    insert: async () => {},
    getById: async () => ({ status: "pending" as never, approvalType: "memory_update" }),
    update: async () => {},
  };
  return store;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function makeMemoryStore(seedProposals: MemoryUpdateProposalRow[] = []) {
  const proposals = new Map(seedProposals.map((p) => [p.id, p]));
  const banks: MemoryBankRow[] = DEFAULT_MEMORY_BANKS.map((bank) =>
    buildMemoryBankRow(bank, { id: `memorybank_${bank.slug}`, now }),
  );
  const records: MemoryRecordRow[] = [];
  const chunks: MemoryChunkRow[] = [];

  const store: MemoryStore = {
    insertProposal: async (row) => {
      proposals.set(row.id, row);
    },
    getProposalById: async (id) => proposals.get(id) ?? null,
    updateProposal: async (id, fields) => {
      const current = proposals.get(id);
      if (current) proposals.set(id, { ...current, ...fields });
    },
    listMemoryBanks: async (query) => banks.slice(0, query?.limit ?? banks.length),
    insertMemoryBankLinks: async () => {},
    insertMemoryRecord: async (row) => {
      records.push(row);
    },
    insertMemoryChunks: async (rows) => {
      chunks.push(...rows);
    },
    // Emulates pgvector: if a query embedding is supplied, rank by real cosine similarity.
    retrieveMemoryCandidates: async (query) => {
      const pool = chunks.filter((c) =>
        query.bankSlugs?.length ? c.bankSlugs.some((b) => query.bankSlugs?.includes(b)) : true,
      );
      const mapped: RetrievalMemoryChunk[] = pool.map((c) => ({
        id: c.id,
        memoryRecordId: c.memoryRecordId,
        content: c.content,
        similarity: query.queryEmbedding && c.embedding ? cosine(query.queryEmbedding, c.embedding) : 0.75,
        tier: c.memoryTier,
        trustLevel: c.trustLevel,
        sourceId: c.sourceId,
        parentEntityId: c.parentEntityId,
        entityType: c.entityType,
        status: c.status,
        archived: c.archived,
        tags: c.tags,
        bankSlugs: c.bankSlugs,
        createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
      }));
      return mapped.sort((a, b) => b.similarity - a.similarity);
    },
    listMemoryRecords: async () => records,
    listMemoryProposals: async () => [...proposals.values()],
    getMemoryRecordById: async (id) => records.find((r) => r.id === id) ?? null,
    updateMemoryRecordFields: async (id, fields) => {
      const r = records.find((x) => x.id === id);
      if (r) Object.assign(r, fields);
    },
    listChunkIdsForRecord: async (recordId) => chunks.filter((c) => c.memoryRecordId === recordId).map((c) => ({ id: c.id, content: c.content })),
    updateChunk: async (id, fields) => {
      const c = chunks.find((x) => x.id === id);
      if (c) Object.assign(c, fields);
    },
    setChunksStatusForRecord: async (recordId, status, archived) => {
      for (const c of chunks) if (c.memoryRecordId === recordId) Object.assign(c, { status, archived });
    },
    insertRecordVersion: async () => {},
    listRecordVersions: async () => [],
    getRecordVersion: async () => null,
    countRecordVersions: async () => 0,
    listExpiredArchivedRecords: async () => [],
    deleteRecordCascade: async () => {},
  };

  return { store, records, chunks };
}

async function approve(store: MemoryStore, id: string, content: string, bankSlugs: string[], embedder: Embedder) {
  const proposal = buildMemoryUpdateProposalRow(
    { proposedMemory: content, reason: "seed", affectedArea: bankSlugs[0] },
    { id, now },
  );
  await store.insertProposal(proposal);
  return approveMemoryUpdate(
    {
      proposalId: id,
      approvalId: `approval_${id}`,
      approvedBy: "Moiz",
      slug: id,
      title: content.slice(0, 40),
      memoryTier: "working",
      trustLevel: "approved_expert",
      bankSlugs,
    },
    { store, approvalStore: fakeApprovalStore(), recordAudit: async () => {}, embedder, now },
  );
}

describe("embeddings adapter", () => {
  it("reports configuration from the environment", () => {
    expect(isEmbeddingsConfigured({})).toBe(false);
    expect(isEmbeddingsConfigured({ OPENROUTER_API_KEY: "x" })).toBe(true);
    expect(getDefaultEmbedder({})).toBeNull();
  });

  it("returns null when no embedder is configured (graceful fallback)", async () => {
    const vector = await embedText("hello", { env: {} });
    expect(vector).toBeNull();
  });

  it("parses OpenAI-compatible responses and preserves request order", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ data: [{ embedding: [0.2], index: 1 }, { embedding: [0.1], index: 0 }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as unknown as typeof fetch;
    const embedder = createOpenRouterEmbedder({ apiKey: "k", fetchImpl });
    const out = await embedder.embed(["a", "b"]);
    expect(out).toEqual([[0.1], [0.2]]);
  });
});

describe("semantic memory", () => {
  it("attaches an embedding to chunks on approval", async () => {
    const { store, chunks } = makeMemoryStore();
    const result = await approve(store, "m_brand", "Brand voice: never say generic AI agency", ["brand"], keywordEmbedder());
    expect(result.memoryChunks[0].embedding).toEqual([1, 0, 0, 0.01]);
    expect(chunks[0].embedding).not.toBeNull();
  });

  it("retrieves the semantically closest memory first, not the most recent", async () => {
    const embedder = keywordEmbedder();
    const { store } = makeMemoryStore();
    // Insert brand first (older), seo second, content last (most recent).
    await approve(store, "m_brand", "Brand voice and positioning rules", ["brand"], embedder);
    await approve(store, "m_seo", "SEO keyword and search intent notes", ["seo"], embedder);
    await approve(store, "m_content", "Content hooks and angles", ["content"], embedder);

    // A brand query must surface the brand chunk first even though it is the oldest.
    const result = await retrieveMemoryContext({ query: "brand positioning", limit: 3 }, { store, embedder, now });
    expect(result[0]?.content).toContain("Brand");
  });

  it("still ranks by recency/trust when no embedder is available", () => {
    const ranked = rankMemoryChunks({
      now,
      queryMode: "current",
      chunks: [
        { id: "old", similarity: 0.75, tier: "episodic", trustLevel: "monitored", createdAt: "2024-01-01T00:00:00.000Z", archived: false },
        { id: "fresh", similarity: 0.75, tier: "episodic", trustLevel: "monitored", createdAt: "2026-07-08T00:00:00.000Z", archived: false },
      ],
    });
    expect(ranked[0]?.id).toBe("fresh");
  });
});
