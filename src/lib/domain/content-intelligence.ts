import { newId } from "@/lib/ids";

/**
 * Content Intelligence Run — the pure core. An intelligence run gathers the founder's ACTIVE sources +
 * knowledge + brand brain and asks the strategist team for a fresh topic bank. It can be triggered MANUALLY
 * or fire on a daily CADENCE (both). New/removed sources are auto-picked-up because each run re-reads the
 * active set at run time — nothing is hard-wired. This file holds the constants + row builder + cadence key;
 * the orchestrator + IO live in src/lib/content-intelligence.
 */

export const CONTENT_INTELLIGENCE_JOB_TYPE = "content.intelligence";
export const CONTENT_INTELLIGENCE_QUEUE = "general";
export const CONTENT_INTELLIGENCE_MODULE = "content";
export const CONTENT_INTELLIGENCE_AGENT = "content_orchestrator";

/** A sensible standing objective when a run is fired on cadence (no explicit objective supplied). */
export const DEFAULT_INTELLIGENCE_OBJECTIVE =
  "Propose the strongest, freshest WOBBLE content topics for Pakistan-first SMB owners — teach real automation mechanisms that generate qualified leads, never agency filler.";

export type IntelligenceRunTrigger = "manual" | "scheduled";
export type IntelligenceRunStatus = "running" | "completed" | "failed";

export interface ContentIntelligenceRunRow {
  id: string;
  trigger: IntelligenceRunTrigger;
  status: IntelligenceRunStatus;
  objective: string;
  sourceCount: number;
  topicCount: number;
  model: string | null;
  requestedBy: string;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export function buildIntelligenceRunRow(
  input: { trigger: IntelligenceRunTrigger; objective: string; model?: string; requestedBy: string },
  opts: { id?: string; now?: Date } = {},
): ContentIntelligenceRunRow {
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("intelrun"),
    trigger: input.trigger,
    status: "running",
    objective: input.objective,
    sourceCount: 0,
    topicCount: 0,
    model: input.model ?? null,
    requestedBy: input.requestedBy,
    error: null,
    startedAt: now,
    finishedAt: null,
    metadata: {},
    createdAt: now,
  };
}

/**
 * Daily cadence idempotency key. Keyed by UTC DATE so repeated scheduler ticks within the day dedupe to ONE
 * run (checked against ANY job status — the WOB-UAT-036 rule — so a fast run can't let the next tick fire
 * another). A deliberate manual run uses its own key and is never blocked by the cadence.
 */
export function intelligenceCadenceKey(now: Date): string {
  return `${CONTENT_INTELLIGENCE_JOB_TYPE}:${now.toISOString().slice(0, 10)}`;
}
