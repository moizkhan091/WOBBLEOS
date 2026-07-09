// SEO & Blog Engine — pure domain.
import { z } from "zod";
import { newId } from "@/lib/ids";

export const SEO_MODULE = "seo";
export const SEO_STATUSES = ["draft", "planned", "active", "archived"] as const;
export type SeoStatus = (typeof SEO_STATUSES)[number];

export interface SeoKeyword { keyword: string; intent?: string; priority?: string; note?: string }
export interface BlogIdea { title: string; angle?: string; targetKeyword?: string; outline?: string[] }

export interface SeoPlanRow {
  id: string;
  topic: string;
  audience: string | null;
  status: SeoStatus;
  pillar: string | null;
  targetKeywords: SeoKeyword[];
  blogIdeas: BlogIdea[];
  notes: string | null;
  createdBy: string | null;
  archivedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export const createSeoPlanSchema = z.object({
  topic: z.string().trim().min(1),
  audience: z.string().trim().optional(),
  pillar: z.string().trim().optional(),
  createdBy: z.string().trim().min(1).optional(),
});
export type CreateSeoPlanInput = z.input<typeof createSeoPlanSchema>;

export function buildSeoPlanRow(input: CreateSeoPlanInput, opts: { now?: Date; id?: string } = {}): SeoPlanRow {
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("seo"),
    topic: input.topic.trim(),
    audience: input.audience ?? null,
    status: "draft",
    pillar: input.pillar ?? null,
    targetKeywords: [],
    blogIdeas: [],
    notes: null,
    createdBy: input.createdBy ?? null,
    archivedAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

// Zod for parsing the LLM's plan output.
export const seoPlanOutputSchema = z.object({
  pillar: z.string().optional(),
  targetKeywords: z.array(z.object({ keyword: z.string(), intent: z.string().optional(), priority: z.string().optional(), note: z.string().optional() })).default([]),
  blogIdeas: z.array(z.object({ title: z.string(), angle: z.string().optional(), targetKeyword: z.string().optional(), outline: z.array(z.string()).optional() })).default([]),
});
