import { describe, expect, it, vi } from "vitest";
import { harvestConversation, type HarvestDeps } from "@/lib/memory-harvester";
import type { ConversationStore } from "@/lib/conversations";
import { buildConversationMessageRow, buildConversationRow } from "@/lib/domain/conversations";
import type { MemoryStore } from "@/lib/memory";
import {
  buildMemoryBankRow,
  DEFAULT_MEMORY_BANKS,
  type MemoryBankRow,
  type MemoryChunkRow,
  type MemoryRecordRow,
  type MemoryUpdateProposalRow,
} from "@/lib/domain/memory";
import type { ApprovalStore } from "@/lib/approvals";

const now = new Date("2026-07-09T12:00:00.000Z");

function convStore() {
  const conversation = buildConversationRow({ founderName: "Moiz", surface: "ask_wobble", scope: "founder" }, { id: "conv_1", now });
  const messages = [
    buildConversationMessageRow({ conversationId: "conv_1", role: "user", content: "I really prefer punchy, aggressive hooks. Also we're targeting Pakistani SaaS founders." }, { id: "m1", now }),
    buildConversationMessageRow({ conversationId: "conv_1", role: "assistant", content: "Got it." }, { id: "m2", now }),
  ];
  let status = conversation.harvestStatus;
  const store: ConversationStore = {
    insertConversation: async () => {},
    insertMessage: async () => {},
    touchConversation: async () => {},
    getConversation: async () => ({ ...conversation, harvestStatus: status }),
    listMessages: async () => messages,
    listPendingHarvest: async () => [],
    setHarvestStatus: async (_id, s) => {
      status = s;
    },
  };
  return { store, status: () => status };
}

function memStore() {
  const proposals = new Map<string, MemoryUpdateProposalRow>();
  const banks: MemoryBankRow[] = DEFAULT_MEMORY_BANKS.map((b) => buildMemoryBankRow(b, { id: `memorybank_${b.slug}`, now }));
  const records: MemoryRecordRow[] = [];
  const chunks: MemoryChunkRow[] = [];
  const store: MemoryStore = {
    insertProposal: async (row) => {
      proposals.set(row.id, row);
    },
    getProposalById: async (id) => proposals.get(id) ?? null,
    updateProposal: async (id, fields) => {
      const cur = proposals.get(id);
      if (cur) proposals.set(id, { ...cur, ...fields });
    },
    listMemoryBanks: async (q) => banks.slice(0, q?.limit ?? banks.length),
    insertMemoryBankLinks: async () => {},
    insertMemoryRecord: async (row) => {
      records.push(row);
    },
    insertMemoryChunks: async (rows) => {
      chunks.push(...rows);
    },
    retrieveMemoryCandidates: async () => [],
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
  return { store, records, chunks, proposals };
}

function fakeApprovalStore(): ApprovalStore {
  return { insert: vi.fn(async () => {}), getById: vi.fn(async () => ({ status: "pending" as never, approvalType: "memory_update" })), update: vi.fn(async () => {}) };
}

describe("harvestConversation", () => {
  it("auto-saves the founder's personal preference and PROPOSES the company fact", async () => {
    const cs = convStore();
    const ms = memStore();
    const deps: HarvestDeps = {
      extract: async () => ({
        candidates: [
          { content: "Moiz prefers punchy, aggressive hooks.", scope: "founder", area: "content", confidence: 0.9 },
          { content: "WOBBLE targets Pakistani SaaS founders.", scope: "company", area: "strategy", confidence: 0.8 },
        ],
      }),
      conversationDeps: { store: cs.store },
      memoryDeps: { store: ms.store, approvalStore: fakeApprovalStore(), recordAudit: async () => {}, embedder: null, now },
      recordAudit: async () => {},
      now,
    };

    const res = await harvestConversation({ conversationId: "conv_1" }, deps);

    expect(res.saved).toBe(1); // the personal preference
    expect(res.proposed).toBe(1); // the company fact (awaiting approval)
    expect(ms.records).toHaveLength(1);
    expect(ms.records[0].bankSlugs).toContain("founder_moiz");
    expect(ms.records[0].content).toContain("punchy");
    expect(cs.status()).toBe("harvested");
  });

  it("skips a conversation with no real content", async () => {
    const empty: ConversationStore = {
      insertConversation: async () => {},
      insertMessage: async () => {},
      touchConversation: async () => {},
      getConversation: async () => buildConversationRow({ founderName: "Moiz" }, { id: "conv_2", now }),
      listMessages: async () => [],
      listPendingHarvest: async () => [],
      setHarvestStatus: async () => {},
    };
    const res = await harvestConversation(
      { conversationId: "conv_2" },
      { extract: async () => ({ candidates: [] }), conversationDeps: { store: empty }, memoryDeps: { embedder: null }, recordAudit: async () => {} },
    );
    expect(res.skipped).toBe(true);
    expect(res.saved).toBe(0);
  });
});
