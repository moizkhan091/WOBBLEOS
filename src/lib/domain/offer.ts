// Offer Lab — pure domain. Offers + experiments + a confidence score.
import { z } from "zod";
import { newId } from "@/lib/ids";

export const OFFER_MODULE = "offers";
export const OFFER_STATUSES = ["draft", "testing", "winning", "paused", "retired"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

const TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  draft: ["testing", "paused", "retired"],
  testing: ["winning", "paused", "retired", "draft"],
  winning: ["testing", "paused", "retired"],
  paused: ["testing", "draft", "retired"],
  retired: [],
};
export function canTransitionOffer(from: OfferStatus, to: OfferStatus): boolean {
  if (from === to) return true;
  return (TRANSITIONS[from] ?? []).includes(to);
}

export interface OfferExperiment { id: string; name: string; metric?: string; result?: string; status?: string }

export interface OfferRow {
  id: string;
  name: string;
  hypothesis: string | null;
  status: OfferStatus;
  audience: string | null;
  promise: string | null;
  priceModel: string | null;
  priceCents: number;
  currency: string;
  deliverables: string[];
  experiments: OfferExperiment[];
  score: number;
  resultNotes: string | null;
  owner: string | null;
  createdBy: string | null;
  archivedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export const createOfferSchema = z.object({
  name: z.string().trim().min(1),
  hypothesis: z.string().trim().optional(),
  audience: z.string().trim().optional(),
  promise: z.string().trim().optional(),
  priceModel: z.string().trim().optional(),
  priceCents: z.number().int().min(0).optional(),
  currency: z.string().trim().optional(),
  deliverables: z.array(z.string().trim().min(1)).optional(),
  owner: z.string().trim().min(1).optional(),
  createdBy: z.string().trim().min(1).optional(),
});
export type CreateOfferInput = z.input<typeof createOfferSchema>;

export function buildOfferRow(input: CreateOfferInput, opts: { now?: Date; id?: string } = {}): OfferRow {
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("offer"),
    name: input.name.trim(),
    hypothesis: input.hypothesis ?? null,
    status: "draft",
    audience: input.audience ?? null,
    promise: input.promise ?? null,
    priceModel: input.priceModel ?? null,
    priceCents: input.priceCents ?? 0,
    currency: input.currency ?? "USD",
    deliverables: input.deliverables ?? [],
    experiments: [],
    score: 0,
    resultNotes: null,
    owner: input.owner ?? null,
    createdBy: input.createdBy ?? null,
    archivedAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}
