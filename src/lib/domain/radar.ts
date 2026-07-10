// Research Radar — pure domain.
import { z } from "zod";
import { newId } from "@/lib/ids";

export const RADAR_MODULE = "radar";
export const RADAR_STATUSES = ["new", "reviewed", "actioned", "dismissed"] as const;
export type RadarStatus = (typeof RADAR_STATUSES)[number];

export interface RadarSignal { title: string; category?: string; summary?: string; implication?: string; score?: number }

export interface RadarScanRow {
  id: string;
  focus: string;
  status: RadarStatus;
  signals: RadarSignal[];
  createdBy: string | null;
  archivedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export const createRadarScanSchema = z.object({
  focus: z.string().trim().min(1),
  createdBy: z.string().trim().min(1).optional(),
});
export type CreateRadarScanInput = z.input<typeof createRadarScanSchema>;

export function buildRadarScanRow(input: CreateRadarScanInput, opts: { now?: Date; id?: string } = {}): RadarScanRow {
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("radar"),
    focus: input.focus.trim(),
    status: "new",
    signals: [],
    createdBy: input.createdBy ?? null,
    archivedAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

export const radarOutputSchema = z.object({
  signals: z.array(z.object({ title: z.string(), category: z.string().optional(), summary: z.string().optional(), implication: z.string().optional(), score: z.number().optional() })).default([]),
});

export function topSignals(signals: RadarSignal[], n = 3): RadarSignal[] {
  return [...signals].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, n);
}
