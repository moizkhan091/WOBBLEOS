import { describe, expect, it } from "vitest";
import { canEditMemoryBanks } from "@/lib/domain/memory";
import {
  archiveMemoryRecord,
  createMemoryRecord,
  editMemoryRecord,
  restoreMemoryRecord,
  type MemoryStore,
} from "@/lib/memory";
import {
  buildMemoryBankRow,
  DEFAULT_MEMORY_BANKS,
  type MemoryBankRow,
  type MemoryChunkRow,
  type MemoryRecordRow,
  type MemoryUpdateProposalRow,
} from "@/lib/domain/memory";
import type { AuditEventInput } from "@/lib/domain/audit";
import type { Embedder } from "@/lib/embeddings";

const now = new Date("2026-07-09T12:00:00.000Z");
const embedder: Embedder = { model: "fake", embed: async (texts) => texts.map((t) => [t.length]) };

function makeStore() {
  const banks: MemoryBankRow[] = DEFAULT_MEMORY_BANKS.map((b) => buildMemoryBankRow(b, { id: `memorybank_${b.slug}`, now }));
  const records: MemoryRecordRow[] = [];
  const chunks: MemoryChunkRow[] = [];
  const store: MemoryStore = {
    insertProposal: async () => {},
    getProposalById: async () => null,
    updateProposal: async () => {},
    listMemoryBanks: async (q) => banks.slice(0, q?.limit ?? banks.length),
    insertMemoryBankLinks: async () => {},
    insertMemoryRecord: async (r) => void records.push(r),
    insertMemoryChunks: async (rows) => void chunks.push(...rows),
    retrieveMemoryCandidates: async () => [],
    listMemoryRecords: async () => records,
    listMemoryProposals: async () => [],
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
  };
  return { store, records, chunks };
}

describe("canEditMemoryBanks", () => {
  it("lets a founder edit their own bank + shared banks, but not another founder's", () => {
    expect(canEditMemoryBanks("Moiz", ["founder_moiz"]).allowed).toBe(true);
    expect(canEditMemoryBanks("Moiz", ["company", "brand"]).allowed).toBe(true);
    expect(canEditMemoryBanks("Moiz", ["founder_ali"]).allowed).toBe(false);
    expect(canEditMemoryBanks("Moiz", ["company", "founder_ali"]).allowed).toBe(false);
  });
});

describe("memory management", () => {
  it("creates a memory directly with an embedding + audit", async () => {
    const { store, records, chunks } = makeStore();
    const audit: AuditEventInput[] = [];
    const rec = await createMemoryRecord(
      { title: "Punchy hooks", content: "Moiz likes punchy hooks", area: "content", memoryTier: "working", trustLevel: "approved_expert", bankSlugs: ["founder_moiz"], createdBy: "Moiz" },
      { store, embedder, recordAudit: async (e) => void audit.push(e), now },
    );
    expect(records).toHaveLength(1);
    expect(chunks[0].embedding).not.toBeNull();
    expect(audit.some((e) => e.eventType === "memory_record.created")).toBe(true);
    expect(rec.bankSlugs).toContain("founder_moiz");
  });

  it("refuses to write into another founder's personal bank", async () => {
    const { store } = makeStore();
    await expect(
      createMemoryRecord({ title: "x", content: "x", area: "content", memoryTier: "working", trustLevel: "approved_expert", bankSlugs: ["founder_ali"], createdBy: "Moiz" }, { store, embedder, now }),
    ).rejects.toThrow(/personal memory bank/);
  });

  it("re-embeds the chunk when content is edited (search never goes stale)", async () => {
    const { store, chunks } = makeStore();
    const rec = await createMemoryRecord(
      { title: "t", content: "short", area: "content", memoryTier: "working", trustLevel: "approved_expert", bankSlugs: ["founder_moiz"], createdBy: "Moiz" },
      { store, embedder, recordAudit: async () => {}, now },
    );
    expect(chunks[0].embedding).toEqual([5]); // "short".length
    const audit: AuditEventInput[] = [];
    await editMemoryRecord({ id: rec.id, content: "a much longer memory", editedBy: "Moiz" }, { store, embedder, recordAudit: async (e) => void audit.push(e), now });
    expect(chunks[0].content).toBe("a much longer memory");
    expect(chunks[0].embedding).toEqual([20]); // re-embedded with new length
    const edited = audit.find((e) => e.eventType === "memory_record.edited");
    expect((edited?.metadata as Record<string, unknown>).reEmbedded).toBe(true);
  });

  it("archives (soft-delete) and restores a memory", async () => {
    const { store, records, chunks } = makeStore();
    const rec = await createMemoryRecord(
      { title: "t", content: "c", area: "content", memoryTier: "working", trustLevel: "approved_expert", bankSlugs: ["founder_moiz"], createdBy: "Moiz" },
      { store, embedder, recordAudit: async () => {}, now },
    );
    await archiveMemoryRecord({ id: rec.id, archivedBy: "Moiz", reason: "outdated" }, { store, recordAudit: async () => {}, now });
    expect(records[0].status).toBe("archived");
    expect(chunks[0].archived).toBe(true);
    await restoreMemoryRecord({ id: rec.id, restoredBy: "Moiz" }, { store, recordAudit: async () => {}, now });
    expect(records[0].status).toBe("active");
    expect(chunks[0].archived).toBe(false);
  });
});
