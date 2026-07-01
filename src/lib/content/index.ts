import { and, desc, eq } from "drizzle-orm";
import { contentPackets, contentTracks, contentVersions, qualityReviews } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { applyApprovalAction, createApproval, type ApprovalRow, type ApprovalStore } from "@/lib/approvals";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  buildContentPacketRow,
  buildContentTrackPatch,
  buildContentTrackRow,
  buildContentVersionRow,
  buildQualityReviewRow,
  contentPacketPatchSchema,
  type ContentApprovalStatus,
  type ContentFormat,
  type ContentPacketPatch,
  type ContentPacketRow,
  type ContentPlatform,
  type ContentQualityStatus,
  type ContentTrackOwnerType,
  type ContentTrackRow,
  type ContentTrackStatus,
  type ContentVersionRow,
  type CreateContentPacketInput,
  type CreateContentTrackInput,
  type QualityReviewRow,
  type UpdateContentTrackInput,
} from "@/lib/domain/content-command";

export type { ContentPacketRow, ContentTrackRow, ContentVersionRow, QualityReviewRow };

export interface ListContentPacketsQuery {
  contentTrackId?: string;
  approvalStatus?: ContentApprovalStatus;
  qualityStatus?: ContentQualityStatus;
  platform?: ContentPlatform;
  format?: ContentFormat;
  limit?: number;
}

export interface ListContentTracksQuery {
  status?: ContentTrackStatus;
  ownerType?: ContentTrackOwnerType;
  slug?: string;
  limit?: number;
}

export const DEFAULT_CONTENT_LIMIT = 50;
export const MAX_CONTENT_LIMIT = 200;

export function clampContentLimit(limit?: number): number {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_CONTENT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_CONTENT_LIMIT);
}

export interface ContentCommandStore {
  insertTrack?(row: ContentTrackRow): Promise<void>;
  updateTrack?(id: string, fields: Partial<ContentTrackRow>): Promise<void>;
  getTrackById(id: string): Promise<ContentTrackRow | null>;
  listTracks(query?: Omit<ListContentTracksQuery, "limit"> & { limit?: number }): Promise<ContentTrackRow[]>;
  insertPacket(row: ContentPacketRow): Promise<void>;
  updatePacket(id: string, fields: Partial<ContentPacketRow>): Promise<void>;
  getPacketById(id: string): Promise<ContentPacketRow | null>;
  listPackets(query: Required<Pick<ListContentPacketsQuery, "limit">> & Omit<ListContentPacketsQuery, "limit">): Promise<ContentPacketRow[]>;
  insertVersion(row: ContentVersionRow): Promise<void>;
  listVersions(contentPacketId: string): Promise<ContentVersionRow[]>;
  insertQualityReview(row: QualityReviewRow): Promise<void>;
  listQualityReviews(entityId: string): Promise<QualityReviewRow[]>;
}

export interface ContentDeps {
  store?: ContentCommandStore;
  approvalStore?: ApprovalStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

export interface CreateContentTrackResult {
  track: ContentTrackRow;
}

export async function createContentTrack(
  input: CreateContentTrackInput,
  deps: ContentDeps = {},
): Promise<CreateContentTrackResult> {
  const store = deps.store ?? defaultStore();
  if (!store.insertTrack) throw new Error("content store does not support track creation");
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const track = buildContentTrackRow(input, { now });
  await store.insertTrack(track);
  await recordAudit({
    eventType: "content_track.created",
    module: "content_command",
    entityType: "content_track",
    entityId: track.id,
    metadata: { slug: track.slug, ownerType: track.ownerType, approvalRequired: track.approvalRequired },
  });

  return { track };
}

export async function listContentTracks(
  query: ListContentTracksQuery = {},
  deps: ContentDeps = {},
): Promise<ContentTrackRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listTracks({ ...query, limit: clampContentLimit(query.limit) });
}

export interface UpdateContentTrackResult {
  track: ContentTrackRow;
}

export async function updateContentTrack(
  contentTrackId: string,
  input: UpdateContentTrackInput,
  deps: ContentDeps = {},
): Promise<UpdateContentTrackResult> {
  if (!contentTrackId.trim()) throw new Error("contentTrackId is required");
  const store = deps.store ?? defaultStore();
  if (!store.updateTrack) throw new Error("content store does not support track updates");
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  const current = await store.getTrackById(contentTrackId);
  if (!current) throw new Error(`content track '${contentTrackId}' not found`);

  const patch = buildContentTrackPatch(input, { now });
  await store.updateTrack(contentTrackId, patch);
  const track = { ...current, ...patch };
  await recordAudit({
    eventType: "content_track.updated",
    module: "content_command",
    entityType: "content_track",
    entityId: contentTrackId,
    metadata: {
      slug: track.slug,
      ownerType: track.ownerType,
      changedFields: Object.keys(patch).filter((field) => field !== "updatedAt"),
    },
  });

  return { track };
}

export interface CreateContentPacketServiceInput extends CreateContentPacketInput {
  requestApproval?: boolean;
}

export interface CreateContentPacketResult {
  packet: ContentPacketRow;
  version: ContentVersionRow;
  qualityReview: QualityReviewRow;
  approval: ApprovalRow | null;
}

export async function createContentPacket(
  input: CreateContentPacketServiceInput,
  deps: ContentDeps = {},
): Promise<CreateContentPacketResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const packet = buildContentPacketRow(input, { now });
  const track = await getActiveTrack(store, packet.contentTrackId);
  const version = buildContentVersionRow(
    {
      contentPacketId: packet.id,
      payload: packet as unknown as Record<string, unknown>,
      changeReason: "initial draft",
      createdBy: packet.createdBy,
    },
    { now, versionNumber: 1 },
  );
  const qualityReview = buildQualityReviewRow(
    {
      entityId: packet.id,
      selfReview: input.selfReview,
      notes: packet.qualityStatus === "passed" ? "Passed initial content quality gate." : "Failed initial content quality gate.",
    },
    { now },
  );

  await store.insertPacket(packet);
  await store.insertVersion(version);
  await store.insertQualityReview(qualityReview);

  await recordAudit({
    eventType: "content_packet.created",
    module: "content_command",
    entityType: "content_packet",
    entityId: packet.id,
    actor: packet.createdBy,
    metadata: {
      contentTrackId: packet.contentTrackId,
      platform: packet.platform,
      format: packet.format,
      qualityStatus: packet.qualityStatus,
      sourceIdsUsed: packet.sourceIdsUsed,
      memoryChunksUsed: packet.memoryChunksUsed,
    },
  });

  let finalPacket = packet;
  let approval: ApprovalRow | null = null;
  if (input.requestApproval && track.approvalRequired && packet.qualityStatus === "passed") {
    const riskLevel = packet.proofRequired || packet.claimRiskLevel === "high" ? "high" : "normal";
    approval = await createApproval(
      {
        approvalType: "content_packet",
        entityType: "content_packet",
        entityId: packet.id,
        riskLevel,
        requestedBy: packet.createdBy,
        notes: `Review ${packet.platform} ${packet.format}: ${packet.hook}`,
        metadata: {
          contentTrackId: packet.contentTrackId,
          platform: packet.platform,
          format: packet.format,
          claimRiskLevel: packet.claimRiskLevel,
          proofRequired: packet.proofRequired,
        },
      },
      { store: deps.approvalStore, recordAudit, now },
    );

    finalPacket = { ...packet, approvalStatus: "pending", updatedAt: now };
    await store.updatePacket(packet.id, { approvalStatus: "pending", updatedAt: now });
  }

  if (input.requestApproval && packet.qualityStatus !== "passed") {
    await recordAudit({
      eventType: "content_packet.approval_skipped",
      module: "content_command",
      entityType: "content_packet",
      entityId: packet.id,
      actor: packet.createdBy,
      metadata: { reason: "quality_gate_failed", qualityStatus: packet.qualityStatus },
    });
  }

  return { packet: finalPacket, version, qualityReview, approval };
}

export async function listContentPackets(
  query: ListContentPacketsQuery = {},
  deps: ContentDeps = {},
): Promise<ContentPacketRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listPackets({ ...query, limit: clampContentLimit(query.limit) });
}

export interface ContentPacketDetail {
  packet: ContentPacketRow;
  track: ContentTrackRow | null;
  versions: ContentVersionRow[];
  qualityReviews: QualityReviewRow[];
}

export async function getContentPacketDetail(
  contentPacketId: string,
  deps: ContentDeps = {},
): Promise<ContentPacketDetail> {
  if (!contentPacketId.trim()) throw new Error("contentPacketId is required");
  const store = deps.store ?? defaultStore();
  const packet = await store.getPacketById(contentPacketId);
  if (!packet) throw new Error(`content packet '${contentPacketId}' not found`);
  const [track, versions, qualityReviews] = await Promise.all([
    store.getTrackById(packet.contentTrackId),
    store.listVersions(packet.id),
    store.listQualityReviews(packet.id),
  ]);
  return { packet, track, versions, qualityReviews };
}

export interface AddContentPacketVersionInput {
  contentPacketId: string;
  patch: ContentPacketPatch;
  changeReason?: string;
  createdBy: string;
}

export interface AddContentPacketVersionResult {
  packet: ContentPacketRow;
  version: ContentVersionRow;
}

export async function addContentPacketVersion(
  input: AddContentPacketVersionInput,
  deps: ContentDeps = {},
): Promise<AddContentPacketVersionResult> {
  if (!input.contentPacketId.trim()) throw new Error("contentPacketId is required");
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const current = await store.getPacketById(input.contentPacketId);
  if (!current) throw new Error(`content packet '${input.contentPacketId}' not found`);
  const patch = contentPacketPatchSchema.parse(input.patch);
  const nextPacket: ContentPacketRow = { ...current, ...patch, updatedAt: now };
  const versions = await store.listVersions(current.id);
  const nextVersionNumber = versions.reduce((max, version) => Math.max(max, version.versionNumber), 0) + 1;
  const version = buildContentVersionRow(
    {
      contentPacketId: current.id,
      payload: nextPacket as unknown as Record<string, unknown>,
      changeReason: input.changeReason,
      createdBy: input.createdBy,
    },
    { now, versionNumber: nextVersionNumber },
  );

  await store.updatePacket(current.id, { ...patch, updatedAt: now });
  await store.insertVersion(version);
  await recordAudit({
    eventType: "content_packet.version_added",
    module: "content_command",
    entityType: "content_packet",
    entityId: current.id,
    actor: input.createdBy,
    metadata: { versionNumber: version.versionNumber, changeReason: input.changeReason },
  });

  return { packet: nextPacket, version };
}

async function getActiveTrack(store: ContentCommandStore, contentTrackId: string): Promise<ContentTrackRow> {
  const track = await store.getTrackById(contentTrackId);
  if (!track) throw new Error(`content track '${contentTrackId}' not found`);
  if (track.status !== "active") throw new Error(`content track '${contentTrackId}' is not active`);
  return track;
}

export function defaultStore(db: Db = getDb()): ContentCommandStore {
  return {
    async insertTrack(row) {
      await db.insert(contentTracks).values(row);
    },
    async getTrackById(id) {
      const rows = await db.select().from(contentTracks).where(eq(contentTracks.id, id)).limit(1);
      return (rows[0] as ContentTrackRow | undefined) ?? null;
    },
    async listTracks(query = {}) {
      const conditions = [];
      if (query.status) conditions.push(eq(contentTracks.status, query.status));
      if (query.ownerType) conditions.push(eq(contentTracks.ownerType, query.ownerType));
      if (query.slug) conditions.push(eq(contentTracks.slug, query.slug));
      const where = conditions.length ? and(...conditions) : undefined;
      return db
        .select()
        .from(contentTracks)
        .where(where)
        .orderBy(desc(contentTracks.createdAt))
        .limit(query.limit ?? DEFAULT_CONTENT_LIMIT) as Promise<ContentTrackRow[]>;
    },
    async updateTrack(id, fields) {
      await db.update(contentTracks).set(fields).where(eq(contentTracks.id, id));
    },
    async insertPacket(row) {
      await db.insert(contentPackets).values(row);
    },
    async updatePacket(id, fields) {
      await db.update(contentPackets).set(fields).where(eq(contentPackets.id, id));
    },
    async getPacketById(id) {
      const rows = await db.select().from(contentPackets).where(eq(contentPackets.id, id)).limit(1);
      return (rows[0] as ContentPacketRow | undefined) ?? null;
    },
    async listPackets(query) {
      const conditions = [];
      if (query.contentTrackId) conditions.push(eq(contentPackets.contentTrackId, query.contentTrackId));
      if (query.approvalStatus) conditions.push(eq(contentPackets.approvalStatus, query.approvalStatus));
      if (query.qualityStatus) conditions.push(eq(contentPackets.qualityStatus, query.qualityStatus));
      if (query.platform) conditions.push(eq(contentPackets.platform, query.platform));
      if (query.format) conditions.push(eq(contentPackets.format, query.format));
      const where = conditions.length ? and(...conditions) : undefined;
      return db
        .select()
        .from(contentPackets)
        .where(where)
        .orderBy(desc(contentPackets.createdAt))
        .limit(query.limit) as Promise<ContentPacketRow[]>;
    },
    async insertVersion(row) {
      await db.insert(contentVersions).values(row);
    },
    async listVersions(contentPacketId) {
      return db
        .select()
        .from(contentVersions)
        .where(eq(contentVersions.contentPacketId, contentPacketId))
        .orderBy(contentVersions.versionNumber) as Promise<ContentVersionRow[]>;
    },
    async insertQualityReview(row) {
      await db.insert(qualityReviews).values(row);
    },
    async listQualityReviews(entityId) {
      return db
        .select()
        .from(qualityReviews)
        .where(and(eq(qualityReviews.entityType, "content_packet"), eq(qualityReviews.entityId, entityId)))
        .orderBy(desc(qualityReviews.createdAt)) as Promise<QualityReviewRow[]>;
    },
  };
}


export interface ContentPacketActionInput {
  packetId: string;
  approvalId: string;
  approvedBy: string;
  notes?: string;
}

async function contentRecordAudit(deps: ContentDeps, input: AuditEventInput): Promise<void> {
  if (deps.recordAudit) return deps.recordAudit(input);
  await writeAuditEvent(input);
}

/** Approve a content packet: transition the approval AND flip the packet live. */
export async function approveContentPacket(input: ContentPacketActionInput, deps: ContentDeps = {}): Promise<ContentPacketRow> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const packet = await store.getPacketById(input.packetId);
  if (!packet) throw new Error(`content packet '${input.packetId}' not found`);
  await applyApprovalAction(
    { approvalId: input.approvalId, action: "approve", approvedBy: input.approvedBy, notes: input.notes },
    { store: deps.approvalStore, recordAudit: (e) => contentRecordAudit(deps, e), now },
  );
  const fields: Partial<ContentPacketRow> = { approvalStatus: "approved" as ContentApprovalStatus, updatedAt: now };
  await store.updatePacket(packet.id, fields);
  await contentRecordAudit(deps, {
    eventType: "content_packet.approved",
    module: "content_command",
    entityType: "content_packet",
    entityId: packet.id,
    actor: input.approvedBy,
    metadata: { approvalId: input.approvalId },
  });
  return { ...packet, ...fields };
}

/** Reject a content packet: transition the approval AND mark the packet rejected. */
export async function rejectContentPacket(input: ContentPacketActionInput, deps: ContentDeps = {}): Promise<ContentPacketRow> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const packet = await store.getPacketById(input.packetId);
  if (!packet) throw new Error(`content packet '${input.packetId}' not found`);
  await applyApprovalAction(
    { approvalId: input.approvalId, action: "reject", approvedBy: input.approvedBy, notes: input.notes },
    { store: deps.approvalStore, recordAudit: (e) => contentRecordAudit(deps, e), now },
  );
  const fields: Partial<ContentPacketRow> = { approvalStatus: "rejected" as ContentApprovalStatus, updatedAt: now };
  await store.updatePacket(packet.id, fields);
  await contentRecordAudit(deps, {
    eventType: "content_packet.rejected",
    module: "content_command",
    entityType: "content_packet",
    entityId: packet.id,
    actor: input.approvedBy,
    metadata: { approvalId: input.approvalId, reason: input.notes },
  });
  return { ...packet, ...fields };
}
