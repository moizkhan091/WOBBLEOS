import { describe, expect, it, vi } from "vitest";
import {
  buildMemoryChunkRows,
  buildMemoryRecordRow,
  buildMemoryUpdateProposalRow,
  rankMemoryChunks,
  type MemoryChunkRow,
  type MemoryRecordRow,
  type MemoryUpdateProposalRow,
  type RetrievalMemoryChunk,
} from "@/lib/domain/memory";
import {
  approveMemoryUpdate,
  proposeMemoryUpdate,
  rejectMemoryUpdate,
  retrieveMemoryContext,
  type MemoryStore,
} from "@/lib/memory";
import type { ApprovalStore } from "@/lib/approvals";
import type { AuditEventInput } from "@/lib/domain/audit";

const now = new Date("2026-06-29T12:00:00.000Z");

describe("rankMemoryChunks", () => {
  it("filters archived chunks unless archived search is requested", () => {
    const ranked = rankMemoryChunks({
      now: new Date("2026-06-26T00:00:00.000Z"),
      queryMode: "current",
      chunks: [
        { id: "fresh", similarity: 0.82, tier: "working", trustLevel: "approved_expert", createdAt: "2026-06-25T00:00:00.000Z", archived: false },
        { id: "old-archived", similarity: 0.99, tier: "episodic", trustLevel: "monitored", createdAt: "2024-01-01T00:00:00.000Z", archived: true },
      ],
    });

    expect(ranked.map((chunk) => chunk.id)).toEqual(["fresh"]);
  });

  it("uses recency to break close similarity ties for current queries", () => {
    const ranked = rankMemoryChunks({
      now: new Date("2026-06-26T00:00:00.000Z"),
      queryMode: "current",
      chunks: [
        { id: "old", similarity: 0.86, tier: "episodic", trustLevel: "monitored", createdAt: "2024-01-01T00:00:00.000Z", archived: false },
        { id: "fresh", similarity: 0.84, tier: "episodic", trustLevel: "monitored", createdAt: "2026-06-25T00:00:00.000Z", archived: false },
      ],
    });

    expect(ranked[0]?.id).toBe("fresh");
  });
});

describe("memory domain builders", () => {
  it("builds metadata-rich memory records and chunks", () => {
    const record = buildMemoryRecordRow(
      {
        slug: "do-not-say-generic-ai-agency",
        title: "Do not say generic AI agency",
        memoryTier: "core",
        area: "brand",
        content: "Avoid generic AI agency language.",
        sourceId: "source_1",
        confidence: 0.92,
        approvedBy: "Moiz",
      },
      { id: "memory_1", now },
    );

    expect(record).toMatchObject({
      id: "memory_1",
      memoryTier: "core",
      area: "brand",
      confidence: "0.92",
      approvedBy: "Moiz",
      approvedAt: now,
      status: "active",
    });

    const chunks = buildMemoryChunkRows(
      {
        memoryRecordId: "memory_1",
        content: "Avoid generic AI agency language.",
        memoryTier: "core",
        trustLevel: "founder_core",
        sourceId: "source_1",
        parentEntityId: "memory_1",
        entityType: "memory_record",
        tags: ["brand", "do-not-say"],
      },
      { ids: ["chunk_1"], now },
    );

    expect(chunks[0]).toMatchObject({
      id: "chunk_1",
      memoryTier: "core",
      trustLevel: "founder_core",
      archived: false,
      status: "active",
      tags: ["brand", "do-not-say"],
    });
  });

  it("builds pending memory update proposals without mutating memory", () => {
    const proposal = buildMemoryUpdateProposalRow(
      {
        proposedMemory: "WOBBLE should cite proof for aggressive claims.",
        reason: "Brand safety from source review.",
        sourceId: "source_1",
        affectedArea: "brand",
        confidence: 0.8,
      },
      { id: "memproposal_1", now },
    );

    expect(proposal).toMatchObject({
      id: "memproposal_1",
      status: "pending",
      approvalId: null,
      confidence: "0.8",
      approvedBy: null,
      rejectedBy: null,
    });
  });
});

function fakeApprovalStore(status: "pending" | "approved" | "rejected" = "pending") {
  const inserted: unknown[] = [];
  const updates: Array<{ id: string; fields: Record<string, unknown> }> = [];
  const store: ApprovalStore = {
    insert: vi.fn(async (row) => {
      inserted.push(row);
    }),
    getById: vi.fn(async () => ({ status: status as never, approvalType: "memory_update" })),
    update: vi.fn(async (id, fields) => {
      updates.push({ id, fields });
    }),
  };
  return { store, inserted, updates };
}

function makeMemoryStore(seedProposals: MemoryUpdateProposalRow[] = [], seedCandidates: RetrievalMemoryChunk[] = []) {
  const proposals = new Map(seedProposals.map((proposal) => [proposal.id, proposal]));
  const records: MemoryRecordRow[] = [];
  const chunks: MemoryChunkRow[] = [];
  const calls = {
    updateProposal: [] as Array<{ id: string; fields: Partial<MemoryUpdateProposalRow> }>,
  };

  const store: MemoryStore = {
    insertProposal: async (row) => {
      proposals.set(row.id, row);
    },
    getProposalById: async (id) => proposals.get(id) ?? null,
    updateProposal: async (id, fields) => {
      calls.updateProposal.push({ id, fields });
      const current = proposals.get(id);
      if (current) proposals.set(id, { ...current, ...fields });
    },
    insertMemoryRecord: async (row) => {
      records.push(row);
    },
    insertMemoryChunks: async (rows) => {
      chunks.push(...rows);
    },
    retrieveMemoryCandidates: async () => seedCandidates,
    listMemoryRecords: async () => records,
    listMemoryProposals: async () => [...proposals.values()],
  };

  return { store, proposals, records, chunks, calls };
}

describe("memory service", () => {
  it("proposes a memory update, creates a memory_update approval, and writes audit", async () => {
    const { store, proposals } = makeMemoryStore();
    const approval = fakeApprovalStore();
    const audit: AuditEventInput[] = [];

    const result = await proposeMemoryUpdate(
      {
        proposedMemory: "Teach-first content remains the default.",
        reason: "Founder strategy decision.",
        affectedArea: "content",
        confidence: 0.9,
        proposedBy: "Moiz",
      },
      {
        store,
        approvalStore: approval.store,
        recordAudit: async (input) => {
          audit.push(input);
        },
        now,
      },
    );

    expect(result.proposal.status).toBe("pending");
    expect(result.approval).toMatchObject({
      approvalType: "memory_update",
      entityType: "memory_update_proposal",
      entityId: result.proposal.id,
    });
    expect(proposals.get(result.proposal.id)?.approvalId).toBe(result.approval.id);
    expect(audit.some((event) => event.eventType === "memory_update.proposed")).toBe(true);
  });

  it("approves a proposal before inserting memory record and chunk", async () => {
    const proposal = buildMemoryUpdateProposalRow(
      {
        proposedMemory: "Avoid generic AI agency language.",
        reason: "Brand voice rule.",
        sourceId: "source_1",
        affectedArea: "brand",
        confidence: 0.95,
      },
      { id: "proposal_1", now },
    );
    const { store, records, chunks, calls } = makeMemoryStore([proposal]);
    const audit: AuditEventInput[] = [];

    const result = await approveMemoryUpdate(
      {
        proposalId: "proposal_1",
        approvalId: "approval_1",
        approvedBy: "Moiz",
        slug: "do-not-say-generic-ai-agency",
        title: "Do not say generic AI agency",
        memoryTier: "core",
        trustLevel: "founder_core",
        tags: ["brand", "do-not-say"],
      },
      {
        store,
        approvalStore: fakeApprovalStore("pending").store,
        recordAudit: async (input) => {
          audit.push(input);
        },
        now,
      },
    );

    expect(result.memoryRecord.id.startsWith("memory_")).toBe(true);
    expect(records).toHaveLength(1);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ memoryTier: "core", trustLevel: "founder_core", sourceId: "source_1" });
    expect(calls.updateProposal[0].fields).toMatchObject({ status: "approved", approvedBy: "Moiz", approvedAt: now });
    expect(audit.some((event) => event.eventType === "approval.approve")).toBe(true);
    expect(audit.some((event) => event.eventType === "memory_update.approved")).toBe(true);
  });

  it("rejects a proposal without inserting memory", async () => {
    const proposal = buildMemoryUpdateProposalRow(
      {
        proposedMemory: "Bad memory",
        reason: "Weak source.",
        affectedArea: "brand",
      },
      { id: "proposal_1", now },
    );
    const { store, records, chunks, calls } = makeMemoryStore([proposal]);

    await rejectMemoryUpdate(
      { proposalId: "proposal_1", approvalId: "approval_1", rejectedBy: "Haad", reason: "Not strong enough" },
      { store, approvalStore: fakeApprovalStore("pending").store, recordAudit: async () => {}, now },
    );

    expect(records).toHaveLength(0);
    expect(chunks).toHaveLength(0);
    expect(calls.updateProposal[0].fields).toMatchObject({ status: "rejected", rejectedBy: "Haad", rejectedAt: now });
  });

  it("retrieves only active, trusted, metadata-rich memory and ranks it", async () => {
    const candidates: RetrievalMemoryChunk[] = [
      {
        id: "blocked",
        memoryRecordId: "memory_blocked",
        content: "Do not use",
        similarity: 0.99,
        tier: "core",
        trustLevel: "blocked",
        sourceId: "source_bad",
        parentEntityId: "memory_blocked",
        entityType: "memory_record",
        status: "active",
        archived: false,
        tags: [],
        createdAt: "2026-06-29T00:00:00.000Z",
      },
      {
        id: "old",
        memoryRecordId: "memory_old",
        content: "Old but matching",
        similarity: 0.86,
        tier: "episodic",
        trustLevel: "monitored",
        sourceId: "source_old",
        parentEntityId: "memory_old",
        entityType: "source_rollup",
        status: "active",
        archived: false,
        tags: ["market"],
        createdAt: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "fresh",
        memoryRecordId: "memory_fresh",
        content: "Fresh approved insight",
        similarity: 0.84,
        tier: "episodic",
        trustLevel: "monitored",
        sourceId: "source_new",
        parentEntityId: "memory_fresh",
        entityType: "source_rollup",
        status: "active",
        archived: false,
        tags: ["market"],
        createdAt: "2026-06-28T00:00:00.000Z",
      },
    ];
    const { store } = makeMemoryStore([], candidates);

    const result = await retrieveMemoryContext(
      { query: "market trend", queryMode: "current", limit: 5 },
      { store, now },
    );

    expect(result.map((chunk) => chunk.id)).toEqual(["fresh", "old"]);
    expect(result[0]).toMatchObject({
      content: "Fresh approved insight",
      sourceId: "source_new",
      memoryRecordId: "memory_fresh",
      score: expect.any(Number),
    });
  });
});
