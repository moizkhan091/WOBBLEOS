import { describe, expect, it } from "vitest";
import { classifyMemoryWrite, buildMemoryBankRow, DEFAULT_MEMORY_BANKS, buildMemoryRecordRow } from "@/lib/domain/memory";
import type { MemoryBankRow, MemoryChunkRow, MemoryConflictRow, MemoryRecordRow, MemoryUpdateProposalRow, RetrievalMemoryChunk } from "@/lib/domain/memory";
import { createMemoryRecord, listMemoryConflicts, resolveMemoryConflict, listMemoriesDueForReview, reviewMemory, type MemoryStore } from "@/lib/memory";
import type { Embedder } from "@/lib/embeddings";

const now = new Date("2026-07-09T12:00:00.000Z");
const embedder: Embedder = { model: "fake", embed: async (texts) => texts.map(() => [1, 0, 0]) };

// A store whose semantic search returns a single, controllable nearest-neighbour so we can
// drive the dedup/conflict verdict by similarity.
function makeStore(neighbourSimilarity: number | null) {
  const banks: MemoryBankRow[] = DEFAULT_MEMORY_BANKS.map((b) => buildMemoryBankRow(b, { id: `memorybank_${b.slug}`, now }));
  const records: MemoryRecordRow[] = [];
  const chunks: MemoryChunkRow[] = [];
  const conflicts: MemoryConflictRow[] = [];

  // Seed an existing memory in founder_moiz for the neighbour to point at.
  const existing = buildMemoryRecordRow(
    { slug: "existing", title: "Existing", memoryTier: "working", area: "content", content: "Moiz likes neon visuals", approvedBy: "Moiz", bankSlugs: ["founder_moiz"] },
    { id: "rec_existing", now },
  );
  records.push(existing);

  const store: MemoryStore = {
    insertProposal: async () => {},
    getProposalById: async () => null,
    updateProposal: async () => {},
    listMemoryBanks: async (q) => banks.slice(0, q?.limit ?? banks.length),
    insertMemoryBankLinks: async () => {},
    insertMemoryRecord: async (r) => void records.push(r),
    insertMemoryChunks: async (rows) => void chunks.push(...rows),
    retrieveMemoryCandidates: async (): Promise<RetrievalMemoryChunk[]> =>
      neighbourSimilarity === null
        ? []
        : [
            {
              id: "chunk_existing",
              memoryRecordId: existing.id,
              content: existing.content,
              similarity: neighbourSimilarity,
              tier: "working",
              trustLevel: "approved_expert",
              sourceId: null,
              parentEntityId: existing.id,
              entityType: "memory_record",
              status: "active",
              archived: false,
              tags: [],
              bankSlugs: ["founder_moiz"],
              createdAt: now.toISOString(),
            },
          ],
    listMemoryRecords: async () => records,
    listMemoryProposals: async () => [],
    getMemoryRecordById: async (id) => records.find((r) => r.id === id) ?? null,
    updateMemoryRecordFields: async (id, fields) => {
      const r = records.find((x) => x.id === id);
      if (r) Object.assign(r, fields);
    },
    listChunkIdsForRecord: async (rid) => chunks.filter((c) => c.memoryRecordId === rid).map((c) => ({ id: c.id, content: c.content })),
    updateChunk: async () => {},
    setChunksStatusForRecord: async () => {},
    insertRecordVersion: async () => {},
    listRecordVersions: async () => [],
    getRecordVersion: async () => null,
    countRecordVersions: async () => 0,
    listExpiredArchivedRecords: async () => [],
    deleteRecordCascade: async () => {},
    insertConflict: async (row) => void conflicts.push(row),
    getConflict: async (id) => conflicts.find((c) => c.id === id) ?? null,
    updateConflict: async (id, fields) => {
      const c = conflicts.find((x) => x.id === id);
      if (c) Object.assign(c, fields);
    },
    listOpenConflicts: async () => conflicts.filter((c) => c.status === "open"),
    listRecordsDueForReview: async (before) => records.filter((r) => r.status === "active" && r.reviewAfter !== null && r.reviewAfter < before),
  };
  return { store, records, conflicts, existing };
}

const audit = async () => {};

describe("classifyMemoryWrite", () => {
  it("labels duplicate / conflict / new by similarity", () => {
    expect(classifyMemoryWrite([{ recordId: "a", content: "x", similarity: 0.97 }]).verdict).toBe("duplicate");
    expect(classifyMemoryWrite([{ recordId: "a", content: "x", similarity: 0.86 }]).verdict).toBe("conflict");
    expect(classifyMemoryWrite([{ recordId: "a", content: "x", similarity: 0.5 }]).verdict).toBe("new");
    expect(classifyMemoryWrite([]).verdict).toBe("new");
  });
});

describe("dedup + conflict on create", () => {
  const base = { area: "content", memoryTier: "working" as const, trustLevel: "approved_expert" as const, bankSlugs: ["founder_moiz"], createdBy: "Moiz" };

  it("dedupes a near-identical memory (returns existing, no new record)", async () => {
    const { store, records } = makeStore(0.97);
    const before = records.length;
    const result = await createMemoryRecord({ ...base, title: "dup", content: "Moiz likes neon visuals" }, { store, embedder, recordAudit: audit, now });
    expect(result.id).toBe("rec_existing"); // returned the existing one
    expect(records.length).toBe(before); // nothing new inserted
  });

  it("flags a conflict for a similar-but-different memory (creates + records conflict)", async () => {
    const { store, records, conflicts } = makeStore(0.86);
    const result = await createMemoryRecord({ ...base, title: "conf", content: "Moiz now prefers muted earthy tones" }, { store, embedder, recordAudit: audit, now });
    expect(result.id).not.toBe("rec_existing"); // a new record WAS created
    expect(records.length).toBe(2);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ newRecordId: result.id, existingRecordId: "rec_existing", status: "open" });
  });

  it("creates cleanly when nothing is similar", async () => {
    const { store, conflicts } = makeStore(0.4);
    await createMemoryRecord({ ...base, title: "new", content: "unrelated pricing fact" }, { store, embedder, recordAudit: audit, now });
    expect(conflicts).toHaveLength(0);
  });

  it("resolves a conflict by keeping the new one (archives the old)", async () => {
    const { store, records, conflicts } = makeStore(0.86);
    await createMemoryRecord({ ...base, title: "conf", content: "Moiz now prefers muted earthy tones" }, { store, embedder, recordAudit: audit, now });
    const open = await listMemoryConflicts({}, { store });
    await resolveMemoryConflict({ conflictId: open[0].id, resolution: "keep_new", resolvedBy: "Moiz" }, { store, recordAudit: audit, now });
    expect(records.find((r) => r.id === "rec_existing")?.status).toBe("archived");
    expect(conflicts[0].status).toBe("resolved");
  });
});

describe("staleness review", () => {
  it("lists memories past their freshness window and re-confirming resets it", async () => {
    const { store, records } = makeStore(null);
    // force the seeded record to be overdue
    records[0].reviewAfter = new Date(now.getTime() - 1000);
    const due = await listMemoriesDueForReview({}, { store, now });
    expect(due.map((r) => r.id)).toContain("rec_existing");
    await reviewMemory({ id: "rec_existing", reviewedBy: "Moiz" }, { store, recordAudit: audit, now });
    expect(records[0].reviewAfter! > now).toBe(true); // pushed into the future
    expect(records[0].lastReviewedAt).not.toBeNull();
  });
});
