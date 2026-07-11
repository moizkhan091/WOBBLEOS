import { describe, expect, it, vi } from "vitest";
import {
  buildMemoryChunkRows,
  buildMemoryBankRow,
  buildMemoryRecordRow,
  buildMemoryUpdateProposalRow,
  rankMemoryChunks,
  resolveDeniedBankSlugs,
  isChunkVisibleForAccess,
  DEFAULT_MEMORY_BANKS,
  suggestMemoryBanks,
  type MemoryBankLinkRow,
  type MemoryBankRow,
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

  it("boosts pinned memories so they outrank a slightly-more-similar unpinned one", () => {
    const ranked = rankMemoryChunks({
      now: new Date("2026-06-26T00:00:00.000Z"),
      queryMode: "current",
      chunks: [
        { id: "unpinned", similarity: 0.8, tier: "working", trustLevel: "monitored", createdAt: "2026-06-25T00:00:00.000Z", archived: false },
        { id: "pinned", similarity: 0.7, tier: "working", trustLevel: "monitored", createdAt: "2026-06-25T00:00:00.000Z", archived: false, pinned: true },
      ],
    });
    expect(ranked[0]?.id).toBe("pinned");
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
  it("routes extracted source knowledge into multiple memory banks with approval still required", () => {
    const suggestion = suggestMemoryBanks({
      content: "Instagram carousel has a strong hook, premium visual hierarchy, and audience comments worth studying.",
      sourceType: "instagram_carousel",
      affectedArea: "content",
      tags: ["carousel", "design"],
    });

    expect(suggestion.needsApproval).toBe(true);
    expect(suggestion.bankSlugs).toEqual(
      expect.arrayContaining(["content", "design", "carousel_structure", "visual_reference"]),
    );
    expect(suggestion.confidence).toBeGreaterThan(0.5);
  });

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
        bankSlugs: ["brand"],
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
      bankSlugs: ["brand"],
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
        suggestedBankSlugs: ["brand", "company"],
        routerReason: "Brand source should feed brand and company memory.",
        routerConfidence: 0.74,
      },
      { id: "memproposal_1", now },
    );

    expect(proposal).toMatchObject({
      id: "memproposal_1",
      status: "pending",
      approvalId: null,
      confidence: "0.8",
      suggestedBankSlugs: ["brand", "company"],
      approvedBankSlugs: [],
      routerConfidence: "0.74",
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
  const banks: MemoryBankRow[] = DEFAULT_MEMORY_BANKS.map((bank) => buildMemoryBankRow(bank, { id: `memorybank_${bank.slug}`, now }));
  const records: MemoryRecordRow[] = [];
  const chunks: MemoryChunkRow[] = [];
  const links: MemoryBankLinkRow[] = [];
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
    listMemoryBanks: async (query) =>
      banks
        .filter((bank) => (query?.status ? bank.status === query.status : true))
        .filter((bank) => (query?.scope ? bank.scope === query.scope : true))
        .slice(0, query?.limit ?? banks.length),
    insertMemoryBankLinks: async (rows) => {
      links.push(...rows);
    },
    insertMemoryRecord: async (row) => {
      records.push(row);
    },
    insertMemoryChunks: async (rows) => {
      chunks.push(...rows);
    },
    retrieveMemoryCandidates: async (query) =>
      query.bankSlugs?.length
        ? seedCandidates.filter((candidate) => candidate.bankSlugs.some((slug) => query.bankSlugs?.includes(slug)))
        : seedCandidates,
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

  return { store, proposals, records, chunks, links, calls };
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
    const { store, records, chunks, links, calls } = makeMemoryStore([proposal]);
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
        bankSlugs: ["brand", "company"],
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
    expect(records[0]).toMatchObject({ bankSlugs: ["brand", "company"] });
    expect(chunks[0]).toMatchObject({ memoryTier: "core", trustLevel: "founder_core", sourceId: "source_1", bankSlugs: ["brand", "company"] });
    expect(links.map((link) => [link.memoryBankSlug, link.memoryRecordId, link.memoryChunkId])).toEqual(
      expect.arrayContaining([
        ["brand", result.memoryRecord.id, null],
        ["brand", result.memoryRecord.id, chunks[0].id],
        ["company", result.memoryRecord.id, null],
        ["company", result.memoryRecord.id, chunks[0].id],
      ]),
    );
    expect(calls.updateProposal[0].fields).toMatchObject({
      status: "approved",
      approvedBankSlugs: ["brand", "company"],
      approvedBy: "Moiz",
      approvedAt: now,
    });
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
    expect(calls.updateProposal[0].fields).toMatchObject({
      status: "rejected",
      rejectedBy: "Haad",
      rejectedAt: now,
      rejectedReason: "Not strong enough",
    });
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
        bankSlugs: [],
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
        bankSlugs: ["research"],
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
        bankSlugs: ["research"],
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

  it("filters retrieval by selected memory banks", async () => {
    const candidates: RetrievalMemoryChunk[] = [
      {
        id: "brand",
        memoryRecordId: "memory_brand",
        content: "Brand rule",
        similarity: 0.8,
        tier: "core",
        trustLevel: "founder_core",
        sourceId: null,
        parentEntityId: "memory_brand",
        entityType: "memory_record",
        status: "active",
        archived: false,
        tags: ["brand"],
        bankSlugs: ["brand"],
        createdAt: "2026-06-29T00:00:00.000Z",
      },
      {
        id: "seo",
        memoryRecordId: "memory_seo",
        content: "SEO rule",
        similarity: 0.8,
        tier: "working",
        trustLevel: "approved_expert",
        sourceId: null,
        parentEntityId: "memory_seo",
        entityType: "memory_record",
        status: "active",
        archived: false,
        tags: ["seo"],
        bankSlugs: ["seo"],
        createdAt: "2026-06-29T00:00:00.000Z",
      },
    ];
    const { store } = makeMemoryStore([], candidates);

    const result = await retrieveMemoryContext({ query: "brand", bankSlugs: ["brand"], limit: 10 }, { store, now });

    expect(result.map((chunk) => chunk.id)).toEqual(["brand"]);
  });

  it("deny-by-default: unscoped retrieval excludes founder-private banks unless authorized", async () => {
    const makeCandidate = (id: string, bankSlugs: string[]): RetrievalMemoryChunk => ({
      id,
      memoryRecordId: `memory_${id}`,
      content: `content ${id}`,
      similarity: 0.8,
      tier: "working",
      trustLevel: "approved_expert",
      sourceId: null,
      parentEntityId: `memory_${id}`,
      entityType: "memory_record",
      status: "active",
      archived: false,
      tags: [],
      bankSlugs,
      createdAt: "2026-06-28T00:00:00.000Z",
    });
    const candidates: RetrievalMemoryChunk[] = [
      makeCandidate("private", ["founder_moiz"]),          // Moiz-only → denied by default
      makeCandidate("shared", ["company"]),                // shared → always visible
      makeCandidate("mixed", ["founder_ali", "company"]),  // shared membership wins → visible
    ];
    const { store } = makeMemoryStore([], candidates);

    // No access context → founder-private bank is excluded, shared + mixed survive.
    const unscoped = await retrieveMemoryContext({ query: "x", limit: 10 }, { store, now });
    expect(unscoped.map((c) => c.id).sort()).toEqual(["mixed", "shared"]);

    // Authorized for Moiz → his private bank becomes visible.
    const authorized = await retrieveMemoryContext(
      { query: "x", limit: 10, access: { founderIds: ["moiz"] } },
      { store, now },
    );
    expect(authorized.map((c) => c.id).sort()).toEqual(["mixed", "private", "shared"]);

    // Explicit bankSlugs is the opt-in and bypasses deny-by-default entirely.
    const explicit = await retrieveMemoryContext(
      { query: "x", limit: 10, bankSlugs: ["founder_moiz"] },
      { store, now },
    );
    expect(explicit.map((c) => c.id)).toEqual(["private"]);
  });
});

describe("resolveDeniedBankSlugs / isChunkVisibleForAccess", () => {
  const banks = [
    { slug: "company", ownerScope: "company", ownerId: null },
    { slug: "founder_moiz", ownerScope: "founder", ownerId: "moiz" },
    { slug: "founder_ali", ownerScope: "founder", ownerId: "ali" },
    { slug: "client_acme", ownerScope: "client", ownerId: "acme" },
  ];

  it("denies every owner-scoped bank when access is empty", () => {
    expect(resolveDeniedBankSlugs(banks, {}).sort()).toEqual(["client_acme", "founder_ali", "founder_moiz"]);
  });

  it("grants only the owner ids the caller proves", () => {
    expect(resolveDeniedBankSlugs(banks, { founderIds: ["moiz"], clientIds: ["acme"] }).sort()).toEqual(["founder_ali"]);
  });

  it("allowOwnerScoped denies nothing", () => {
    expect(resolveDeniedBankSlugs(banks, { allowOwnerScoped: true })).toEqual([]);
  });

  it("a chunk is hidden only when every one of its banks is denied", () => {
    const denied = new Set(["founder_moiz", "founder_ali"]);
    expect(isChunkVisibleForAccess(["founder_moiz"], denied)).toBe(false);
    expect(isChunkVisibleForAccess(["founder_moiz", "company"], denied)).toBe(true); // shared wins
    expect(isChunkVisibleForAccess([], denied)).toBe(true); // unlinked = shared
    expect(isChunkVisibleForAccess(["company"], denied)).toBe(true);
    expect(isChunkVisibleForAccess(["founder_moiz"], new Set())).toBe(true); // nothing denied
  });
});
