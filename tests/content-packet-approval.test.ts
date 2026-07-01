import { describe, expect, it, vi } from "vitest";
import type { AuditEventInput } from "@/lib/domain/audit";
import type { ApprovalStore } from "@/lib/approvals";
import {
  approveContentPacket,
  rejectContentPacket,
  type ContentCommandStore,
  type ContentPacketRow,
  type ContentTrackRow,
  type ContentVersionRow,
  type QualityReviewRow,
} from "@/lib/content";
import { buildContentPacketRow, buildContentTrackRow } from "@/lib/domain/content-command";

const now = new Date("2026-07-01T12:00:00.000Z");

function makePacket(id = "content_1"): ContentPacketRow {
  return buildContentPacketRow(
    {
      contentTrackId: "track_wobble_company",
      platform: "linkedin",
      format: "text",
      objective: "Teach founders why AI tools without an operating system create chaos.",
      targetAudience: "Owner-led businesses",
      angle: "AI tools are not the same as an AI operating system.",
      hook: "Your AI tools are multiplying decisions, not removing them.",
      mainCopy: "A real AI OS routes work, memory, approvals, and execution through one governed loop.",
      caption: "Build the operating system, not another tab.",
      cta: "Audit your AI workflow this week.",
      designDirection: "Black/lime WOBBLE system card.",
      sourceIdsUsed: ["source_1"],
      insightIdsUsed: ["insight_1"],
      memoryChunksUsed: ["memory_1"],
      evidenceSummary: "Based on approved WOBBLE positioning memory.",
      claimRiskLevel: "low",
      proofRequired: false,
      selfReview: {
        usefulness: 8,
        originality: 8,
        brandFit: 9,
        clarity: 8,
        aggressionControl: 8,
        proofStrength: 7,
        postWorthiness: "pass",
      },
      approvalStatus: "pending",
      createdBy: "Codex test",
    },
    { id, now },
  );
}

function makeTrack(): ContentTrackRow {
  return buildContentTrackRow(
    {
      slug: "wobble_company",
      label: "WOBBLE Company",
      ownerType: "company",
      voiceProfile: {},
      goals: ["teach"],
      allowedTopics: ["ai os"],
      bannedPhrases: [],
      platformPriorities: ["linkedin"],
      approvalRequired: true,
      status: "active",
    },
    { id: "track_wobble_company", now },
  );
}

function makeContentStore(seedPacket: ContentPacketRow) {
  const packets = new Map<string, ContentPacketRow>([[seedPacket.id, seedPacket]]);
  const track = makeTrack();
  const updates: Array<{ id: string; fields: Partial<ContentPacketRow> }> = [];

  const store: ContentCommandStore = {
    insertTrack: vi.fn(async () => {}),
    updateTrack: vi.fn(async () => {}),
    getTrackById: vi.fn(async (id) => (id === track.id ? track : null)),
    listTracks: vi.fn(async () => [track]),
    insertPacket: vi.fn(async (row) => {
      packets.set(row.id, row);
    }),
    updatePacket: vi.fn(async (id, fields) => {
      updates.push({ id, fields });
      const current = packets.get(id);
      if (current) packets.set(id, { ...current, ...fields });
    }),
    getPacketById: vi.fn(async (id) => packets.get(id) ?? null),
    listPackets: vi.fn(async () => [...packets.values()]),
    insertVersion: vi.fn(async () => {}),
    listVersions: vi.fn(async (): Promise<ContentVersionRow[]> => []),
    insertQualityReview: vi.fn(async () => {}),
    listQualityReviews: vi.fn(async (): Promise<QualityReviewRow[]> => []),
  };

  return { store, packets, updates };
}

function makeApprovalStore(status: "pending" | "approved" | "rejected" = "pending") {
  const updates: Array<{ id: string; fields: Record<string, unknown> }> = [];
  const store: ApprovalStore = {
    insert: vi.fn(async () => {}),
    getById: vi.fn(async () => ({ status, approvalType: "content_packet" })),
    update: vi.fn(async (id, fields) => {
      updates.push({ id, fields });
    }),
  };
  return { store, updates };
}

describe("content packet approval actions", () => {
  it("approves the approval row, flips packet approvalStatus to approved, and audits both effects", async () => {
    const packet = makePacket();
    const { store, packets, updates } = makeContentStore(packet);
    const approvalStore = makeApprovalStore();
    const audit: AuditEventInput[] = [];

    const result = await approveContentPacket(
      { packetId: packet.id, approvalId: "approval_1", approvedBy: "Moiz", notes: "Strong enough" },
      {
        store,
        approvalStore: approvalStore.store,
        recordAudit: async (event) => {
          audit.push(event);
        },
        now,
      },
    );

    expect(result.approvalStatus).toBe("approved");
    expect(packets.get(packet.id)?.approvalStatus).toBe("approved");
    expect(updates).toEqual([{ id: packet.id, fields: { approvalStatus: "approved", updatedAt: now } }]);
    expect(approvalStore.updates[0]).toMatchObject({
      id: "approval_1",
      fields: { status: "approved", approvedBy: "Moiz", approvedAt: now, approvalAction: "approve" },
    });
    expect(audit.map((event) => event.eventType)).toEqual(["approval.approve", "content_packet.approved"]);
  });

  it("rejects the approval row, flips packet approvalStatus to rejected, and audits both effects", async () => {
    const packet = makePacket("content_2");
    const { store, packets, updates } = makeContentStore(packet);
    const approvalStore = makeApprovalStore();
    const audit: AuditEventInput[] = [];

    const result = await rejectContentPacket(
      { packetId: packet.id, approvalId: "approval_2", approvedBy: "Haad", notes: "Too generic" },
      {
        store,
        approvalStore: approvalStore.store,
        recordAudit: async (event) => {
          audit.push(event);
        },
        now,
      },
    );

    expect(result.approvalStatus).toBe("rejected");
    expect(packets.get(packet.id)?.approvalStatus).toBe("rejected");
    expect(updates).toEqual([{ id: packet.id, fields: { approvalStatus: "rejected", updatedAt: now } }]);
    expect(approvalStore.updates[0]).toMatchObject({
      id: "approval_2",
      fields: { status: "rejected", rejectedBy: "Haad", rejectedAt: now, approvalAction: "reject" },
    });
    expect(audit.map((event) => event.eventType)).toEqual(["approval.reject", "content_packet.rejected"]);
  });
});
