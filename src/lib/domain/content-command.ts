import { z } from "zod";
import { newId } from "@/lib/ids";
import { passesQualityGate, selfReviewSchema, type SelfReview } from "@/lib/domain/content-packet";

export const CONTENT_PLATFORMS = ["instagram", "linkedin", "x", "youtube", "multi"] as const;
export const CONTENT_FORMATS = ["static", "carousel", "text", "thread", "reel_script", "youtube_script"] as const;
export const CONTENT_TRACK_OWNER_TYPES = ["company", "founder", "client", "campaign"] as const;
export const CONTENT_TRACK_STATUSES = ["active", "archived"] as const;
export const CONTENT_QUALITY_STATUSES = ["not_reviewed", "passed", "failed"] as const;
export const CONTENT_APPROVAL_STATUSES = ["draft", "pending", "approved", "rejected", "archived"] as const;
export const CONTENT_HANDOFF_STATUSES = ["not_sent", "queued", "sent", "failed"] as const;

export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number];
export type ContentFormat = (typeof CONTENT_FORMATS)[number];
export type ContentTrackOwnerType = (typeof CONTENT_TRACK_OWNER_TYPES)[number];
export type ContentTrackStatus = (typeof CONTENT_TRACK_STATUSES)[number];
export type ContentQualityStatus = (typeof CONTENT_QUALITY_STATUSES)[number];
export type ContentApprovalStatus = (typeof CONTENT_APPROVAL_STATUSES)[number];
export type ContentHandoffStatus = (typeof CONTENT_HANDOFF_STATUSES)[number];

const stringList = z.array(z.string().trim().min(1)).default([]);
const optionalStringList = z.array(z.string().trim().min(1)).optional();

export const aggressionRangeSchema = z
  .object({
    min: z.number().min(0).max(10).default(0),
    max: z.number().min(0).max(10).default(10),
  })
  .superRefine((range, ctx) => {
    if (range.min > range.max) {
      ctx.addIssue({ code: "custom", path: ["min"], message: "aggressionRange min cannot be greater than max" });
    }
  });

export const createContentTrackSchema = z.object({
  slug: z.string().trim().min(1, "slug is required"),
  label: z.string().trim().min(1, "label is required"),
  ownerType: z.enum(CONTENT_TRACK_OWNER_TYPES).default("company"),
  voiceProfile: z.record(z.string(), z.unknown()).default({}),
  goals: stringList,
  allowedTopics: stringList,
  bannedPhrases: stringList,
  aggressionRange: aggressionRangeSchema.default({ min: 0, max: 10 }),
  platformPriorities: z.array(z.enum(CONTENT_PLATFORMS)).default([]),
  approvalRequired: z.boolean().default(true),
  status: z.enum(CONTENT_TRACK_STATUSES).default("active"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type CreateContentTrackInput = z.input<typeof createContentTrackSchema>;

export const updateContentTrackSchema = z
  .object({
    slug: z.string().trim().min(1, "slug cannot be empty").optional(),
    label: z.string().trim().min(1, "label cannot be empty").optional(),
    ownerType: z.enum(CONTENT_TRACK_OWNER_TYPES).optional(),
    voiceProfile: z.record(z.string(), z.unknown()).optional(),
    goals: optionalStringList,
    allowedTopics: optionalStringList,
    bannedPhrases: optionalStringList,
    aggressionRange: aggressionRangeSchema.optional(),
    platformPriorities: z.array(z.enum(CONTENT_PLATFORMS)).optional(),
    approvalRequired: z.boolean().optional(),
    status: z.enum(CONTENT_TRACK_STATUSES).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((patch, ctx) => {
    if (Object.values(patch).every((value) => value === undefined)) {
      ctx.addIssue({ code: "custom", message: "at least one content track field is required" });
    }
  });

export type UpdateContentTrackInput = z.input<typeof updateContentTrackSchema>;

export interface ContentTrackRow {
  id: string;
  slug: string;
  label: string;
  ownerType: ContentTrackOwnerType;
  voiceProfile: Record<string, unknown>;
  goals: string[];
  allowedTopics: string[];
  bannedPhrases: string[];
  aggressionRange: { min: number; max: number };
  platformPriorities: ContentPlatform[];
  approvalRequired: boolean;
  status: ContentTrackStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export function buildContentTrackRow(
  input: CreateContentTrackInput,
  opts: { id?: string; now?: Date } = {},
): ContentTrackRow {
  const parsed = createContentTrackSchema.parse(input);
  const now = opts.now ?? new Date();

  return {
    id: opts.id ?? newId("track"),
    slug: parsed.slug,
    label: parsed.label,
    ownerType: parsed.ownerType,
    voiceProfile: parsed.voiceProfile,
    goals: parsed.goals,
    allowedTopics: parsed.allowedTopics,
    bannedPhrases: parsed.bannedPhrases,
    aggressionRange: parsed.aggressionRange,
    platformPriorities: parsed.platformPriorities,
    approvalRequired: parsed.approvalRequired,
    status: parsed.status,
    metadata: parsed.metadata,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildContentTrackPatch(
  input: UpdateContentTrackInput,
  opts: { now?: Date } = {},
): Partial<ContentTrackRow> {
  const parsed = updateContentTrackSchema.parse(input);
  const patch: Partial<ContentTrackRow> = {};
  for (const [key, value] of Object.entries(parsed) as Array<[keyof typeof parsed, unknown]>) {
    if (value !== undefined) {
      (patch as Record<string, unknown>)[key] = value;
    }
  }
  patch.updatedAt = opts.now ?? new Date();
  return patch;
}

function voiceValueToText(value: unknown): string {
  if (Array.isArray(value)) return value.map(voiceValueToText).filter(Boolean).join("; ");
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => `${key}: ${voiceValueToText(nested)}`)
      .filter((part) => !part.endsWith(": "))
      .join("; ");
  }
  return value === undefined || value === null ? "" : String(value);
}

function voiceProfileLines(profile: Record<string, unknown>): string[] {
  const lines = Object.entries(profile)
    .map(([key, value]) => {
      const text = voiceValueToText(value);
      return text ? `- ${key}: ${text}` : "";
    })
    .filter(Boolean);
  return lines.length ? lines : ["(none set)"];
}

export function getContentTrackPersonaName(track: ContentTrackRow): string | null {
  const direct = track.voiceProfile.founderName ?? track.voiceProfile.personaName ?? track.metadata.founderName;
  return typeof direct === "string" && direct.trim() ? direct.trim() : null;
}

export function buildContentTrackPromptBlock(track: ContentTrackRow): string {
  const personaName = getContentTrackPersonaName(track);
  const lines = [
    `Content track: ${track.label} (${track.slug})`,
    `Track type: ${track.ownerType}`,
    track.ownerType === "founder" ? `Founder/persona: ${personaName ?? track.label}` : "",
    "Voice profile:",
    ...voiceProfileLines(track.voiceProfile),
    `Goals: ${track.goals.join(", ") || "(none set)"}`,
    `Allowed topics: ${track.allowedTopics.join(", ") || "(none set)"}`,
    `Do-not-say / banned phrases: ${track.bannedPhrases.join(", ") || "(none set)"}`,
    `Aggression range: ${track.aggressionRange.min}-${track.aggressionRange.max}/10`,
    `Platform priorities: ${track.platformPriorities.join(", ") || "(model may choose from request/context)"}`,
    `Approval required: ${track.approvalRequired ? "yes" : "no"}`,
  ];
  return lines.filter(Boolean).join("\n");
}

const carouselSlideSchema = z.union([
  z.string().trim().min(1).transform((body) => ({ body })),
  z.record(z.string(), z.unknown()),
]);

export const contentPacketBaseSchema = z.object({
  contentTrackId: z.string().trim().min(1, "contentTrackId is required").default("track_wobble_company"),
  platform: z.enum(CONTENT_PLATFORMS),
  format: z.enum(CONTENT_FORMATS),
  objective: z.string().trim().min(1, "objective is required"),
  targetAudience: z.string().trim().min(1, "targetAudience is required"),
  angle: z.string().trim().min(1, "angle is required"),
  hook: z.string().trim().min(1, "hook is required"),
  mainCopy: z.string().trim().default(""),
  carouselSlides: z.array(carouselSlideSchema).default([]),
  caption: z.string().trim().min(1, "caption is required"),
  cta: z.string().trim().min(1, "cta is required"),
  designDirection: z.string().trim().min(1, "designDirection is required"),
  sourceIdsUsed: z.array(z.string().trim().min(1)).default([]),
  insightIdsUsed: z.array(z.string().trim().min(1)).default([]),
  memoryChunksUsed: z.array(z.string().trim().min(1)).default([]),
  evidenceSummary: z.string().trim().default(""),
  claimRiskLevel: z.enum(["low", "medium", "high"]).default("low"),
  proofRequired: z.boolean().default(false),
  selfReview: selfReviewSchema,
  approvalStatus: z.enum(CONTENT_APPROVAL_STATUSES).default("draft"),
  n8nHandoffStatus: z.enum(CONTENT_HANDOFF_STATUSES).default("not_sent"),
  createdBy: z.string().trim().min(1, "createdBy is required"),
});

export const createContentPacketSchema = contentPacketBaseSchema
  .superRefine((packet, ctx) => {
    if (!packet.mainCopy.trim() && packet.carouselSlides.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["mainCopy"],
        message: "mainCopy or carouselSlides is required",
      });
    }

    const hasSeriousClaim = packet.proofRequired || packet.claimRiskLevel === "medium" || packet.claimRiskLevel === "high";
    if (hasSeriousClaim && packet.sourceIdsUsed.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceIdsUsed"],
        message: "sourceIdsUsed is required for researched or proof-required claims",
      });
    }
    if (hasSeriousClaim && packet.evidenceSummary.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["evidenceSummary"],
        message: "evidenceSummary is required for researched or proof-required claims",
      });
    }
  });

export type CreateContentPacketInput = z.input<typeof createContentPacketSchema>;

export interface ContentPacketRow {
  id: string;
  contentTrackId: string;
  platform: ContentPlatform;
  format: ContentFormat;
  objective: string;
  targetAudience: string;
  angle: string;
  hook: string;
  mainCopy: string;
  carouselSlides: Array<Record<string, unknown>>;
  caption: string;
  cta: string;
  designDirection: string;
  sourceIdsUsed: string[];
  insightIdsUsed: string[];
  memoryChunksUsed: string[];
  evidenceSummary: string;
  claimRiskLevel: "low" | "medium" | "high";
  proofRequired: boolean;
  qualityStatus: ContentQualityStatus;
  approvalStatus: ContentApprovalStatus;
  n8nHandoffStatus: ContentHandoffStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export function buildContentPacketRow(
  input: CreateContentPacketInput,
  opts: { id?: string; now?: Date } = {},
): ContentPacketRow {
  const parsed = createContentPacketSchema.parse(input);
  const now = opts.now ?? new Date();

  return {
    id: opts.id ?? newId("content"),
    contentTrackId: parsed.contentTrackId,
    platform: parsed.platform,
    format: parsed.format,
    objective: parsed.objective,
    targetAudience: parsed.targetAudience,
    angle: parsed.angle,
    hook: parsed.hook,
    mainCopy: parsed.mainCopy,
    carouselSlides: parsed.carouselSlides,
    caption: parsed.caption,
    cta: parsed.cta,
    designDirection: parsed.designDirection,
    sourceIdsUsed: parsed.sourceIdsUsed,
    insightIdsUsed: parsed.insightIdsUsed,
    memoryChunksUsed: parsed.memoryChunksUsed,
    evidenceSummary: parsed.evidenceSummary,
    claimRiskLevel: parsed.claimRiskLevel,
    proofRequired: parsed.proofRequired,
    qualityStatus: passesQualityGate(parsed.selfReview) ? "passed" : "failed",
    approvalStatus: parsed.approvalStatus,
    n8nHandoffStatus: parsed.n8nHandoffStatus,
    createdBy: parsed.createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

export const contentPacketPatchSchema = contentPacketBaseSchema
  .omit({ selfReview: true, createdBy: true })
  .partial()
  .extend({
    approvalStatus: z.enum(CONTENT_APPROVAL_STATUSES).optional(),
    qualityStatus: z.enum(CONTENT_QUALITY_STATUSES).optional(),
  });

export type ContentPacketPatch = z.infer<typeof contentPacketPatchSchema>;

export const createContentVersionSchema = z.object({
  contentPacketId: z.string().trim().min(1, "contentPacketId is required"),
  payload: z.unknown().default({}),
  changeReason: z.string().trim().min(1).optional(),
  createdBy: z.string().trim().min(1, "createdBy is required"),
});

export type CreateContentVersionInput = z.input<typeof createContentVersionSchema>;

export interface ContentVersionRow {
  id: string;
  contentPacketId: string;
  versionNumber: number;
  payload: Record<string, unknown>;
  changeReason: string | null;
  createdBy: string;
  createdAt: Date;
}

export function buildContentVersionRow(
  input: CreateContentVersionInput,
  opts: { id?: string; now?: Date; versionNumber?: number } = {},
): ContentVersionRow {
  const parsed = createContentVersionSchema.parse(input);
  const payload =
    parsed.payload && typeof parsed.payload === "object" && !Array.isArray(parsed.payload)
      ? (parsed.payload as Record<string, unknown>)
      : { value: parsed.payload };
  return {
    id: opts.id ?? newId("contentversion"),
    contentPacketId: parsed.contentPacketId,
    versionNumber: opts.versionNumber ?? 1,
    payload,
    changeReason: parsed.changeReason ?? null,
    createdBy: parsed.createdBy,
    createdAt: opts.now ?? new Date(),
  };
}

export interface QualityReviewRow {
  id: string;
  entityType: string;
  entityId: string;
  usefulness: number;
  originality: number;
  brandFit: number;
  clarity: number;
  aggressionControl: number;
  proofStrength: number;
  postWorthiness: "pass" | "fail";
  passed: boolean;
  notes: string | null;
  createdAt: Date;
}

export function buildQualityReviewRow(
  input: { entityId: string; selfReview: SelfReview; notes?: string },
  opts: { id?: string; now?: Date } = {},
): QualityReviewRow {
  const review = selfReviewSchema.parse(input.selfReview);
  return {
    id: opts.id ?? newId("quality"),
    entityType: "content_packet",
    entityId: input.entityId,
    usefulness: review.usefulness,
    originality: review.originality,
    brandFit: review.brandFit,
    clarity: review.clarity,
    aggressionControl: review.aggressionControl,
    proofStrength: review.proofStrength,
    postWorthiness: review.postWorthiness,
    passed: passesQualityGate(review),
    notes: input.notes ?? null,
    createdAt: opts.now ?? new Date(),
  };
}
