// Social Intelligence — pure domain. AI platform content strategy.
import { z } from "zod";
import { newId } from "@/lib/ids";

export const SOCIAL_MODULE = "social";
export const SOCIAL_PLATFORMS = ["instagram", "linkedin", "tiktok", "x", "multi"] as const;
export const SOCIAL_STATUSES = ["draft", "active", "archived"] as const;
export type SocialStatus = (typeof SOCIAL_STATUSES)[number];

export interface SocialStrategy {
  positioning?: string;
  cadence?: string;
  pillars?: string[];
  hooks?: string[];
  competitorAngles?: string[];
  contentIdeas?: Array<{ format?: string; idea: string; hook?: string }>;
}

export interface SocialStrategyRow {
  id: string;
  platform: string;
  niche: string;
  status: SocialStatus;
  strategy: SocialStrategy;
  createdBy: string | null;
  archivedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export const createSocialSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS).default("multi"),
  niche: z.string().trim().min(1),
  createdBy: z.string().trim().min(1).optional(),
});
export type CreateSocialInput = z.input<typeof createSocialSchema>;

export function buildSocialRow(input: CreateSocialInput, opts: { now?: Date; id?: string } = {}): SocialStrategyRow {
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("social"),
    platform: input.platform ?? "multi",
    niche: input.niche.trim(),
    status: "draft",
    strategy: {},
    createdBy: input.createdBy ?? null,
    archivedAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

export const socialOutputSchema = z.object({
  positioning: z.string().optional(),
  cadence: z.string().optional(),
  pillars: z.array(z.string()).default([]),
  hooks: z.array(z.string()).default([]),
  competitorAngles: z.array(z.string()).default([]),
  contentIdeas: z.array(z.object({ format: z.string().optional(), idea: z.string(), hook: z.string().optional() })).default([]),
});
