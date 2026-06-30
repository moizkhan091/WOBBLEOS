import { describe, expect, it, vi } from "vitest";
import {
  buildContentTrackPromptBlock,
  buildContentPacketRow,
  buildContentTrackRow,
  buildContentVersionRow,
  buildQualityReviewRow,
  type ContentPacketRow,
  type ContentTrackRow,
  type ContentVersionRow,
  type QualityReviewRow,
} from "@/lib/domain/content-command";
import {
  addContentPacketVersion,
  createContentPacket,
  createContentTrack,
  getContentPacketDetail,
  listContentPackets,
  listContentTracks,
  updateContentTrack,
  type ContentCommandStore,
} from "@/lib/content";
import type { ApprovalStore } from "@/lib/approvals";
import type { AuditEventInput } from "@/lib/domain/audit";

const now = new Date("2026-06-30T08:00:00.000Z");

const passingReview = {
  usefulness: 8,
  originality: 8,
  brandFit: 9,
  clarity: 8,
  aggressionControl: 7,
  proofStrength: 7,
  postWorthiness: "pass" as const,
};

const failingReview = {
  usefulness: 8,
  originality: 6,
  brandFit: 9,
  clarity: 8,
  aggressionControl: 7,
  proofStrength: 7,
  postWorthiness: "pass" as const,
};

function packetInput(overrides: Partial<Parameters<typeof buildContentPacketRow>[0]> = {}) {
  return {
    contentTrackId: "track_wobble_company",
    platform: "linkedin" as const,
    format: "text" as const,
    objective: "teach AI OS ownership",
    targetAudience: "Pakistani owner-led businesses",
    angle: "Agencies keep the process. Businesses should own the system.",
    hook: "Your agency is not your advantage. Your operating system is.",
    mainCopy: "Most businesses are still renting output instead of building capability.",
    caption: "Build the machine, not another dependency.",
    cta: "Book an AI Readiness Call.",
    designDirection: "Black liquid-glass WOBBLE card with electric lime proof points.",
    sourceIdsUsed: ["source_company_os"],
    insightIdsUsed: ["insight_agency_dependency"],
    memoryChunksUsed: ["memorychunk_brand_voice"],
    evidenceSummary: "Uses approved WOBBLE Company OS positioning and Brain content strategy.",
    claimRiskLevel: "medium" as const,
    proofRequired: true,
    selfReview: passingReview,
    createdBy: "Moiz",
    ...overrides,
  };
}

function fakeApprovalStore() {
  const inserted: unknown[] = [];
  const updates: Array<{ id: string; fields: Record<string, unknown> }> = [];
  const store: ApprovalStore = {
    insert: vi.fn(async (row) => {
      inserted.push(row);
    }),
    getById: vi.fn(async () => ({ status: "pending" as const, approvalType: "content_packet" })),
    update: vi.fn(async (id, fields) => {
      updates.push({ id, fields });
    }),
  };
  return { store, inserted, updates };
}

function makeContentStore(seed: {
  tracks?: ContentTrackRow[];
  packets?: ContentPacketRow[];
  versions?: ContentVersionRow[];
  reviews?: QualityReviewRow[];
} = {}) {
  const tracks = new Map((seed.tracks ?? []).map((track) => [track.id, track]));
  const packets = new Map((seed.packets ?? []).map((packet) => [packet.id, packet]));
  const versions: ContentVersionRow[] = [...(seed.versions ?? [])];
  const reviews: QualityReviewRow[] = [...(seed.reviews ?? [])];
  const calls = {
    insertTrack: [] as ContentTrackRow[],
    updateTrack: [] as Array<{ id: string; fields: Partial<ContentTrackRow> }>,
    insertPacket: [] as ContentPacketRow[],
    updatePacket: [] as Array<{ id: string; fields: Partial<ContentPacketRow> }>,
    insertVersion: [] as ContentVersionRow[],
    insertQualityReview: [] as QualityReviewRow[],
  };

  const store: ContentCommandStore = {
    insertTrack: async (row) => {
      calls.insertTrack.push(row);
      tracks.set(row.id, row);
    },
    updateTrack: async (id, fields) => {
      calls.updateTrack.push({ id, fields });
      const current = tracks.get(id);
      if (current) tracks.set(id, { ...current, ...fields });
    },
    getTrackById: async (id) => tracks.get(id) ?? null,
    listTracks: async (query = {}) =>
      [...tracks.values()]
        .filter((track) => (query.status ? track.status === query.status : true))
        .filter((track) => (query.ownerType ? track.ownerType === query.ownerType : true))
        .filter((track) => (query.slug ? track.slug === query.slug : true))
        .slice(0, query.limit ?? 50),
    insertPacket: async (row) => {
      calls.insertPacket.push(row);
      packets.set(row.id, row);
    },
    updatePacket: async (id, fields) => {
      calls.updatePacket.push({ id, fields });
      const current = packets.get(id);
      if (current) packets.set(id, { ...current, ...fields });
    },
    getPacketById: async (id) => packets.get(id) ?? null,
    listPackets: async (query) =>
      [...packets.values()]
        .filter((packet) => (query.contentTrackId ? packet.contentTrackId === query.contentTrackId : true))
        .filter((packet) => (query.approvalStatus ? packet.approvalStatus === query.approvalStatus : true))
        .filter((packet) => (query.platform ? packet.platform === query.platform : true))
        .slice(0, query.limit),
    insertVersion: async (row) => {
      calls.insertVersion.push(row);
      versions.push(row);
    },
    listVersions: async (contentPacketId) => versions.filter((version) => version.contentPacketId === contentPacketId),
    insertQualityReview: async (row) => {
      calls.insertQualityReview.push(row);
      reviews.push(row);
    },
    listQualityReviews: async (entityId) => reviews.filter((review) => review.entityId === entityId),
  };

  return { store, calls, tracks, packets, versions, reviews };
}

describe("content command domain", () => {
  it("builds editable content tracks instead of hardcoding one WOBBLE-only lane", () => {
    const row = buildContentTrackRow(
      {
        slug: "wobble_company",
        label: "WOBBLE Company",
        ownerType: "company",
        voiceProfile: { tone: "teach-first, sharp, premium" },
        goals: ["education", "AI OS authority"],
        allowedTopics: ["AI operating systems", "agency dependency"],
        bannedPhrases: ["AI agency"],
        aggressionRange: { min: 2, max: 8 },
        platformPriorities: ["linkedin", "instagram", "x"],
        approvalRequired: true,
      },
      { id: "track_wobble_company", now },
    );

    expect(row).toMatchObject({
      id: "track_wobble_company",
      slug: "wobble_company",
      ownerType: "company",
      status: "active",
      approvalRequired: true,
      platformPriorities: ["linkedin", "instagram", "x"],
      createdAt: now,
      updatedAt: now,
    });
  });

  it("builds a generation prompt block that separates company and founder voice profiles", () => {
    const companyTrack = buildContentTrackRow(
      {
        slug: "wobble_company",
        label: "WOBBLE Company",
        ownerType: "company",
        voiceProfile: { tone: "teach-first, premium, anti-agency dependency" },
        goals: ["AI OS education"],
        platformPriorities: ["linkedin", "instagram"],
      },
      { id: "track_wobble_company", now },
    );
    const founderTrack = buildContentTrackRow(
      {
        slug: "moiz_founder_pov",
        label: "Moiz Founder POV",
        ownerType: "founder",
        voiceProfile: {
          founderName: "Moiz",
          tone: "operator POV, direct, educational, sharper than company voice",
          signatureBeliefs: ["teach in public", "show the system being built"],
        },
        goals: ["founder authority", "education"],
        allowedTopics: ["AI OS builds"],
        bannedPhrases: ["easy money"],
        aggressionRange: { min: 3, max: 9 },
        platformPriorities: ["linkedin", "x"],
      },
      { id: "track_moiz_founder", now },
    );

    expect(buildContentTrackPromptBlock(companyTrack)).toContain("Track type: company");
    const founderBlock = buildContentTrackPromptBlock(founderTrack);

    expect(founderBlock).toContain("Track type: founder");
    expect(founderBlock).toContain("Founder/persona: Moiz");
    expect(founderBlock).toContain("operator POV");
    expect(founderBlock).toContain("easy money");
  });

  it("requires evidence metadata for content packets with serious researched claims", () => {
    expect(() =>
      buildContentPacketRow(
        packetInput({
          sourceIdsUsed: [],
          evidenceSummary: "",
          claimRiskLevel: "high",
          proofRequired: true,
        }),
        { id: "packet_bad", now },
      ),
    ).toThrowError(/sourceIdsUsed/);
  });

  it("requires hook and either main copy or carousel slide copy", () => {
    expect(() =>
      buildContentPacketRow(
        packetInput({
          hook: "",
          mainCopy: "",
          carouselSlides: [],
        }),
        { id: "packet_bad", now },
      ),
    ).toThrowError(/hook/);
  });

  it("builds packet, version, and quality review rows with stable packet evidence", () => {
    const packet = buildContentPacketRow(packetInput(), { id: "packet_1", now });
    const version = buildContentVersionRow(
      { contentPacketId: packet.id, payload: packet, changeReason: "initial draft", createdBy: "Moiz" },
      { id: "contentversion_1", now, versionNumber: 1 },
    );
    const review = buildQualityReviewRow(
      { entityId: packet.id, selfReview: passingReview, notes: "Passes minimum gate." },
      { id: "quality_1", now },
    );

    expect(packet).toMatchObject({
      id: "packet_1",
      contentTrackId: "track_wobble_company",
      platform: "linkedin",
      format: "text",
      targetAudience: "Pakistani owner-led businesses",
      qualityStatus: "passed",
      approvalStatus: "draft",
      createdBy: "Moiz",
    });
    expect(version).toMatchObject({ contentPacketId: "packet_1", versionNumber: 1, createdBy: "Moiz" });
    expect(review).toMatchObject({ entityType: "content_packet", entityId: "packet_1", passed: true });
  });
});

describe("content command service", () => {
  it("creates, filters, and updates founder content tracks without creating a separate content engine", async () => {
    const companyTrack = buildContentTrackRow(
      { slug: "wobble_company", label: "WOBBLE Company", ownerType: "company" },
      { id: "track_wobble_company", now },
    );
    const { store, calls, tracks } = makeContentStore({ tracks: [companyTrack] });
    const audit: AuditEventInput[] = [];

    const created = await createContentTrack(
      {
        slug: "moiz_founder_pov",
        label: "Moiz Founder POV",
        ownerType: "founder",
        voiceProfile: { founderName: "Moiz", tone: "direct operator POV" },
        goals: ["founder authority"],
        allowedTopics: ["AI OS builds"],
        platformPriorities: ["linkedin", "x"],
      },
      {
        store,
        recordAudit: async (event) => {
          audit.push(event);
        },
        now,
      },
    );

    const founderTracks = await listContentTracks({ ownerType: "founder", status: "active" }, { store });
    const updated = await updateContentTrack(
      created.track.id,
      {
        voiceProfile: { founderName: "Moiz", tone: "more educational, less hype", pov: "building WOBBLE in public" },
        bannedPhrases: ["easy money", "passive income"],
      },
      {
        store,
        recordAudit: async (event) => {
          audit.push(event);
        },
        now,
      },
    );

    expect(calls.insertTrack).toHaveLength(1);
    expect(founderTracks).toHaveLength(1);
    expect(founderTracks[0].id).toBe(created.track.id);
    expect(calls.updateTrack[0]).toMatchObject({
      id: created.track.id,
      fields: {
        voiceProfile: { founderName: "Moiz", tone: "more educational, less hype", pov: "building WOBBLE in public" },
        bannedPhrases: ["easy money", "passive income"],
        updatedAt: now,
      },
    });
    expect(tracks.get(created.track.id)?.voiceProfile).toMatchObject({ pov: "building WOBBLE in public" });
    expect(updated.track.ownerType).toBe("founder");
    expect(audit.some((event) => event.eventType === "content_track.created")).toBe(true);
    expect(audit.some((event) => event.eventType === "content_track.updated")).toBe(true);
  });

  it("creates an approval-ready content packet with version, quality review, approval, and audit trail", async () => {
    const track = buildContentTrackRow({ slug: "wobble_company", label: "WOBBLE Company" }, { id: "track_wobble_company", now });
    const { store, calls } = makeContentStore({ tracks: [track] });
    const approval = fakeApprovalStore();
    const audit: AuditEventInput[] = [];

    const result = await createContentPacket(
      { ...packetInput(), requestApproval: true },
      {
        store,
        approvalStore: approval.store,
        recordAudit: async (event) => {
          audit.push(event);
        },
        now,
      },
    );

    expect(result.packet.qualityStatus).toBe("passed");
    expect(result.packet.approvalStatus).toBe("pending");
    expect(result.approval).toMatchObject({
      approvalType: "content_packet",
      entityType: "content_packet",
      entityId: result.packet.id,
      riskLevel: "high",
    });
    expect(calls.insertPacket).toHaveLength(1);
    expect(calls.insertVersion).toHaveLength(1);
    expect(calls.insertQualityReview).toHaveLength(1);
    expect(audit.some((event) => event.eventType === "content_packet.created")).toBe(true);
    expect(audit.some((event) => event.eventType === "approval.created")).toBe(true);
  });

  it("saves failing drafts but keeps them out of the approval queue", async () => {
    const track = buildContentTrackRow({ slug: "wobble_company", label: "WOBBLE Company" }, { id: "track_wobble_company", now });
    const { store } = makeContentStore({ tracks: [track] });
    const approval = fakeApprovalStore();

    const result = await createContentPacket(
      { ...packetInput({ selfReview: failingReview }), requestApproval: true },
      { store, approvalStore: approval.store, recordAudit: async () => {}, now },
    );

    expect(result.packet.qualityStatus).toBe("failed");
    expect(result.packet.approvalStatus).toBe("draft");
    expect(result.approval).toBeNull();
    expect(approval.inserted).toHaveLength(0);
  });

  it("returns packet board rows and rich packet detail from stored data", async () => {
    const track = buildContentTrackRow({ slug: "wobble_company", label: "WOBBLE Company" }, { id: "track_wobble_company", now });
    const packet = buildContentPacketRow(packetInput(), { id: "packet_1", now });
    const version = buildContentVersionRow(
      { contentPacketId: packet.id, payload: packet, changeReason: "initial", createdBy: "Moiz" },
      { id: "version_1", now, versionNumber: 1 },
    );
    const review = buildQualityReviewRow({ entityId: packet.id, selfReview: passingReview }, { id: "quality_1", now });
    const { store } = makeContentStore({ tracks: [track], packets: [packet], versions: [version], reviews: [review] });

    const board = await listContentPackets({ limit: 20 }, { store });
    const detail = await getContentPacketDetail("packet_1", { store });

    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({ id: "packet_1", platform: "linkedin", evidenceSummary: expect.any(String) });
    expect(detail.packet.id).toBe("packet_1");
    expect(detail.track?.id).toBe("track_wobble_company");
    expect(detail.versions).toHaveLength(1);
    expect(detail.qualityReviews).toHaveLength(1);
  });

  it("adds a new content version and updates the packet snapshot", async () => {
    const track = buildContentTrackRow({ slug: "wobble_company", label: "WOBBLE Company" }, { id: "track_wobble_company", now });
    const packet = buildContentPacketRow(packetInput(), { id: "packet_1", now });
    const firstVersion = buildContentVersionRow(
      { contentPacketId: packet.id, payload: packet, changeReason: "initial", createdBy: "Moiz" },
      { id: "version_1", now, versionNumber: 1 },
    );
    const { store, calls, packets } = makeContentStore({ tracks: [track], packets: [packet], versions: [firstVersion] });

    const result = await addContentPacketVersion(
      {
        contentPacketId: "packet_1",
        patch: { hook: "Stop renting output. Build the machine." },
        changeReason: "Sharper hook",
        createdBy: "Haad",
      },
      { store, recordAudit: async () => {}, now },
    );

    expect(result.version.versionNumber).toBe(2);
    expect(calls.updatePacket[0]).toMatchObject({
      id: "packet_1",
      fields: { hook: "Stop renting output. Build the machine.", updatedAt: now },
    });
    expect(packets.get("packet_1")?.hook).toBe("Stop renting output. Build the machine.");
  });
});
