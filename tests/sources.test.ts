import { describe, expect, it, vi } from "vitest";
import {
  assertSupportedSourceFile,
  buildFileRow,
  buildSourceChunkRows,
  buildSourceRow,
  resolveSourceTrust,
  type SourceTrustLevel,
} from "@/lib/domain/sources";
import {
  approveSource,
  attachSourceChunks,
  createSource,
  listApprovedSourcesForJobs,
  rejectSource,
  type SourceFileRow,
  type SourceLibraryStore,
  type SourceRow,
} from "@/lib/sources";
import type { AuditEventInput } from "@/lib/domain/audit";
import type { ApprovalStore } from "@/lib/approvals";

const now = new Date("2026-06-29T12:00:00.000Z");

const trustLevels: SourceTrustLevel[] = [
  {
    id: "trust_tier_1_core_wobble",
    slug: "tier_1_core_wobble",
    label: "Tier 1: Core WOBBLE",
    priority: 1,
    canUpdateBrain: true,
  },
  {
    id: "trust_tier_2_approved_expert",
    slug: "tier_2_approved_expert",
    label: "Tier 2: Approved Expert",
    priority: 2,
    canUpdateBrain: false,
  },
  {
    id: "trust_tier_4_experimental",
    slug: "tier_4_experimental",
    label: "Tier 4: Experimental",
    priority: 4,
    canUpdateBrain: false,
  },
  {
    id: "trust_blocked",
    slug: "blocked",
    label: "Blocked",
    priority: 99,
    canUpdateBrain: false,
  },
];

describe("source domain", () => {
  it("builds new unknown sources as pending experimental records", () => {
    const row = buildSourceRow(
      {
        title: "AI OS transcript",
        sourceType: "transcript",
        addedBy: "Moiz",
        metadata: { origin: "youtube" },
      },
      { id: "source_fixed", now },
    );

    expect(row).toMatchObject({
      id: "source_fixed",
      title: "AI OS transcript",
      sourceType: "transcript",
      trustLevel: "tier_4_experimental",
      approvalStatus: "pending",
      status: "active",
      addedBy: "Moiz",
      approvedBy: null,
      approvedAt: null,
      metadata: { origin: "youtube" },
      createdAt: now,
      updatedAt: now,
    });
  });

  it("never allows explicit trusted sources to skip approval", () => {
    const row = buildSourceRow(
      {
        title: "Founder doc",
        sourceType: "document",
        trustLevel: "tier_1_core_wobble",
        approvalStatus: "approved",
        addedBy: "Moiz",
      },
      { id: "source_trusted", now },
    );

    expect(row.trustLevel).toBe("tier_1_core_wobble");
    expect(row.approvalStatus).toBe("pending");
    expect(row.approvedBy).toBeNull();
  });

  it("resolves source trust hierarchy and blocks invalid trust slugs", () => {
    expect(resolveSourceTrust("tier_1_core_wobble", trustLevels)).toMatchObject({
      slug: "tier_1_core_wobble",
      canUpdateBrain: true,
      isBlocked: false,
    });
    expect(resolveSourceTrust("blocked", trustLevels)).toMatchObject({ isBlocked: true });
    expect(() => resolveSourceTrust("random_blog", trustLevels)).toThrowError(/unknown source trust level/);
  });

  it("rejects unsupported upload file types", () => {
    expect(() =>
      assertSupportedSourceFile({ filename: "clip.exe", mimeType: "application/x-msdownload", sizeBytes: 10 }),
    ).toThrowError(/unsupported source file type/);
  });

  it("accepts supported uploads and normalizes file metadata rows", () => {
    const row = buildFileRow(
      {
        path: "/storage/sources/source_1/transcript.txt",
        fileType: "txt",
        mimeType: "text/plain",
        module: "source_library",
        linkedEntityId: "source_1",
        createdBy: "Moiz",
        sizeBytes: 1234,
        checksum: "abc123",
      },
      { id: "file_fixed", now },
    );

    expect(row).toMatchObject({
      id: "file_fixed",
      fileType: "txt",
      module: "source_library",
      linkedEntityType: "source",
      linkedEntityId: "source_1",
      approvalState: "pending",
      sizeBytes: "1234",
      checksum: "abc123",
      metadata: { mimeType: "text/plain" },
    });
  });

  it("builds ordered source chunk rows", () => {
    const chunks = buildSourceChunkRows(
      { sourceId: "source_1", chunks: ["First", "Second"], metadata: { parser: "manual" } },
      { ids: ["chunk_1", "chunk_2"], now },
    );
    expect(chunks.map((chunk) => [chunk.id, chunk.chunkIndex, chunk.content])).toEqual([
      ["chunk_1", 0, "First"],
      ["chunk_2", 1, "Second"],
    ]);
    expect(chunks[0].metadata).toEqual({ parser: "manual" });
  });
});

function makeSourceStore(seed: SourceRow[] = []) {
  const sources = new Map(seed.map((source) => [source.id, source]));
  const files: SourceFileRow[] = [];
  const chunks: ReturnType<typeof buildSourceChunkRows> = [];
  const calls = {
    updateSource: [] as Array<{ id: string; fields: Record<string, unknown> }>,
    insertSource: [] as SourceRow[],
    insertFile: [] as SourceFileRow[],
  };

  const store: SourceLibraryStore = {
    insertSource: async (row) => {
      calls.insertSource.push(row);
      sources.set(row.id, row);
    },
    insertFile: async (row) => {
      calls.insertFile.push(row);
      files.push(row);
    },
    getSourceById: async (id) => sources.get(id) ?? null,
    updateSource: async (id, fields) => {
      calls.updateSource.push({ id, fields });
      const current = sources.get(id);
      if (current) sources.set(id, { ...current, ...fields } as SourceRow);
    },
    insertSourceChunks: async (rows) => {
      chunks.push(...rows);
    },
    listSources: async (query) =>
      [...sources.values()]
        .filter((source) => (query.approvalStatus ? source.approvalStatus === query.approvalStatus : true))
        .filter((source) => (query.status ? source.status === query.status : true))
        .filter((source) => (query.trustLevel ? source.trustLevel === query.trustLevel : true))
        .slice(0, query.limit),
    listApprovedSourcesForJobs: async () =>
      [...sources.values()].filter((source) => source.status === "active" && source.approvalStatus === "approved"),
  };

  return { store, calls, sources, files, chunks };
}

function fakeApprovalStore(status: "pending" | "approved" | "rejected" = "pending") {
  const inserted: unknown[] = [];
  const updates: Array<{ id: string; fields: Record<string, unknown> }> = [];
  const store: ApprovalStore = {
    insert: vi.fn(async (row) => {
      inserted.push(row);
    }),
    getById: vi.fn(async () => ({ status: status as never, approvalType: "source" })),
    update: vi.fn(async (id, fields) => {
      updates.push({ id, fields });
    }),
  };
  return { store, inserted, updates };
}

describe("source library service", () => {
  it("creates a pending source, optional file metadata, source approval, and audit event", async () => {
    const { store, calls } = makeSourceStore();
    const approval = fakeApprovalStore();
    const audit: AuditEventInput[] = [];

    const result = await createSource(
      {
        title: "New transcript",
        sourceType: "transcript",
        addedBy: "Moiz",
        file: {
          path: "/storage/sources/source_1/transcript.txt",
          fileType: "txt",
          mimeType: "text/plain",
          createdBy: "Moiz",
          sizeBytes: 100,
          checksum: "hash",
        },
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

    expect(result.source.approvalStatus).toBe("pending");
    expect(calls.insertSource).toHaveLength(1);
    expect(calls.insertFile).toHaveLength(1);
    expect(result.approval).toMatchObject({ approvalType: "source", entityType: "source", entityId: result.source.id });
    expect(audit.some((event) => event.eventType === "source.added")).toBe(true);
  });

  it("rejects unsupported files before creating a source", async () => {
    const { store, calls } = makeSourceStore();
    await expect(
      createSource(
        {
          title: "Bad file",
          sourceType: "upload",
          addedBy: "Moiz",
          file: {
            path: "/storage/sources/bad.exe",
            fileType: "exe",
            mimeType: "application/x-msdownload",
            createdBy: "Moiz",
            sizeBytes: 100,
          },
        },
        { store, recordAudit: async () => {}, approvalStore: fakeApprovalStore().store, now },
      ),
    ).rejects.toThrowError(/unsupported source file type/);
    expect(calls.insertSource).toHaveLength(0);
  });

  it("approves a source through the approval system and updates source trust attribution", async () => {
    const existing = buildSourceRow({ title: "Pending source", sourceType: "url", addedBy: "Moiz" }, { id: "source_1", now });
    const { store, calls } = makeSourceStore([existing]);
    const approval = fakeApprovalStore("pending");
    const audit: AuditEventInput[] = [];

    // Transactional-outbox seam: the atomic flip+record is injected; assert the effect intent + the
    // inline idempotent activation both run.
    let recordedEffect: { effectType: string; entityId: string; payload?: Record<string, unknown> } | null = null;
    const result = await approveSource(
      {
        sourceId: "source_1",
        approvalId: "approval_1",
        approvedBy: "Haad",
        trustLevel: "tier_2_approved_expert",
        trustLevels,
      },
      {
        store,
        approvalStore: approval.store,
        claimAndRecordEffect: async (i) => { recordedEffect = i.effect; return { claimed: true, effectId: "eff_1" }; },
        recordAudit: async (input) => {
          audit.push(input);
        },
        now,
      },
    );

    expect(result.source.approvalStatus).toBe("approved");
    expect(result.source.trustLevel).toBe("tier_2_approved_expert");
    // The activation effect intent was recorded atomically with the flip.
    expect(recordedEffect).toMatchObject({ effectType: "source.activate", entityId: "source_1", payload: { trustLevel: "tier_2_approved_expert" } });
    // The inline idempotent activation ran (updateSource).
    expect(calls.updateSource[0].fields).toMatchObject({
      approvalStatus: "approved",
      trustLevel: "tier_2_approved_expert",
      approvedBy: "Haad",
      approvedAt: now,
    });
    expect(audit.some((event) => event.eventType === "approval.approve")).toBe(true);
    expect(audit.some((event) => event.eventType === "source.approved")).toBe(true);
  });

  it("approving an already-actioned source is a no-op (lost the atomic claim)", async () => {
    const existing = buildSourceRow({ title: "Pending source", sourceType: "url", addedBy: "Moiz" }, { id: "source_1", now });
    const { store, calls } = makeSourceStore([existing]);
    const result = await approveSource(
      { sourceId: "source_1", approvalId: "approval_1", approvedBy: "Haad", trustLevel: "tier_2_approved_expert", trustLevels },
      { store, recordAudit: async () => {}, claimAndRecordEffect: async () => ({ claimed: false, effectId: null }), now },
    );
    expect(result.source.id).toBe("source_1");
    expect(calls.updateSource).toHaveLength(0); // did not re-activate — idempotent
  });

  it("rejects a source through the approval system", async () => {
    const existing = buildSourceRow({ title: "Pending source", sourceType: "url", addedBy: "Moiz" }, { id: "source_1", now });
    const { store, calls } = makeSourceStore([existing]);

    const result = await rejectSource(
      { sourceId: "source_1", approvalId: "approval_1", rejectedBy: "Moiz", reason: "Not useful" },
      { store, approvalStore: fakeApprovalStore("pending").store, recordAudit: async () => {}, now },
    );

    expect(result.source.approvalStatus).toBe("rejected");
    expect(calls.updateSource[0].fields).toMatchObject({ approvalStatus: "rejected", status: "archived" });
  });

  it("attaches chunks only to approved sources", async () => {
    const approved = buildSourceRow(
      { title: "Approved", sourceType: "transcript", approvalStatus: "pending" },
      { id: "source_1", now },
    );
    const { store, chunks } = makeSourceStore([{ ...approved, approvalStatus: "approved" }]);

    const rows = await attachSourceChunks(
      { sourceId: "source_1", chunks: ["alpha", "beta"], metadata: { parser: "manual" } },
      { store, recordAudit: async () => {}, now },
    );

    expect(rows).toHaveLength(2);
    expect(chunks).toHaveLength(2);
  });

  it("blocks chunk attachment for pending sources", async () => {
    const pending = buildSourceRow({ title: "Pending", sourceType: "transcript" }, { id: "source_1", now });
    const { store } = makeSourceStore([pending]);

    await expect(
      attachSourceChunks({ sourceId: "source_1", chunks: ["nope"] }, { store, recordAudit: async () => {}, now }),
    ).rejects.toThrowError(/must be approved/);
  });

  it("returns only active approved sources for job handlers", async () => {
    const approved = {
      ...buildSourceRow({ title: "Approved", sourceType: "url" }, { id: "source_ok", now }),
      approvalStatus: "approved" as const,
    };
    const pending = buildSourceRow({ title: "Pending", sourceType: "url" }, { id: "source_pending", now });
    const { store } = makeSourceStore([approved, pending]);

    const sources = await listApprovedSourcesForJobs({ store, limit: 10 });
    expect(sources.map((source) => source.id)).toEqual(["source_ok"]);
  });
});
