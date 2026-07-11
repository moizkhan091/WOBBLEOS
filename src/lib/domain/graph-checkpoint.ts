import { newId } from "@/lib/ids";

/**
 * Graph checkpointing — pure domain. A multi-agent graph run persists each completed node's output
 * keyed by a stable `graphRunId` so a later failure / restart / retry RESUMES from the failed node
 * instead of re-running (and re-charging) the nodes that already completed.
 *
 * `schemaVersion` is bumped whenever a graph's node contract changes so stale cached outputs from an
 * older code version are ignored (re-run) rather than replayed incorrectly. Reuse is ALSO guarded at
 * runtime by re-parsing the cached text against the node's schema, so a corrupted/partial output can
 * never be trusted — it just triggers a clean re-run of that node.
 */

export type GraphKind = "content_graph" | "paid_audit";

/** Bump the relevant number when a graph's node output contract changes. */
export const GRAPH_CHECKPOINT_SCHEMA_VERSION: Record<GraphKind, number> = {
  content_graph: 1,
  paid_audit: 1,
};

export interface GraphCheckpointRow {
  id: string;
  graphRunId: string;
  graph: string;
  nodeSlug: string;
  nodeIndex: number;
  status: string; // "completed" | "failed"
  schemaVersion: number;
  outputText: string;
  output: Record<string, unknown> | null;
  modelRunIds: string[];
  error: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface BuildGraphCheckpointInput {
  graphRunId: string;
  graph: string;
  nodeSlug: string;
  nodeIndex: number;
  schemaVersion: number;
  status?: "completed" | "failed";
  outputText: string;
  output?: Record<string, unknown> | null;
  modelRunIds?: string[];
  error?: string | null;
}

export function buildGraphCheckpointRow(input: BuildGraphCheckpointInput, opts: { now?: Date; id?: string } = {}): GraphCheckpointRow {
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("gckpt"),
    graphRunId: input.graphRunId,
    graph: input.graph,
    nodeSlug: input.nodeSlug,
    nodeIndex: input.nodeIndex,
    status: input.status ?? "completed",
    schemaVersion: input.schemaVersion,
    outputText: input.outputText,
    output: input.output ?? null,
    modelRunIds: input.modelRunIds ?? [],
    error: input.error ?? null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

/** A cached node output is reusable only when it COMPLETED and its schema version matches the current code. */
export function isCheckpointReusable(row: { status: string; schemaVersion: number }, currentSchemaVersion: number): boolean {
  return row.status === "completed" && row.schemaVersion === currentSchemaVersion;
}

/**
 * Stable id for a graph execution. The job queue reuses the same job row (and id) across retries and
 * dedupes by idempotency key, so the job id is a perfect resume key. Falls back to a deterministic
 * join of the provided parts when no job id is available (never random — resume depends on stability).
 */
export function graphRunIdFrom(jobId: string | undefined | null, ...fallbackParts: Array<string | undefined | null>): string | undefined {
  if (jobId && jobId.trim()) return jobId.trim();
  const parts = fallbackParts.map((p) => (p ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join("::") : undefined;
}
