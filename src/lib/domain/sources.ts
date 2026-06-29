import { z } from "zod";
import { newId } from "@/lib/ids";

export const SOURCE_APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type SourceApprovalStatus = (typeof SOURCE_APPROVAL_STATUSES)[number];

export const SOURCE_RECORD_STATUSES = ["active", "archived"] as const;
export type SourceRecordStatus = (typeof SOURCE_RECORD_STATUSES)[number];

export interface SourceTrustLevel {
  id: string;
  slug: string;
  label: string;
  priority: number;
  canUpdateBrain: boolean;
}

export interface ResolvedSourceTrust extends SourceTrustLevel {
  isBlocked: boolean;
}

export const DEFAULT_SOURCE_TRUST_LEVELS: SourceTrustLevel[] = [
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
    id: "trust_tier_3_monitored",
    slug: "tier_3_monitored",
    label: "Tier 3: Monitored",
    priority: 3,
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

export const DEFAULT_SOURCE_TRUST = "tier_4_experimental";

export const addSourceSchema = z.object({
  title: z.string().trim().min(1, "title is required"),
  sourceType: z.string().trim().min(1, "sourceType is required"),
  url: z.string().trim().url().optional(),
  trustLevel: z.string().trim().min(1).default(DEFAULT_SOURCE_TRUST),
  approvalStatus: z.enum(SOURCE_APPROVAL_STATUSES).optional(),
  discoveredBy: z.string().trim().min(1).optional(),
  addedBy: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type AddSourceInput = z.input<typeof addSourceSchema>;

export interface SourceRow {
  id: string;
  title: string;
  sourceType: string;
  url: string | null;
  trustLevel: string;
  approvalStatus: SourceApprovalStatus;
  status: SourceRecordStatus;
  discoveredBy: string | null;
  addedBy: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export function buildSourceRow(input: AddSourceInput, opts: { id?: string; now?: Date } = {}): SourceRow {
  const parsed = addSourceSchema.parse(input);
  const now = opts.now ?? new Date();

  return {
    id: opts.id ?? newId("source"),
    title: parsed.title,
    sourceType: parsed.sourceType,
    url: parsed.url ?? null,
    trustLevel: parsed.trustLevel,
    // Source creation is never self-trusting. Approval attribution is written
    // only by approveSource after the founder gate runs.
    approvalStatus: "pending",
    status: "active",
    discoveredBy: parsed.discoveredBy ?? null,
    addedBy: parsed.addedBy ?? null,
    approvedBy: null,
    approvedAt: null,
    metadata: parsed.metadata,
    createdAt: now,
    updatedAt: now,
  };
}

export function resolveSourceTrust(
  requestedTrustLevel: string | undefined,
  trustLevels: SourceTrustLevel[] = DEFAULT_SOURCE_TRUST_LEVELS,
): ResolvedSourceTrust {
  const slug = requestedTrustLevel?.trim() || DEFAULT_SOURCE_TRUST;
  const found = trustLevels.find((level) => level.slug === slug);
  if (!found) {
    throw new Error(`unknown source trust level '${slug}'`);
  }
  return { ...found, isBlocked: found.slug === "blocked" };
}

const supportedExtensions = new Set([
  "pdf",
  "txt",
  "md",
  "csv",
  "docx",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "mp4",
  "mov",
  "mp3",
  "wav",
]);

const supportedMimeTypes = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
]);

export const sourceFileInputSchema = z.object({
  path: z.string().trim().min(1).optional(),
  filename: z.string().trim().min(1).optional(),
  fileType: z.string().trim().min(1).optional(),
  mimeType: z.string().trim().min(1).optional(),
  module: z.string().trim().min(1).default("source_library"),
  linkedEntityId: z.string().trim().min(1).optional(),
  createdBy: z.string().trim().min(1),
  sizeBytes: z.number().nonnegative().optional(),
  checksum: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type SourceFileInput = z.input<typeof sourceFileInputSchema>;

export const sourceFileSupportSchema = z.object({
  path: z.string().trim().min(1).optional(),
  filename: z.string().trim().min(1).optional(),
  fileType: z.string().trim().min(1).optional(),
  mimeType: z.string().trim().min(1).optional(),
  sizeBytes: z.number().nonnegative().optional(),
});

export type SourceFileSupportInput = z.input<typeof sourceFileSupportSchema>;

export interface SourceFileRow {
  id: string;
  path: string;
  fileType: string;
  module: string;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  createdBy: string;
  status: string;
  approvalState: string;
  sizeBytes: string | null;
  checksum: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

function extensionFrom(input: { filename?: string; path?: string; fileType?: string }): string | undefined {
  if (input.fileType?.trim()) return input.fileType.trim().replace(/^\./, "").toLowerCase();
  const value = input.filename ?? input.path;
  const match = value?.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1];
}

export function assertSupportedSourceFile(input: SourceFileSupportInput): { extension: string; mimeType: string | null } {
  const parsed = sourceFileSupportSchema.parse(input);
  const extension = extensionFrom(parsed);
  const mimeType = parsed.mimeType?.toLowerCase() ?? null;

  const extensionOk = extension ? supportedExtensions.has(extension) : false;
  const mimeOk = mimeType ? supportedMimeTypes.has(mimeType) : false;

  if (!extensionOk && !mimeOk) {
    throw new Error(`unsupported source file type '${extension ?? mimeType ?? "unknown"}'`);
  }

  return { extension: extension ?? "unknown", mimeType };
}

export function buildFileRow(
  input: SourceFileInput & { path: string; linkedEntityId?: string },
  opts: { id?: string; now?: Date; linkedEntityId?: string } = {},
): SourceFileRow {
  const parsed = sourceFileInputSchema.extend({ path: z.string().trim().min(1) }).parse(input);
  const supported = assertSupportedSourceFile(parsed);
  const now = opts.now ?? new Date();
  const linkedEntityId = opts.linkedEntityId ?? parsed.linkedEntityId ?? null;

  return {
    id: opts.id ?? newId("file"),
    path: parsed.path,
    fileType: supported.extension,
    module: parsed.module,
    linkedEntityType: linkedEntityId ? "source" : null,
    linkedEntityId,
    createdBy: parsed.createdBy,
    status: "active",
    approvalState: "pending",
    sizeBytes: parsed.sizeBytes !== undefined ? String(parsed.sizeBytes) : null,
    checksum: parsed.checksum ?? null,
    metadata: {
      ...parsed.metadata,
      ...(supported.mimeType ? { mimeType: supported.mimeType } : {}),
      ...(parsed.filename ? { filename: parsed.filename } : {}),
    },
    createdAt: now,
    updatedAt: now,
  };
}

export const sourceChunksInputSchema = z.object({
  sourceId: z.string().trim().min(1),
  chunks: z.array(z.string().trim().min(1)).min(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type SourceChunksInput = z.input<typeof sourceChunksInputSchema>;

export interface SourceChunkRow {
  id: string;
  sourceId: string;
  chunkIndex: number;
  content: string;
  embedding: number[] | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export function buildSourceChunkRows(
  input: SourceChunksInput,
  opts: { ids?: string[]; now?: Date } = {},
): SourceChunkRow[] {
  const parsed = sourceChunksInputSchema.parse(input);
  const now = opts.now ?? new Date();

  return parsed.chunks.map((content, index) => ({
    id: opts.ids?.[index] ?? newId("sourcechunk"),
    sourceId: parsed.sourceId,
    chunkIndex: index,
    content,
    embedding: null,
    metadata: parsed.metadata,
    createdAt: now,
    updatedAt: now,
  }));
}
